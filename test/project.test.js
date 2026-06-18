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

test("app uses genre premiere effects and real scream fallback path", () => {
  const app = fs.readFileSync("app.js", "utf8");
  assert.match(app, /winnerEffectType/);
  assert.match(app, /showWinnerPremiere/);
  assert.match(app, /female-scream-pixabay-41894\.mp3/);
  assert.match(app, /playSyntheticScream/);
});

test("horror premiere uses cassette horror naming and splatter effects", () => {
  const app = fs.readFileSync("app.js", "utf8");
  const css = fs.readFileSync("styles.css", "utf8");
  const docs = fs.readFileSync("docs/AI_CONTEXT.md", "utf8");

  assert.match(app, /КАССЕТА УЖАСА/);
  assert.doesNotMatch(app, /НОЧНОЙ СЕАНС/);
  assert.match(css, /\.blood-drip/);
  assert.match(css, /\.blood-splash/);
  assert.doesNotMatch(css, /\.blood-drop/);
  assert.match(docs, /КАССЕТА УЖАСА/);
});

test("sound asset documentation records source and license", () => {
  const docs = fs.readFileSync("assets/sounds/README.md", "utf8");
  assert.match(docs, /Loud Female Scream/);
  assert.match(docs, /Pixabay Content License/);
});
