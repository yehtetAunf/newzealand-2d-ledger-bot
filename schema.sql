CREATE TABLE IF NOT EXISTS users (
  chat_id INTEGER PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  plan TEXT DEFAULT 'none',
  approved INTEGER DEFAULT 0,
  expires_at TEXT,
  created_at TEXT
);
