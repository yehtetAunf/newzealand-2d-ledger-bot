/**
 * New Zealand 2D Ledger Bot
 * src/database.js
 *
 * Multi-tenant storage:
 * - Private chat: scope_id = Telegram user/chat ID
 * - Group chat: scope_id = Telegram group ID
 */

/* USER LICENSES */
export async function getUser(db, chatId) {
  return db.prepare(`SELECT * FROM users WHERE chat_id = ?`).bind(chatId).first();
}

export async function createUser(db, chatId, username = "", firstName = "") {
  const now = new Date().toISOString();
  return db.prepare(`
    INSERT OR IGNORE INTO users
      (chat_id, username, first_name, status, plan, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, 'pending', 'none', NULL, ?, ?)
  `).bind(chatId, username || "", firstName || "", now, now).run();
}

export async function updateLicense(db, chatId, status, plan, expiresAt) {
  return db.prepare(`
    UPDATE users
    SET status = ?, plan = ?, expires_at = ?, updated_at = ?
    WHERE chat_id = ?
  `).bind(status, plan, expiresAt, new Date().toISOString(), chatId).run();
}

export async function getUsers(db) {
  const { results } = await db.prepare(`
    SELECT * FROM users ORDER BY created_at DESC
  `).all();
  return results;
}

/* GROUP LICENSES */
export async function ensureLicensedGroups(db) {
  return db.prepare(`
    CREATE TABLE IF NOT EXISTS licensed_groups (
      group_id INTEGER PRIMARY KEY,
      owner_id INTEGER,
      group_title TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      plan TEXT NOT NULL DEFAULT 'none',
      expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    )
  `).run();
}

export async function getLicensedGroup(db, groupId) {
  await ensureLicensedGroups(db);
  return db.prepare(`SELECT * FROM licensed_groups WHERE group_id = ?`)
    .bind(groupId).first();
}

export async function createLicensedGroup(db, groupId, ownerId = null, groupTitle = "") {
  await ensureLicensedGroups(db);
  const now = new Date().toISOString();
  return db.prepare(`
    INSERT OR IGNORE INTO licensed_groups
      (group_id, owner_id, group_title, status, plan, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, 'pending', 'none', NULL, ?, ?)
  `).bind(groupId, ownerId, groupTitle || "", now, now).run();
}

export async function approveGroup(db, groupId, plan, expiresAt) {
  await ensureLicensedGroups(db);
  return db.prepare(`
    UPDATE licensed_groups
    SET status = 'approved', plan = ?, expires_at = ?, updated_at = ?
    WHERE group_id = ?
  `).bind(plan, expiresAt, new Date().toISOString(), groupId).run();
}

export async function banGroup(db, groupId) {
  await ensureLicensedGroups(db);
  return db.prepare(`
    UPDATE licensed_groups
    SET status = 'banned', updated_at = ?
    WHERE group_id = ?
  `).bind(new Date().toISOString(), groupId).run();
}

export async function unbanGroup(db, groupId) {
  await ensureLicensedGroups(db);
  return db.prepare(`
    UPDATE licensed_groups
    SET status = 'approved', updated_at = ?
    WHERE group_id = ?
  `).bind(new Date().toISOString(), groupId).run();
}


export async function archiveGroup(db, groupId) {
  await ensureLicensedGroups(db);
  return db.prepare(`
    UPDATE licensed_groups
    SET status = 'archived', updated_at = ?
    WHERE group_id = ?
  `).bind(new Date().toISOString(), groupId).run();
}

export async function restoreGroup(db, groupId) {
  await ensureLicensedGroups(db);
  return db.prepare(`
    UPDATE licensed_groups
    SET status = 'banned', updated_at = ?
    WHERE group_id = ?
  `).bind(new Date().toISOString(), groupId).run();
}

export async function deleteGroupPermanently(db, groupId) {
  await ensureLicensedGroups(db);
  await db.prepare(`DELETE FROM ledger_totals WHERE scope_id = ?`).bind(groupId).run();
  await db.prepare(`DELETE FROM transactions WHERE chat_id = ?`).bind(groupId).run();
  return db.prepare(`DELETE FROM licensed_groups WHERE group_id = ?`).bind(groupId).run();
}

export async function getLicensedGroups(db) {
  await ensureLicensedGroups(db);
  const { results } = await db.prepare(`
    SELECT * FROM licensed_groups ORDER BY created_at DESC
  `).all();
  return results;
}

/* SCOPED NUMBER LEDGER */
async function ensureLedgerTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ledger_totals (
      scope_id INTEGER NOT NULL,
      number TEXT NOT NULL,
      total_amount INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT,
      PRIMARY KEY (scope_id, number)
    )
  `).run();
}

export async function ensureNumberTotals(db, scopeId) {
  if (!Number.isSafeInteger(Number(scopeId))) {
    throw new Error("Ledger scope ID မမှန်ပါ။");
  }

  await ensureLedgerTable(db);

  const now = new Date().toISOString();
  const statements = [];
  for (let number = 0; number <= 99; number++) {
    statements.push(
      db.prepare(`
        INSERT OR IGNORE INTO ledger_totals
          (scope_id, number, total_amount, updated_at)
        VALUES (?, ?, 0, ?)
      `).bind(Number(scopeId), String(number).padStart(2, "0"), now)
    );
  }
  await db.batch(statements);
}

export async function addBetItemsToNumberTotals(db, scopeId, items = []) {
  if (!Array.isArray(items)) throw new Error("Bet items ပုံစံမမှန်ပါ။");
  await ensureNumberTotals(db, scopeId);

  const statements = [];
  const now = new Date().toISOString();

  for (const item of items) {
    if (!item || !Array.isArray(item.numbers) || item.numbers.length === 0) continue;

    const count = Number(item.count || item.numbers.length);
    const amountPerNumber = Number(
      item.amountPerNumber ?? (count > 0 ? Number(item.totalAmount || 0) / count : 0)
    );
    if (!Number.isFinite(amountPerNumber) || amountPerNumber <= 0) continue;

    for (const number of item.numbers) {
      const numberText = String(number || "");
      if (!/^\d{2}$/.test(numberText)) {
        throw new Error(`2D ဂဏန်းမမှန်ပါ: ${numberText}`);
      }
      statements.push(
        db.prepare(`
          UPDATE ledger_totals
          SET total_amount = total_amount + ?, updated_at = ?
          WHERE scope_id = ? AND number = ?
        `).bind(Math.round(amountPerNumber), now, Number(scopeId), numberText)
      );
    }
  }

  if (statements.length) await db.batch(statements);
  return { success: true, updatedCount: statements.length };
}

export async function getNumberTotals(db, scopeId) {
  await ensureNumberTotals(db, scopeId);
  const { results } = await db.prepare(`
    SELECT number, total_amount, updated_at
    FROM ledger_totals
    WHERE scope_id = ?
    ORDER BY number ASC
  `).bind(Number(scopeId)).all();
  return results;
}

export async function getNumberTotal(db, scopeId, number) {
  await ensureNumberTotals(db, scopeId);
  const numberText = String(number ?? "").trim().padStart(2, "0");
  if (!/^\d{2}$/.test(numberText)) throw new Error("00 မှ 99 အတွင်း ဂဏန်းထည့်ပါ။");
  return db.prepare(`
    SELECT number, total_amount, updated_at
    FROM ledger_totals
    WHERE scope_id = ? AND number = ?
  `).bind(Number(scopeId), numberText).first();
}

export async function getUntouchedNumbers(db, scopeId) {
  await ensureNumberTotals(db, scopeId);
  const { results } = await db.prepare(`
    SELECT number, total_amount
    FROM ledger_totals
    WHERE scope_id = ? AND total_amount = 0
    ORDER BY number ASC
  `).bind(Number(scopeId)).all();
  return results;
}

export async function getTopNumbers(db, scopeId, limit = 10) {
  await ensureNumberTotals(db, scopeId);
  const parsed = Number(limit);
  const safeLimit = Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 100) : 10;
  const { results } = await db.prepare(`
    SELECT number, total_amount
    FROM ledger_totals
    WHERE scope_id = ? AND total_amount > 0
    ORDER BY total_amount DESC, number ASC
    LIMIT ?
  `).bind(Number(scopeId), safeLimit).all();
  return results;
}

export async function getNumbersBelowAmount(db, scopeId, amount) {
  await ensureNumberTotals(db, scopeId);
  const limit = Number(amount);
  if (!Number.isFinite(limit) || limit < 0) throw new Error("Amount မမှန်ပါ။");
  const { results } = await db.prepare(`
    SELECT number, total_amount
    FROM ledger_totals
    WHERE scope_id = ? AND total_amount < ?
    ORDER BY total_amount ASC, number ASC
  `).bind(Number(scopeId), limit).all();
  return results;
}

export async function getNumbersAboveAmount(db, scopeId, amount) {
  await ensureNumberTotals(db, scopeId);
  const limit = Number(amount);
  if (!Number.isFinite(limit) || limit < 0) throw new Error("Amount မမှန်ပါ။");
  const { results } = await db.prepare(`
    SELECT number, total_amount
    FROM ledger_totals
    WHERE scope_id = ? AND total_amount > ?
    ORDER BY total_amount DESC, number ASC
  `).bind(Number(scopeId), limit).all();
  return results;
}

/* TRANSACTIONS / SALES */
export async function ensureTransactions(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      user_id INTEGER,
      bet_text TEXT NOT NULL,
      total_amount INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `).run();

  const { results = [] } = await db
    .prepare(`PRAGMA table_info(transactions)`)
    .all();
  const hasUserId = results.some((column) => column.name === "user_id");
  if (!hasUserId) {
    await db.prepare(`ALTER TABLE transactions ADD COLUMN user_id INTEGER`).run();
  }
}

export async function saveTransaction(db, scopeId, userId, betText, totalAmount, createdAt) {
  await ensureTransactions(db);
  return db.prepare(`
    INSERT INTO transactions (chat_id, user_id, bet_text, total_amount, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(Number(scopeId), Number(userId) || null, betText, Number(totalAmount) || 0, createdAt).run();
}

export async function getTotalSales(db, scopeId = null) {
  await ensureTransactions(db);
  const row = scopeId === null
    ? await db.prepare(`SELECT COALESCE(SUM(total_amount), 0) AS total_sales FROM transactions`).first()
    : await db.prepare(`
        SELECT COALESCE(SUM(total_amount), 0) AS total_sales
        FROM transactions WHERE chat_id = ?
      `).bind(Number(scopeId)).first();
  return Number(row?.total_sales || 0);
}

export async function getUserSales(db, scopeId) {
  await ensureTransactions(db);
  const row = await db.prepare(`
    SELECT COUNT(*) AS transaction_count,
           COALESCE(SUM(total_amount), 0) AS total_sales
    FROM transactions WHERE chat_id = ?
  `).bind(Number(scopeId)).first();
  return {
    chatId: scopeId,
    transactionCount: Number(row?.transaction_count || 0),
    totalSales: Number(row?.total_sales || 0)
  };
}

export async function resetNumberTotals(db, scopeId = null) {
  await ensureLedgerTable(db);
  if (scopeId === null) {
    return db.prepare(`UPDATE ledger_totals SET total_amount = 0, updated_at = ?`)
      .bind(new Date().toISOString()).run();
  }
  await ensureNumberTotals(db, scopeId);
  return db.prepare(`
    UPDATE ledger_totals SET total_amount = 0, updated_at = ? WHERE scope_id = ?
  `).bind(new Date().toISOString(), Number(scopeId)).run();
}

export async function resetTransactions(db, scopeId = null) {
  await ensureTransactions(db);
  if (scopeId === null) return db.prepare(`DELETE FROM transactions`).run();
  return db.prepare(`DELETE FROM transactions WHERE chat_id = ?`).bind(Number(scopeId)).run();
}
