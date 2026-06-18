const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 5173);
const pidFile = path.join(root, "kinoauk-server.pid");
const kinopoiskListUrls = [
  "https://www.kinopoisk.ru/user/14758743/movies/planned-to-watch/",
  "https://www.kinopoisk.ru/user/33826991/movies/planned-to-watch/"
];
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === "/api/refresh") {
    importKinopoiskList(res);
    return;
  }

  if (url.pathname === "/api/shutdown" && req.method === "POST") {
    sendJson(res, 200, { ok: true });
    setTimeout(() => {
      cleanupPid();
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 500);
    }, 150);
    return;
  }

  const requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(root, requested));

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
});

if (require.main === module) {
  server.listen(port, "127.0.0.1", () => {
    fs.writeFileSync(pidFile, String(process.pid));
    console.log(`Киноаук открыт на http://127.0.0.1:${port}`);
  });
}

function cleanupPid() {
  try {
    if (fs.existsSync(pidFile) && fs.readFileSync(pidFile, "utf8").trim() === String(process.pid)) {
      fs.unlinkSync(pidFile);
    }
  } catch {
    // Best-effort cleanup for Windows terminal closes.
  }
}

process.on("exit", cleanupPid);
process.on("SIGINT", () => {
  cleanupPid();
  process.exit(0);
});

async function importKinopoiskList(res) {
  try {
    sendJson(res, 200, { movies: await fetchKinopoiskMovies() });
  } catch (error) {
    sendJson(res, 400, { error: error.message || "Не получилось импортировать список." });
  }
}

async function fetchKinopoiskMovies() {
  const movies = new Map();

  for (const listUrl of kinopoiskListUrls) {
    for (let page = 1; page <= 10; page += 1) {
      const url = new URL(listUrl);
      url.searchParams.set("page", String(page));
      const html = await fetchKinopoiskHtml(url.href);
      const pageMovies = parseKinopoiskHtml(html);
      let added = 0;

      for (const movie of pageMovies) {
        if (movies.has(movie.url)) continue;
        movies.set(movie.url, movie);
        added += 1;
      }

      if (!pageMovies.length || !added) break;
    }
  }

  return [...movies.values()];
}

async function fetchKinopoiskHtml(url) {
  const jar = new Map();
  let result = await requestKinopoisk(url, jar);

  const redirect = result.response.headers.get("location");
  if (redirect) {
    result = await requestKinopoisk(new URL(redirect, url).href, jar);
  }

  const hostMatch = result.text.match(/"host":"([^"]+)/);
  if (hostMatch) {
    const installUrl = JSON.parse(`"${hostMatch[1]}"`);
    await requestKinopoisk(installUrl, jar);
    result = await requestKinopoisk(url, jar);
  }

  if (!result.response.ok) throw new Error(`Кинопоиск ответил ${result.response.status}`);
  return result.text;
}

async function requestKinopoisk(url, jar) {
  const response = await fetch(url, {
    redirect: "manual",
    headers: {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "ru-RU,ru;q=0.9,en;q=0.7",
      "cookie": cookieHeader(jar),
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
    }
  });

  saveCookies(response, jar);
  return { response, text: await response.text() };
}

function cookieHeader(jar) {
  return [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
}

function saveCookies(response, jar) {
  const cookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  for (const cookie of cookies) {
    const pair = cookie.split(";")[0];
    const index = pair.indexOf("=");
    if (index > 0) jar.set(pair.slice(0, index), pair.slice(index + 1));
  }
}

function parseKinopoiskHtml(html) {
  const movies = new Map();
  const anchorRe = /<a\b([^>]*href=["']([^"']*\/(?:film|series)\/\d+\/?[^"']*)["'][^>]*)>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorRe.exec(html))) {
    const href = decodeHtml(match[2]).split("?")[0];
    const attrs = match[1];
    const body = match[3];
    const poster = absoluteUrl(readAttr(body, "src"));
    const title = cleanTitle(stripTags(body))
      || cleanTitle(readAttr(body, "alt"))
      || cleanTitle(readAttr(attrs, "aria-label"))
      || cleanTitle(readAttr(attrs, "title"));
    if (!title) continue;

    const movieUrl = new URL(href, "https://www.kinopoisk.ru").href;
    const current = movies.get(movieUrl);
    movies.set(movieUrl, {
      title: current?.title || title,
      url: movieUrl,
      poster: current?.poster || poster
    });
  }

  return [...movies.values()];
}

function readAttr(attrs, name) {
  const match = new RegExp(`${name}=["']([^"']+)["']`, "i").exec(attrs);
  return match ? decodeHtml(match[1]) : "";
}

function stripTags(value) {
  return decodeHtml(String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " "));
}

function cleanTitle(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\.\s*\d{4},.*$/u, "")
    .replace(/\b\d{4},.*$/u, "")
    .trim();
}

function absoluteUrl(value) {
  if (!value) return "";
  const decoded = decodeHtml(value);
  if (decoded.startsWith("//")) return `https:${decoded}`;
  return new URL(decoded, "https://www.kinopoisk.ru").href;
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

module.exports = { fetchKinopoiskHtml, fetchKinopoiskMovies, parseKinopoiskHtml, server };
