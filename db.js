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
    dvsa_licence TEXT NOT NULL,
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
`);

// Migration: make telegram fields and dvsa_licence optional on existing DBs
// SQLite can't drop NOT NULL, so we recreate the table if needed
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS monitors_new (
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
    INSERT OR IGNORE INTO monitors_new SELECT * FROM monitors;
    DROP TABLE monitors;
    ALTER TABLE monitors_new RENAME TO monitors;
  `);
} catch (e) {
  // Already migrated or migration not needed
}

module.exports = db;
