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
  for (const file of ["server.js", "start-kinoauk.cmd", "stop-kinoauk.cmd", "assets/mascot.png"]) {
    assert.equal(fs.existsSync(file), true, `${file} should exist`);
  }
});
