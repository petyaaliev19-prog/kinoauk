const fs = require("fs");
const path = require("path");

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const DEFAULT_LANGUAGE = "ru-RU";
const DEFAULT_PERSON_LIMIT = 8;
const RENTAL_MEDIA_TYPES = new Set(["movie", "tv"]);
const MAX_DISCOVER_PAGES = 500;

function readDotEnv(envPath = path.join(__dirname, ".env")) {
  try {
    const text = fs.readFileSync(envPath, "utf8");
    const values = {};

    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
      if (!match) continue;

      const key = match[1];
      let value = match[2].trim();
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      values[key] = value;
    }

    return values;
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

function tmdbToken(env = process.env, envPath) {
  return String(env.TMDB_API_TOKEN || readDotEnv(envPath).TMDB_API_TOKEN || "").trim();
}

function tmdbAuthHeaders(token) {
  return {
    accept: "application/json",
    authorization: `Bearer ${token}`
  };
}

async function tmdbGet(pathname, params = {}, options = {}) {
  const token = options.token || tmdbToken(options.env, options.envPath);
  if (!token) {
    const error = new Error("TMDB_API_TOKEN is not configured.");
    error.code = "TMDB_TOKEN_MISSING";
    throw error;
  }

  const fetchImpl = options.fetchImpl || fetch;
  const url = new URL(`${TMDB_BASE_URL}${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }

  const response = await fetchImpl(url, { headers: tmdbAuthHeaders(token) });
  if (!response.ok) {
    const error = new Error(`TMDb request failed with ${response.status}.`);
    error.code = "TMDB_REQUEST_FAILED";
    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function searchTmdbPeople(query, options = {}) {
  const normalizedQuery = String(query || "").trim();
  if (normalizedQuery.length < 2) return [];

  const payload = await tmdbGet("/search/person", {
    query: normalizedQuery,
    include_adult: false,
    language: options.language || DEFAULT_LANGUAGE,
    page: 1
  }, options);

  return normalizeTmdbPeople(payload.results || [], options.limit || DEFAULT_PERSON_LIMIT);
}

async function fetchTmdbGenres(mediaType, options = {}) {
  assertRentalMediaType(mediaType);
  const payload = await tmdbGet(`/genre/${mediaType}/list`, {
    language: options.language || DEFAULT_LANGUAGE
  }, options);

  return normalizeTmdbGenres(payload.genres || [], mediaType);
}

async function fetchTmdbPersonCredits(personTmdbId, mediaType, options = {}) {
  assertRentalMediaType(mediaType);
  const endpoint = mediaType === "movie" ? "movie_credits" : "tv_credits";
  const payload = await tmdbGet(`/person/${personTmdbId}/${endpoint}`, {
    language: options.language || DEFAULT_LANGUAGE
  }, options);

  return {
    cast: normalizeTmdbMediaList(payload.cast || [], mediaType),
    crew: normalizeTmdbMediaList(payload.crew || [], mediaType)
  };
}

async function fetchTmdbDiscoverPool(mediaType, filters = {}, options = {}) {
  assertRentalMediaType(mediaType);
  const items = [];
  const baseParams = buildDiscoverParams(mediaType, filters, options.language || DEFAULT_LANGUAGE);
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= (options.maxPages || MAX_DISCOVER_PAGES)) {
    const payload = await tmdbGet(`/discover/${mediaType}`, { ...baseParams, page }, options);
    items.push(...normalizeTmdbMediaList(payload.results || [], mediaType));
    totalPages = Math.min(Number(payload.total_pages || 1), options.maxPages || MAX_DISCOVER_PAGES);
    page += 1;
  }

  return items;
}

function assertRentalMediaType(mediaType) {
  if (!RENTAL_MEDIA_TYPES.has(mediaType)) {
    const error = new Error("mediaType must be movie or tv.");
    error.code = "INVALID_MEDIA_TYPE";
    throw error;
  }
}

function normalizeTmdbPeople(results, limit = DEFAULT_PERSON_LIMIT) {
  return results
    .filter((person) => person && person.id && person.name)
    .slice(0, limit)
    .map(normalizeTmdbPerson);
}

function normalizeTmdbPerson(person) {
  return {
    tmdbId: Number(person.id),
    name: String(person.name || "").trim(),
    originalName: String(person.original_name || person.name || "").trim(),
    profilePath: person.profile_path || "",
    knownForDepartment: person.known_for_department || "",
    popularity: Number.isFinite(Number(person.popularity)) ? Number(person.popularity) : null,
    knownFor: normalizeKnownFor(person.known_for)
  };
}

function normalizeKnownFor(knownFor = []) {
  return knownFor
    .map((item) => item?.title || item?.name || item?.original_title || item?.original_name || "")
    .map((title) => String(title).trim())
    .filter(Boolean)
    .slice(0, 3);
}

function normalizeTmdbGenres(genres, mediaType) {
  assertRentalMediaType(mediaType);
  return genres
    .filter((genre) => genre && genre.id && genre.name)
    .map((genre) => ({
      tmdbId: Number(genre.id),
      mediaType,
      name: String(genre.name || "").trim()
    }));
}

function normalizeTmdbMediaList(items, mediaType) {
  assertRentalMediaType(mediaType);
  return items
    .filter((item) => item && item.id && (item.title || item.name || item.original_title || item.original_name))
    .map((item) => normalizeTmdbMedia(item, mediaType));
}

function normalizeTmdbMedia(item, mediaType) {
  assertRentalMediaType(mediaType);
  return {
    tmdbId: Number(item.id),
    mediaType,
    title: String(item.title || item.name || item.original_title || item.original_name || "").trim(),
    originalTitle: String(item.original_title || item.original_name || item.title || item.name || "").trim(),
    year: extractYear(mediaType === "movie" ? item.release_date : item.first_air_date),
    overview: String(item.overview || "").trim(),
    runtimeMinutes: Number.isFinite(Number(item.runtime)) ? Number(item.runtime) : null,
    voteAverage: Number.isFinite(Number(item.vote_average)) ? Number(item.vote_average) : null,
    voteCount: Number.isFinite(Number(item.vote_count)) ? Number(item.vote_count) : 0,
    popularity: Number.isFinite(Number(item.popularity)) ? Number(item.popularity) : null,
    posterPath: item.poster_path || "",
    backdropPath: item.backdrop_path || "",
    genreIds: Array.isArray(item.genre_ids) ? item.genre_ids.map(Number).filter(Number.isFinite) : [],
    originCountry: normalizeOriginCountry(item),
    department: item.department || "",
    job: item.job || "",
    character: item.character || "",
    creditOrder: Number.isFinite(Number(item.order)) ? Number(item.order) : null
  };
}

function normalizeOriginCountry(item) {
  if (Array.isArray(item.origin_country) && item.origin_country.length) {
    return item.origin_country.map(String);
  }
  if (Array.isArray(item.production_countries) && item.production_countries.length) {
    return item.production_countries
      .map((country) => country?.iso_3166_1 || country?.name || "")
      .map(String)
      .filter(Boolean);
  }
  return [];
}

function extractYear(value) {
  const match = /^(\d{4})/.exec(String(value || "").trim());
  return match ? Number(match[1]) : null;
}

function buildDiscoverParams(mediaType, filters, language) {
  const params = {
    language,
    include_adult: false,
    sort_by: "popularity.desc"
  };
  if (Array.isArray(filters.genreTmdbIds) && filters.genreTmdbIds.length) {
    params.with_genres = filters.genreTmdbIds.join(",");
  }
  if (mediaType === "movie") {
    if (filters.yearFrom) params["primary_release_date.gte"] = `${filters.yearFrom}-01-01`;
    if (filters.yearTo) params["primary_release_date.lte"] = `${filters.yearTo}-12-31`;
  } else {
    if (filters.yearFrom) params["first_air_date.gte"] = `${filters.yearFrom}-01-01`;
    if (filters.yearTo) params["first_air_date.lte"] = `${filters.yearTo}-12-31`;
  }
  return params;
}

function saveTmdbPeople(database, people) {
  if (!database || !people.length) return;

  const statement = database.prepare(`
    INSERT INTO people (tmdb_id, name, original_name, profile_path, known_for_department, popularity, last_synced_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(tmdb_id) DO UPDATE SET
      name = excluded.name,
      original_name = excluded.original_name,
      profile_path = excluded.profile_path,
      known_for_department = excluded.known_for_department,
      popularity = excluded.popularity,
      last_synced_at = excluded.last_synced_at,
      updated_at = excluded.updated_at
  `);

  for (const person of people) {
    statement.run(
      person.tmdbId,
      person.name,
      person.originalName,
      person.profilePath,
      person.knownForDepartment,
      person.popularity
    );
  }
}

function saveTmdbGenres(database, genres) {
  if (!database || !genres.length) return;

  const statement = database.prepare(`
    INSERT INTO genres (tmdb_id, media_type, name, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(tmdb_id, media_type) DO UPDATE SET
      name = excluded.name,
      updated_at = excluded.updated_at
  `);

  for (const genre of genres) {
    assertRentalMediaType(genre.mediaType);
    statement.run(genre.tmdbId, genre.mediaType, genre.name);
  }
}

module.exports = {
  DEFAULT_PERSON_LIMIT,
  MAX_DISCOVER_PAGES,
  RENTAL_MEDIA_TYPES,
  assertRentalMediaType,
  fetchTmdbDiscoverPool,
  fetchTmdbGenres,
  fetchTmdbPersonCredits,
  normalizeTmdbMedia,
  normalizeTmdbMediaList,
  readDotEnv,
  normalizeKnownFor,
  normalizeTmdbGenres,
  normalizeTmdbPeople,
  normalizeTmdbPerson,
  saveTmdbGenres,
  saveTmdbPeople,
  searchTmdbPeople,
  tmdbGet,
  tmdbToken
};
