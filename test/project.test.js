const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("index.html loads core before app", () => {
  const html = fs.readFileSync("index.html", "utf8");
  assert.match(html, /<script src="core\.js"><\/script>\s*<script src="app\.js"><\/script>/);
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
  assert.match(app, /sayMascotGenre/);
  assert.match(app, /setMascotSpeech/);
  assert.match(css, /\.genre-chip-effect-action/);
  assert.match(css, /\.genre-chip-effect-horror/);
  assert.match(css, /\.genre-stage-horror/);
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
  assert.match(app, /state\.stakes = \{ max: "", olya: "" \}/);
  assert.match(css, /\.movie-chance/);
  assert.match(css, /\.stake-button/);
  assert.match(css, /\.auction-divider/);
});

test("wheel uses a low-key VHS transport sound instead of rapid bright ticks", () => {
  const app = fs.readFileSync("app.js", "utf8");

  assert.match(app, /function playWheelMotor/);
  assert.match(app, /function playSoftCassetteEngage/);
  assert.match(app, /progress < \.76/);
  assert.match(app, /minimumGap = 170/);
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
