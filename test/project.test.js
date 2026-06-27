const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("index.html loads core before app", () => {
  const html = fs.readFileSync("index.html", "utf8");
  assert.match(html, /<script src="core\.js"><\/script>\s*(?:<script[^>]+><\/script>\s*)*<script src="app\.js"><\/script>/);
});

test("app.js consumes the shared core module", () => {
  const app = fs.readFileSync("app.js", "utf8");
  assert.match(app, /window\.KinoaukCore/);
  assert.match(app, /mergeMovieList/);
  assert.match(app, /movieAtPointerFromSegments/);
});

test("runtime files needed by shortcuts exist", () => {
  for (const file of ["server.js", "start-kinoauk.cmd", "stop-kinoauk.cmd", "assets/mascot.png", "assets/sounds/README.md"]) {
    assert.equal(fs.existsSync(file), true, `${file} should exist`);
  }
});

test("winner premiere modal markup is present", () => {
  const html = fs.readFileSync("index.html", "utf8");
  for (const id of ["winnerModal", "winnerModalEffects", "watchWinnerButton", "modalRemoveWinnerButton", "closeWinnerModalButton"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test("genre auction markup and runtime hooks are present", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const app = fs.readFileSync("app.js", "utf8");
  const css = fs.readFileSync("styles.css", "utf8");

  for (const id of ["genreTab", "genrePanel", "genreAuctionToggle", "genreAuctionPanel", "genreChipList", "genreAllButton", "genreApplyButton"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(app, /filterMoviesByGenres/);
  assert.match(app, /animateGenreRemontage/);
  assert.match(app, /showGenreStageEffect/);
  assert.match(app, /function showDramaRain/);
  assert.match(app, /state\.genreFilter\.some\(\(genre\) => genreEffectType\(genre\) === "drama"\)/);
  assert.match(app, /drama-rain-frame-v2\.png/);
  assert.match(app, /function prepareRainFrame/);
  assert.match(app, /if \(brightness <= 12\)/);
  assert.match(app, /context\.drawImage/);
  assert.match(app, /sayMascotGenre/);
  assert.match(app, /setMascotSpeech/);
  assert.match(css, /\.genre-chip-effect-action/);
  assert.match(css, /\.genre-chip-effect-horror/);
  assert.match(css, /\.genre-chip-list\s*\{[\s\S]*?max-height: none;[\s\S]*?overflow: visible;/);
  assert.match(css, /\.genre-stage-horror/);
  assert.match(css, /\.genre-rain-canvas/);
  assert.match(css, /width: 100vw/);
  assert.match(css, /height: 100vh/);
  assert.match(css, /@keyframes genre-rain-fade/);
  assert.doesNotMatch(css, /\.genre-stage-drama/);
  assert.equal(fs.existsSync("assets/effects/drama-edge-drop.png"), true);
  assert.match(css, /@keyframes mascot-speech-pop/);
  assert.doesNotMatch(css, /\.genre-stage-thriller/);
  assert.equal(fs.existsSync("assets/genre-horror-shadow.png"), true);
});

test("app uses genre premiere effects and real scream fallback path", () => {
  const app = fs.readFileSync("app.js", "utf8");
  assert.match(app, /winnerEffectType/);
  assert.match(app, /showWinnerPremiere/);
  assert.match(app, /female-scream-pixabay-41894\.mp3/);
  assert.match(app, /playSyntheticScream/);
});

test("movie list exposes exact stake controls and the spin uses weighted odds", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const app = fs.readFileSync("app.js", "utf8");
  const css = fs.readFileSync("styles.css", "utf8");

  assert.match(html, /stake-max/);
  assert.match(html, /stake-olya/);
  assert.match(app, /calculateMovieOdds/);
  assert.match(app, /pickMovieByOdds/);
  assert.match(app, /wheelSegments/);
  assert.match(app, /groupMoviesByAuctionEligibility/);
  assert.match(app, /animateStakeRemontage/);
  assert.match(app, /playSoftRemontage/);
  assert.match(app, /state\.stakes = \{ max: "", olya: "" \}/);
  assert.match(css, /\.movie-chance/);
  assert.match(css, /\.stake-button/);
  assert.match(css, /\.auction-divider/);
});

test("home video library visuals load Motion and local fonts", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const app = fs.readFileSync("app.js", "utf8");

  assert.match(html, /node_modules\/motion\/dist\/motion\.js/);
  assert.match(html, /@fontsource\/rubik-mono-one/);
  assert.match(html, /@fontsource\/ibm-plex-mono/);
  assert.match(app, /window\.Motion\?\.animate/);
  assert.match(app, /function playLibraryEntrance/);
});

test("TV and VHS atmosphere modes include their controls and local backgrounds", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const app = fs.readFileSync("app.js", "utf8");
  const css = fs.readFileSync("styles.css", "utf8");

  for (const id of ["autoThemeButton", "dayThemeButton", "nightThemeButton"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(app, /THEME_KEY/);
  assert.match(app, /function activeTheme/);
  assert.match(app, /hour >= 8 && hour < 19/);
  assert.match(app, /function setTheme\(themeMode\)/);
  assert.match(css, /\.poster-backdrop \{[\s\S]*?filter: none;/);
  assert.match(css, /body::after \{[\s\S]*?background: none;/);
  assert.match(app, /state\.themeMode = themeMode/);
  assert.match(css, /assets\/backdrop\/vhs-night-lounge\.png/);
  assert.match(css, /assets\/backdrop\/tv-day-lounge\.png/);
  assert.match(css, /window owns the left side of the room/);
  assert.match(css, /width: min\(1100px, calc\(100vw - 36px\)\)/);
  assert.match(html, /id="mascotSpeech"/);
  assert.doesNotMatch(html, /class="mascot-stand"/);
  assert.doesNotMatch(html, /class="family-mascot"/);
  assert.match(css, /\.mascot-stage \{ display: none; \}/);
  assert.match(css, /\.mascot-speech\s*\{\s*visibility: hidden;/);
  assert.match(css, /\.mascot-stage\s*\{[\s\S]*?z-index: 1;/);
  assert.match(css, /A small video-room corner/);
  assert.match(css, /body\[data-theme="day"\]/);
  assert.equal(fs.existsSync("assets/backdrop/vhs-night-lounge.png"), true);
  assert.equal(fs.existsSync("assets/backdrop/tv-day-lounge.png"), true);
});

test("VHS status indicator stays at the upper-left edge of the background scene", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const css = fs.readFileSync("styles.css", "utf8");

  assert.match(html, /<div class="wheel-osd" id="vhsOsd"[\s\S]*?<main class="app">/);
  assert.match(css, /\.wheel-osd\s*\{[\s\S]*?top: 8px;[\s\S]*?left: 8px;[\s\S]*?font-size: 14px;/);
});

test("rental is a separate prototype mode, not another personal-catalog tab", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const app = fs.readFileSync("app.js", "utf8");
  const css = fs.readFileSync("styles.css", "utf8");

  for (const id of ["shelfModeButton", "rentalModeButton", "rentalStage", "rentalListPanel"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, />Прокат</);
  assert.match(app, /MODE_KEY/);
  assert.match(app, /function setAppMode\(mode\)/);
  assert.match(app, /rentalListPanel\.hidden = state\.mode !== "rental"/);
  assert.match(css, /body\[data-mode="rental"\] \.wheel-wrap/);
  assert.match(css, /body\[data-mode="rental"\] \.side-panel \.tab-panel \{ display: none; \}/);
  assert.match(css, /\.rental-stage\[hidden\]\s*\{\s*display: none;/);
});

test("rental evening form is wired to TMDb search without hard-coded person placeholders", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const app = fs.readFileSync("app.js", "utf8");
  const css = fs.readFileSync("styles.css", "utf8");

  for (const id of ["rentalForm", "rentalGenreSelect", "rentalPersonInput", "rentalIncludeTv", "rentalBuildPoolButton", "rentalClearButton", "rentalTapeList"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /Собрать вечер/);
  assert.match(html, /Актёр \/ актриса/);
  assert.match(html, /Учитывать сериалы/);
  assert.match(html, /Собрать кассеты/);
  assert.match(html, /Кассеты ещё не собраны/);
  assert.match(html, /Колесо или VHS-автомат/);
  assert.match(html, /«Наша видеотека» появится отдельной будущей задачей/);
  assert.doesNotMatch(html, /Brad Pitt|Michael Pitt|Питт|Fight Club|Snatch|Mr\. &amp; Mrs\. Smith/);
  assert.doesNotMatch(html, /режим «наша видеотека»/i);
  assert.match(app, /ensureRentalGenres/);
  assert.match(app, /searchRentalPeople/);
  assert.match(app, /buildRentalSession/);
  assert.match(app, /\/api\/rental\/genres\?mediaType=movie/);
  assert.match(app, /\/api\/rental\/people\?q=/);
  assert.match(app, /\/api\/rental\/sessions/);
  assert.match(css, /\.rental-form/);
  assert.match(css, /\.rental-person-suggestions/);
  assert.match(css, /\.rental-empty-hint/);
  assert.match(css, /\.rental-checkbox/);
  assert.match(css, /\.rental-machine-note/);
});

test("settled spin keeps its weighted sector layout after stakes are cleared", () => {
  const app = fs.readFileSync("app.js", "utf8");

  assert.match(app, /settledWheel: null/);
  assert.match(app, /state\.settledWheel = \{ movies, odds \}/);
  assert.match(app, /settledWheel\?\.odds \|\| calculateMovieOdds/);
  assert.match(app, /state\.stakes = \{ max: "", olya: "" \};\s*save\(\);\s*render\(\);/);
});

test("spin uses whole turns before aiming the chosen sector at the pointer", () => {
  const app = fs.readFileSync("app.js", "utf8");

  assert.match(app, /const turns = 6 \+ Math\.floor\(Math\.random\(\) \* 4\)/);
  assert.doesNotMatch(app, /const turns = 6 \+ Math\.random\(\) \* 4/);
});

test("wheel uses a low-key VHS transport sound instead of rapid bright ticks", () => {
  const app = fs.readFileSync("app.js", "utf8");

  assert.match(app, /function playWheelMotor/);
  assert.match(app, /function playSoftCassetteEngage/);
  assert.match(app, /progress < \.76/);
  assert.match(app, /minimumGap = 170/);
});

test("spin-only NO REVOTE label stays below the header controls", () => {
  const css = fs.readFileSync("styles.css", "utf8");

  assert.match(css, /body\.dictatorship-active \.wheel-panel::after\s*\{[\s\S]*?content: "NO REVOTE";[\s\S]*?inset: auto;[\s\S]*?top: 302px;[\s\S]*?border: 0;/);
});

test("all ordinary interface buttons receive one soft delegated sound", () => {
  const app = fs.readFileSync("app.js", "utf8");

  assert.match(app, /document\.addEventListener\("click"/);
  assert.match(app, /target\?\.closest\("button"\)/);
  assert.match(app, /customButtonSoundSelector/);
  assert.match(app, /playNoise\(\.022, startAt \+ \.006, \.009, 840, "lowpass"\)/);
  assert.doesNotMatch(app, /playNoise\(\.012, startAt, \.11, 2800, "highpass"\)/);
});

test("every winner gets a gentle shared VHS cue before genre-specific sound", () => {
  const app = fs.readFileSync("app.js", "utf8");
  const winSound = app.match(/function playWinSound\(\) \{([\s\S]*?)\n\}/)?.[1] || "";

  assert.match(app, /function playGenreWinSound[\s\S]*?playWinSound\(\)/);
  assert.match(winSound, /174\.61/);
  assert.doesNotMatch(winSound, /playVhsGlitch|playTapeClick|playTapeHiss/);
});

test("horror premiere uses cassette horror naming and raster blood overlay", () => {
  const app = fs.readFileSync("app.js", "utf8");
  const css = fs.readFileSync("styles.css", "utf8");
  const docs = fs.readFileSync("docs/AI_CONTEXT.md", "utf8");

  assert.match(app, /КАССЕТА УЖАСА/);
  assert.doesNotMatch(app, /НОЧНОЙ СЕАНС/);
  assert.match(css, /assets\/blood-overlay\.png/);
  assert.match(css, /\.blood-overlay/);
  assert.equal(fs.existsSync("assets/blood-overlay.png"), true);
  assert.doesNotMatch(css, /\.blood-drop/);
  assert.match(docs, /КАССЕТА УЖАСА/);
});

test("action premiere uses falling glass and optional real gunshots", () => {
  const app = fs.readFileSync("app.js", "utf8");
  const css = fs.readFileSync("styles.css", "utf8");
  const soundDocs = fs.readFileSync("assets/sounds/README.md", "utf8");

  assert.match(app, /action-gunshots\.mp3/);
  assert.doesNotMatch(app, /playSyntheticActionGunshots/);
  assert.match(css, /assets\/action-glass-fall\.png/);
  assert.match(css, /\.action-glass-fall/);
  assert.match(app, /\["first", "second"\]/);
  assert.match(app, /action-glass-fall-\$\{shot\}/);
  assert.match(css, /\.action-glass-fall-first/);
  assert.match(css, /\.action-glass-fall-second/);
  assert.match(css, /animation-delay: \.28s/);
  assert.doesNotMatch(css, /\.bullet-tracer/);
  assert.doesNotMatch(css, /\.muzzle-flash/);
  assert.equal(fs.existsSync("assets/action-glass-fall.png"), true);
  assert.equal(fs.existsSync("assets/sounds/action-gunshots.mp3"), true);
  assert.match(soundDocs, /Action gunshots/);
});

test("sound asset documentation records source and license", () => {
  const docs = fs.readFileSync("assets/sounds/README.md", "utf8");
  assert.match(docs, /Loud Female Scream/);
  assert.match(docs, /Pixabay Content License/);
});
