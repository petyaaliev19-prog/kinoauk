const STORAGE_KEY = "kinoauk.movies.v1";
const HISTORY_KEY = "kinoauk.history.v1";
const GENRE_FILTER_KEY = "kinoauk.genre-filter.v1";
const STAKES_KEY = "kinoauk.stakes.v1";
const THEME_KEY = "kinoauk.theme.v1";
const MODE_KEY = "kinoauk.mode.v1";
const RENTAL_WHEEL_LIMIT = 24;
const FALLBACK_POSTER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 180">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#00ffd1"/>
      <stop offset=".48" stop-color="#ffd640"/>
      <stop offset="1" stop-color="#ff2d95"/>
    </linearGradient>
    <radialGradient id="shine" cx=".34" cy=".2" r=".62">
      <stop offset="0" stop-color="#fff" stop-opacity=".75"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="120" height="180" rx="12" fill="#111315"/>
  <rect x="6" y="6" width="108" height="168" rx="10" fill="url(#bg)"/>
  <rect x="6" y="6" width="108" height="168" rx="10" fill="url(#shine)"/>
  <circle cx="60" cy="70" r="28" fill="#111315" opacity=".86"/>
  <path d="M51 54v32l28-16z" fill="#f6f2ea"/>
  <rect x="20" y="124" width="80" height="8" rx="4" fill="#111315" opacity=".82"/>
  <rect x="31" y="140" width="58" height="7" rx="3.5" fill="#111315" opacity=".7"/>
  <text x="60" y="164" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="900" fill="#111315">КИНОАУК</text>
</svg>
`)}`;

const palette = ["#f4c542", "#31c6a7", "#f46f63", "#5aa9e6", "#e08dac", "#8bd17c", "#f39b4a", "#b9a7ff"];
const {
  calculateMovieOdds,
  canUseStakeOdds,
  filterMoviesByGenres,
  genreCounts,
  groupMoviesByAuctionEligibility,
  isHorrorMovie,
  mergeMovieList,
  movieAtPointerFromSegments,
  movieKey,
  movieMetaLabel,
  pickMovieByOdds,
  rotationToLandSegmentAtPointer,
  wheelSegments,
  winnerEffectType
} = window.KinoaukCore;

const state = {
  movies: loadJson(STORAGE_KEY, []),
  history: loadJson(HISTORY_KEY, []),
  genreFilter: loadJson(GENRE_FILTER_KEY, []),
  stakes: loadJson(STAKES_KEY, { max: "", olya: "" }),
  themeMode: ["auto", "day", "night"].includes(loadJson(THEME_KEY, "auto")) ? loadJson(THEME_KEY, "auto") : "auto",
  mode: ["shelf", "rental"].includes(loadJson(MODE_KEY, "shelf")) ? loadJson(MODE_KEY, "shelf") : "shelf",
  rotation: 0,
  spinning: false,
  winner: null,
  rental: {
    genres: [],
    genresLoaded: false,
    genresLoading: false,
    people: [],
    peopleLoading: false,
    selectedPerson: null,
    session: null,
    view: "form",
    loading: false,
    status: "Можно собрать пул только по жанру или уточнить актёра через поиск.",
    configLoaded: false,
    configLoading: false,
    configured: false,
    configStatus: "Проверяю подключение TMDb на сервере."
  },
  // Keep the exact sector geometry that the animation landed on. Stakes are
  // cleared after a result, so recalculating here would move the winner away
  // from the pointer even though the canvas itself has stopped.
  settledWheel: null,
  query: ""
};

const canvas = document.querySelector("#wheelCanvas");
const ctx = canvas.getContext("2d");
const wheelWrap = document.querySelector(".wheel-wrap");
const rentalMachineStage = document.querySelector("#rentalMachineStage");
const rentalMachineTitle = document.querySelector("#rentalMachineTitle");
const rentalMachineText = document.querySelector("#rentalMachineText");
const movieList = document.querySelector("#movieList");
const template = document.querySelector("#movieItemTemplate");
const spinButton = document.querySelector("#spinButton");
const removeWinnerButton = document.querySelector("#removeWinnerButton");
const resetWinnerButton = document.querySelector("#resetWinnerButton");
const movieCount = document.querySelector("#movieCount");
const emptyWheelLabel = document.querySelector("#emptyWheelLabel");
const vhsOsd = document.querySelector("#vhsOsd");
const winnerBox = document.querySelector("#winnerBox");
const winnerLink = document.querySelector("#winnerLink");
const winnerPoster = document.querySelector("#winnerPoster");
const addForm = document.querySelector("#addForm");
const searchInput = document.querySelector("#searchInput");
const clearButton = document.querySelector("#clearButton");
const refreshKinopoiskButton = document.querySelector("#refreshKinopoiskButton");
const refreshKinopoiskStatus = document.querySelector("#refreshKinopoiskStatus");
const soundButton = document.querySelector("#soundButton");
const autoThemeButton = document.querySelector("#autoThemeButton");
const dayThemeButton = document.querySelector("#dayThemeButton");
const nightThemeButton = document.querySelector("#nightThemeButton");
const shelfModeButton = document.querySelector("#shelfModeButton");
const rentalModeButton = document.querySelector("#rentalModeButton");
const rentalStage = document.querySelector("#rentalStage");
const rentalListPanel = document.querySelector("#rentalListPanel");
const rentalForm = document.querySelector("#rentalForm");
const rentalGenreSelect = document.querySelector("#rentalGenreSelect");
const rentalPersonInput = document.querySelector("#rentalPersonInput");
const rentalPersonSuggestions = document.querySelector("#rentalPersonSuggestions");
const rentalIncludeTv = document.querySelector("#rentalIncludeTv");
const rentalBuildPoolButton = document.querySelector("#rentalBuildPoolButton");
const rentalClearButton = document.querySelector("#rentalClearButton");
const rentalBackToFormButton = document.querySelector("#rentalBackToFormButton");
const rentalStatusTitle = document.querySelector("#rentalStatusTitle");
const rentalStatusText = document.querySelector("#rentalStatusText");
const rentalListTitle = document.querySelector("#rentalListTitle");
const rentalListMeta = document.querySelector("#rentalListMeta");
const rentalTapeList = document.querySelector("#rentalTapeList");
const rentalMachineMode = document.querySelector("#rentalMachineMode");
const rentalMachineNote = document.querySelector("#rentalMachineNote");
const shutdownButton = document.querySelector("#shutdownButton");
const dictatorshipBanner = document.querySelector("#dictatorshipBanner");
const confettiLayer = document.querySelector("#confettiLayer");
const genreStageEffects = document.querySelector("#genreStageEffects");
const mascotSpeech = document.querySelector("#mascotSpeech");
const posterBackdrop = document.querySelector("#posterBackdrop");
const winnerModal = document.querySelector("#winnerModal");
const winnerModalEffects = document.querySelector("#winnerModalEffects");
const winnerModalLabel = document.querySelector("#winnerModalLabel");
const winnerModalPoster = document.querySelector("#winnerModalPoster");
const winnerModalMeta = document.querySelector("#winnerModalMeta");
const winnerModalTitle = document.querySelector("#winnerModalTitle");
const watchWinnerButton = document.querySelector("#watchWinnerButton");
const modalRemoveWinnerButton = document.querySelector("#modalRemoveWinnerButton");
const closeWinnerModalButton = document.querySelector("#closeWinnerModalButton");
const genreAuctionPanel = document.querySelector("#genreAuctionPanel");
const genreAuctionSummary = document.querySelector("#genreAuctionSummary");
const genreAuctionCount = document.querySelector("#genreAuctionCount");
const genreAuctionDraft = document.querySelector("#genreAuctionDraft");
const genreChipList = document.querySelector("#genreChipList");
const genreAllButton = document.querySelector("#genreAllButton");
const genreApplyButton = document.querySelector("#genreApplyButton");
const motionAnimate = window.Motion?.animate;

let audioContext = null;
let soundEnabled = loadJson("kinoauk.sound.v1", true);
let lastTickIndex = -1;
let lastSettlingRollerAt = 0;
let horrorScream = null;
let actionGunshots = null;
let genreDraft = [...state.genreFilter];
let genreTransition = null;
let mascotSpeechTimer = null;
let rentalPersonSearchTimer = null;

const mascotLines = {
  idle: [
    "Киномагия для Оли и Максима уже шуршит плёнкой.",
    "Я видел трейлер судьбы. Там вы с попкорном.",
    "Оля выбирает сердцем, Максим крутит колесо. Почти честно.",
    "Если выпадет драма, делаем вид, что так и планировали."
  ],
  spin: [
    "Кассета зашла в деку. Дальше решает магнитная лента.",
    "Крупный план на интригу! Демократия вышла за снеками.",
    "Оля, Максим, ставки сделаны. Попкорн держать крепко.",
    "Колесо крутится, критики нервничают, диктатура улыбается."
  ],
  win: [
    "Премьера назначена! Оля и Максим, занимайте лучшие места.",
    "Фильм выбран. Спорить с зелёным продюсером бессмысленно.",
    "Оракул монтажа сказал: сегодня смотрим это.",
    "Вот он, главный герой вечера. Попкорн в кадр!"
  ],
  empty: [
    "Кассета пустая. Нужны фильмы, иначе я начну предсказывать рекламу.",
    "Список голый, как титры без фильма. Добавьте кино.",
    "У меня светится пузо, но без фильмов даже оно не поможет."
  ],
  locked: [
    "Всё, Оля и Максим, плёнка пошла. Суд не принимает апелляции.",
    "Режим диктатуры включён. Руки убрали от кнопок.",
    "Протокол VHS-тайны активирован. Перекрут запрещён морально."
  ],
  reset: [
    "Победителя спрятали в архив. Я ничего не видел.",
    "Сцена удалена. Можно переснять.",
    "Оракул сделал вид, что этого дубля не было."
  ]
};

const genreMascotLines = {
  horror: [
    "Ужасы отмечены. Плед официально получает статус защитного снаряжения.",
    "Тревожная кассета выбрана. Свет выключать только по взаимному согласию.",
    "Я слышал, как плёнка вздохнула. Это, конечно, совершенно нормально."
  ],
  action: [
    "Боевик в прокате. Максим делает серьёзное лицо, Оля оценивает постановку.",
    "Экшен отмечен. Кассета застегнула ремни безопасности.",
    "Режим погони включён. Попкорн держать обеими руками."
  ],
  drama: [
    "Драма выбрана. Сегодня разрешается молчать после титров.",
    "Кассета стала немного тише. Это хороший знак для драмы.",
    "Драматический вечер отмечен. Салфетки не обязательны, но мудры."
  ],
  comedy: [
    "Комедия отмечена. Критики временно лишены права на серьёзность.",
    "Смешная кассета в деке. Настроение принято без поправок.",
    "Комедийный режим включён. Улыбка не является нарушением протокола."
  ],
  "sci-fi": [
    "Фантастика выбрана. Мой зелёный корпус одобряет этот маршрут.",
    "Сигнал пойман. Будущее доступно на VHS.",
    "Космическая полка кассет открыта. Время ведёт себя подозрительно."
  ],
  thriller: [
    "Триллер отмечен. Я буду смотреть в коридор вместо вас.",
    "Напряжённая кассета загружена. Дверь лучше не скрипеть.",
    "Режим подозрений активирован. Даже попкорн выглядит загадочно."
  ],
  catalog: [
    "Весь каталог снова в кадре. Демократия всё равно не вернулась.",
    "Все кассеты допущены к аукциону. Судьба довольна ассортиментом."
  ]
};

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.movies));
  localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
  localStorage.setItem(GENRE_FILTER_KEY, JSON.stringify(state.genreFilter));
  localStorage.setItem(STAKES_KEY, JSON.stringify(state.stakes));
  localStorage.setItem(THEME_KEY, JSON.stringify(state.themeMode));
  localStorage.setItem(MODE_KEY, JSON.stringify(state.mode));
}

function mergeMovies(nextMovies) {
  if (state.spinning) return;
  state.settledWheel = null;
  state.movies = mergeMovieList(state.movies, nextMovies, { fallbackPoster: FALLBACK_POSTER });
  save();
  render();
}

function cleanupTitle(value) {
  return String(value || "")
    .replace(/\b(смотреть|буду смотреть|хочу посмотреть)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function importFromHash() {
  if (!location.hash.startsWith("#import=")) return;

  try {
    const payload = decodeURIComponent(location.hash.slice("#import=".length));
    mergeMovies(JSON.parse(payload));
    history.replaceState(null, "", location.pathname + location.search);
  } catch {
    alert("Не получилось принять импорт. Попробуй еще раз после прокрутки списка на Кинопоиске.");
  }
}

function filteredMovies() {
  const query = state.query.toLowerCase();
  if (!query) return state.movies;
  return state.movies.filter((movie) => movie.title.toLowerCase().includes(query));
}

function auctionMovies() {
  return filterMoviesByGenres(state.movies, state.genreFilter);
}

function auctionOdds() {
  return calculateMovieOdds(auctionMovies(), state.stakes);
}

function rentalWheelItems() {
  const session = state.rental.session;
  if (!isRentalWheelView() || !session || session.selectionMode !== "wheel") return [];
  return (session.items || []).map(rentalItemToMovie);
}

function isRentalWheelView() {
  return state.mode === "rental" && state.rental.view === "wheel";
}

function isRentalMachineView() {
  return state.mode === "rental" && state.rental.view === "vhs_machine";
}

function rentalItemToMovie(item) {
  return {
    title: item.title,
    url: item.tmdbId ? `https://www.themoviedb.org/${item.mediaType === "tv" ? "tv" : "movie"}/${item.tmdbId}` : "",
    poster: item.posterPath ? `https://image.tmdb.org/t/p/w342${item.posterPath}` : "",
    year: item.year ? String(item.year) : "",
    genre: item.mediaType === "tv" ? "сериал" : "прокат",
    genres: item.genreIds || [],
    rental: true,
    tmdbId: item.tmdbId,
    mediaType: item.mediaType
  };
}

function activeWheelMovies() {
  return state.mode === "rental" ? rentalWheelItems() : auctionMovies();
}

function activeWheelOdds(movies = activeWheelMovies()) {
  return state.mode === "rental" ? calculateMovieOdds(movies, {}) : calculateMovieOdds(movies, state.stakes);
}

function chanceLabel(chance) {
  const percent = chance * 100;
  return `${percent >= 10 ? percent.toFixed(0) : percent.toFixed(1).replace(".", ",")}%`;
}

function genreLabel(genre) {
  return String(genre || "").replace(/^./, (letter) => letter.toUpperCase());
}

function genreSummary(genres = state.genreFilter) {
  return genres.length ? genres.map(genreLabel).join(" + ") : "Весь каталог";
}

function genreEffectType(genre) {
  const value = String(genre || "").toLowerCase();
  if (/(ужас|хоррор)/.test(value)) return "horror";
  if (/(боевик|экшен)/.test(value)) return "action";
  if (/(драма|мелодрам)/.test(value)) return "drama";
  if (/(комед|юмор)/.test(value)) return "comedy";
  if (/(фантаст|фэнтези)/.test(value)) return "sci-fi";
  if (/(триллер|детектив)/.test(value)) return "thriller";
  return "catalog";
}

function renderGenreAuction() {
  const candidates = auctionMovies();
  const locked = state.spinning;
  genreAuctionSummary.textContent = genreSummary();
  genreAuctionCount.textContent = `${candidates.length} ${pluralizeCassettes(candidates.length)}`;
  genreAuctionPanel.hidden = false;

  genreAuctionDraft.textContent = genreSummary(genreDraft);
  genreChipList.textContent = "";
  for (const { genre, count } of genreCounts(state.movies)) {
    const chip = document.createElement("button");
    const selected = genreDraft.includes(genre);
    chip.type = "button";
    chip.className = `genre-chip genre-chip-${genreEffectType(genre)}`;
    chip.dataset.genre = genre;
    chip.dataset.effect = genreEffectType(genre);
    chip.setAttribute("aria-pressed", String(selected));
    chip.disabled = locked;
    chip.innerHTML = `<span>${genreLabel(genre)}</span><b>${count}</b><i aria-hidden="true"></i>`;
    chip.addEventListener("click", () => toggleGenreDraft(genre));
    genreChipList.append(chip);
  }

  genreAllButton.classList.toggle("active", genreDraft.length === 0);
  genreAllButton.disabled = locked;
  genreApplyButton.disabled = locked;
}

function toggleGenreDraft(genre) {
  const selected = genreDraft.includes(genre);
  genreDraft = selected ? genreDraft.filter((item) => item !== genre) : [...genreDraft, genre];
  renderGenreAuction();
  const chip = genreChipList.querySelector(`[data-genre="${CSS.escape(genre)}"]`);
  if (chip) runGenreChipEffect(chip, genreEffectType(genre));
  const effect = genreEffectType(genre);
  if (effect !== "drama") {
    playGenreFilterSound(effect);
    showGenreStageEffect(effect);
  }
  sayMascotGenre(effect);
}

function runGenreChipEffect(chip, effect) {
  chip.classList.remove("genre-chip-effect");
  void chip.offsetWidth;
  chip.classList.add("genre-chip-effect", `genre-chip-effect-${effect}`);
  setTimeout(() => chip.classList.remove("genre-chip-effect", `genre-chip-effect-${effect}`), 520);
}

function showGenreStageEffect(effect) {
  genreStageEffects.textContent = "";
  if (effect === "thriller" || effect === "drama") return;
  const scene = document.createElement("div");
  scene.className = `genre-stage-effect genre-stage-${effect}`;
  if (effect === "horror") {
    const shadow = document.createElement("img");
    shadow.src = "assets/genre-horror-shadow.png";
    shadow.alt = "";
    scene.append(shadow);
  }
  genreStageEffects.append(scene);
  setTimeout(() => scene.remove(), 1100);
}

function showDramaRain() {
  genreStageEffects.textContent = "";
  const canvas = document.createElement("canvas");
  canvas.className = "genre-rain-canvas";
  canvas.setAttribute("aria-hidden", "true");
  genreStageEffects.append(canvas);

  const context = canvas.getContext("2d");
  if (!context) return;
  const lifetime = 2300;
  let animationFrame = 0;
  let expiresAt = 0;
  const rainTexture = new Image();
  const rainFrame = document.createElement("canvas");
  const frameContext = rainFrame.getContext("2d", { willReadFrequently: true });

  function resize() {
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.floor(width * scale);
    canvas.height = Math.floor(height * scale);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(scale, 0, 0, scale, 0, 0);
  }

  function clearRain() {
    cancelAnimationFrame(animationFrame);
    window.removeEventListener("resize", resize);
    if (canvas.parentElement) genreStageEffects.textContent = "";
  }

  function prepareRainFrame() {
    if (!frameContext) return false;
    rainFrame.width = rainTexture.naturalWidth;
    rainFrame.height = rainTexture.naturalHeight;
    frameContext.clearRect(0, 0, rainFrame.width, rainFrame.height);
    frameContext.drawImage(rainTexture, 0, 0);
    const pixels = frameContext.getImageData(0, 0, rainFrame.width, rainFrame.height);

    for (let index = 0; index < pixels.data.length; index += 4) {
      const brightness = Math.max(pixels.data[index], pixels.data[index + 1], pixels.data[index + 2]);
      if (brightness <= 12) {
        pixels.data[index + 3] = 0;
      } else {
        pixels.data[index + 3] = Math.round(pixels.data[index + 3] * Math.min(1, (brightness - 8) / 54));
      }
    }

    frameContext.putImageData(pixels, 0, 0);
    return true;
  }

  function draw(now) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const progress = Math.min((now - (expiresAt - lifetime)) / lifetime, 1);
    context.clearRect(0, 0, width, height);
    context.globalCompositeOperation = "source-over";
    context.imageSmoothingQuality = "high";
    const imageRatio = rainFrame.width / rainFrame.height;
    const viewportRatio = width / height;
    const drawWidth = viewportRatio > imageRatio ? width : height * imageRatio;
    const drawHeight = viewportRatio > imageRatio ? width / imageRatio : height;
    const fade = progress < .14 ? progress / .14 : progress > .78 ? (1 - progress) / .22 : 1;
    context.globalAlpha = Math.max(0, fade) * .92;
    context.drawImage(
      rainFrame,
      (width - drawWidth) / 2,
      (height - drawHeight) / 2 + progress * 12,
      drawWidth,
      drawHeight
    );

    if (now >= expiresAt) {
      clearRain();
      return;
    }
    animationFrame = requestAnimationFrame(draw);
  }

  window.addEventListener("resize", resize);
  rainTexture.addEventListener("load", () => {
    if (!canvas.parentElement) return;
    if (!prepareRainFrame()) {
      clearRain();
      return;
    }
    resize();
    expiresAt = performance.now() + lifetime;
    animationFrame = requestAnimationFrame(draw);
  }, { once: true });
  rainTexture.addEventListener("error", clearRain, { once: true });
  rainTexture.src = "assets/effects/drama-rain-frame-v2.png";
}

function sayMascotGenre(effect) {
  const lines = genreMascotLines[effect] || genreMascotLines.catalog;
  setMascotSpeech(lines[Math.floor(Math.random() * lines.length)], effect);
}

function applyGenreFilter() {
  if (state.spinning) return;
  state.settledWheel = null;
  const before = auctionMovies();
  const beforeOdds = auctionOdds();
  state.genreFilter = [...genreDraft];
  const after = auctionMovies();
  if (!canUseStakeOdds(after, state.stakes)) state.stakes = { max: "", olya: "" };
  const afterOdds = auctionOdds();
  save();
  render();
  if (state.genreFilter.some((genre) => genreEffectType(genre) === "drama")) {
    showDramaRain();
    playGenreFilterSound("drama");
  }
  animateGenreRemontage(before, after, beforeOdds, afterOdds);
  sayMascotGenre(state.genreFilter.length ? genreEffectType(state.genreFilter[0]) : "catalog");
}

function pluralizeCassettes(count) {
  const value = Math.abs(count) % 100;
  const last = value % 10;
  if (value > 10 && value < 20) return "кассет";
  if (last === 1) return "кассета";
  if (last > 1 && last < 5) return "кассеты";
  return "кассет";
}

function render() {
  const candidates = activeWheelMovies();
  const shelfCandidates = auctionMovies();
  movieCount.textContent = candidates.length;
  wheelWrap.classList.toggle("is-empty", candidates.length === 0);
  if (state.mode === "rental") {
    emptyWheelLabel.textContent = "Сначала собери небольшой пул";
  } else {
    emptyWheelLabel.textContent = state.movies.length && state.genreFilter.length && !shelfCandidates.length
      ? "В этой кассете нет подходящих жанров"
      : "Нет фильмов";
  }
  document.body.classList.toggle("rental-wheel-view", isRentalWheelView());
  document.body.classList.toggle("rental-wheel-ready", isRentalWheelView() && candidates.length > 0);
  document.body.classList.toggle("rental-machine-ready", isRentalMachineView());
  document.body.classList.toggle("dictatorship-active", state.spinning);
  vhsOsd.textContent = vhsOsdLabel();
  dictatorshipBanner.textContent = state.spinning
    ? "РЕЗУЛЬТАТ ЗАПЕЧАТАН НА VHS. ПЕРЕГОЛОСОВКИ НЕТ."
    : "Результат ещё можно обсуждать. Пока.";
  renderList();
  renderGenreAuction();
  renderPosterBackdrop();
  drawWheel();
  updateWinner();
  rentalMachineStage.hidden = !isRentalMachineView();
  const canSpinRentalMachine = isRentalMachineView() && state.rental.session?.totalCount > 0;
  spinButton.disabled = state.spinning || (canSpinRentalMachine ? false : candidates.length < 2);
  spinButton.textContent = state.spinning
    ? (canSpinRentalMachine ? "Автомат выбирает..." : "Диктатура крутит...")
    : (canSpinRentalMachine ? "Выбрать кассету" : "Крутить");
  removeWinnerButton.disabled = !state.winner || state.spinning;
  resetWinnerButton.disabled = state.spinning;
  clearButton.disabled = state.spinning;
  searchInput.disabled = state.spinning;
  refreshKinopoiskButton.disabled = state.spinning;
  addForm.querySelectorAll("input, button").forEach((control) => {
    control.disabled = state.spinning;
  });
  soundButton.classList.toggle("sound-on", soundEnabled);
  const theme = activeTheme();
  document.body.dataset.theme = theme;
  autoThemeButton.setAttribute("aria-pressed", String(state.themeMode === "auto"));
  dayThemeButton.setAttribute("aria-pressed", String(state.themeMode === "day"));
  nightThemeButton.setAttribute("aria-pressed", String(state.themeMode === "night"));
  document.body.dataset.mode = state.mode;
  shelfModeButton.classList.toggle("active", state.mode === "shelf");
  rentalModeButton.classList.toggle("active", state.mode === "rental");
  shelfModeButton.setAttribute("aria-pressed", String(state.mode === "shelf"));
  rentalModeButton.setAttribute("aria-pressed", String(state.mode === "rental"));
  rentalStage.hidden = state.mode !== "rental";
  rentalStage.classList.toggle("is-collapsed", isRentalWheelView());
  rentalListPanel.hidden = state.mode !== "rental";
  renderRental();
}

function setAppMode(mode) {
  if (state.spinning || !["shelf", "rental"].includes(mode)) return;
  state.mode = mode;
  save();
  render();
  if (mode === "rental") bootRentalCatalog();
}

function renderRental() {
  if (!rentalForm) return;

  const selectedGenre = rentalGenreSelect.value;
  const rentalReady = state.rental.configured;
  rentalGenreSelect.disabled = state.rental.genresLoading || state.rental.loading;
  rentalPersonInput.disabled = state.rental.loading;
  rentalIncludeTv.disabled = state.rental.loading;
  rentalBuildPoolButton.disabled = !rentalReady || state.rental.loading || state.rental.genresLoading || !selectedGenre;
  rentalClearButton.disabled = state.rental.loading
    || (!selectedGenre && !rentalPersonInput.value && !state.rental.selectedPerson && !state.rental.session);

  rentalStatusTitle.textContent = rentalStatusTitleText();
  rentalStatusText.textContent = state.rental.status;
  renderRentalGenres();
  renderRentalPeople();
  renderRentalSession();
}

function rentalStatusTitleText() {
  if (!state.rental.configured) return state.rental.configLoading ? "Проверяю TMDb" : "Прокат недоступен";
  if (state.rental.loading) return "Собираю кассеты";
  if (state.rental.peopleLoading) return "Ищу человека";
  if (state.rental.session) return `${state.rental.session.totalCount} ${pluralizeCassettes(state.rental.session.totalCount)} найдено`;
  if (state.rental.genresLoading) return "Загружаю жанры";
  return "Кассеты ещё не собраны";
}

function renderRentalGenres() {
  const current = rentalGenreSelect.value;
  rentalGenreSelect.innerHTML = "";

  if (!state.rental.configured) {
    rentalGenreSelect.append(new Option("TMDb не настроен на сервере", ""));
    return;
  }

  if (state.rental.genresLoading) {
    rentalGenreSelect.append(new Option("Загрузка жанров...", ""));
    return;
  }

  if (!state.rental.genres.length) {
    rentalGenreSelect.append(new Option("Жанры недоступны", ""));
    return;
  }

  rentalGenreSelect.append(new Option("Выбрать жанр", ""));
  for (const genre of state.rental.genres) {
    rentalGenreSelect.append(new Option(genre.name, String(genre.tmdbId)));
  }
  rentalGenreSelect.value = state.rental.genres.some((genre) => String(genre.tmdbId) === current) ? current : "";
}

function renderRentalPeople() {
  rentalPersonSuggestions.innerHTML = "";

  if (state.rental.selectedPerson) {
    rentalPersonSuggestions.append(rentalPersonButton(state.rental.selectedPerson, true));
    return;
  }

  if (!state.rental.configured) {
    const hint = document.createElement("p");
    hint.className = "rental-empty-hint";
    hint.textContent = "Прокат включится, когда на сервере будет настроен TMDb.";
    rentalPersonSuggestions.append(hint);
    return;
  }

  if (state.rental.peopleLoading) {
    const hint = document.createElement("p");
    hint.className = "rental-empty-hint";
    hint.textContent = "Ищу в каталоге TMDb...";
    rentalPersonSuggestions.append(hint);
    return;
  }

  if (!rentalPersonInput.value.trim()) {
    const hint = document.createElement("p");
    hint.className = "rental-empty-hint";
    hint.textContent = "Подсказки появятся после ввода имени.";
    rentalPersonSuggestions.append(hint);
    return;
  }

  if (!state.rental.people.length) {
    const hint = document.createElement("p");
    hint.className = "rental-empty-hint";
    hint.textContent = "Никого не нашли. Проверь имя или попробуй другой запрос.";
    rentalPersonSuggestions.append(hint);
    return;
  }

  for (const person of state.rental.people) {
    rentalPersonSuggestions.append(rentalPersonButton(person, false));
  }
}

function rentalPersonButton(person, active) {
  const button = document.createElement("button");
  button.className = `rental-person-suggestion${active ? " active" : ""}`;
  button.type = "button";
  button.dataset.tmdbId = person.tmdbId;
  const name = document.createElement("strong");
  name.textContent = person.name;
  const meta = document.createElement("small");
  meta.textContent = person.knownFor?.length
    ? person.knownFor.join(" · ")
    : person.knownForDepartment || "TMDb";
  button.append(name, meta);
  return button;
}

function renderRentalSession() {
  const session = state.rental.session;
  rentalTapeList.innerHTML = "";

  if (!session) {
    rentalListTitle.textContent = "Пул ещё не собран";
    rentalListMeta.textContent = "После запроса здесь появится результат TMDb";
    rentalMachineMode.textContent = "Колесо или VHS-автомат";
    rentalMachineNote.textContent = "Если кассет слишком много, автомат выберет честно из всего пула.";
    const item = document.createElement("li");
    item.className = "rental-empty-row";
    const title = document.createElement("strong");
    title.textContent = "Список появится после сборки кассет";
    item.append(title);
    rentalTapeList.append(item);
    return;
  }

  rentalListTitle.textContent = session.queryLabel || "Прокат по запросу";
  rentalListMeta.textContent = `${session.totalCount} ${pluralizeCassettes(session.totalCount)} в пуле проката`;
  rentalMachineMode.textContent = session.totalCount <= RENTAL_WHEEL_LIMIT ? "Колесо" : "VHS-автомат";
  rentalMachineNote.textContent = session.totalCount <= RENTAL_WHEEL_LIMIT
    ? "Пул достаточно компактный для читаемого колеса."
    : "Пул большой, поэтому выбор будет честно сделан из всего списка.";
  rentalMachineTitle.textContent = session.totalCount <= RENTAL_WHEEL_LIMIT
    ? "Пул готов к колесу"
    : `${session.totalCount} ${pluralizeCassettes(session.totalCount)} в автомате`;
  rentalMachineText.textContent = state.spinning && isRentalMachineView()
    ? "Лента перематывает весь пул и ловит случайную кассету."
    : "Нажми выбор, и автомат достанет одну кассету из полного пула.";

  for (const movie of session.items) {
    const item = document.createElement("li");
    const index = document.createElement("span");
    index.textContent = String(movie.tmdbRank || rentalTapeList.children.length + 1).padStart(3, "0");
    const title = document.createElement("strong");
    title.textContent = movie.title;
    const meta = document.createElement("small");
    meta.textContent = `${movie.mediaType === "tv" ? "сериал" : "фильм"}${movie.year ? ` · ${movie.year}` : ""}`;
    item.append(index, title, meta);
    rentalTapeList.append(item);
  }
}

function vhsOsdLabel() {
  const now = new Date();
  const time = now.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  if (state.spinning) return `REC  SP  ${time}`;
  if (state.winner) return `PLAY SP  ${time}`;
  return `STOP SP  ${String(auctionMovies().length).padStart(2, "0")} TAPES`;
}

function renderPosterBackdrop() {
  posterBackdrop.dataset.theme = activeTheme();
}

function activeTheme(now = new Date()) {
  if (state.themeMode !== "auto") return state.themeMode;
  const hour = now.getHours();
  return hour >= 8 && hour < 19 ? "day" : "night";
}

function sayMascot(kind, movie = "") {
  const movieTitle = typeof movie === "object" ? movie.title : movie;
  const lines = getMascotLines(kind, movie);
  const line = lines[Math.floor(Math.random() * lines.length)];
  setMascotSpeech(movieTitle ? `${line} ${movieTitle}.` : line, kind === "win" ? "celebration" : kind);
}

function setMascotSpeech(text, tone = "idle") {
  clearTimeout(mascotSpeechTimer);
  mascotSpeech.className = "mascot-speech";
  void mascotSpeech.offsetWidth;
  mascotSpeech.textContent = text;
  mascotSpeech.classList.add("mascot-speech-pop", `mascot-speech-${tone}`);
  mascotSpeechTimer = setTimeout(() => {
    mascotSpeech.className = "mascot-speech";
  }, 620);
}

function getMascotLines(kind, movie = "") {
  const movieTitle = typeof movie === "object" ? movie.title : movie;
  if (kind !== "win" || !movieTitle) return mascotLines[kind] || mascotLines.idle;

  const title = movieTitle.toLowerCase();
  const genre = typeof movie === "object" ? String(movie.genre || "").toLowerCase() : "";
  const signal = `${title} ${genre}`;
  const custom = [];
  if (isHorrorMovie(movie)) {
    custom.push("Хоррор на вечер. Оля и Максим, плед официально становится бронёй, свет не выключаем.");
    custom.push("Ужасы в деке. Если кто-то вскрикнет, это попадёт в режиссёрскую версию.");
    custom.push("Сегодня плёнка пахнет тревогой. Попкорн держать крепко, подушку не осуждаю.");
  }
  if (/(любов|роман|красот|амели|рассвет|закат|свадь|дневник|мелодрам)/i.test(signal)) {
    custom.push("Романтическая линия обнаружена. Попкорн держим нежно.");
    custom.push("Сегодня у нас кино с шансом на уютный взгляд поверх пледа.");
  }
  if (/(войн|бой|уби|гангстер|кримин|псы|драйв|ярост|оруж|полиц|боевик|триллер)/i.test(signal)) {
    custom.push("Экшен-плёнка пошла. Максим делает серьёзное лицо, Оля оценивает вайб.");
    custom.push("Если будет погоня, я официально моргаю как аварийка.");
  }
  if (/(космос|планет|матриц|будущ|робот|чуж|галак|фантаст)/i.test(signal)) {
    custom.push("Фантастика в деке. Мой зелёный корпус одобряет технологический шум.");
    custom.push("Будущее выбрало вас. Оно немного зернистое, зато на VHS.");
  }
  if (/(мульт|анимац|семейн|ребен|кот|панда|кролик)/i.test(signal)) {
    custom.push("Мульт-режим активирован. Это не инфантильность, это стратегический уют.");
    custom.push("Сегодня можно смеяться без объяснения кинокритикам.");
  }

  return custom.length ? custom : mascotLines.win;
}

function renderList() {
  movieList.textContent = "";
  const matchingMovies = filteredMovies();
  const candidates = auctionMovies();
  const hasGenreAuction = state.genreFilter.length > 0;
  const movies = hasGenreAuction
    ? groupMoviesByAuctionEligibility(matchingMovies, candidates)
    : matchingMovies;
  const candidateKeys = new Set(candidates.map(movieKey));
  const oddsByKey = new Map(auctionOdds().map((entry) => [movieKey(entry.movie), entry]));

  if (!movies.length) {
    const empty = document.createElement("li");
    empty.className = "movie-item empty-state";
    empty.textContent = state.movies.length
      ? "\u041d\u0438\u0447\u0435\u0433\u043e \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e"
      : "\u0414\u043e\u0431\u0430\u0432\u044c \u0444\u0438\u043b\u044c\u043c\u044b \u0438\u043b\u0438 \u0438\u043c\u043f\u043e\u0440\u0442\u0438\u0440\u0443\u0439 \u0441\u043f\u0438\u0441\u043e\u043a";
    movieList.append(empty);
    return;
  }

  let outsideDividerAdded = false;
  for (const movie of movies) {
    const isCandidate = candidateKeys.has(movieKey(movie));
    if (hasGenreAuction && !isCandidate && !outsideDividerAdded) {
      const divider = document.createElement("li");
      divider.className = "auction-divider";
      divider.textContent = "Вне жанрового аукциона";
      movieList.append(divider);
      outsideDividerAdded = true;
    }

    const item = template.content.firstElementChild.cloneNode(true);
    const link = item.querySelector(".movie-title");
    const poster = item.querySelector(".movie-poster");
    const posterSlot = item.querySelector(".movie-poster-slot");
    const remove = item.querySelector(".remove-button");
    const maxStake = item.querySelector(".stake-max");
    const olyaStake = item.querySelector(".stake-olya");
    const chance = oddsByKey.get(movieKey(movie));

    link.textContent = "";
    item.classList.toggle("outside-auction", hasGenreAuction && !isCandidate);
    const title = document.createElement("span");
    const meta = document.createElement("span");
    const details = document.createElement("span");
    title.className = "movie-title-main";
    meta.className = "movie-meta";
    details.className = "movie-details";
    title.textContent = movie.title;
    meta.textContent = movieMetaLabel(movie);
    const chanceMeta = document.createElement("span");
    chanceMeta.className = "movie-chance";
    chanceMeta.textContent = chance ? `Шанс ${chanceLabel(chance.chance)}` : "Вне аукциона";
    link.append(title);
    if (meta.textContent) details.append(meta);
    details.append(chanceMeta);
    link.append(details);
    link.href = movie.url || "#";
    poster.hidden = false;
    poster.src = movie.poster || FALLBACK_POSTER;
    poster.alt = movie.title;
    poster.onerror = () => {
      poster.onerror = null;
      poster.src = FALLBACK_POSTER;
    };
    posterSlot.classList.toggle("empty-poster", !movie.poster);
    remove.disabled = state.spinning;
    for (const [player, button] of [["max", maxStake], ["olya", olyaStake]]) {
      const selected = state.stakes[player] === movieKey(movie);
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.disabled = state.spinning || !chance;
      button.addEventListener("click", () => toggleStake(player, movie));
    }
    if (!movie.url) {
      link.removeAttribute("target");
      link.addEventListener("click", (event) => event.preventDefault());
    }

    remove.addEventListener("click", () => {
      if (state.spinning) return;
      state.settledWheel = null;
      state.movies = state.movies.filter((candidate) => candidate !== movie);
      for (const player of ["max", "olya"]) {
        if (state.stakes[player] === movieKey(movie)) state.stakes[player] = "";
      }
      if (state.winner === movie) state.winner = null;
      save();
      render();
    });

    movieList.append(item);
  }
}

function toggleStake(player, movie) {
  const candidates = auctionMovies();
  if (state.spinning || !candidates.includes(movie)) return;
  const beforeOdds = calculateMovieOdds(candidates, state.stakes);
  const key = movieKey(movie);
  const nextStakes = { ...state.stakes, [player]: state.stakes[player] === key ? "" : key };
  if (!canUseStakeOdds(candidates, nextStakes)) {
    setMascotSpeech("С этими ставками для остальных кассет не останется честного шанса.", "idle");
    playTapeClick();
    return;
  }
  state.settledWheel = null;
  state.stakes = nextStakes;
  const afterOdds = calculateMovieOdds(candidates, state.stakes);
  save();
  renderList();
  animateStakeRemontage(candidates, beforeOdds, afterOdds);
  playButtonClack();
  setMascotSpeech(state.stakes[player] ? `${player === "max" ? "Максим" : "Оля"} добавил(а) 10 пунктов к шансу ${movie.title}.` : "Ставка снята. Аукцион снова дышит свободнее.", "idle");
}

function updateWinner() {
  if (!state.winner) {
    winnerBox.hidden = false;
    winnerBox.classList.add("waiting");
    winnerBox.classList.remove("has-winner", "has-winner-poster", "horror-winner", "vhs-reveal", "horror-reveal");
    winnerBox.querySelector("p").textContent = "";
    winnerPoster.hidden = true;
    winnerPoster.src = "";
    winnerPoster.alt = "";
    winnerLink.textContent = "ЧТО ЖЕ СЕГОДНЯ СМОТРЯТ МАКСИМ И ОЛЯ???";
    winnerLink.href = "#";
    winnerLink.removeAttribute("target");
    return;
  }

  winnerBox.hidden = false;
  winnerBox.classList.remove("waiting");
  winnerBox.classList.add("has-winner");
  winnerBox.classList.toggle("has-winner-poster", Boolean(state.winner.poster));
  winnerBox.classList.toggle("horror-winner", isHorrorMovie(state.winner));
  winnerBox.querySelector("p").textContent = ["Максим и Оля сегодня смотрят", movieMetaLabel(state.winner)]
    .filter(Boolean)
    .join(" · ");
  winnerLink.textContent = state.winner.title;
  winnerLink.href = state.winner.url || "#";
  if (state.winner.url) {
    winnerLink.target = "_blank";
  } else {
    winnerLink.removeAttribute("target");
  }
  winnerPoster.hidden = !state.winner.poster;
  winnerPoster.src = state.winner.poster || "";
  winnerPoster.alt = state.winner.title;
}

function drawWheel(rotation = state.rotation, options = {}) {
  const width = canvas.width;
  const height = canvas.height;
  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.47;
  const settledWheel = !options.movies && state.settledWheel;
  const movies = options.movies || settledWheel?.movies || activeWheelMovies();
  const odds = options.odds || settledWheel?.odds || activeWheelOdds(movies);
  const segments = wheelSegments(movies, odds);
  const scale = options.scale ?? 1;
  const opacity = options.opacity ?? 1;

  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);
  ctx.globalAlpha = opacity;

  if (!movies.length) {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#241b13";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 184, 74, .32)";
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.restore();
    return;
  }

  segments.forEach((segment, index) => {
    const { movie } = segment;
    const start = segment.start - Math.PI / 2;
    const end = segment.end - Math.PI / 2;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = palette[index % palette.length];
    ctx.fill();
    ctx.strokeStyle = "rgba(16, 18, 20, .55)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.save();
    ctx.rotate(start + segment.angle / 2);
    ctx.textAlign = "right";
    ctx.fillStyle = "#111315";
    const smallSegment = segment.angle < .11;
    ctx.font = smallSegment || movies.length > 18 ? "700 17px Segoe UI, Arial" : "800 23px Segoe UI, Arial";
    ctx.fillText(truncate(movie.title, smallSegment || movies.length > 18 ? 24 : 18), radius - 28, 8);
    ctx.restore();
  });

  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255, 255, 255, .22)";
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.restore();
}

function truncate(value, max) {
  return value.length > max ? value.slice(0, max - 1) + "…" : value;
}

async function spinRentalMachine() {
  const session = state.rental.session;
  if (!session?.id || state.spinning) return;

  state.spinning = true;
  state.winner = null;
  state.settledWheel = null;
  sayMascot("spin");
  render();
  playStartSound();

  const startedAt = performance.now();
  let tapeFrame = 0;
  const items = session.items || [];

  function frame(now) {
    if (!state.spinning || !items.length) return;
    const index = Math.floor((tapeFrame * 7 + now / 85) % items.length);
    const item = items[index];
    rentalMachineTitle.textContent = item?.title || "Перемотка пула";
    rentalMachineText.textContent = `${String(index + 1).padStart(3, "0")} / ${session.totalCount} · случайный прокат`;
    tapeFrame += 1;
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  try {
    const payload = await fetchJson(apiEndpoint(`/api/rental/sessions/${session.id}/select`), {
      method: "POST"
    });
    const elapsed = performance.now() - startedAt;
    if (elapsed < 1400) {
      await new Promise((resolve) => setTimeout(resolve, 1400 - elapsed));
    }
    state.winner = rentalItemToMovie(payload.selectedItem);
    state.rental.session = {
      ...state.rental.session,
      selectedItem: payload.selectedItem,
      selectionMode: payload.selectionMode
    };
    sayMascot("win", state.winner);
    render();
    showWinnerPremiere(state.winner);
  } catch (error) {
    state.rental.status = rentalErrorMessage(error);
    sayMascot("empty");
  } finally {
    state.spinning = false;
    render();
  }
}

function spin() {
  if (state.spinning) return;
  if (isRentalMachineView()) {
    spinRentalMachine();
    return;
  }
  const movies = activeWheelMovies();
  if (movies.length < 2) {
    sayMascot("empty");
    playTapeClick();
    return;
  }

  state.spinning = true;
  state.winner = null;
  state.settledWheel = null;
  lastTickIndex = -1;
  lastSettlingRollerAt = 0;
  sayMascot(Math.random() > .45 ? "locked" : "spin");
  render();
  playStartSound();

  const odds = activeWheelOdds(movies);
  const segments = wheelSegments(movies, odds);
  const stakesForSpin = { ...state.stakes };
  const selectedWinner = pickMovieByOdds(odds, Math.random);
  const winnerSegment = segments.find((segment) => segment.movie === selectedWinner);
  // Only whole rotations belong before the final aiming correction. A
  // fractional turn would rotate the chosen segment away from the pointer.
  const turns = 6 + Math.floor(Math.random() * 4);
  const start = state.rotation;
  const end = rotationToLandSegmentAtPointer(winnerSegment, start, turns);
  const startedAt = performance.now();
  const duration = 4300;

  function frame(now) {
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - Math.pow(1 - progress, 4);
    state.rotation = start + (end - start) * eased;
    tickWheel(state.rotation, progress, movies, odds);
    drawWheel(state.rotation, { movies, odds });

    if (progress < 1) {
      requestAnimationFrame(frame);
      return;
    }

    state.spinning = false;
    state.rotation = end % (Math.PI * 2);
    state.winner = selectedWinner;
    state.settledWheel = { movies, odds };
    sayMascot("win", state.winner);
    if (state.mode === "shelf") {
      state.history.unshift({ ...state.winner, wonAt: new Date().toISOString(), stakes: stakesForSpin });
      state.history = state.history.slice(0, 20);
      state.stakes = { max: "", olya: "" };
      save();
    }
    render();
    showWinnerPremiere(state.winner);
  }

  requestAnimationFrame(frame);
}

function movieAtPointer(rotation, movies = activeWheelMovies(), odds = activeWheelOdds(movies)) {
  return movieAtPointerFromSegments(movies, rotation, odds);
}

function getAudioContext() {
  if (!soundEnabled) return null;
  audioContext ||= new AudioContext();
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function playTone(frequency, duration, startAt = 0, type = "sine", gainValue = .06) {
  const audio = getAudioContext();
  if (!audio) return;

  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const start = audio.currentTime + startAt;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(gainValue, start + .015);
  gain.gain.exponentialRampToValueAtTime(.001, start + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + .02);
}

function playPitchSlide(from, to, duration, startAt = 0, type = "sawtooth", gainValue = .04) {
  const audio = getAudioContext();
  if (!audio) return;

  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const start = audio.currentTime + startAt;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(gainValue, start + .02);
  gain.gain.exponentialRampToValueAtTime(.001, start + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + .02);
}

function playNoise(duration, startAt = 0, gainValue = .05, frequency = 900, type = "bandpass") {
  const audio = getAudioContext();
  if (!audio) return;

  const sampleCount = Math.max(1, Math.floor(audio.sampleRate * duration));
  const buffer = audio.createBuffer(1, sampleCount, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < sampleCount; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }

  const source = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const gain = audio.createGain();
  const start = audio.currentTime + startAt;

  filter.type = type;
  filter.frequency.setValueAtTime(frequency, start);
  filter.Q.setValueAtTime(1.8, start);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(gainValue, start + .018);
  gain.gain.exponentialRampToValueAtTime(.001, start + duration);

  source.buffer = buffer;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(audio.destination);
  source.start(start);
  source.stop(start + duration);
}

function playTapeClick(startAt = 0) {
  playTone(68, .065, startAt, "triangle", .024);
  playNoise(.03, startAt + .008, .012, 720, "lowpass");
}

function playTapeRewind(startAt = 0) {
  playPitchSlide(420, 1680, .34, startAt, "sawtooth", .035);
  playPitchSlide(680, 210, .28, startAt + .18, "triangle", .026);
  playNoise(.5, startAt, .045, 1450, "bandpass");
  playNoise(.22, startAt + .12, .022, 4200, "highpass");
}

function playVhsGlitch(startAt = 0) {
  playNoise(.13, startAt, .11, 3600, "highpass");
  playPitchSlide(96, 42, .24, startAt, "sawtooth", .065);
  playNoise(.06, startAt + .16, .075, 900, "bandpass");
}

function playTapeHiss(duration, startAt = 0, gainValue = .022) {
  playNoise(duration, startAt, gainValue, 1800, "bandpass");
  playNoise(duration * .86, startAt + .03, gainValue * .55, 5200, "highpass");
}

function playButtonClack(startAt = 0) {
  playTone(92, .055, startAt, "triangle", .02);
  playNoise(.022, startAt + .006, .009, 840, "lowpass");
}

function playCapstanThump(startAt = 0) {
  playTone(46, .18, startAt, "sine", .07);
  playNoise(.045, startAt + .025, .04, 760, "bandpass");
}

function playWheelMotor(duration = 4.3) {
  // A warm transport motor is calmer than one sharp click per wheel sector.
  playTone(54, duration, 0, "sine", .012);
  playTone(108, duration * .9, .05, "triangle", .006);
  playNoise(duration * .82, .08, .004, 520, "lowpass");
  playNoise(.12, .02, .01, 760, "lowpass");
}

function playSoftCassetteEngage() {
  playTone(62, .13, 0, "triangle", .024);
  playNoise(.08, .015, .012, 680, "lowpass");
}

function playStartSound() {
  playSoftCassetteEngage();
  playWheelMotor();
}

function playWinSound() {
  // The shared win cue should feel like a warm tape settle, not an alarm.
  playTone(174.61, .34, 0, "sine", .018);
  playTone(220, .42, .09, "sine", .016);
  playTone(261.63, .48, .18, "triangle", .012);
  playNoise(.045, .1, .005, 640, "lowpass");
}

function playTickSound(progress) {
  if (progress < .76) return;
  const slow = (progress - .76) / .24;
  playTone(58 - slow * 11, .055 + slow * .045, 0, "sine", .012 + slow * .01);
  playNoise(.016, .004, .008 + slow * .006, 480, "lowpass");
}

function tickWheel(rotation, progress, movies = activeWheelMovies(), odds = activeWheelOdds(movies)) {
  if (!soundEnabled || !movies.length) return;
  const movie = movieAtPointer(rotation, movies, odds);
  const key = movieKey(movie);
  if (key === lastTickIndex) return;
  lastTickIndex = key;
  const now = performance.now();
  const minimumGap = 170 + Math.max(0, .9 - progress) * 260;
  if (now - lastSettlingRollerAt < minimumGap) return;
  lastSettlingRollerAt = now;
  playTickSound(progress);
}

function playSoftRemontage() {
  playTone(78, .18, 0, "triangle", .014);
  playNoise(.24, .035, .006, 540, "lowpass");
}

function animateWheelRemontage(before, after, beforeOdds, afterOdds) {
  const startedAt = performance.now();
  const duration = 680;
  genreTransition = { before, after };
  wheelWrap.classList.add("genre-remontage");
  playSoftRemontage();

  function frame(now) {
    const progress = Math.min(1, (now - startedAt) / duration);
    const firstHalf = progress < .5;
    const local = firstHalf ? progress / .5 : (progress - .5) / .5;
    const eased = firstHalf ? 1 - Math.pow(1 - local, 3) : Math.pow(local, 3);
    const movies = firstHalf ? before : after;
    const scale = firstHalf ? 1 - eased * .78 : .22 + eased * .78;
    const opacity = firstHalf ? 1 - eased : eased;
    drawWheel(state.rotation, {
      movies,
      odds: firstHalf ? beforeOdds : afterOdds,
      scale,
      opacity
    });
    movieCount.textContent = Math.round(before.length + (after.length - before.length) * progress);

    if (progress < 1) {
      requestAnimationFrame(frame);
      return;
    }

    genreTransition = null;
    wheelWrap.classList.remove("genre-remontage");
    movieCount.textContent = after.length;
    drawWheel();
    playSoftCassetteEngage();
  }

  requestAnimationFrame(frame);
}

function animateGenreRemontage(before, after, beforeOdds, afterOdds) {
  animateWheelRemontage(before, after, beforeOdds, afterOdds);
}

function animateStakeRemontage(movies, beforeOdds, afterOdds) {
  animateWheelRemontage(movies, movies, beforeOdds, afterOdds);
}

function playGenreFilterSound(effect) {
  if (!soundEnabled) return;
  if (effect === "action") {
    playTone(168, .055, 0, "square", .035);
    playNoise(.035, .04, .025, 2200, "highpass");
    return;
  }
  if (effect === "horror") {
    playNoise(.1, 0, .018, 1200, "bandpass");
    playPitchSlide(188, 126, .14, .01, "triangle", .024);
    return;
  }
  if (effect === "drama") {
    playTone(261.63, .18, 0, "sine", .025);
    return;
  }
  if (effect === "comedy") {
    playPitchSlide(380, 510, .12, 0, "triangle", .03);
    return;
  }
  if (effect === "sci-fi") {
    playPitchSlide(340, 680, .13, 0, "sine", .024);
    return;
  }
  playButtonClack();
}

function showWinnerPremiere(movie) {
  const effect = winnerEffectType(movie);
  renderWinnerModal(movie, effect);
  showGenreWinBurst(movie, effect);
  playGenreWinSound(movie, effect);
}

function renderWinnerModal(movie, effect) {
  winnerModal.hidden = false;
  winnerModal.className = `winner-modal active ${effect}-premiere`;
  winnerModalLabel.textContent = effectLabel(effect);
  winnerModalTitle.textContent = movie.title;
  winnerModalMeta.textContent = ["Максим и Оля сегодня смотрят", movieMetaLabel(movie)]
    .filter(Boolean)
    .join(" · ");
  winnerModalPoster.src = movie.poster || FALLBACK_POSTER;
  winnerModalPoster.alt = movie.title;
  winnerModalPoster.onerror = () => {
    winnerModalPoster.onerror = null;
    winnerModalPoster.src = FALLBACK_POSTER;
  };
  playLibraryEntrance(winnerModal.querySelector(".winner-modal-card"));
}

function playLibraryEntrance(element) {
  if (!motionAnimate || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  motionAnimate(element, {
    opacity: [0, 1],
    transform: ["translateY(26px) rotate(-.8deg) scale(.96)", "translateY(0) rotate(0deg) scale(1)"]
  }, {
    duration: .46,
    ease: [.16, .9, .28, 1]
  });
}

function closeWinnerModal() {
  winnerModal.hidden = true;
  winnerModal.className = "winner-modal";
  winnerModalEffects.textContent = "";
}

function removeWinnerFromModal() {
  if (!state.winner) return;
  state.movies = state.movies.filter((movie) => movie !== state.winner);
  state.winner = null;
  state.settledWheel = null;
  closeWinnerModal();
  save();
  render();
}

function showGenreWinBurst(movie = null, effect = winnerEffectType(movie)) {
  confettiLayer.textContent = "";
  winnerModalEffects.textContent = "";
  if (effect === "action") {
    winnerModalEffects.append(...createGenreEffectNodes(effect));
    return;
  }
  const burst = document.createElement("div");
  const stamp = document.createElement("div");
  burst.className = `static-burst ${effect}-static-burst`;
  stamp.className = `vhs-winner-stamp ${effect}-stamp`;
  stamp.textContent = effectLabel(effect);
  confettiLayer.append(burst, stamp);
  winnerModalEffects.append(...createGenreEffectNodes(effect));

  setTimeout(() => {
    confettiLayer.textContent = "";
  }, 1450);
}

function createGenreEffectNodes(effect) {
  if (effect === "horror") {
    const overlay = document.createElement("span");
    overlay.className = "blood-overlay";
    return [overlay];
  }

  if (effect === "drama") {
    return Array.from({ length: 34 }, (_, index) => {
      const rain = document.createElement("span");
      rain.className = "rain-drop";
      rain.style.left = `${(index * 7 + Math.random() * 6) % 100}%`;
      rain.style.animationDelay = `${Math.random() * .9}s`;
      rain.style.setProperty("--fall", `${240 + Math.random() * 340}px`);
      return rain;
    });
  }

  if (effect === "action") {
    return ["first", "second"].map((shot) => {
      const glass = document.createElement("span");
      glass.className = `action-glass-fall action-glass-fall-${shot}`;
      return glass;
    });
  }

  if (effect === "comedy") {
    return Array.from({ length: 16 }, (_, index) => {
      const laugh = document.createElement("span");
      laugh.className = "laugh-pop";
      laugh.textContent = index % 3 === 0 ? "ХА!" : index % 3 === 1 ? "LOL" : "★";
      laugh.style.left = `${8 + Math.random() * 82}%`;
      laugh.style.top = `${12 + Math.random() * 72}%`;
      laugh.style.animationDelay = `${Math.random() * .65}s`;
      return laugh;
    });
  }

  return [];
}

function effectLabel(effect) {
  return {
    action: "БОЕВОЙ ПРОКАТ",
    comedy: "СМЕШНОЙ СЕАНС",
    drama: "ДРАМАТИЧЕСКИЙ СЕАНС",
    horror: "КАССЕТА УЖАСА",
    default: "СЕГОДНЯ В ПРОКАТЕ"
  }[effect] || "СЕГОДНЯ В ПРОКАТЕ";
}

function playGenreWinSound(movie, effect = winnerEffectType(movie)) {
  playWinSound();
  if (effect === "horror") {
    playRealHorrorScream();
    playHorrorSoundBed();
    return;
  }
  if (effect === "drama") {
    playDramaWinSound();
    return;
  }
  if (effect === "action") {
    playActionWinSound();
    return;
  }
  if (effect === "comedy") {
    playComedyWinSound();
    return;
  }
}

function playRealHorrorScream() {
  if (!soundEnabled) return;
  horrorScream ||= new Audio("assets/sounds/female-scream-pixabay-41894.mp3");
  horrorScream.currentTime = 0;
  horrorScream.volume = .86;
  const playback = horrorScream.play();
  if (playback?.catch) playback.catch(() => playSyntheticScream(.08));
}

function playHorrorSoundBed() {
  playVhsGlitch(0);
  playPitchSlide(70, 28, .82, 0, "sawtooth", .09);
  playNoise(.38, .16, .08, 600, "bandpass");
  playCapstanThump(.34);
}

function playSyntheticScream(startAt = 0) {
  playPitchSlide(920, 1320, .18, startAt, "sawtooth", .05);
  playPitchSlide(1320, 760, .42, startAt + .16, "sawtooth", .045);
  playNoise(.36, startAt + .12, .045, 3400, "highpass");
}

function playDramaWinSound() {
  playTapeHiss(.7, 0, .015);
  playNoise(.9, 0, .035, 1300, "bandpass");
  [220, 261.63, 196, 174.61].forEach((frequency, index) => {
    playTone(frequency, .42, index * .2, "sine", .04);
  });
}

function playActionWinSound() {
  if (!soundEnabled) return;
  actionGunshots ||= new Audio("assets/sounds/action-gunshots.mp3");
  actionGunshots.currentTime = 0;
  actionGunshots.volume = .68;
  const playback = actionGunshots.play();
  if (playback?.catch) playback.catch(() => {});

  playCapstanThump(0);
  playNoise(.28, .42, .04, 4200, "highpass");
}

function playComedyWinSound() {
  [330, 440, 392, 523].forEach((frequency, index) => {
    playTone(frequency, .11, index * .12, index % 2 ? "square" : "triangle", .04);
  });
  playPitchSlide(220, 520, .18, .42, "triangle", .045);
  playNoise(.05, .62, .06, 1800, "bandpass");
}

addForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = document.querySelector("#movieTitle").value;
  const url = document.querySelector("#movieUrl").value;
  mergeMovies([{ title, url }]);
  addForm.reset();
});

searchInput.addEventListener("input", () => {
  state.query = searchInput.value;
  renderList();
});

genreAllButton.addEventListener("click", () => {
  if (state.spinning) return;
  genreDraft = [];
  renderGenreAuction();
  runGenreChipEffect(genreAllButton, "catalog");
  playGenreFilterSound("catalog");
});

genreApplyButton.addEventListener("click", applyGenreFilter);

clearButton.addEventListener("click", () => {
  if (state.spinning) return;
  if (!confirm("Очистить весь список?")) return;
  state.movies = [];
  state.stakes = { max: "", olya: "" };
  state.winner = null;
  state.settledWheel = null;
  save();
  render();
});

spinButton.addEventListener("click", spin);

removeWinnerButton.addEventListener("click", () => {
  if (!state.winner) return;
  state.movies = state.movies.filter((movie) => movie !== state.winner);
  state.winner = null;
  state.settledWheel = null;
  closeWinnerModal();
  save();
  render();
});

resetWinnerButton.addEventListener("click", () => {
  state.winner = null;
  state.settledWheel = null;
  closeWinnerModal();
  sayMascot("reset");
  render();
});

watchWinnerButton.addEventListener("click", closeWinnerModal);
closeWinnerModalButton.addEventListener("click", closeWinnerModal);
modalRemoveWinnerButton.addEventListener("click", removeWinnerFromModal);

winnerModal.addEventListener("click", (event) => {
  if (event.target === winnerModal) closeWinnerModal();
});

soundButton.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  localStorage.setItem("kinoauk.sound.v1", JSON.stringify(soundEnabled));
  if (soundEnabled) playButtonClack();
  render();
});

function setTheme(themeMode) {
  if (!['auto', 'day', 'night'].includes(themeMode)) return;
  state.themeMode = themeMode;
  save();
  render();
}

autoThemeButton.addEventListener("click", () => setTheme("auto"));
dayThemeButton.addEventListener("click", () => setTheme("day"));
nightThemeButton.addEventListener("click", () => setTheme("night"));

setInterval(() => {
  if (state.themeMode === "auto") render();
}, 60_000);

shutdownButton.addEventListener("click", async () => {
  if (!confirm("Выключить локальный сервер Киноаука?")) return;

  try {
    const endpoint = location.protocol === "file:" ? "http://127.0.0.1:5173/api/shutdown" : "/api/shutdown";
    await fetch(endpoint, { method: "POST" });
    shutdownButton.textContent = "✓";
  } catch {
    alert("Не получилось выключить сервер из браузера. Можно запустить stop-kinoauk.cmd.");
  }
});

refreshKinopoiskButton.addEventListener("click", async () => {
  refreshKinopoiskButton.disabled = true;
  refreshKinopoiskStatus.textContent = "Тяну список...";

  try {
    const payload = await refreshFromServer();
    if (!payload.movies?.length) throw new Error("Кинопоиск не отдал фильмы на странице.");

    mergeMovies(payload.movies);
    refreshKinopoiskStatus.textContent = `Добавлено/обновлено: ${payload.movies.length}`;
  } catch (error) {
    refreshKinopoiskStatus.textContent = error instanceof TypeError
      ? "Локальный сервер не отвечает. Запусти start-kinoauk.cmd и открой http://127.0.0.1:5173"
      : error.message;
  } finally {
    refreshKinopoiskButton.disabled = false;
  }
});

rentalPersonInput.addEventListener("input", () => {
  clearTimeout(rentalPersonSearchTimer);
  state.rental.selectedPerson = null;
  state.rental.session = null;
  state.rental.view = "form";
  rentalPersonSearchTimer = setTimeout(() => searchRentalPeople(rentalPersonInput.value), 320);
  render();
});

rentalPersonSuggestions.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest(".rental-person-suggestion");
  if (!button) return;
  const person = state.rental.people.find((candidate) => String(candidate.tmdbId) === button.dataset.tmdbId);
  if (!person) return;
  state.rental.selectedPerson = person;
  rentalPersonInput.value = person.name;
  state.rental.status = "Человек выбран. Можно собирать кассеты.";
  state.rental.view = "form";
  render();
});

rentalGenreSelect.addEventListener("change", () => {
  state.rental.session = null;
  state.rental.view = "form";
  render();
});

rentalIncludeTv.addEventListener("change", () => {
  state.rental.session = null;
  state.rental.view = "form";
  render();
});

rentalForm.addEventListener("submit", (event) => {
  event.preventDefault();
  buildRentalSession();
});

rentalClearButton.addEventListener("click", clearRentalForm);

rentalBackToFormButton.addEventListener("click", () => {
  state.rental.view = "form";
  state.winner = null;
  state.settledWheel = null;
  render();
});

async function refreshFromServer() {
  const endpoint = apiEndpoint("/api/refresh");
  const response = await fetch(endpoint);
  const payload = await response.json();

  if (!response.ok) throw new Error(payload.error || "Не получилось обновить список.");
  return payload;
}

function apiEndpoint(path) {
  return location.protocol === "file:" ? `http://127.0.0.1:5173${path}` : path;
}

async function bootRentalCatalog() {
  await ensureRentalConfig();
  if (state.rental.configured) ensureRentalGenres();
}

async function ensureRentalConfig() {
  if (state.rental.configLoaded || state.rental.configLoading) return;
  state.rental.configLoading = true;
  state.rental.configStatus = "Проверяю локальное подключение TMDb.";
  render();

  try {
    const payload = await fetchJson(apiEndpoint("/api/rental/config"));
    state.rental.configured = Boolean(payload.configured);
    state.rental.configLoaded = true;
    state.rental.configStatus = state.rental.configured
      ? "Живой поиск включён. Ключ хранится только локально."
      : "TMDb не настроен на сервере. Нужна серверная переменная окружения.";
    state.rental.status = state.rental.configured
      ? state.rental.status
      : "Прокат временно недоступен: TMDb не настроен на сервере.";
  } catch (error) {
    state.rental.configStatus = rentalErrorMessage(error);
    state.rental.status = rentalErrorMessage(error);
  } finally {
    state.rental.configLoading = false;
    render();
  }
}

async function ensureRentalGenres() {
  if (!state.rental.configured) return;
  if (state.rental.genresLoaded || state.rental.genresLoading) return;
  state.rental.genresLoading = true;
  state.rental.status = "Загружаю жанры из TMDb.";
  render();

  try {
    const payload = await fetchJson(apiEndpoint("/api/rental/genres?mediaType=movie"));
    state.rental.genres = payload.genres || [];
    state.rental.genresLoaded = true;
    state.rental.status = state.rental.genres.length
      ? "Выбери жанр, затем при желании уточни актёра или актрису."
      : "TMDb не вернул жанры. Можно попробовать обновить позже.";
  } catch (error) {
    state.rental.status = rentalErrorMessage(error);
  } finally {
    state.rental.genresLoading = false;
    render();
  }
}

async function searchRentalPeople(query) {
  const value = query.trim();
  state.rental.selectedPerson = null;
  state.rental.people = [];

  if (!state.rental.configured) {
    state.rental.peopleLoading = false;
    state.rental.status = "Прокат временно недоступен: TMDb не настроен на сервере.";
    render();
    return;
  }

  if (value.length < 2) {
    state.rental.peopleLoading = false;
    state.rental.status = "Можно собрать пул только по жанру или уточнить актёра через поиск.";
    render();
    return;
  }

  state.rental.peopleLoading = true;
  state.rental.status = "Ищу человека в TMDb.";
  render();

  try {
    const payload = await fetchJson(apiEndpoint(`/api/rental/people?q=${encodeURIComponent(value)}`));
    if (rentalPersonInput.value.trim() !== value) return;
    state.rental.people = payload.results || [];
    state.rental.status = state.rental.people.length
      ? "Выбери конкретного человека из подсказок или собери кассеты только по жанру."
      : "Никого не нашли. Можно собрать кассеты только по жанру.";
  } catch (error) {
    state.rental.status = rentalErrorMessage(error);
  } finally {
    state.rental.peopleLoading = false;
    render();
  }
}

async function buildRentalSession() {
  if (!state.rental.configured) {
    state.rental.status = "Прокат временно недоступен: TMDb не настроен на сервере.";
    render();
    return;
  }

  const genreTmdbId = Number(rentalGenreSelect.value);
  if (!genreTmdbId) {
    state.rental.status = "Сначала выбери жанр.";
    render();
    return;
  }

  state.rental.loading = true;
  state.rental.status = "Собираю пул кассет. Это может занять несколько секунд.";
  render();

  try {
    const payload = await fetchJson(apiEndpoint("/api/rental/sessions"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        genreTmdbIds: [genreTmdbId],
        actorTmdbId: state.rental.selectedPerson?.tmdbId || null,
        includeTv: rentalIncludeTv.checked
      })
    });
    state.rental.session = payload;
    state.rental.view = payload.selectionMode === "wheel" && payload.totalCount > 1
      ? "wheel"
      : (payload.selectionMode === "vhs_machine" && payload.totalCount > 0 ? "vhs_machine" : "form");
    state.rental.status = payload.totalCount
      ? `Собрано ${payload.totalCount} ${pluralizeCassettes(payload.totalCount)}.`
      : "По этому запросу кассет не нашли.";
  } catch (error) {
    state.rental.status = rentalErrorMessage(error);
  } finally {
    state.rental.loading = false;
    render();
  }
}

function clearRentalForm() {
  rentalGenreSelect.value = "";
  rentalPersonInput.value = "";
  rentalIncludeTv.checked = false;
  state.rental.people = [];
  state.rental.selectedPerson = null;
  state.rental.session = null;
  state.rental.view = "form";
  state.rental.status = "Можно собрать пул только по жанру или уточнить актёра через поиск.";
  render();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || payload.error || "Запрос не удался.");
    error.code = payload.error;
    throw error;
  }
  return payload;
}

function rentalErrorMessage(error) {
  if (error?.code === "TMDB_TOKEN_MISSING") {
    return "Нет ключа TMDb. Настрой TMDB_API_TOKEN на локальном сервере.";
  }
  if (error instanceof TypeError) {
    return "Локальный сервер не отвечает. Запусти start-kinoauk.cmd и открой http://127.0.0.1:5173";
  }
  return error?.message || "Прокат не смог выполнить запрос.";
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((button) => {
      button.classList.toggle("active", button === tab);
      button.setAttribute("aria-selected", String(button === tab));
    });
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === tab.id.replace("Tab", "Panel"));
    });
    const activePanel = document.querySelector(".tab-panel.active");
    if (motionAnimate && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      motionAnimate(activePanel, { opacity: [0, 1], transform: ["translateX(12px)", "translateX(0)"] }, {
        duration: .24,
        ease: "ease-out"
      });
    }
    if (tab.id === "genreTab") {
      genreDraft = [...state.genreFilter];
      renderGenreAuction();
    }
  });
});

shelfModeButton.addEventListener("click", () => setAppMode("shelf"));
rentalModeButton.addEventListener("click", () => setAppMode("rental"));

const customButtonSoundSelector = "#spinButton, #soundButton, #autoThemeButton, #dayThemeButton, #nightThemeButton, #shelfModeButton, #rentalModeButton, #genreAllButton, #genreApplyButton, #rentalBuildPoolButton, #rentalClearButton, #rentalBackToFormButton, .rental-person-suggestion, .genre-chip, .stake-button";

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest("button");
  if (!button || button.disabled || button.matches(customButtonSoundSelector)) return;
  playButtonClack();
});

importFromHash();
render();
if (state.mode === "rental") bootRentalCatalog();

