const assert = require("node:assert/strict");
const test = require("node:test");

const { fetchKinopoiskMovies, parseKinopoiskHtml } = require("../server");

test("parseKinopoiskHtml extracts title, URL, poster, year, and genre", () => {
  const html = `
    <a href="/film/64187/" class="styles_posterLink__oK4I9">
      <img src="//avatars.mds.yandex.net/get-kinopoisk-image/poster/268x402" alt="Пила. 2004, ужасы">
    </a>
    <a href="/film/64187/" class="styles_captions__FtfU6">
      <span><span>Пила</span></span>
      <span>2004, ужасы</span>
    </a>
  `;

  assert.deepEqual(parseKinopoiskHtml(html), [{
    title: "Пила",
    url: "https://www.kinopoisk.ru/film/64187/",
    poster: "https://avatars.mds.yandex.net/get-kinopoisk-image/poster/268x402",
    year: "2004",
    genre: "ужасы"
  }]);
});

test("parseKinopoiskHtml supports series links and deduplicates repeated anchors", () => {
  const html = `
    <a href="/series/665654/"><img src="//img/one.jpg" alt="Лиллехаммер. 2012, драма"></a>
    <a href="/series/665654/"><span>Лиллехаммер</span><span>2012, драма</span></a>
  `;
  const movies = parseKinopoiskHtml(html);

  assert.equal(movies.length, 1);
  assert.equal(movies[0].url, "https://www.kinopoisk.ru/series/665654/");
  assert.equal(movies[0].genre, "драма");
});

test("parseKinopoiskHtml ignores anchors without usable titles", () => {
  assert.deepEqual(parseKinopoiskHtml('<a href="/film/1/"></a>'), []);
});

test("fetchKinopoiskMovies loads sources in parallel and merges movie owners", async () => {
  const html = (id, title) => `<a href="/film/${id}/"><span>${title}</span><span>2000, drama</span></a>`;
  const sources = [
    { owner: "maxim", url: "https://kp/max/" },
    { owner: "olya", url: "https://kp/olya/" }
  ];
  const calls = [];
  const movies = await fetchKinopoiskMovies({
    sources,
    fetchHtml: async (href) => {
      const url = new URL(href);
      const page = url.searchParams.get("page");
      calls.push(`${url.pathname}:${page}`);
      if (url.pathname === "/max/" && page === "1") return html(1, "Max Movie") + html(2, "Shared Movie");
      if (url.pathname === "/olya/" && page === "1") return html(2, "Shared Movie");
      if (url.pathname === "/olya/" && page === "2") return html(3, "Olya Movie");
      return "";
    }
  });

  assert.deepEqual(calls.slice(0, 2).sort(), ["/max/:1", "/olya/:1"]);
  assert.deepEqual(
    movies.map((movie) => [movie.title, movie.owners]),
    [
      ["Max Movie", ["maxim"]],
      ["Shared Movie", ["maxim", "olya"]],
      ["Olya Movie", ["olya"]]
    ]
  );
});
