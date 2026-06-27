const fs = require("fs");
const path = require("path");

const SCHEMA_VERSION = 1;
const DEFAULT_DATABASE_PATH = path.join(__dirname, "data", "kinoauk.sqlite");

function loadDatabaseSync() {
  try {
    return require("node:sqlite").DatabaseSync;
  } catch (error) {
    const message = [
      "Киноаук needs Node.js with the built-in node:sqlite module for the rental database.",
      "Use the bundled/current Node 24 runtime, or postpone TMDb rental storage until an SQLite dependency is approved.",
      `Original error: ${error.message}`
    ].join(" ");
    throw new Error(message);
  }
}

function openRentalDatabase(databasePath = DEFAULT_DATABASE_PATH) {
  if (databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const DatabaseSync = loadDatabaseSync();
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON;");
  migrateRentalDatabase(database);
  return database;
}

function migrateRentalDatabase(database) {
  database.exec("PRAGMA foreign_keys = ON;");
  const currentVersion = Number(database.prepare("PRAGMA user_version").get().user_version || 0);

  if (currentVersion > SCHEMA_VERSION) {
    throw new Error(`Rental database schema ${currentVersion} is newer than this app supports (${SCHEMA_VERSION}).`);
  }

  if (currentVersion < 1) {
    database.exec(SCHEMA_V1);
    database.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  }
}

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY,
  tmdb_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  title TEXT NOT NULL,
  original_title TEXT,
  year INTEGER,
  overview TEXT,
  runtime_minutes INTEGER,
  vote_average REAL,
  vote_count INTEGER,
  popularity REAL,
  poster_path TEXT,
  backdrop_path TEXT,
  origin_country_json TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tmdb_id, media_type)
);

CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY,
  tmdb_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  original_name TEXT,
  profile_path TEXT,
  known_for_department TEXT,
  popularity REAL,
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS genres (
  id INTEGER PRIMARY KEY,
  tmdb_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv', 'shared')),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tmdb_id, media_type)
);

CREATE TABLE IF NOT EXISTS media_genres (
  media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (media_id, genre_id)
);

CREATE TABLE IF NOT EXISTS media_credits (
  id INTEGER PRIMARY KEY,
  media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  job TEXT NOT NULL,
  character TEXT,
  credit_order INTEGER,
  UNIQUE (media_id, person_id, department, job, character)
);

CREATE TABLE IF NOT EXISTS rental_sessions (
  id INTEGER PRIMARY KEY,
  query_label TEXT NOT NULL,
  filters_json TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('tmdb')),
  total_count INTEGER NOT NULL DEFAULT 0,
  selection_mode TEXT CHECK (selection_mode IN ('wheel', 'vhs_machine')),
  selected_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  selected_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rental_session_items (
  session_id INTEGER NOT NULL REFERENCES rental_sessions(id) ON DELETE CASCADE,
  media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  tmdb_rank INTEGER,
  random_order INTEGER,
  PRIMARY KEY (session_id, media_id)
);

CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY,
  scope TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS watch_sources (
  id INTEGER PRIMARY KEY,
  owner TEXT NOT NULL CHECK (owner IN ('maxim', 'olya')),
  source TEXT NOT NULL CHECK (source IN ('kinopoisk_watched')),
  url TEXT NOT NULL,
  last_imported_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner, source, url)
);

CREATE TABLE IF NOT EXISTS watched_items (
  source_id INTEGER NOT NULL REFERENCES watch_sources(id) ON DELETE CASCADE,
  media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  watched_by TEXT NOT NULL CHECK (watched_by IN ('maxim', 'olya')),
  external_url TEXT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (source_id, media_id)
);

CREATE INDEX IF NOT EXISTS idx_media_tmdb ON media(tmdb_id, media_type);
CREATE INDEX IF NOT EXISTS idx_people_tmdb ON people(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_media_credits_person ON media_credits(person_id, department, job);
CREATE INDEX IF NOT EXISTS idx_rental_session_items_session ON rental_session_items(session_id);
CREATE INDEX IF NOT EXISTS idx_watched_items_media ON watched_items(media_id);
`;

module.exports = {
  DEFAULT_DATABASE_PATH,
  SCHEMA_VERSION,
  migrateRentalDatabase,
  openRentalDatabase
};
