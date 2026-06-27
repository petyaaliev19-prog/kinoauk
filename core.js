(function initKinoaukCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.KinoaukCore = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createKinoaukCore() {
  function normalizeMovie(input, options = {}) {
    const fallbackPoster = options.fallbackPoster || "";

    if (typeof input === "string") {
      const title = input.trim();
      if (!title) return null;
      return { title, url: "", poster: fallbackPoster, year: "", genre: "" };
    }

    if (!input || typeof input !== "object") return null;

    const title = String(input.title || input.name || input.ruTitle || input.originalTitle || "").trim();
    const url = String(input.url || input.link || input.href || "").trim();
    const poster = String(input.poster || input.image || input.cover || fallbackPoster).trim();
    const year = String(input.year || "").trim();
    const genre = normalizeGenre(input.genre || input.genres || "");
    if (!title) return null;

    return { title, url, poster, year, genre };
  }

  function mergeMovieList(existingMovies, nextMovies, options = {}) {
    const byKey = new Map();

    for (const movie of existingMovies || []) {
      const normalized = normalizeMovie(movie, options);
      if (!normalized) continue;
      byKey.set(movieKey(normalized), normalized);
    }

    for (const movie of nextMovies || []) {
      const normalized = normalizeMovie(movie, options);
      if (!normalized) continue;
      const key = movieKey(normalized);
      byKey.set(key, {
        ...normalized,
        ...byKey.get(key),
        ...removeEmptyFields(normalized, options)
      });
    }

    return [...byKey.values()].sort((a, b) => a.title.localeCompare(b.title, "ru"));
  }

  function movieAtPointerFromRotation(movies, rotation) {
    if (!movies?.length) return null;

    const slice = (Math.PI * 2) / movies.length;
    const normalized = mod(-rotation, Math.PI * 2);
    const index = Math.floor(normalized / slice) % movies.length;
    return movies[index];
  }

  function movieMetaLabel(movie) {
    return [movie?.year, movie?.genre].filter(Boolean).join(" · ");
  }

  function movieGenres(movie) {
    const value = movie?.genre || movie?.genres || "";
    const values = Array.isArray(value) ? value : [value];
    return [...new Set(values
      .flatMap((item) => String(item || "").toLowerCase().split(/[,/|;]/))
      .map((item) => item.trim())
      .filter(Boolean))];
  }

  function filterMoviesByGenres(movies, selectedGenres) {
    const selected = new Set((selectedGenres || []).map((genre) => String(genre || "").trim().toLowerCase()).filter(Boolean));
    const list = Array.isArray(movies) ? movies : [];
    if (!selected.size) return [...list];
    return list.filter((movie) => movieGenres(movie).some((genre) => selected.has(genre)));
  }

  function groupMoviesByAuctionEligibility(movies, auctionMovies) {
    const auctionKeys = new Set((auctionMovies || []).map(movieKey));
    const eligible = [];
    const outside = [];

    for (const movie of movies || []) {
      (auctionKeys.has(movieKey(movie)) ? eligible : outside).push(movie);
    }

    return [...eligible, ...outside];
  }

  function genreCounts(movies) {
    const counts = new Map();
    for (const movie of movies || []) {
      for (const genre of movieGenres(movie)) {
        counts.set(genre, (counts.get(genre) || 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([genre, count]) => ({ genre, count }))
      .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre, "ru"));
  }

  function calculateMovieOdds(movies, stakes = {}, stakeShare = .1) {
    const list = Array.isArray(movies) ? movies : [];
    const requested = [stakes.max, stakes.olya]
      .map((key) => String(key || ""))
      .filter((key) => list.some((movie) => movieKey(movie) === key));
    const reserved = new Map();

    for (const key of requested) {
      reserved.set(key, (reserved.get(key) || 0) + 1);
    }

    const unreserved = list.filter((movie) => !reserved.has(movieKey(movie)));
    if (!canUseStakeOdds(list, stakes, stakeShare)) {
      return list.map((movie) => ({ movie, chance: 1 / list.length, stakeCount: 0 }));
    }

    const baseChance = 1 / list.length;
    const boostedTotal = reserved.size * baseChance + requested.length * stakeShare;
    const remainingShare = unreserved.length ? (1 - boostedTotal) / unreserved.length : 0;
    return list.map((movie) => {
      const stakeCount = reserved.get(movieKey(movie)) || 0;
      return {
        movie,
        chance: stakeCount ? baseChance + stakeCount * stakeShare : remainingShare,
        stakeCount
      };
    });
  }

  function canUseStakeOdds(movies, stakes = {}, stakeShare = .1) {
    const list = Array.isArray(movies) ? movies : [];
    const requested = [stakes.max, stakes.olya]
      .map((key) => String(key || ""))
      .filter((key) => list.some((movie) => movieKey(movie) === key));
    const activeKeys = new Set(requested);
    const boostedTotal = activeKeys.size / list.length + requested.length * stakeShare;
    return Boolean(list.length) && activeKeys.size < list.length && boostedTotal <= 1;
  }

  function wheelSegments(movies, odds = []) {
    const list = Array.isArray(movies) ? movies : [];
    const chanceByMovie = new Map((odds || []).map((entry) => [movieKey(entry.movie), Number(entry.chance) || 0]));
    const fallbackChance = list.length ? 1 / list.length : 0;
    const raw = list.map((movie) => chanceByMovie.get(movieKey(movie)) || fallbackChance);
    const total = raw.reduce((sum, chance) => sum + chance, 0) || 1;
    let offset = 0;

    return list.map((movie, index) => {
      const angle = (raw[index] / total) * Math.PI * 2;
      const segment = { movie, start: offset, end: offset + angle, angle };
      offset += angle;
      return segment;
    });
  }

  function movieAtPointerFromSegments(movies, rotation, odds = []) {
    const segments = wheelSegments(movies, odds);
    if (!segments.length) return null;
    const pointerOffset = mod(-rotation, Math.PI * 2);
    return segments.find((segment) => pointerOffset >= segment.start && pointerOffset < segment.end)?.movie || segments[segments.length - 1].movie;
  }

  function rotationToLandSegmentAtPointer(segment, currentRotation = 0, turns = 0) {
    if (!segment) return currentRotation;
    const fullTurn = Math.PI * 2;
    const targetRotation = mod(-(segment.start + segment.angle / 2), fullTurn);
    const wholeTurns = Math.max(0, Math.floor(Number(turns) || 0));
    return currentRotation + wholeTurns * fullTurn + mod(targetRotation - currentRotation, fullTurn);
  }

  function pickMovieByOdds(odds, random = Math.random) {
    if (!odds?.length) return null;
    const roll = Math.min(.999999999, Math.max(0, Number(random()) || 0));
    let boundary = 0;
    for (const entry of odds) {
      boundary += entry.chance;
      if (roll < boundary) return entry.movie;
    }
    return odds[odds.length - 1].movie;
  }

  function isHorrorMovie(movie) {
    return winnerEffectType(movie) === "horror";
  }

  function winnerEffectType(movie) {
    if (!movie) return "default";
    const genre = String(movie.genre || "").toLowerCase();

    if (/(ужас|хоррор)/i.test(genre)) {
      return "horror";
    }
    if (/(драма|мелодрам)/i.test(genre)) {
      return "drama";
    }
    if (/(боевик|экшен)/i.test(genre)) {
      return "action";
    }
    if (/(комед|юмор)/i.test(genre)) {
      return "comedy";
    }

    return "default";
  }

  function mod(value, max) {
    return ((value % max) + max) % max;
  }

  function movieKey(movie) {
    return movie.url || movie.title.toLowerCase();
  }

  function normalizeGenre(value) {
    const raw = Array.isArray(value) ? value[0] : value;
    return String(raw || "").trim().toLowerCase();
  }

  function removeEmptyFields(movie, options = {}) {
    return Object.fromEntries(Object.entries(movie).filter(([key, value]) => {
      if (value === "") return false;
      if (key === "poster" && options.fallbackPoster && value === options.fallbackPoster) return false;
      return true;
    }));
  }

  return {
    canUseStakeOdds,
    calculateMovieOdds,
    filterMoviesByGenres,
    genreCounts,
    groupMoviesByAuctionEligibility,
    isHorrorMovie,
    mergeMovieList,
    mod,
    movieGenres,
    movieAtPointerFromRotation,
    movieAtPointerFromSegments,
    movieMetaLabel,
    movieKey,
    normalizeMovie,
    pickMovieByOdds,
    rotationToLandSegmentAtPointer,
    wheelSegments,
    winnerEffectType
  };
});
