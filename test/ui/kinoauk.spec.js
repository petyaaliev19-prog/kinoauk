const { test, expect } = require("@playwright/test");

const storageKeys = [
  "kinoauk.movies.v1",
  "kinoauk.history.v1",
  "kinoauk.genre-filter.v1",
  "kinoauk.stakes.v1",
  "kinoauk.sound.v1"
];

async function openApp(page, movies = []) {
  await page.addInitScript(({ keys, seedMovies }) => {
    keys.forEach((key) => localStorage.removeItem(key));
    localStorage.setItem("kinoauk.movies.v1", JSON.stringify(seedMovies));
    localStorage.setItem("kinoauk.sound.v1", JSON.stringify(false));
  }, { keys: storageKeys, seedMovies: movies });
  await page.goto("/");
}

async function addMovie(page, title) {
  await page.getByPlaceholder("Название фильма").fill(title);
  await page.getByRole("button", { name: "Добавить фильм" }).click();
}

test("добавляет фильмы и фильтрует список по поиску", async ({ page }) => {
  await openApp(page);

  await addMovie(page, "Сталкер");
  await addMovie(page, "Амели");
  await addMovie(page, "Матрица");

  await expect(page.locator("#movieCount")).toHaveText("3");
  for (const title of ["Сталкер", "Амели", "Матрица"]) {
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }

  await page.getByPlaceholder("Найти в списке").fill("амели");
  await expect(page.locator(".movie-item")).toHaveCount(1);
  await expect(page.locator(".movie-title-main")).toHaveText(["Амели"]);
});

test("ставка меняет шанс только у фильма из текущего аукциона", async ({ page }) => {
  await openApp(page, [
    { title: "Сталкер", genre: "фантастика" },
    { title: "Амели", genre: "комедия" },
    { title: "Пила", genre: "ужасы" }
  ]);

  const stalker = page.locator(".movie-item", { hasText: "Сталкер" });
  await stalker.getByRole("button", { name: "Ставка Максима: 10%" }).click();

  await expect(stalker.getByText("Шанс 43%")).toBeVisible();
  await expect(stalker.getByRole("button", { name: "Ставка Максима: 10%" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".movie-item", { hasText: "Амели" }).getByText("Шанс 28%")).toBeVisible();
});

test("жанровый аукцион оставляет в колесе только выбранные кассеты", async ({ page }) => {
  await openApp(page, [
    { title: "Пила", genre: "ужасы" },
    { title: "Амели", genre: "комедия" },
    { title: "Нечто", genre: "ужасы, фантастика" }
  ]);

  await page.getByRole("tab", { name: "Жанры" }).click();
  await page.getByRole("button", { name: /^Ужасы/ }).click();
  await page.getByRole("button", { name: "Применить" }).click();

  await expect(page.locator("#genreAuctionSummary")).toHaveText("Ужасы");
  await expect(page.locator("#movieCount")).toHaveText("2");
  await expect(page.locator(".auction-divider")).toHaveText("Вне жанрового аукциона");
  await expect(page.locator(".movie-item.outside-auction .movie-title-main")).toHaveText(["Амели"]);
});

test("вращение выбирает фильм и открывает премьерную модалку", async ({ page }) => {
  test.setTimeout(15_000);
  await openApp(page, [
    { title: "Сталкер", genre: "фантастика" },
    { title: "Амели", genre: "комедия" }
  ]);

  await page.getByRole("button", { name: "Крутить" }).click();

  await expect(page.locator("#winnerModal")).toBeVisible({ timeout: 8_000 });
  await expect(page.locator("#winnerModalTitle")).not.toBeEmpty();
  await expect(page.locator("#winnerBox")).toHaveClass(/has-winner/);
});
