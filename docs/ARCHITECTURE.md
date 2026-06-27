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
- `/api/rental/people`;
- `/api/rental/genres`;
- `/api/rental/sessions`;
- `/api/rental/sessions/:id`;
- `/api/rental/sessions/:id/select`;
- `/api/shutdown`;
- Kinopoisk request/cookie handling;
- HTML parsing.

Exported for tests:

- `fetchKinopoiskHtml`
- `fetchKinopoiskMovies`
- `parseKinopoiskHtml`
- `createRentalSession`
- `getRentalGenres`
- `getRentalSession`
- `selectRentalSession`
- `selectRentalWinner`
- `selectionModeForPool`
- `searchRentalPeople`
- `server`

### `rental-db.js`

Local SQLite storage for the future «Прокат» mode. It uses the built-in `node:sqlite` module, creates `data/kinoauk.sqlite` by default, and applies schema migrations. It is server-side only.

### `tmdb-client.js`

Server-side TMDb helper. It reads `TMDB_API_TOKEN` from the process environment or local `.env`, performs TMDb JSON requests, normalizes person search results, and saves selected person suggestions to `people`. This module must not be loaded by browser code.
It also fetches TMDb genre lists for `movie` and `tv`, validates media types, normalizes genres, caches them in `genres` without mixing equal TMDb ids from different media types, and supports full pool collection through person credits plus discover pagination.

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

## Future TMDb Rental Architecture

«Прокат» — отдельный режим приложения для поиска по TMDb. Он не смешивается с текущей «Домашней полкой» и не использует текущий localStorage-список как источник выдачи.

### Product decisions

- Источник для первого «Проката»: только TMDb.
- «Наша видеотека» — отдельная будущая функция, не часть первого поиска по TMDb. Её нужно спроектировать отдельно как импорт двух списков Кинопоиска «Просмотрено»: просмотрено Максимом и просмотрено Олей.
- Фильмы и сериалы при включённом чекбоксе «Учитывать сериалы» смешиваются в одном пуле, но каждый элемент хранит `media_type`.
- Поиск по актёру означает только актёрское участие (`cast`). Поиск по режиссёру — отдельный фильтр (`crew/director`), не смешивать его с актёрским.
- Для MVP режиссёр, год, рейтинг, страна, длительность и история запросов закладываются в данные/API, но UI подключается постепенно.
- Человек для фильтра выбирается явно через поиск и подсказки. Не запускать тяжёлый поиск по фильмам, пока пользователь не выбрал конкретную персону TMDb.

### Local database draft

Рекомендуемая локальная БД: SQLite в `data/kinoauk.sqlite`. Файл БД не должен попадать в git.

```text
media
  id                      local integer pk
  tmdb_id                 integer not null
  media_type              "movie" | "tv"
  title                   display title
  original_title
  year                    first release/air year
  overview
  runtime_minutes         nullable, mainly movies
  vote_average
  vote_count
  popularity
  poster_path
  backdrop_path
  origin_country_json
  last_synced_at
  created_at
  updated_at
  unique(tmdb_id, media_type)

people
  id                      local integer pk
  tmdb_id                 integer unique not null
  name
  original_name
  profile_path
  known_for_department
  popularity
  last_synced_at

genres
  id                      local integer pk
  tmdb_id                 integer not null
  media_type              "movie" | "tv" | "shared"
  name
  unique(tmdb_id, media_type)

media_genres
  media_id
  genre_id
  unique(media_id, genre_id)

media_credits
  media_id
  person_id
  department              "Acting" | "Directing" | ...
  job                     "Actor" | "Director" | ...
  character               nullable
  credit_order            nullable
  unique(media_id, person_id, department, job, character)

rental_sessions
  id                      local integer pk
  query_label             human readable label
  filters_json            selected genre/person/director/year/rating/include_tv
  source                  "tmdb"
  total_count
  selection_mode          "wheel" | "vhs_machine" | null
  selected_media_id       nullable
  selected_at             nullable
  created_at

rental_session_items
  session_id
  media_id
  tmdb_rank               original TMDb order if available
  random_order            local shuffled order for UI if needed
  unique(session_id, media_id)

sync_log
  id
  scope                   "person_search" | "rental_pool" | "media_details" | ...
  status                  "ok" | "error"
  message
  created_at
```

Отдельная будущая ветка для «Нашей видеотеки»:

```text
watch_sources
  id
  owner                   "maxim" | "olya"
  source                  "kinopoisk_watched"
  url
  last_imported_at

watched_items
  source_id
  media_id
  watched_by              "maxim" | "olya"
  external_url
  imported_at
  unique(source_id, media_id)
```

Эту ветку не подключать к первому «Прокату», пока не будет отдельной задачи и согласования.

### Server API draft

TMDb-ключ хранится только на сервере: `.env` или переменная окружения `TMDB_API_TOKEN`. Ключ не отдаётся в браузер и не коммитится.

```http
GET /api/rental/genres?mediaType=movie|tv
```

Возвращает жанры TMDb для формы. Для чекбокса сериалов UI может запросить оба набора.
Если `mediaType` не `movie` и не `tv`, endpoint возвращает `400 INVALID_MEDIA_TYPE`. Если `TMDB_API_TOKEN` не настроен, возвращает `503 TMDB_TOKEN_MISSING`.

```http
GET /api/rental/people?q=brad%20pitt
```

Возвращает короткий список людей для явного выбора.
Если `TMDB_API_TOKEN` не настроен на локальном сервере, endpoint возвращает `503` с `TMDB_TOKEN_MISSING`. До выбора конкретного человека поиск фильмов не запускается.

```json
{
  "results": [
    {
      "tmdbId": 287,
      "name": "Brad Pitt",
      "knownForDepartment": "Acting",
      "profilePath": "/...",
      "knownFor": ["Fight Club", "Se7en", "Once Upon a Time... in Hollywood"]
    }
  ]
}
```

```http
POST /api/rental/sessions
```

Создаёт полный пул по выбранным фильтрам. До выбора конкретного `actorTmdbId` или `directorTmdbId` сервер не должен собирать пул по свободному тексту имени. Если выбран человек, сервер берёт его полные `movie_credits` / `tv_credits` и фильтрует локально. Если человека нет, сервер проходит discover-страницы полностью и не обрезает выдачу скрыто.

```json
{
  "genreTmdbIds": [28],
  "actorTmdbId": 287,
  "directorTmdbId": null,
  "includeTv": false,
  "yearFrom": null,
  "yearTo": null,
  "voteAverageFrom": null,
  "countries": []
}
```

Ответ:

```json
{
  "sessionId": 12,
  "totalCount": 184,
  "selectionMode": "vhs_machine",
  "items": [
    {
      "id": 501,
      "tmdbId": 550,
      "mediaType": "movie",
      "title": "Fight Club",
      "year": 1999,
      "posterPath": "/..."
    }
  ]
}
```

```http
GET /api/rental/sessions/:id
POST /api/rental/sessions/:id/select
```

`GET /api/rental/sessions/:id` уже доступен и возвращает сохранённый сеанс вместе с полным пулом `items`.
`POST /api/rental/sessions/:id/select` выбирает один элемент равновероятно из сохранённых `session_items`, сохраняет `selected_media_id`, `selected_at`, `selection_mode` и возвращает `selectedItem`, `selectedIndex`, `totalCount`. До 24 кассет сервер помечает режим как `wheel`, больше 24 — как `vhs_machine`.

### TMDb query rules

- Фильтры работают как `И`.
- Если `includeTv=false`, собирать только `movie`.
- Если `includeTv=true`, собрать `movie` и `tv`, затем объединить и дедуплицировать по `(tmdb_id, media_type)`.
- Актёрский фильтр использует выбранного человека как `cast`.
- Режиссёрский фильтр использует выбранного человека как `director`.
- Пагинацию TMDb проходить полностью в рамках разумных лимитов API; скрыто брать только первую страницу запрещено.
- Сохранять `total_count`, чтобы UI честно показывал размер пула.

### Migration note

Текущий localStorage остаётся источником для «Домашней полки». Миграция в SQLite не должна удалять `kinoauk.movies.v1` и не должна менять поведение существующего колеса. Связь между старым локальным фильмом и будущей записью `media` можно делать отдельной задачей после TMDb-импорта.

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
