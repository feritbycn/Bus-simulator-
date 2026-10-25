const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(process.env.DB_FILE || path.join(DATA_DIR, 'nova.db'));

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT UNIQUE NOT NULL,
  token TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  lang TEXT DEFAULT 'en',
  platform TEXT DEFAULT 'web',
  country TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  best_level INTEGER NOT NULL DEFAULT 0,
  coins INTEGER NOT NULL DEFAULT 0,
  props TEXT NOT NULL DEFAULT '{}',
  stars INTEGER NOT NULL DEFAULT 0,
  ad_free INTEGER NOT NULL DEFAULT 0,
  vip_until INTEGER NOT NULL DEFAULT 0,
  vip_last_daily TEXT DEFAULT '',
  daily_day INTEGER NOT NULL DEFAULT 0,
  daily_last TEXT DEFAULT '',
  daily_doubled TEXT DEFAULT '',
  spin_last_free INTEGER NOT NULL DEFAULT 0,
  spin_extra INTEGER NOT NULL DEFAULT 0,
  supply_last INTEGER NOT NULL DEFAULT 0,
  missions TEXT NOT NULL DEFAULT '[]',
  missions_day TEXT DEFAULT '',
  chest_claimed INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  playtime_ms INTEGER NOT NULL DEFAULT 0,
  spent_cents INTEGER NOT NULL DEFAULT 0,
  one_time TEXT NOT NULL DEFAULT '[]',
  wins_since_inter INTEGER NOT NULL DEFAULT 0,
  last_inter INTEGER NOT NULL DEFAULT 0,
  flags INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_players_created ON players(created_at);
CREATE INDEX IF NOT EXISTS idx_players_seen ON players(last_seen);
CREATE INDEX IF NOT EXISTS idx_players_best ON players(best_level DESC);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,
  start INTEGER NOT NULL,
  last_ping INTEGER NOT NULL,
  day TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_day ON sessions(day, player_id);
CREATE INDEX IF NOT EXISTS idx_sessions_player ON sessions(player_id, last_ping);

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,
  level INTEGER NOT NULL,
  start INTEGER NOT NULL,
  end INTEGER,
  result TEXT DEFAULT 'started',
  stars INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  reward INTEGER DEFAULT 0,
  doubled INTEGER DEFAULT 0,
  charged TEXT DEFAULT '{}',
  revives INTEGER DEFAULT 0,
  revives_used INTEGER DEFAULT 0,
  attempt INTEGER DEFAULT 1,
  day TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_level ON runs(level, result);
CREATE INDEX IF NOT EXISTS idx_runs_day ON runs(day);
CREATE INDEX IF NOT EXISTS idx_runs_player ON runs(player_id, level);

CREATE TABLE IF NOT EXISTS ad_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,
  placement TEXT NOT NULL,
  token TEXT UNIQUE,
  extra TEXT DEFAULT '',
  start INTEGER NOT NULL,
  done INTEGER,
  status TEXT NOT NULL DEFAULT 'started',
  day TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ads_day ON ad_events(day, status);

CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  cents INTEGER NOT NULL,
  provider TEXT NOT NULL,
  ts INTEGER NOT NULL,
  day TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_purch_day ON purchases(day);

CREATE TABLE IF NOT EXISTS metrics_minute (
  ts INTEGER PRIMARY KEY,
  online INTEGER NOT NULL,
  playing INTEGER NOT NULL
);
`);

const q = (sql) => db.prepare(sql);
const dayKey = (ts = Date.now()) => new Date(ts).toISOString().slice(0, 10);

module.exports = { db, q, dayKey, DATA_DIR };
