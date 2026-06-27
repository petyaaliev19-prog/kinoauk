const assert = require("node:assert/strict");
const { Readable, Writable } = require("node:stream");
const test = require("node:test");

const { openRentalDatabase } = require("../rental-db");
const {
  buildRentalPool,
  createRentalSession,
  getRentalGenres,
  getRentalSession,
  normalizeRentalSessionFilters,
  readRentalSession,
  selectRentalSession,
  selectRentalWinner,
  selectionModeForPool,
  searchRentalPeople
} = require("../server");
const {
  fetchTmdbGenres,
  normalizeTmdbGenres,
  normalizeTmdbPeople,
  readDotEnv,
  saveTmdbGenres,
  saveTmdbPeople,
  searchTmdbPeople,
  tmdbToken
} = require("../tmdb-client");

function createJsonResponse() {
  const chunks = [];
  const response = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    }
  });
  response.writeHead = (status, headers) => {
    response.statusCode = status;
    response.headers = headers;
  };
  response.body = () => JSON.parse(Buffer.concat(chunks).toString("utf8"));
  return response;
}

function createJsonRequest(payload) {
  const text = payload === undefined ? "" : JSON.stringify(payload);
  return Readable.from([text]);
}

test("readDotEnv and tmdbToken read TMDb token without exposing it to the browser", () => {
  const values = readDotEnv("__missing_kinoauk_env_file__");

  assert.deepEqual(values, {});
  assert.equal(tmdbToken({ TMDB_API_TOKEN: " token-123 " }, "__missing_kinoauk_env_file__"), "token-123");
});

test("normalizeTmdbPeople keeps compact person suggestions and known titles", () => {
  const people = normalizeTmdbPeople([
    {
      id: 287,
      name: "Brad Pitt",
      original_name: "Brad Pitt",
      profile_path: "/pitt.jpg",
      known_for_department: "Acting",
      popularity: 80.5,
      known_for: [
        { title: "Fight Club" },
        { title: "Se7en" },
        { name: "Friends" },
        { title: "Ocean's Eleven" }
      ]
    },
    { id: null, name: "Broken Person" }
  ]);

  assert.deepEqual(people, [{
    tmdbId: 287,
    name: "Brad Pitt",
    originalName: "Brad Pitt",
    profilePath: "/pitt.jpg",
    knownForDepartment: "Acting",
    popularity: 80.5,
    knownFor: ["Fight Club", "Se7en", "Friends"]
  }]);
});

test("searchTmdbPeople calls TMDb person search only and normalizes candidates", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      async json() {
        return {
          results: [{
            id: 287,
            name: "Brad Pitt",
            original_name: "Brad Pitt",
            known_for_department: "Acting",
            profile_path: "/profile.jpg",
            popularity: 70,
            known_for: [{ title: "Fight Club" }]
          }]
        };
      }
    };
  };

  const results = await searchTmdbPeople("Питт", { fetchImpl, token: "test-token" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.pathname, "/3/search/person");
  assert.equal(calls[0].url.searchParams.get("query"), "Питт");
  assert.equal(calls[0].url.searchParams.get("include_adult"), "false");
  assert.equal(calls[0].options.headers.authorization, "Bearer test-token");
  assert.equal(results[0].tmdbId, 287);
  assert.equal(results[0].name, "Brad Pitt");
});

test("fetchTmdbGenres calls the matching TMDb genre endpoint and normalizes media type", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      async json() {
        return {
          genres: [
            { id: 28, name: "Action" },
            { id: 18, name: "Drama" }
          ]
        };
      }
    };
  };

  const genres = await fetchTmdbGenres("movie", { fetchImpl, token: "test-token" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.pathname, "/3/genre/movie/list");
  assert.equal(calls[0].url.searchParams.get("language"), "ru-RU");
  assert.equal(calls[0].options.headers.authorization, "Bearer test-token");
  assert.deepEqual(genres, [
    { tmdbId: 28, mediaType: "movie", name: "Action" },
    { tmdbId: 18, mediaType: "movie", name: "Drama" }
  ]);
});

test("normalizeTmdbGenres rejects unsupported rental media types", () => {
  assert.throws(() => normalizeTmdbGenres([{ id: 1, name: "Broken" }], "person"), /movie or tv/);
});

test("saveTmdbPeople upserts person suggestions into local SQLite", () => {
  const database = openRentalDatabase(":memory:");

  try {
    saveTmdbPeople(database, [{
      tmdbId: 287,
      name: "Brad Pitt",
      originalName: "Brad Pitt",
      profilePath: "/old.jpg",
      knownForDepartment: "Acting",
      popularity: 70,
      knownFor: ["Fight Club"]
    }]);
    saveTmdbPeople(database, [{
      tmdbId: 287,
      name: "Brad Pitt",
      originalName: "William Bradley Pitt",
      profilePath: "/new.jpg",
      knownForDepartment: "Acting",
      popularity: 90,
      knownFor: ["Se7en"]
    }]);

    const rows = database.prepare("SELECT tmdb_id, name, original_name, profile_path, popularity FROM people").all()
      .map((row) => ({ ...row }));
    assert.deepEqual(rows, [{
      tmdb_id: 287,
      name: "Brad Pitt",
      original_name: "William Bradley Pitt",
      profile_path: "/new.jpg",
      popularity: 90
    }]);
  } finally {
    database.close();
  }
});

test("saveTmdbGenres keeps movie and tv genres separate even when TMDb ids match", () => {
  const database = openRentalDatabase(":memory:");

  try {
    saveTmdbGenres(database, [
      { tmdbId: 18, mediaType: "movie", name: "Drama" },
      { tmdbId: 18, mediaType: "tv", name: "Drama TV" }
    ]);
    saveTmdbGenres(database, [
      { tmdbId: 18, mediaType: "movie", name: "Драма" }
    ]);

    const rows = database.prepare("SELECT tmdb_id, media_type, name FROM genres ORDER BY media_type").all()
      .map((row) => ({ ...row }));
    assert.deepEqual(rows, [
      { tmdb_id: 18, media_type: "movie", name: "Драма" },
      { tmdb_id: 18, media_type: "tv", name: "Drama TV" }
    ]);
  } finally {
    database.close();
  }
});

test("searchRentalPeople returns a clear error when TMDb token is missing", async () => {
  const response = createJsonResponse();

  await searchRentalPeople(new URL("http://localhost/api/rental/people?q=Питт"), response, {
    env: {},
    envPath: "__missing_kinoauk_env_file__"
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.body().error, "TMDB_TOKEN_MISSING");
});

test("searchRentalPeople uses mocked fetch and stores exact people, not movie pools", async () => {
  const database = openRentalDatabase(":memory:");
  const response = createJsonResponse();
  const fetchImpl = async () => ({
    ok: true,
    async json() {
      return {
        results: [
          {
            id: 287,
            name: "Brad Pitt",
            original_name: "Brad Pitt",
            known_for_department: "Acting",
            profile_path: "/pitt.jpg",
            popularity: 80,
            known_for: [{ title: "Fight Club" }, { title: "Snatch" }]
          },
          {
            id: 123,
            name: "Michael Pitt",
            known_for_department: "Acting",
            profile_path: "/michael.jpg",
            popularity: 20,
            known_for: [{ title: "Funny Games" }]
          }
        ]
      };
    }
  });

  try {
    await searchRentalPeople(new URL("http://localhost/api/rental/people?q=Питт"), response, {
      env: { TMDB_API_TOKEN: "test-token" },
      fetchImpl,
      keepDatabaseOpen: true,
      openDatabase: () => database
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body().results.map((person) => person.name), ["Brad Pitt", "Michael Pitt"]);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM people").get().count, 2);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM media").get().count, 0);
  } finally {
    database.close();
  }
});

test("getRentalGenres returns validation errors before touching TMDb", async () => {
  const response = createJsonResponse();

  await getRentalGenres(new URL("http://localhost/api/rental/genres?mediaType=person"), response, {
    env: { TMDB_API_TOKEN: "test-token" }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body().error, "INVALID_MEDIA_TYPE");
});

test("getRentalGenres returns a clear error when TMDb token is missing", async () => {
  const response = createJsonResponse();

  await getRentalGenres(new URL("http://localhost/api/rental/genres?mediaType=movie"), response, {
    env: {},
    envPath: "__missing_kinoauk_env_file__"
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.body().error, "TMDB_TOKEN_MISSING");
});

test("getRentalGenres uses mocked fetch and caches movie/tv genres without mixing them", async () => {
  const database = openRentalDatabase(":memory:");
  const movieResponse = createJsonResponse();
  const tvResponse = createJsonResponse();
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url.pathname);
    return {
      ok: true,
      async json() {
        return {
          genres: [{ id: 18, name: url.pathname.includes("/tv/") ? "Драма TV" : "Драма" }]
        };
      }
    };
  };

  try {
    await getRentalGenres(new URL("http://localhost/api/rental/genres?mediaType=movie"), movieResponse, {
      env: { TMDB_API_TOKEN: "test-token" },
      fetchImpl,
      keepDatabaseOpen: true,
      openDatabase: () => database
    });
    await getRentalGenres(new URL("http://localhost/api/rental/genres?mediaType=tv"), tvResponse, {
      env: { TMDB_API_TOKEN: "test-token" },
      fetchImpl,
      keepDatabaseOpen: true,
      openDatabase: () => database
    });

    assert.deepEqual(calls, ["/3/genre/movie/list", "/3/genre/tv/list"]);
    assert.equal(movieResponse.statusCode, 200);
    assert.equal(tvResponse.statusCode, 200);
    assert.equal(movieResponse.body().genres[0].mediaType, "movie");
    assert.equal(tvResponse.body().genres[0].mediaType, "tv");
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM genres").get().count, 2);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM media").get().count, 0);
  } finally {
    database.close();
  }
});

test("normalizeRentalSessionFilters requires a primary rental filter", () => {
  assert.throws(
    () => normalizeRentalSessionFilters({ includeTv: true }),
    /Нужен хотя бы один основной фильтр/
  );
});

test("buildRentalPool filters exact actor credits and mixes movie plus tv when includeTv is on", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url.pathname);
    if (url.pathname === "/3/person/287/movie_credits") {
      return {
        ok: true,
        async json() {
          return {
            cast: [
              { id: 550, title: "Fight Club", release_date: "1999-10-15", genre_ids: [18], vote_average: 8.4, poster_path: "/fight.jpg" },
              { id: 107, title: "Snatch", release_date: "2000-09-01", genre_ids: [80], vote_average: 7.8, poster_path: "/snatch.jpg" }
            ],
            crew: []
          };
        }
      };
    }
    if (url.pathname === "/3/person/287/tv_credits") {
      return {
        ok: true,
        async json() {
          return {
            cast: [
              { id: 9001, name: "King of the Hill", first_air_date: "2003-01-01", genre_ids: [18], vote_average: 7.1, origin_country: ["US"] }
            ],
            crew: []
          };
        }
      };
    }
    throw new Error(`Unexpected URL ${url.pathname}`);
  };

  const filters = normalizeRentalSessionFilters({
    genreTmdbIds: [18],
    actorTmdbId: 287,
    includeTv: true
  });

  const items = await buildRentalPool(filters, openRentalDatabase(":memory:"), {
    fetchImpl,
    token: "test-token"
  });

  assert.deepEqual(calls, ["/3/person/287/movie_credits", "/3/person/287/tv_credits"]);
  assert.deepEqual(items.map((item) => `${item.mediaType}:${item.title}`), [
    "movie:Fight Club",
    "tv:King of the Hill"
  ]);
});

test("buildRentalPool fetches all discover pages and deduplicates by tmdb id plus media type", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(`${url.pathname}?${url.searchParams.toString()}`);
    return {
      ok: true,
      async json() {
        const page = Number(url.searchParams.get("page"));
        if (page === 1) {
          return {
            page: 1,
            total_pages: 2,
            results: [
              { id: 1, title: "Page One", release_date: "2001-01-01", genre_ids: [28], vote_average: 7.2 },
              { id: 2, title: "Shared", release_date: "2002-01-01", genre_ids: [28], vote_average: 7.3 }
            ]
          };
        }
        return {
          page: 2,
          total_pages: 2,
          results: [
            { id: 2, title: "Shared", release_date: "2002-01-01", genre_ids: [28], vote_average: 7.3 },
            { id: 3, title: "Page Two", release_date: "2003-01-01", genre_ids: [28], vote_average: 7.4 }
          ]
        };
      }
    };
  };

  const filters = normalizeRentalSessionFilters({
    genreTmdbIds: [28],
    includeTv: false
  });

  const items = await buildRentalPool(filters, openRentalDatabase(":memory:"), {
    fetchImpl,
    token: "test-token"
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(items.map((item) => item.title), ["Page One", "Shared", "Page Two"]);
});

test("createRentalSession stores the full filtered pool and getRentalSession reads it back", async () => {
  const database = openRentalDatabase(":memory:");
  const createResponse = createJsonResponse();
  const readResponse = createJsonResponse();
  const fetchImpl = async (url) => {
    if (url.pathname === "/3/person/287/movie_credits") {
      return {
        ok: true,
        async json() {
          return {
            cast: [
              { id: 550, title: "Fight Club", release_date: "1999-10-15", genre_ids: [18], vote_average: 8.4, poster_path: "/fight.jpg" },
              { id: 551, title: "Meet Joe Black", release_date: "1998-11-12", genre_ids: [18], vote_average: 7.1, poster_path: "/joe.jpg" }
            ],
            crew: []
          };
        }
      };
    }
    throw new Error(`Unexpected URL ${url.pathname}`);
  };

  try {
    saveTmdbPeople(database, [{
      tmdbId: 287,
      name: "Brad Pitt",
      originalName: "Brad Pitt",
      profilePath: "/pitt.jpg",
      knownForDepartment: "Acting",
      popularity: 80.5,
      knownFor: ["Fight Club"]
    }]);
    saveTmdbGenres(database, [{ tmdbId: 18, mediaType: "movie", name: "Драма" }]);

    await createRentalSession(createJsonRequest({
      genreTmdbIds: [18],
      actorTmdbId: 287,
      includeTv: false
    }), createResponse, {
      env: { TMDB_API_TOKEN: "test-token" },
      fetchImpl,
      keepDatabaseOpen: true,
      openDatabase: () => database
    });

    const created = createResponse.body();
    assert.equal(createResponse.statusCode, 200);
    assert.equal(created.totalCount, 2);
    assert.equal(created.items.length, 2);
    assert.match(created.queryLabel, /Brad Pitt/);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM rental_sessions").get().count, 1);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM rental_session_items").get().count, 2);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM media").get().count, 2);

    await getRentalSession(readResponse, created.sessionId, {
      keepDatabaseOpen: true,
      openDatabase: () => database
    });

    assert.equal(readResponse.statusCode, 200);
    assert.equal(readResponse.body().items[0].title, "Fight Club");
  } finally {
    database.close();
  }
});

test("selectionModeForPool switches small pools to wheel and large pools to VHS machine", () => {
  assert.equal(selectionModeForPool(24, 24), "wheel");
  assert.equal(selectionModeForPool(25, 24), "vhs_machine");
});

test("selectRentalWinner chooses uniformly-addressable items from the saved full pool", () => {
  const database = openRentalDatabase(":memory:");

  try {
    const sessionId = seedRentalSession(database, ["First Tape", "Middle Tape", "Last Tape"]);

    const first = selectRentalWinner(database, sessionId, { random: () => 0, wheelLimit: 2 });
    assert.equal(first.selectionMode, "vhs_machine");
    assert.equal(first.selectedIndex, 1);
    assert.equal(first.selectedItem.title, "First Tape");

    const middle = selectRentalWinner(database, sessionId, { random: () => 0.34, wheelLimit: 10 });
    assert.equal(middle.selectionMode, "wheel");
    assert.equal(middle.selectedIndex, 2);
    assert.equal(middle.selectedItem.title, "Middle Tape");

    const last = selectRentalWinner(database, sessionId, { random: () => 0.999999, wheelLimit: 10 });
    assert.equal(last.selectedIndex, 3);
    assert.equal(last.selectedItem.title, "Last Tape");

    const persisted = readRentalSession(database, sessionId);
    assert.equal(persisted.selectionMode, "wheel");
    assert.equal(persisted.selectedItem.title, "Last Tape");
  } finally {
    database.close();
  }
});

test("selectRentalSession endpoint returns the selected cassette number and updates the session", async () => {
  const database = openRentalDatabase(":memory:");
  const response = createJsonResponse();

  try {
    const sessionId = seedRentalSession(database, ["Tape A", "Tape B", "Tape C"]);
    await selectRentalSession(response, sessionId, {
      keepDatabaseOpen: true,
      openDatabase: () => database,
      random: () => 0.67,
      wheelLimit: 2
    });

    const body = response.body();
    assert.equal(response.statusCode, 200);
    assert.equal(body.selectionMode, "vhs_machine");
    assert.equal(body.selectedIndex, 3);
    assert.equal(body.selectedItem.title, "Tape C");
    assert.equal(body.totalCount, 3);
    assert.equal(database.prepare("SELECT selected_media_id IS NOT NULL AS selected FROM rental_sessions WHERE id = ?").get(sessionId).selected, 1);
  } finally {
    database.close();
  }
});

function seedRentalSession(database, titles) {
  const insertMedia = database.prepare(`
    INSERT INTO media (tmdb_id, media_type, title)
    VALUES (?, 'movie', ?)
    RETURNING id
  `);
  const sessionId = database.prepare(`
    INSERT INTO rental_sessions (query_label, filters_json, source, total_count)
    VALUES ('Seeded rental', '{"genreTmdbIds":[18]}', 'tmdb', ?)
    RETURNING id
  `).get(titles.length).id;
  const insertItem = database.prepare(`
    INSERT INTO rental_session_items (session_id, media_id, tmdb_rank)
    VALUES (?, ?, ?)
  `);

  titles.forEach((title, index) => {
    const mediaId = insertMedia.get(1000 + index, title).id;
    insertItem.run(sessionId, mediaId, index + 1);
  });

  return sessionId;
}
