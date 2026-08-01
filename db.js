// db.js — SQLite database connection and schema.
// Uses a single file (ticket_market.db) that lives next to this file.
// better-sqlite3 is synchronous, which keeps route code simple and fast
// for a small-to-medium marketplace like this.

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'ticket_market.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username    TEXT PRIMARY KEY,
    pin_hash    TEXT NOT NULL,
    contact     TEXT NOT NULL,
    bank        TEXT DEFAULT '',
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS listings (
    id              TEXT PRIMARY KEY,
    event           TEXT NOT NULL,
    date            TEXT,
    section         TEXT,
    venue           TEXT NOT NULL,
    qty             INTEGER NOT NULL,
    price           REAL NOT NULL,
    original_price  REAL,
    description     TEXT,
    contact         TEXT NOT NULL,
    seller          TEXT NOT NULL REFERENCES users(username),
    status          TEXT NOT NULL DEFAULT 'available',
    created_at      INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payment_notices (
    id          TEXT PRIMARY KEY,
    listing_id  TEXT NOT NULL REFERENCES listings(id),
    amount      REAL NOT NULL,
    note        TEXT,
    by_user     TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    username    TEXT NOT NULL,
    sender      TEXT NOT NULL CHECK (sender IN ('user','admin')),
    text        TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payments (
    id          TEXT PRIMARY KEY,
    listing_id  TEXT NOT NULL REFERENCES listings(id),
    charge_id   TEXT NOT NULL,
    buyer       TEXT NOT NULL,
    amount      REAL NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS listing_messages (
    id          TEXT PRIMARY KEY,
    listing_id  TEXT NOT NULL REFERENCES listings(id),
    buyer       TEXT NOT NULL,
    sender      TEXT NOT NULL CHECK (sender IN ('buyer','seller')),
    text        TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );
`);

module.exports = db;
// db.js — SQLite database connection and schema.
// Uses a single file (ticket_market.db) that lives next to this file.
// better-sqlite3 is synchronous, which keeps route code simple and fast
// for a small-to-medium marketplace like this.

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'ticket_market.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username    TEXT PRIMARY KEY,
    pin_hash    TEXT NOT NULL,
    contact     TEXT NOT NULL,
    bank        TEXT DEFAULT '',
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS listings (
    id              TEXT PRIMARY KEY,
    event           TEXT NOT NULL,
    date            TEXT,
    section         TEXT,
    venue           TEXT NOT NULL,
    qty             INTEGER NOT NULL,
    price           REAL NOT NULL,
    original_price  REAL,
    description     TEXT,
    contact         TEXT NOT NULL,
    seller          TEXT NOT NULL REFERENCES users(username),
    status          TEXT NOT NULL DEFAULT 'available',
    created_at      INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payment_notices (
    id          TEXT PRIMARY KEY,
    listing_id  TEXT NOT NULL REFERENCES listings(id),
    amount      REAL NOT NULL,
    note        TEXT,
    by_user     TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    username    TEXT NOT NULL,
    sender      TEXT NOT NULL CHECK (sender IN ('user','admin')),
    text        TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payments (
    id          TEXT PRIMARY KEY,
    listing_id  TEXT NOT NULL REFERENCES listings(id),
    charge_id   TEXT NOT NULL,
    buyer       TEXT NOT NULL,
    amount      REAL NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    created_at  INTEGER NOT NULL
  );
`);

module.exports = db;
