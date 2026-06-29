function runMigrations() {
  const { getDb } = require('./db');
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jid TEXT UNIQUE,
      name TEXT,
      language TEXT DEFAULT 'en',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_jid TEXT,
      messages TEXT,
      updated_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_jid TEXT,
      order_id TEXT,
      status TEXT,
      details TEXT,
      created_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_jid TEXT,
      date TEXT,
      time TEXT,
      service TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_jid TEXT,
      name TEXT,
      email TEXT,
      phone TEXT,
      stage TEXT,
      data TEXT,
      created_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_jid TEXT,
      rating INTEGER,
      comment TEXT,
      created_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_jid TEXT,
      subject TEXT,
      description TEXT,
      status TEXT DEFAULT 'open',
      created_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_jid TEXT,
      game TEXT,
      score INTEGER,
      data TEXT,
      created_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS cron_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      user_jid TEXT,
      data TEXT,
      next_run DATETIME,
      created_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS otp_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_jid TEXT,
      code TEXT,
      purpose TEXT,
      expires_at DATETIME,
      verified INTEGER DEFAULT 0,
      created_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      sku TEXT UNIQUE,
      stock INTEGER,
      price REAL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_jid TEXT,
      plan TEXT,
      status TEXT,
      start_date DATETIME,
      end_date DATETIME
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_jid TEXT,
      title TEXT,
      content TEXT,
      encrypted INTEGER DEFAULT 0,
      created_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS branch_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      address TEXT,
      latitude REAL,
      longitude REAL,
      phone TEXT
    );

    CREATE TABLE IF NOT EXISTS faq_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT,
      answer TEXT,
      keywords TEXT,
      category TEXT
    );
  `);
}

module.exports = { runMigrations };
