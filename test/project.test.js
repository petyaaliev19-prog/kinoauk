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
  assert.match(app, /movieAtPointerFromRotation/);
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

  for (const id of ["genreAuctionToggle", "genreAuctionPanel", "genreChipList", "genreAllButton", "genreApplyButton"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(app, /filterMoviesByGenres/);
  assert.match(app, /animateGenreRemontage/);
  assert.match(css, /\.genre-chip-effect-action/);
  assert.match(css, /\.genre-chip-effect-horror/);
});

test("app uses genre premiere effects and real scream fallback path", () => {
  const app = fs.readFileSync("app.js", "utf8");
  assert.match(app, /winnerEffectType/);
  assert.match(app, /showWinnerPremiere/);
  assert.match(app, /female-scream-pixabay-41894\.mp3/);
  assert.match(app, /playSyntheticScream/);
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
