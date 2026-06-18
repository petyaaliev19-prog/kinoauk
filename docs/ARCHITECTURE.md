# Architecture

## Runtime Overview

Киноаук состоит из двух частей:

1. Локальный Node.js сервер.
2. Статический браузерный интерфейс.

Сервер нужен для двух вещей:

- отдавать файлы приложения на `http://127.0.0.1:5173`;
- делать запросы к Кинопоиску с серверной стороны, потому что браузерный `fetch` к Кинопоиску будет упираться в CORS.

## Request Flow

```text
Browser
  |
  | GET /
  v
server.js -> index.html/styles.css/core.js/app.js/assets

Browser
  |
  | GET /api/refresh
  v
server.js -> Kinopoisk planned-to-watch pages -> parsed JSON -> Browser localStorage
```

## Modules

### `core.js`

Pure logic, no DOM, no localStorage, no network.

Exports:

- `normalizeMovie`
- `mergeMovieList`
- `movieAtPointerFromRotation`
- `movieMetaLabel`
- `isHorrorMovie`
- `mod`

This file is loaded in browser through `window.KinoaukCore` and tested in Node through `require("../core")`.

### `server.js`

Responsibilities:

- static file serving;
- `/api/refresh`;
- `/api/shutdown`;
- Kinopoisk request/cookie handling;
- HTML parsing.

Exported for tests:

- `fetchKinopoiskHtml`
- `fetchKinopoiskMovies`
- `parseKinopoiskHtml`
- `server`

### `app.js`

Browser orchestration:

- localStorage state;
- canvas wheel drawing;
- spin animation;
- winner rendering;
- mascot speech;
- WebAudio VHS sounds;
- visual effect triggering;
- UI event listeners.

Keep `app.js` browser-only. If a function can be tested without DOM, prefer moving it to `core.js`.

## State

Stored in localStorage:

- `kinoauk.movies.v1`: current movie list.
- `kinoauk.history.v1`: winner history, currently only kept internally.
- `kinoauk.sound.v1`: sound enabled flag.

## Import Parser

The parser does not use a full HTML parser dependency. It scans known Kinopoisk card anchors:

```js
/<a\b([^>]*href=["']([^"']*\/(?:film|series)\/\d+\/?[^"']*)["'][^>]*)>([\s\S]*?)<\/a>/gi
```

It extracts:

- poster from `img src`;
- title from caption/alt/title;
- year and genre from strings like `2004, ужасы`.

This is intentionally dependency-free, but it means tests should cover likely Kinopoisk HTML fragments.

## Winner Selection

Winner selection is random and precomputed:

```js
const winnerIndex = Math.floor(Math.random() * state.movies.length);
```

Wheel animation is then calculated to land on that winner. The winner under the pointer is resolved by `movieAtPointerFromRotation`.

## Test Strategy

Current tests cover:

- movie normalization/merge;
- pointer math;
- horror detection;
- Kinopoisk parser;
- required runtime files and script ordering.

Good next tests:

- import pagination with mocked `fetchKinopoiskHtml`;
- localStorage migration if state shape changes;
- smoke test for `/api/refresh` with a fake fetch implementation.
