/**
 * New Zealand 2D Ledger Bot
 * src/database.js
 */

/*
 * =========================================
 * USER FUNCTIONS
 * =========================================
 */

export async function getUser(
  db,
  chatId
) {
  const { results } = await db
    .prepare(`
      SELECT *
      FROM users
      WHERE chat_id = ?
    `)
    .bind(chatId)
    .all();

  return results.length
    ? results[0]
    : null;
}

export async function createUser(
  db,
  chatId,
  username,
  firstName
) {
  return db
    .prepare(`
      INSERT OR IGNORE INTO users
      (
        chat_id,
        username,
        first_name,
        created_at
      )
      VALUES (?, ?, ?, ?)
    `)
    .bind(
      chatId,
      username || "",
      firstName || "",
      new Date().toISOString()
    )
    .run();
}

export async function updateLicense(
  db,
  chatId,
  status,
  plan,
  expiresAt
) {
  return db
    .prepare(`
      UPDATE users
      SET
        status = ?,
        plan = ?,
        expires_at = ?,
        updated_at = ?
      WHERE chat_id = ?
    `)
    .bind(
      status,
      plan,
      expiresAt,
      new Date().toISOString(),
      chatId
    )
    .run();
}

export async function getUsers(db) {
  const { results } = await db
    .prepare(`
      SELECT *
      FROM users
      ORDER BY created_at DESC
    `)
    .all();

  return results;
}

/*
 * =========================================
 * NUMBER TOTALS TABLE
 * =========================================
 */

export async function ensureNumberTotals(
  db
) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS number_totals
    (
      number TEXT PRIMARY KEY,
      total_amount INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT
    )
  `).run();

  const statements = [];
  const now = new Date().toISOString();

  for (
    let number = 0;
    number <= 99;
    number++
  ) {
    const numberText =
      String(number).padStart(2, "0");

    statements.push(
      db.prepare(`
        INSERT OR IGNORE INTO number_totals
        (
          number,
          total_amount,
          updated_at
        )
        VALUES (?, 0, ?)
      `).bind(
        numberText,
        now
      )
    );
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }
}

/*
 * =========================================
 * BET NUMBERS SAVE
 * =========================================
 *
 * Parser ကပြန်ပေးတဲ့ items ကို
 * number_totals ထဲ ပေါင်းသိမ်းမယ်။
 *
 * ဥပမာ:
 * 67R 500
 *
 * 67 = +500
 * 76 = +500
 */

export async function addBetItemsToNumberTotals(
  db,
  items = []
) {
  if (!Array.isArray(items)) {
    throw new Error(
      "Bet items ပုံစံမမှန်ပါ။"
    );
  }

  await ensureNumberTotals(db);

  const statements = [];
  const now = new Date().toISOString();

  for (const item of items) {
    if (
      !item ||
      !Array.isArray(item.numbers)
    ) {
      continue;
    }

    const count =
      Number(item.count || 0);

    const totalAmount =
      Number(item.totalAmount || 0);

    const amountPerNumber =
      Number(
        item.amountPerNumber ??
        (
          count > 0
            ? totalAmount / count
            : 0
        )
      );

    if (
      !Number.isFinite(amountPerNumber) ||
      amountPerNumber <= 0
    ) {
      continue;
    }

    for (const number of item.numbers) {
      const numberText =
        String(number || "");

      if (!/^\d{2}$/.test(numberText)) {
        throw new Error(
          `2D ဂဏန်းမမှန်ပါ: ${numberText}`
        );
      }

      statements.push(
        db.prepare(`
          UPDATE number_totals
          SET
            total_amount =
              total_amount + ?,
            updated_at = ?
          WHERE number = ?
        `).bind(
          amountPerNumber,
          now,
          numberText
        )
      );
    }
  }

  if (statements.length === 0) {
    return {
      success: true,
      updatedCount: 0
    };
  }

  await db.batch(statements);

  return {
    success: true,
    updatedCount:
      statements.length
  };
}

/*
 * =========================================
 * 00–99 REPORT
 * =========================================
 */

export async function getNumberTotals(
  db
) {
  await ensureNumberTotals(db);

  const { results } = await db
    .prepare(`
      SELECT
        number,
        total_amount,
        updated_at
      FROM number_totals
      ORDER BY number ASC
    `)
    .all();

  return results;
}

/*
 * =========================================
 * NUMBER တစ်လုံး REPORT
 * =========================================
 */

export async function getNumberTotal(
  db,
  number
) {
  await ensureNumberTotals(db);

  const numberText =
    String(number || "").padStart(2, "0");

  if (!/^\d{2}$/.test(numberText)) {
    throw new Error(
      "00 မှ 99 အတွင်း ဂဏန်းထည့်ပါ။"
    );
  }

  return db
    .prepare(`
      SELECT
        number,
        total_amount,
        updated_at
      FROM number_totals
      WHERE number = ?
    `)
    .bind(numberText)
    .first();
}

/*
 * =========================================
 * မထိုးရသေးသော ဂဏန်းများ
 * =========================================
 */

export async function getUntouchedNumbers(
  db
) {
  await ensureNumberTotals(db);

  const { results } = await db
    .prepare(`
      SELECT
        number,
        total_amount
      FROM number_totals
      WHERE total_amount = 0
      ORDER BY number ASC
    `)
    .all();

  return results;
}

/*
 * =========================================
 * သတ်မှတ် Amount အောက်
 * =========================================
 *
 * ဥပမာ:
 * 1000 အောက်
 */

export async function getNumbersBelowAmount(
  db,
  amount
) {
  await ensureNumberTotals(db);

  const limit = Number(amount);

  if (
    !Number.isFinite(limit) ||
    limit < 0
  ) {
    throw new Error(
      "Amount မမှန်ပါ။"
    );
  }

  const { results } = await db
    .prepare(`
      SELECT
        number,
        total_amount
      FROM number_totals
      WHERE total_amount < ?
      ORDER BY
        total_amount ASC,
        number ASC
    `)
    .bind(limit)
    .all();

  return results;
}

/*
 * =========================================
 * သတ်မှတ် Amount အထက်
 * =========================================
 *
 * ဥပမာ:
 * 5000 အထက်
 */

export async function getNumbersAboveAmount(
  db,
  amount
) {
  await ensureNumberTotals(db);

  const limit = Number(amount);

  if (
    !Number.isFinite(limit) ||
    limit < 0
  ) {
    throw new Error(
      "Amount မမှန်ပါ။"
    );
  }

  const { results } = await db
    .prepare(`
      SELECT
        number,
        total_amount
      FROM number_totals
      WHERE total_amount > ?
      ORDER BY
        total_amount DESC,
        number ASC
    `)
    .bind(limit)
    .all();

  return results;
}

/*
 * =========================================
 * ထိုးငွေအများဆုံး Numbers
 * =========================================
 */

export async function getTopNumbers(
  db,
  limit = 10
) {
  await ensureNumberTotals(db);

  const safeLimit =
    Number.isInteger(Number(limit)) &&
    Number(limit) > 0
      ? Math.min(Number(limit), 100)
      : 10;

  const { results } = await db
    .prepare(`
      SELECT
        number,
        total_amount
      FROM number_totals
      ORDER BY
        total_amount DESC,
        number ASC
      LIMIT ?
    `)
    .bind(safeLimit)
    .all();

  return results;
}

/*
 * =========================================
 * စုစုပေါင်းရောင်းအား
 * =========================================
 */

export async function getTotalSales(db) {
  const row = await db
    .prepare(`
      SELECT
        COALESCE(
          SUM(total_amount),
          0
        ) AS total_sales
      FROM transactions
    `)
    .first();

  return Number(
    row?.total_sales || 0
  );
}

/*
 * =========================================
 * User တစ်ယောက်ချင်း ရောင်းအား
 * =========================================
 */

export async function getUserSales(
  db,
  chatId
) {
  const row = await db
    .prepare(`
      SELECT
        COUNT(*) AS transaction_count,
        COALESCE(
          SUM(total_amount),
          0
        ) AS total_sales
      FROM transactions
      WHERE chat_id = ?
    `)
    .bind(chatId)
    .first();

  return {
    chatId,
    transactionCount:
      Number(
        row?.transaction_count || 0
      ),
    totalSales:
      Number(
        row?.total_sales || 0
      )
  };
}

/*
 * =========================================
 * RESET NUMBER TOTALS
 * =========================================
 *
 * နောက်ပိုင်း Admin command ကနေ
 * အသုံးပြုရန်။
 */

export async function resetNumberTotals(
  db
) {
  await ensureNumberTotals(db);

  return db
    .prepare(`
      UPDATE number_totals
      SET
        total_amount = 0,
        updated_at = ?
    `)
    .bind(
      new Date().toISOString()
    )
    .run();
      }
