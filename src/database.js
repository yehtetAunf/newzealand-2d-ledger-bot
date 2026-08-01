export async function getUser(db, chatId) {
  const { results } = await db
    .prepare("SELECT * FROM users WHERE chat_id = ?")
    .bind(chatId)
    .all();

  return results.length ? results[0] : null;
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
    .prepare("SELECT * FROM users ORDER BY created_at DESC")
    .all();

  return results;
}
