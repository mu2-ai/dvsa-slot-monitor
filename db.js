const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "dvsa.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    verified INTEGER DEFAULT 0,
    verify_token TEXT,
    verify_expires DATETIME,
    stripe_customer_id TEXT,
    subscription_status TEXT DEFAULT 'trial',
    trial_ends_at DATETIME DEFAULT (datetime('now', '+7 days')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS monitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    dvsa_licence TEXT DEFAULT '',
    dvsa_theory TEXT NOT NULL,
    telegram_token TEXT DEFAULT '',
    telegram_chat_id TEXT DEFAULT '',
    centres TEXT DEFAULT 'ALL_LONDON',
    active INTEGER DEFAULT 1,
    last_checked DATETIME,
    last_result TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    monitor_id INTEGER NOT NULL,
    centre_name TEXT,
    slot_dates TEXT,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (monitor_id) REFERENCES monitors(id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expire INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// ─── Migrations (safe ALTER TABLE ADD COLUMN — no-ops if column exists) ───────
const migrations = [
  // users table: add columns added after initial deployment
  "ALTER TABLE users ADD COLUMN verified INTEGER DEFAULT 0",
  "ALTER TABLE users ADD COLUMN verify_token TEXT",
  "ALTER TABLE users ADD COLUMN verify_expires DATETIME",
  "ALTER TABLE users ADD COLUMN stripe_customer_id TEXT",
  "ALTER TABLE users ADD COLUMN subscription_status TEXT DEFAULT 'trial'",
  "ALTER TABLE users ADD COLUMN trial_ends_at DATETIME",
  // monitors table: make telegram/licence optional
  "ALTER TABLE monitors ADD COLUMN telegram_token TEXT DEFAULT ''",
  "ALTER TABLE monitors ADD COLUMN telegram_chat_id TEXT DEFAULT ''",
];

for (const sql of migrations) {
  try { db.exec(sql); } catch {}
}

module.exports = db;
