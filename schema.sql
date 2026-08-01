CREATE TABLE IF NOT EXISTS users (
    chat_id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,

    status TEXT DEFAULT 'pending',
    plan TEXT DEFAULT 'none',

    expires_at TEXT,

    created_at TEXT,
    updated_at TEXT
);
