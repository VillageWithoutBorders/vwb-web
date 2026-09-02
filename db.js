const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./resources.db');

db.serialize(() => {
  db.run(\
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT,
      quantity INTEGER DEFAULT 0,
      location TEXT,
      notes TEXT,
      photo_url TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  \);
});

module.exports = db;
