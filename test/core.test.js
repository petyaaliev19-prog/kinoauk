const assert = require("node:assert/strict");
const test = require("node:test");

const {
  isHorrorMovie,
  mergeMovieList,
  mod,
  movieAtPointerFromRotation,
  movieMetaLabel,
  normalizeMovie,
  winnerEffectType
} = require("../core");

test("normalizeMovie accepts strings and applies fallback poster", () => {
  assert.deepEqual(normalizeMovie("Дюна", { fallbackPoster: "fallback.svg" }), {
    title: "Дюна",
    url: "",
    poster: "fallback.svg",
    year: "",
    genre: ""
  });
});

test("normalizeMovie keeps Kinopoisk metadata", () => {
  assert.deepEqual(normalizeMovie({
    title: "Пила",
    url: "https://www.kinopoisk.ru/film/64187/",
    poster: "poster.jpg",
    year: 2004,
    genre: "Ужасы"
  }), {
    title: "Пила",
    url: "https://www.kinopoisk.ru/film/64187/",
    poster: "poster.jpg",
    year: "2004",
    genre: "ужасы"
  });
});

test("mergeMovieList deduplicates by URL and fills new metadata", () => {
  const merged = mergeMovieList(
    [{ title: "Пила", url: "https://kp/film/1/", poster: "old.jpg" }],
    [{ title: "Пила", url: "https://kp/film/1/", year: "2004", genre: "ужасы" }],
    { fallbackPoster: "fallback.svg" }
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].poster, "old.jpg");
  assert.equal(merged[0].year, "2004");
  assert.equal(merged[0].genre, "ужасы");
});

test("movieAtPointerFromRotation matches wheel pointer math", () => {
  const movies = [{ title: "A" }, { title: "B" }, { title: "C" }, { title: "D" }];

  assert.equal(movieAtPointerFromRotation(movies, 0).title, "A");
  assert.equal(movieAtPointerFromRotation(movies, -Math.PI / 2).title, "B");
  assert.equal(movieAtPointerFromRotation(movies, -Math.PI).title, "C");
});

test("movie metadata label and horror detection are stable", () => {
  assert.equal(movieMetaLabel({ year: "1978", genre: "ужасы" }), "1978 · ужасы");
  assert.equal(isHorrorMovie({ title: "Нечто", genre: "ужасы" }), true);
  assert.equal(isHorrorMovie({ title: "Амели", genre: "мелодрама" }), false);
});

test("winnerEffectType maps key genres to premiere effects", () => {
  assert.equal(winnerEffectType({ title: "Пила", genre: "ужасы" }), "horror");
  assert.equal(winnerEffectType({ title: "Манчестер у моря", genre: "драма" }), "drama");
  assert.equal(winnerEffectType({ title: "Безумный Макс", genre: "боевик" }), "action");
  assert.equal(winnerEffectType({ title: "Голый пистолет", genre: "комедия" }), "comedy");
  assert.equal(winnerEffectType({ title: "Кояанискаци", genre: "документальный" }), "default");
});

test("mod handles negative rotations", () => {
  assert.equal(mod(-1, 4), 3);
  assert.equal(mod(5, 4), 1);
});
