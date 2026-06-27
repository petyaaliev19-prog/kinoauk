const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  DEFAULT_DATABASE_PATH,
  SCHEMA_VERSION,
  migrateRentalDatabase,
  openRentalDatabase
} = require("../rental-db");

function tempDatabasePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kinoauk-rental-db-"));
  return path.join(dir, "kinoauk.sqlite");
}

function tableNames(database) {
  return database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name);
}

function columns(database, tableName) {
  return database
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .map((row) => row.name);
}

test("openRentalDatabase creates the local SQLite file and core rental tables", () => {
  const databasePath = tempDatabasePath();
  const database = openRentalDatabase(databasePath);

  try {
    assert.equal(fs.existsSync(databasePath), true);
    assert.equal(database.prepare("PRAGMA user_version").get().user_version, SCHEMA_VERSION);
    assert.deepEqual(
      tableNames(database).filter((name) => !name.startsWith("sqlite_")),
      [
        "genres",
        "media",
        "media_credits",
        "media_genres",
        "people",
        "rental_session_items",
        "rental_sessions",
        "sync_log",
        "watch_sources",
        "watched_items"
      ]
    );
  } finally {
    database.close();
  }
});

test("rental database schema keeps media, people, credits, sessions, and watched-library fields", () => {
  const database = openRentalDatabase(":memory:");

  try {
    assert.deepEqual(columns(database, "media"), [
      "id",
      "tmdb_id",
      "media_type",
      "title",
      "original_title",
      "year",
      "overview",
      "runtime_minutes",
      "vote_average",
      "vote_count",
      "popularity",
      "poster_path",
      "backdrop_path",
      "origin_country_json",
      "last_synced_at",
      "created_at",
      "updated_at"
    ]);
    assert.deepEqual(columns(database, "people"), [
      "id",
      "tmdb_id",
      "name",
      "original_name",
      "profile_path",
      "known_for_department",
      "popularity",
      "last_synced_at",
      "created_at",
      "updated_at"
    ]);
    assert.deepEqual(columns(database, "media_credits"), [
      "id",
      "media_id",
      "person_id",
      "department",
      "job",
      "character",
      "credit_order"
    ]);
    assert.deepEqual(columns(database, "rental_sessions"), [
      "id",
      "query_label",
      "filters_json",
      "source",
      "total_count",
      "selection_mode",
      "selected_media_id",
      "selected_at",
      "created_at"
    ]);
    assert.deepEqual(columns(database, "watch_sources"), [
      "id",
      "owner",
      "source",
      "url",
      "last_imported_at",
      "created_at"
    ]);
  } finally {
    database.close();
  }
});

test("rental database migrations are idempotent and keep existing rows", () => {
  const database = openRentalDatabase(":memory:");

  try {
    database
      .prepare("INSERT INTO media (tmdb_id, media_type, title, year) VALUES (?, ?, ?, ?)")
      .run(550, "movie", "Fight Club", 1999);

    migrateRentalDatabase(database);
    migrateRentalDatabase(database);

    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM media").get().count, 1);
    assert.equal(database.prepare("PRAGMA user_version").get().user_version, SCHEMA_VERSION);
  } finally {
    database.close();
  }
});

test("rental database constraints prevent duplicate TMDb media and invalid session items", () => {
  const database = openRentalDatabase(":memory:");

  try {
    const insertMedia = database.prepare("INSERT INTO media (tmdb_id, media_type, title) VALUES (?, ?, ?)");
    insertMedia.run(550, "movie", "Fight Club");

    assert.throws(() => insertMedia.run(550, "movie", "Fight Club duplicate"), /UNIQUE/);
    insertMedia.run(550, "tv", "Fight Club: The Series");

    const movieId = database.prepare("SELECT id FROM media WHERE tmdb_id = 550 AND media_type = 'movie'").get().id;
    const person = database
      .prepare("INSERT INTO people (tmdb_id, name, known_for_department) VALUES (?, ?, ?) RETURNING id")
      .get(287, "Brad Pitt", "Acting");

    database
      .prepare("INSERT INTO media_credits (media_id, person_id, department, job, character, credit_order) VALUES (?, ?, ?, ?, ?, ?)")
      .run(movieId, person.id, "Acting", "Actor", "Tyler Durden", 0);

    const session = database
      .prepare("INSERT INTO rental_sessions (query_label, filters_json, source, total_count, selection_mode) VALUES (?, ?, ?, ?, ?) RETURNING id")
      .get("Боевик + Брэд Питт", "{\"includeTv\":false}", "tmdb", 1, "wheel");

    database
      .prepare("INSERT INTO rental_session_items (session_id, media_id, tmdb_rank) VALUES (?, ?, ?)")
      .run(session.id, movieId, 1);

    assert.throws(
      () => database.prepare("INSERT INTO rental_session_items (session_id, media_id) VALUES (?, ?)").run(session.id, 999999),
      /FOREIGN KEY/
    );
  } finally {
    database.close();
  }
});

test("rental database keeps local secrets and SQLite files out of git", () => {
  const gitignore = fs.readFileSync(".gitignore", "utf8");

  assert.match(gitignore, /^\.env$/m);
  assert.match(gitignore, /^data\/\*\.sqlite$/m);
  assert.match(gitignore, /^data\/\*\.sqlite-\*$/m);
  assert.equal(DEFAULT_DATABASE_PATH.endsWith(path.join("data", "kinoauk.sqlite")), true);
});
