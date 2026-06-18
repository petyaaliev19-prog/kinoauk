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

  function isHorrorMovie(movie) {
    if (!movie) return false;
    const signal = `${movie.title || ""} ${movie.genre || ""}`.toLowerCase();
    return /(ужас|хоррор|пила|смерт|дьявол|прокля|псих|монстр|зомби|кошмар|ад|ночь|вампир|одержим)/i.test(signal);
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
    isHorrorMovie,
    mergeMovieList,
    mod,
    movieAtPointerFromRotation,
    movieMetaLabel,
    normalizeMovie
  };
});
