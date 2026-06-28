const http = require("http");
const fs = require("fs");
const path = require("path");
const { openRentalDatabase } = require("./rental-db");
const {
  assertRentalMediaType,
  fetchTmdbDiscoverPool,
  fetchTmdbGenres,
  fetchTmdbPersonCredits,
  normalizeTmdbMedia,
  saveTmdbGenres,
  saveTmdbPeople,
  searchTmdbPeople,
  tmdbCredential
} = require("./tmdb-client");

const root = __dirname;
const port = Number(process.env.PORT || 5173);
const pidFile = path.join(root, "kinoauk-server.pid");
const kinopoiskListUrls = [
  "https://www.kinopoisk.ru/user/14758743/movies/planned-to-watch/",
  "https://www.kinopoisk.ru/user/33826991/movies/planned-to-watch/"
];
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};
const DEFAULT_RENTAL_WHEEL_LIMIT = 24;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === "/api/refresh") {
    importKinopoiskList(res);
    return;
  }

  if (url.pathname === "/api/rental/people" && req.method === "GET") {
    searchRentalPeople(url, res);
    return;
  }

  if (url.pathname === "/api/rental/genres" && req.method === "GET") {
    getRentalGenres(url, res);
    return;
  }

  if (url.pathname === "/api/rental/config" && req.method === "GET") {
    getRentalConfig(res);
    return;
  }

  if (url.pathname === "/api/rental/sessions" && req.method === "POST") {
    createRentalSession(req, res);
    return;
  }

  const rentalSessionMatch = /^\/api\/rental\/sessions\/(\d+)$/.exec(url.pathname);
  if (rentalSessionMatch && req.method === "GET") {
    getRentalSession(res, Number(rentalSessionMatch[1]));
    return;
  }

  const rentalSelectMatch = /^\/api\/rental\/sessions\/(\d+)\/select$/.exec(url.pathname);
  if (rentalSelectMatch && req.method === "POST") {
    selectRentalSession(res, Number(rentalSelectMatch[1]));
    return;
  }

  if (url.pathname === "/api/shutdown" && req.method === "POST") {
    sendJson(res, 200, { ok: true });
    setTimeout(() => {
      cleanupPid();
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 500);
    }, 150);
    return;
  }

  const requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(root, requested));

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
});

if (require.main === module) {
  server.listen(port, "127.0.0.1", () => {
    fs.writeFileSync(pidFile, String(process.pid));
    console.log(`Киноаук открыт на http://127.0.0.1:${port}`);
  });
}

function cleanupPid() {
  try {
    if (fs.existsSync(pidFile) && fs.readFileSync(pidFile, "utf8").trim() === String(process.pid)) {
      fs.unlinkSync(pidFile);
    }
  } catch {
    // Best-effort cleanup for Windows terminal closes.
  }
}

process.on("exit", cleanupPid);
process.on("SIGINT", () => {
  cleanupPid();
  process.exit(0);
});

async function importKinopoiskList(res) {
  try {
    sendJson(res, 200, { movies: await fetchKinopoiskMovies() });
  } catch (error) {
    sendJson(res, 400, { error: error.message || "Не получилось импортировать список." });
  }
}

async function searchRentalPeople(url, res, options = {}) {
  const query = String(url.searchParams.get("q") || "").trim();
  if (query.length < 2) {
    sendJson(res, 400, { error: "QUERY_TOO_SHORT", message: "Введите минимум 2 символа для поиска человека." });
    return;
  }

  const credential = tmdbCredential(options.env, options.envPath);
  if (!credential) {
    sendJson(res, 503, { error: "TMDB_TOKEN_MISSING", message: "TMDb credentials не настроены на локальном сервере." });
    return;
  }

  let database;
  try {
    const openDatabase = options.openDatabase || openRentalDatabase;
    database = openDatabase();
    const results = await searchTmdbPeople(query, {
      fetchImpl: options.fetchImpl,
      language: options.language,
      limit: options.limit,
      ...credential
    });
    saveTmdbPeople(database, results);
    sendJson(res, 200, { results });
  } catch (error) {
    const status = error.status && error.status >= 400 && error.status < 500 ? 502 : 500;
    sendJson(res, status, { error: error.code || "TMDB_PEOPLE_SEARCH_FAILED", message: error.message });
  } finally {
    if (database && !options.keepDatabaseOpen) database.close();
  }
}

async function getRentalGenres(url, res, options = {}) {
  const mediaType = String(url.searchParams.get("mediaType") || "movie").trim();
  try {
    assertRentalMediaType(mediaType);
  } catch (error) {
    sendJson(res, 400, { error: error.code, message: "mediaType должен быть movie или tv." });
    return;
  }

  const credential = tmdbCredential(options.env, options.envPath);
  if (!credential) {
    sendJson(res, 503, { error: "TMDB_TOKEN_MISSING", message: "TMDb credentials не настроены на локальном сервере." });
    return;
  }

  let database;
  try {
    const openDatabase = options.openDatabase || openRentalDatabase;
    database = openDatabase();
    const genres = await fetchTmdbGenres(mediaType, {
      fetchImpl: options.fetchImpl,
      language: options.language,
      ...credential
    });
    saveTmdbGenres(database, genres);
    sendJson(res, 200, { mediaType, genres });
  } catch (error) {
    const status = error.status && error.status >= 400 && error.status < 500 ? 502 : 500;
    sendJson(res, status, { error: error.code || "TMDB_GENRES_FAILED", message: error.message });
  } finally {
    if (database && !options.keepDatabaseOpen) database.close();
  }
}

function getRentalConfig(res, options = {}) {
  const credential = tmdbCredential(options.env, options.envPath);
  sendJson(res, 200, {
    configured: Boolean(credential),
    kind: credential?.apiKey ? "apiKey" : credential?.token ? "token" : null
  });
}

async function createRentalSession(req, res, options = {}) {
  let filters;
  try {
    filters = normalizeRentalSessionFilters(await readJsonBody(req));
  } catch (error) {
    sendJson(res, 400, { error: error.code || "INVALID_JSON_BODY", message: error.message });
    return;
  }

  const credential = tmdbCredential(options.env, options.envPath);
  if (!credential) {
    sendJson(res, 503, { error: "TMDB_TOKEN_MISSING", message: "TMDb credentials не настроены на локальном сервере." });
    return;
  }

  let database;
  try {
    const openDatabase = options.openDatabase || openRentalDatabase;
    database = openDatabase();
    const items = await buildRentalPool(filters, database, {
      fetchImpl: options.fetchImpl,
      language: options.language,
      ...credential,
      maxPages: options.maxPages
    });
    const sessionId = saveRentalSession(database, filters, items);
    const session = readRentalSession(database, sessionId);
    sendJson(res, 200, session);
  } catch (error) {
    const status = error.status && error.status >= 400 && error.status < 500 ? 502 : error.code === "INVALID_RENTAL_FILTERS" ? 400 : 500;
    sendJson(res, status, { error: error.code || "RENTAL_SESSION_CREATE_FAILED", message: error.message });
  } finally {
    if (database && !options.keepDatabaseOpen) database.close();
  }
}

async function getRentalSession(res, sessionId, options = {}) {
  let database;
  try {
    const openDatabase = options.openDatabase || openRentalDatabase;
    database = openDatabase();
    const session = readRentalSession(database, sessionId);
    if (!session) {
      sendJson(res, 404, { error: "RENTAL_SESSION_NOT_FOUND", message: "Сеанс проката не найден." });
      return;
    }
    sendJson(res, 200, session);
  } catch (error) {
    sendJson(res, 500, { error: error.code || "RENTAL_SESSION_READ_FAILED", message: error.message });
  } finally {
    if (database && !options.keepDatabaseOpen) database.close();
  }
}

async function selectRentalSession(res, sessionId, options = {}) {
  let database;
  try {
    const openDatabase = options.openDatabase || openRentalDatabase;
    database = openDatabase();
    const selection = selectRentalWinner(database, sessionId, {
      random: options.random,
      wheelLimit: options.wheelLimit
    });
    if (!selection) {
      sendJson(res, 404, { error: "RENTAL_SESSION_NOT_FOUND", message: "Сеанс проката не найден или пуст." });
      return;
    }
    sendJson(res, 200, selection);
  } catch (error) {
    sendJson(res, 500, { error: error.code || "RENTAL_SESSION_SELECT_FAILED", message: error.message });
  } finally {
    if (database && !options.keepDatabaseOpen) database.close();
  }
}

function normalizeRentalSessionFilters(payload) {
  const raw = payload && typeof payload === "object" ? payload : {};
  const filters = {
    genreTmdbIds: normalizeIdList(raw.genreTmdbIds),
    actorTmdbId: normalizeOptionalId(raw.actorTmdbId),
    directorTmdbId: normalizeOptionalId(raw.directorTmdbId),
    includeTv: Boolean(raw.includeTv),
    yearFrom: normalizeOptionalYear(raw.yearFrom),
    yearTo: normalizeOptionalYear(raw.yearTo),
    voteAverageFrom: normalizeOptionalNumber(raw.voteAverageFrom),
    countries: normalizeCountryList(raw.countries)
  };

  if (!filters.genreTmdbIds.length && !filters.actorTmdbId && !filters.directorTmdbId) {
    const error = new Error("Нужен хотя бы один основной фильтр: жанр, актёр или режиссёр.");
    error.code = "INVALID_RENTAL_FILTERS";
    throw error;
  }

  if (filters.yearFrom && filters.yearTo && filters.yearFrom > filters.yearTo) {
    const error = new Error("Год 'от' не может быть больше года 'до'.");
    error.code = "INVALID_RENTAL_FILTERS";
    throw error;
  }

  return filters;
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => Number(item)).filter(Number.isInteger).filter((item) => item > 0))];
}

function normalizeOptionalId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeOptionalYear(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1800 && parsed <= 3000 ? parsed : null;
}

function normalizeOptionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCountryList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .map((item) => String(item || "").trim().toUpperCase())
      .filter(Boolean)
  )];
}

async function buildRentalPool(filters, database, options = {}) {
  const mediaTypes = filters.includeTv ? ["movie", "tv"] : ["movie"];
  let items;

  if (filters.actorTmdbId || filters.directorTmdbId) {
    items = await buildRentalPoolFromCredits(mediaTypes, filters, options);
  } else {
    items = await buildRentalPoolFromDiscover(mediaTypes, filters, options);
  }

  if (database) savePoolPeople(database, filters);
  return dedupeRentalItems(items).filter((item) => matchesRentalFilters(item, filters));
}

async function buildRentalPoolFromCredits(mediaTypes, filters, options = {}) {
  const actorItems = filters.actorTmdbId
    ? await collectCreditsForPerson(filters.actorTmdbId, "actor", mediaTypes, options)
    : null;
  const directorItems = filters.directorTmdbId
    ? await collectCreditsForPerson(filters.directorTmdbId, "director", mediaTypes, options)
    : null;

  if (actorItems && directorItems) {
    const directorKeys = new Set(directorItems.map((item) => mediaKey(item)));
    return actorItems.filter((item) => directorKeys.has(mediaKey(item)));
  }

  return actorItems || directorItems || [];
}

async function collectCreditsForPerson(personTmdbId, mode, mediaTypes, options = {}) {
  const items = [];
  for (const mediaType of mediaTypes) {
    const credits = await fetchTmdbPersonCredits(personTmdbId, mediaType, options);
    const sourceItems = mode === "actor"
      ? credits.cast
      : credits.crew.filter((item) => item.job === "Director" || item.department === "Directing");
    items.push(...sourceItems);
  }
  return items;
}

async function buildRentalPoolFromDiscover(mediaTypes, filters, options = {}) {
  const items = [];
  for (const mediaType of mediaTypes) {
    const discovered = await fetchTmdbDiscoverPool(mediaType, filters, options);
    items.push(...discovered);
  }
  return items;
}

function dedupeRentalItems(items) {
  const map = new Map();
  for (const item of items) {
    const key = mediaKey(item);
    if (!map.has(key)) {
      map.set(key, item);
      continue;
    }

    const current = map.get(key);
    map.set(key, {
      ...current,
      genreIds: current.genreIds.length ? current.genreIds : item.genreIds,
      originCountry: current.originCountry.length ? current.originCountry : item.originCountry,
      overview: current.overview || item.overview,
      posterPath: current.posterPath || item.posterPath,
      backdropPath: current.backdropPath || item.backdropPath,
      voteAverage: current.voteAverage ?? item.voteAverage,
      voteCount: current.voteCount || item.voteCount,
      popularity: current.popularity ?? item.popularity
    });
  }
  return [...map.values()];
}

function mediaKey(item) {
  return `${item.mediaType}:${item.tmdbId}`;
}

function matchesRentalFilters(item, filters) {
  if (filters.genreTmdbIds.length && !filters.genreTmdbIds.every((genreId) => item.genreIds.includes(genreId))) {
    return false;
  }
  if (filters.yearFrom && (!item.year || item.year < filters.yearFrom)) return false;
  if (filters.yearTo && (!item.year || item.year > filters.yearTo)) return false;
  if (filters.voteAverageFrom !== null && (item.voteAverage === null || item.voteAverage < filters.voteAverageFrom)) return false;
  if (filters.countries.length && !filters.countries.some((country) => item.originCountry.includes(country))) return false;
  return true;
}

function savePoolPeople(database, filters) {
  const ids = [filters.actorTmdbId, filters.directorTmdbId].filter(Boolean);
  if (!ids.length) return;
  const statement = database.prepare("UPDATE people SET last_synced_at = datetime('now'), updated_at = datetime('now') WHERE tmdb_id = ?");
  for (const tmdbId of ids) statement.run(tmdbId);
}

function saveRentalSession(database, filters, items) {
  const mediaIds = upsertRentalMedia(database, items);
  const selectionMode = selectionModeForPool(items.length);
  const insertSession = database.prepare(`
    INSERT INTO rental_sessions (query_label, filters_json, source, total_count, selection_mode)
    VALUES (?, ?, 'tmdb', ?, ?)
    RETURNING id
  `);
  const sessionId = insertSession.get(buildRentalQueryLabel(database, filters), JSON.stringify(filters), items.length, selectionMode).id;
  const insertItem = database.prepare(`
    INSERT INTO rental_session_items (session_id, media_id, tmdb_rank, random_order)
    VALUES (?, ?, ?, ?)
  `);

  mediaIds.forEach((mediaId, index) => {
    insertItem.run(sessionId, mediaId, index + 1, null);
  });

  return sessionId;
}

function upsertRentalMedia(database, items) {
  const insertMedia = database.prepare(`
    INSERT INTO media (
      tmdb_id, media_type, title, original_title, year, overview, runtime_minutes,
      vote_average, vote_count, popularity, poster_path, backdrop_path, origin_country_json,
      last_synced_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(tmdb_id, media_type) DO UPDATE SET
      title = excluded.title,
      original_title = excluded.original_title,
      year = excluded.year,
      overview = excluded.overview,
      runtime_minutes = COALESCE(excluded.runtime_minutes, media.runtime_minutes),
      vote_average = excluded.vote_average,
      vote_count = excluded.vote_count,
      popularity = excluded.popularity,
      poster_path = excluded.poster_path,
      backdrop_path = excluded.backdrop_path,
      origin_country_json = excluded.origin_country_json,
      last_synced_at = excluded.last_synced_at,
      updated_at = excluded.updated_at
  `);
  const selectMediaId = database.prepare("SELECT id FROM media WHERE tmdb_id = ? AND media_type = ?");
  const clearGenres = database.prepare("DELETE FROM media_genres WHERE media_id = ?");
  const ensureGenre = database.prepare(`
    INSERT INTO genres (tmdb_id, media_type, name, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(tmdb_id, media_type) DO UPDATE SET updated_at = excluded.updated_at
  `);
  const selectGenreId = database.prepare("SELECT id FROM genres WHERE tmdb_id = ? AND media_type = ?");
  const insertMediaGenre = database.prepare("INSERT OR IGNORE INTO media_genres (media_id, genre_id) VALUES (?, ?)");

  return items.map((item) => {
    insertMedia.run(
      item.tmdbId,
      item.mediaType,
      item.title,
      item.originalTitle,
      item.year,
      item.overview,
      item.runtimeMinutes,
      item.voteAverage,
      item.voteCount,
      item.popularity,
      item.posterPath,
      item.backdropPath,
      JSON.stringify(item.originCountry),
    );
    const mediaId = selectMediaId.get(item.tmdbId, item.mediaType).id;
    clearGenres.run(mediaId);
    for (const genreId of item.genreIds) {
      ensureGenre.run(genreId, item.mediaType, `TMDB:${genreId}`);
      const genreRow = selectGenreId.get(genreId, item.mediaType);
      if (genreRow) insertMediaGenre.run(mediaId, genreRow.id);
    }
    return mediaId;
  });
}

function buildRentalQueryLabel(database, filters) {
  const parts = [];
  if (filters.genreTmdbIds.length) {
    const selectGenreName = database.prepare("SELECT name FROM genres WHERE tmdb_id = ? AND media_type IN ('movie', 'tv') ORDER BY media_type LIMIT 1");
    const names = filters.genreTmdbIds
      .map((genreId) => selectGenreName.get(genreId)?.name || `Жанр ${genreId}`)
      .filter(Boolean);
    if (names.length) parts.push(names.join(" + "));
  }
  if (filters.actorTmdbId) parts.push(readPersonLabel(database, filters.actorTmdbId));
  if (filters.directorTmdbId) parts.push(`реж. ${readPersonLabel(database, filters.directorTmdbId)}`);
  if (filters.includeTv) parts.push("с сериалами");
  return parts.join(" × ") || "Сеанс проката";
}

function readPersonLabel(database, tmdbId) {
  return database.prepare("SELECT name FROM people WHERE tmdb_id = ?").get(tmdbId)?.name || `TMDb:${tmdbId}`;
}

function readRentalSession(database, sessionId) {
  const session = database.prepare(`
    SELECT id, query_label, filters_json, source, total_count, selection_mode, selected_media_id, selected_at, created_at
    FROM rental_sessions
    WHERE id = ?
  `).get(sessionId);
  if (!session) return null;

  const items = database.prepare(`
    SELECT
      media.id,
      media.tmdb_id,
      media.media_type,
      media.title,
      media.year,
      media.poster_path,
      rental_session_items.tmdb_rank
    FROM rental_session_items
    JOIN media ON media.id = rental_session_items.media_id
    WHERE rental_session_items.session_id = ?
    ORDER BY rental_session_items.tmdb_rank
  `).all(sessionId).map((item) => ({
    id: item.id,
    tmdbId: item.tmdb_id,
    mediaType: item.media_type,
    title: item.title,
    year: item.year,
    posterPath: item.poster_path || "",
    tmdbRank: item.tmdb_rank
  }));
  const selectedItem = session.selected_media_id
    ? items.find((item) => item.id === session.selected_media_id) || null
    : null;

  return {
    sessionId: session.id,
    queryLabel: session.query_label,
    filters: JSON.parse(session.filters_json),
    source: session.source,
    totalCount: session.total_count,
    selectionMode: session.selection_mode,
    selectedMediaId: session.selected_media_id,
    selectedItem,
    selectedAt: session.selected_at,
    createdAt: session.created_at,
    items
  };
}

function selectRentalWinner(database, sessionId, options = {}) {
  const session = readRentalSession(database, sessionId);
  if (!session || !session.items.length) return null;

  const random = typeof options.random === "function" ? options.random : Math.random;
  const index = Math.min(session.items.length - 1, Math.floor(random() * session.items.length));
  const selectedItem = session.items[index];
  const selectionMode = selectionModeForPool(session.items.length, options.wheelLimit);

  database.prepare(`
    UPDATE rental_sessions
    SET selected_media_id = ?, selected_at = datetime('now'), selection_mode = ?
    WHERE id = ?
  `).run(selectedItem.id, selectionMode, sessionId);

  const updatedSession = readRentalSession(database, sessionId);
  return {
    ...updatedSession,
    selectionMode,
    selectedItem,
    selectedIndex: index + 1,
    totalCount: session.items.length
  };
}

function selectionModeForPool(totalCount, wheelLimit = DEFAULT_RENTAL_WHEEL_LIMIT) {
  return totalCount <= wheelLimit ? "wheel" : "vhs_machine";
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (!text) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        const error = new Error("Тело запроса должно быть валидным JSON.");
        error.code = "INVALID_JSON_BODY";
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function fetchKinopoiskMovies() {
  const movies = new Map();

  for (const listUrl of kinopoiskListUrls) {
    for (let page = 1; page <= 10; page += 1) {
      const url = new URL(listUrl);
      url.searchParams.set("page", String(page));
      const html = await fetchKinopoiskHtml(url.href);
      const pageMovies = parseKinopoiskHtml(html);
      let added = 0;

      for (const movie of pageMovies) {
        if (movies.has(movie.url)) continue;
        movies.set(movie.url, movie);
        added += 1;
      }

      if (!pageMovies.length || !added) break;
    }
  }

  return [...movies.values()];
}

async function fetchKinopoiskHtml(url) {
  const jar = new Map();
  let result = await requestKinopoisk(url, jar);

  const redirect = result.response.headers.get("location");
  if (redirect) {
    result = await requestKinopoisk(new URL(redirect, url).href, jar);
  }

  const hostMatch = result.text.match(/"host":"([^"]+)/);
  if (hostMatch) {
    const installUrl = JSON.parse(`"${hostMatch[1]}"`);
    await requestKinopoisk(installUrl, jar);
    result = await requestKinopoisk(url, jar);
  }

  if (!result.response.ok) throw new Error(`Кинопоиск ответил ${result.response.status}`);
  return result.text;
}

async function requestKinopoisk(url, jar) {
  const response = await fetch(url, {
    redirect: "manual",
    headers: {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "ru-RU,ru;q=0.9,en;q=0.7",
      "cookie": cookieHeader(jar),
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
    }
  });

  saveCookies(response, jar);
  return { response, text: await response.text() };
}

function cookieHeader(jar) {
  return [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
}

function saveCookies(response, jar) {
  const cookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  for (const cookie of cookies) {
    const pair = cookie.split(";")[0];
    const index = pair.indexOf("=");
    if (index > 0) jar.set(pair.slice(0, index), pair.slice(index + 1));
  }
}

function parseKinopoiskHtml(html) {
  const movies = new Map();
  const anchorRe = /<a\b([^>]*href=["']([^"']*\/(?:film|series)\/\d+\/?[^"']*)["'][^>]*)>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorRe.exec(html))) {
    const href = decodeHtml(match[2]).split("?")[0];
    const attrs = match[1];
    const body = match[3];
    const captionText = stripTags(body);
    const altText = readAttr(body, "alt");
    const meta = parseMovieMeta(captionText) || parseMovieMeta(altText);
    const poster = absoluteUrl(readAttr(body, "src"));
    const title = cleanTitle(captionText)
      || cleanTitle(altText)
      || cleanTitle(readAttr(attrs, "aria-label"))
      || cleanTitle(readAttr(attrs, "title"));
    if (!title) continue;

    const movieUrl = new URL(href, "https://www.kinopoisk.ru").href;
    const current = movies.get(movieUrl);
    movies.set(movieUrl, {
      title: current?.title || title,
      url: movieUrl,
      poster: current?.poster || poster,
      year: current?.year || meta?.year || "",
      genre: current?.genre || meta?.genre || ""
    });
  }

  return [...movies.values()];
}

function readAttr(attrs, name) {
  const match = new RegExp(`${name}=["']([^"']+)["']`, "i").exec(attrs);
  return match ? decodeHtml(match[1]) : "";
}

function stripTags(value) {
  return decodeHtml(String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " "));
}

function cleanTitle(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\.\s*\d{4},.*$/u, "")
    .replace(/\b\d{4},.*$/u, "")
    .trim();
}

function parseMovieMeta(value) {
  const text = stripTags(value).replace(/\s+/g, " ").trim();
  const match = /(?:^|[\s.])((?:19|20)\d{2})(?:\s*[-–—]\s*(?:(?:19|20)\d{2})?)?\s*,\s*([^.,<]+)/u.exec(text);
  if (!match) return null;

  return {
    year: match[1],
    genre: match[2].trim().toLowerCase()
  };
}

function absoluteUrl(value) {
  if (!value) return "";
  const decoded = decodeHtml(value);
  if (decoded.startsWith("//")) return `https:${decoded}`;
  return new URL(decoded, "https://www.kinopoisk.ru").href;
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

module.exports = {
  buildRentalPool,
  createRentalSession,
  DEFAULT_RENTAL_WHEEL_LIMIT,
  fetchKinopoiskHtml,
  fetchKinopoiskMovies,
  getRentalConfig,
  getRentalGenres,
  getRentalSession,
  normalizeRentalSessionFilters,
  parseKinopoiskHtml,
  readRentalSession,
  selectRentalSession,
  selectRentalWinner,
  selectionModeForPool,
  searchRentalPeople,
  server
};
