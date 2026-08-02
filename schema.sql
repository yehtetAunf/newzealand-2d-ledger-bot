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
CREATE TABLE IF NOT EXISTS licensed_groups (
    group_id INTEGER PRIMARY KEY,
    owner_id INTEGER,
    group_title TEXT,

    status TEXT DEFAULT 'pending',
    plan TEXT DEFAULT 'none',

    expires_at TEXT,

    created_at TEXT,
    updated_at TEXT
);
