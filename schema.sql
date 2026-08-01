CREATE TABLE IF NOT EXISTS users (
    chat_id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,

    status TEXT NOT NULL DEFAULT 'pending',

    plan TEXT NOT NULL DEFAULT 'free',

    expires_at TEXT,

    created_at TEXT NOT NULL,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    chat_id INTEGER NOT NULL,

    bet_text TEXT NOT NULL,

    bet_type TEXT NOT NULL,

    total_numbers INTEGER NOT NULL,

    amount_per_number INTEGER NOT NULL,

    total_amount INTEGER NOT NULL,

    created_at TEXT NOT NULL
);
