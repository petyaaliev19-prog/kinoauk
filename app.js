const STORAGE_KEY = "kinoauk.movies.v1";
const HISTORY_KEY = "kinoauk.history.v1";
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

const state = {
  movies: loadJson(STORAGE_KEY, []),
  history: loadJson(HISTORY_KEY, []),
  rotation: 0,
  spinning: false,
  winner: null,
  query: ""
};

const canvas = document.querySelector("#wheelCanvas");
const ctx = canvas.getContext("2d");
const wheelWrap = document.querySelector(".wheel-wrap");
const movieList = document.querySelector("#movieList");
const template = document.querySelector("#movieItemTemplate");
const spinButton = document.querySelector("#spinButton");
const removeWinnerButton = document.querySelector("#removeWinnerButton");
const resetWinnerButton = document.querySelector("#resetWinnerButton");
const movieCount = document.querySelector("#movieCount");
const winnerBox = document.querySelector("#winnerBox");
const winnerLink = document.querySelector("#winnerLink");
const winnerPoster = document.querySelector("#winnerPoster");
const addForm = document.querySelector("#addForm");
const searchInput = document.querySelector("#searchInput");
const clearButton = document.querySelector("#clearButton");
const refreshKinopoiskButton = document.querySelector("#refreshKinopoiskButton");
const refreshKinopoiskStatus = document.querySelector("#refreshKinopoiskStatus");
const soundButton = document.querySelector("#soundButton");
const shutdownButton = document.querySelector("#shutdownButton");
const confettiLayer = document.querySelector("#confettiLayer");
const mascotSpeech = document.querySelector("#mascotSpeech");
const posterBackdrop = document.querySelector("#posterBackdrop");

let audioContext = null;
let soundEnabled = loadJson("kinoauk.sound.v1", true);
let lastTickIndex = -1;

const mascotLines = {
  idle: [
    "Киномагия для Оли и Максима уже шуршит плёнкой.",
    "Я видел трейлер судьбы. Там вы с попкорном.",
    "Оля выбирает сердцем, Максим крутит колесо. Почти честно.",
    "Если выпадет драма, делаем вид, что так и планировали."
  ],
  spin: [
    "Тсс, сейчас монтаж судьбы...",
    "Крупный план на интригу!",
    "Оля, Максим, ставки сделаны. Попкорн держать крепко.",
    "Колесо крутится, критики нервничают."
  ],
  win: [
    "Премьера назначена! Оля и Максим, занимайте лучшие места.",
    "Фильм выбран. Спорить с зелёным продюсером бессмысленно.",
    "Оракул монтажа сказал: сегодня смотрим это.",
    "Вот он, главный герой вечера. Попкорн в кадр!"
  ],
  reset: [
    "Победителя спрятали в архив. Я ничего не видел.",
    "Сцена удалена. Можно переснять.",
    "Оракул сделал вид, что этого дубля не было."
  ]
};

const backdropPosters = [
  "assets/backdrop/1-fight-club.jpg",
  "assets/backdrop/2-pulp-fiction.jpg",
  "assets/backdrop/3-the-matrix.png",
  "assets/backdrop/4-blade-runner.png",
  "assets/backdrop/5-the-big-lebowski.jpg",
  "assets/backdrop/6-trainspotting-film.jpg",
  "assets/backdrop/7-drive-2011-film.jpg",
  "assets/backdrop/8-kill-bill-volume-1.png",
  "assets/backdrop/9-the-grand-budapest-hotel.png",
  "assets/backdrop/10-amelie.jpg"
];

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
}

function normalizeMovie(input) {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return null;
    return { title: trimmed, url: "" };
  }

  const title = String(input.title || input.name || input.ruTitle || input.originalTitle || "").trim();
  const url = String(input.url || input.link || input.href || "").trim();
  const poster = String(input.poster || input.image || input.cover || FALLBACK_POSTER).trim();
  if (!title) return null;
  return { title, url, poster };
}

function mergeMovies(nextMovies) {
  if (state.spinning) return;

  const byKey = new Map(state.movies.map((movie) => [movie.url || movie.title.toLowerCase(), movie]));

  for (const movie of nextMovies) {
    const normalized = normalizeMovie(movie);
    if (!normalized) continue;
    const key = normalized.url || normalized.title.toLowerCase();
    byKey.set(key, normalized);
  }

  state.movies = [...byKey.values()].sort((a, b) => a.title.localeCompare(b.title, "ru"));
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

function render() {
  movieCount.textContent = state.movies.length;
  wheelWrap.classList.toggle("is-empty", state.movies.length === 0);
  renderList();
  renderPosterBackdrop();
  drawWheel();
  updateWinner();
  spinButton.disabled = state.movies.length < 2 || state.spinning;
  removeWinnerButton.disabled = !state.winner || state.spinning;
  soundButton.classList.toggle("sound-on", soundEnabled);
}

function renderPosterBackdrop() {
  if (posterBackdrop.children.length) return;
  posterBackdrop.textContent = "";
  [...backdropPosters, ...backdropPosters, ...backdropPosters].forEach((poster, index) => {
    const tile = document.createElement("div");
    tile.className = "poster-tile";
    tile.style.setProperty("--tilt", `${(index % 7 - 3) * 1.1}deg`);
    tile.style.backgroundImage = `url("${poster}")`;
    posterBackdrop.append(tile);
  });
}

function sayMascot(kind, movieTitle = "") {
  const lines = mascotLines[kind] || mascotLines.idle;
  const line = lines[Math.floor(Math.random() * lines.length)];
  mascotSpeech.textContent = movieTitle ? `${line} ${movieTitle}.` : line;
}

function renderList() {
  movieList.textContent = "";
  const movies = filteredMovies();

  if (!movies.length) {
    const empty = document.createElement("li");
    empty.className = "movie-item empty-state";
    empty.textContent = state.movies.length
      ? "\u041d\u0438\u0447\u0435\u0433\u043e \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e"
      : "\u0414\u043e\u0431\u0430\u0432\u044c \u0444\u0438\u043b\u044c\u043c\u044b \u0438\u043b\u0438 \u0438\u043c\u043f\u043e\u0440\u0442\u0438\u0440\u0443\u0439 \u0441\u043f\u0438\u0441\u043e\u043a";
    movieList.append(empty);
    return;
  }

  for (const movie of movies) {
    const item = template.content.firstElementChild.cloneNode(true);
    const link = item.querySelector(".movie-title");
    const poster = item.querySelector(".movie-poster");
    const posterSlot = item.querySelector(".movie-poster-slot");
    const remove = item.querySelector(".remove-button");

    link.textContent = movie.title;
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
    if (!movie.url) {
      link.removeAttribute("target");
      link.addEventListener("click", (event) => event.preventDefault());
    }

    remove.addEventListener("click", () => {
      if (state.spinning) return;
      state.movies = state.movies.filter((candidate) => candidate !== movie);
      if (state.winner === movie) state.winner = null;
      save();
      render();
    });

    movieList.append(item);
  }
}

function updateWinner() {
  if (!state.winner) {
    winnerBox.hidden = false;
    winnerBox.classList.remove("has-winner-poster");
    winnerBox.querySelector("p").textContent = "Киноаук Максима и Оли";
    winnerPoster.hidden = true;
    winnerPoster.src = "";
    winnerPoster.alt = "";
    winnerLink.textContent = "ЧТО ЖЕ СЕГОДНЯ СМОТРЯТ МАКСИМ И ОЛЯ???";
    winnerLink.href = "#";
    winnerLink.removeAttribute("target");
    return;
  }

  winnerBox.hidden = false;
  winnerBox.classList.toggle("has-winner-poster", Boolean(state.winner.poster));
  winnerBox.querySelector("p").textContent = "Максим и Оля сегодня смотрят";
  winnerLink.textContent = state.winner.title;
  winnerLink.href = state.winner.url || "#";
  winnerLink.target = "_blank";
  winnerPoster.hidden = !state.winner.poster;
  winnerPoster.src = state.winner.poster || "";
  winnerPoster.alt = state.winner.title;
}

function drawWheel(rotation = state.rotation) {
  const width = canvas.width;
  const height = canvas.height;
  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.47;
  const movies = state.movies;

  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);

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

  const slice = (Math.PI * 2) / movies.length;
  movies.forEach((movie, index) => {
    const start = index * slice - Math.PI / 2;
    const end = start + slice;

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
    ctx.rotate(start + slice / 2);
    ctx.textAlign = "right";
    ctx.fillStyle = "#111315";
    ctx.font = movies.length > 18 ? "700 17px Segoe UI, Arial" : "800 23px Segoe UI, Arial";
    ctx.fillText(truncate(movie.title, movies.length > 18 ? 24 : 18), radius - 28, 8);
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

function spin() {
  if (state.spinning || state.movies.length < 2) return;

  state.spinning = true;
  state.winner = null;
  lastTickIndex = -1;
  sayMascot("spin");
  render();
  playStartSound();

  const winnerIndex = Math.floor(Math.random() * state.movies.length);
  const slice = (Math.PI * 2) / state.movies.length;
  const targetAtPointer = Math.PI * 1.5;
  const winnerCenter = winnerIndex * slice - Math.PI / 2 + slice / 2;
  const turns = 6 + Math.random() * 4;
  const start = state.rotation;
  const end = start + turns * Math.PI * 2 + targetAtPointer - winnerCenter - (start % (Math.PI * 2));
  const startedAt = performance.now();
  const duration = 4300;

  function frame(now) {
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - Math.pow(1 - progress, 4);
    state.rotation = start + (end - start) * eased;
    tickWheel(state.rotation, progress);
    drawWheel(state.rotation);

    if (progress < 1) {
      requestAnimationFrame(frame);
      return;
    }

    state.spinning = false;
    state.rotation = end % (Math.PI * 2);
    state.winner = movieAtPointer(state.rotation);
    sayMascot("win", state.winner.title);
    state.history.unshift({ ...state.winner, wonAt: new Date().toISOString() });
    state.history = state.history.slice(0, 20);
    save();
    playWinSound();
    burstConfetti();
    launchFireworks();
    render();
  }

  requestAnimationFrame(frame);
}

function movieAtPointer(rotation) {
  if (!state.movies.length) return null;

  const slice = (Math.PI * 2) / state.movies.length;
  const normalized = mod(-rotation, Math.PI * 2);
  const index = Math.floor(normalized / slice) % state.movies.length;
  return state.movies[index];
}

function mod(value, max) {
  return ((value % max) + max) % max;
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

function playStartSound() {
  [330, 392, 494, 587, 740, 880, 988, 1175].forEach((frequency, index) => {
    playTone(frequency, .075, index * .045, index % 2 ? "sawtooth" : "square", .028 + index * .003);
  });
  [82, 98].forEach((frequency, index) => {
    playTone(frequency, .18, index * .18, "sine", .055);
  });
}

function playWinSound() {
  playTone(62, .42, 0, "sine", .12);
  [523, 659, 784, 1046, 1318, 1568].forEach((frequency, index) => {
    playTone(frequency, .16, index * .055, index % 2 ? "triangle" : "sawtooth", .055);
  });
  [262, 330, 392, 523].forEach((frequency) => {
    playTone(frequency, .48, .28, "sine", .04);
  });
}

function playTickSound(progress) {
  const frequency = 760 + Math.floor(progress * 640);
  playTone(frequency, .025, 0, "square", .018);
  if (progress > .82) playTone(1800, .018, .012, "triangle", .012);
}

function tickWheel(rotation, progress) {
  if (!soundEnabled || !state.movies.length) return;
  const slice = (Math.PI * 2) / state.movies.length;
  const index = Math.floor(mod(-rotation, Math.PI * 2) / slice);
  if (index === lastTickIndex) return;
  lastTickIndex = index;
  playTickSound(progress);
}

function burstConfetti() {
  confettiLayer.textContent = "";
  const colors = ["#f4c542", "#31c6a7", "#f46f63", "#5aa9e6", "#e08dac", "#8bd17c"];

  for (let index = 0; index < 120; index += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[index % colors.length];
    piece.style.setProperty("--x", `${(Math.random() - .5) * 520}px`);
    piece.style.animationDelay = `${Math.random() * .28}s`;
    confettiLayer.append(piece);
  }

  setTimeout(() => {
    confettiLayer.textContent = "";
  }, 3600);
}

function launchFireworks() {
  const colors = ["#f4c542", "#31c6a7", "#f46f63", "#5aa9e6", "#e08dac", "#8bd17c"];
  const bursts = [
    { x: 20, y: 22 },
    { x: 38, y: 18 },
    { x: 62, y: 20 },
    { x: 80, y: 24 },
    { x: 50, y: 38 }
  ];

  for (const burst of bursts) {
    for (let index = 0; index < 42; index += 1) {
      const spark = document.createElement("span");
      const angle = (Math.PI * 2 * index) / 42;
      const distance = 110 + Math.random() * 170;
      spark.className = "firework";
      spark.style.left = `${burst.x}%`;
      spark.style.top = `${burst.y}%`;
      spark.style.background = colors[index % colors.length];
      spark.style.color = colors[index % colors.length];
      spark.style.setProperty("--x", `${Math.cos(angle) * distance}px`);
      spark.style.setProperty("--y", `${Math.sin(angle) * distance}px`);
      spark.style.animationDelay = `${Math.random() * .2}s`;
      confettiLayer.append(spark);
    }
  }
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

clearButton.addEventListener("click", () => {
  if (state.spinning) return;
  if (!confirm("Очистить весь список?")) return;
  state.movies = [];
  state.winner = null;
  save();
  render();
});

spinButton.addEventListener("click", spin);

removeWinnerButton.addEventListener("click", () => {
  if (!state.winner) return;
  state.movies = state.movies.filter((movie) => movie !== state.winner);
  state.winner = null;
  save();
  render();
});

resetWinnerButton.addEventListener("click", () => {
  state.winner = null;
  sayMascot("reset");
  render();
});

soundButton.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  localStorage.setItem("kinoauk.sound.v1", JSON.stringify(soundEnabled));
  if (soundEnabled) playTone(660, .12, 0, "sine", .05);
  render();
});

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

async function refreshFromServer() {
  const endpoint = location.protocol === "file:" ? "http://127.0.0.1:5173/api/refresh" : "/api/refresh";
  const response = await fetch(endpoint);
  const payload = await response.json();

  if (!response.ok) throw new Error(payload.error || "Не получилось обновить список.");
  return payload;
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
  });
});

importFromHash();
render();
