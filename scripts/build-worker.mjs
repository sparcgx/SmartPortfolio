import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(projectRoot, "dist");
const assetsRoot = path.join(distRoot, "assets");

const staticFiles = {
  "/": {
    body: await readFile(path.join(distRoot, "index.html"), "utf8"),
    type: "text/html; charset=utf-8",
  },
  "/index.html": {
    body: await readFile(path.join(distRoot, "index.html"), "utf8"),
    type: "text/html; charset=utf-8",
  },
  "/favicon.svg": {
    body: await readFile(path.join(distRoot, "favicon.svg"), "utf8"),
    type: "image/svg+xml; charset=utf-8",
  },
  "/manifest.webmanifest": {
    body: await readFile(path.join(distRoot, "manifest.webmanifest"), "utf8"),
    type: "application/manifest+json; charset=utf-8",
  },
  "/sw.js": {
    body: await readFile(path.join(distRoot, "sw.js"), "utf8"),
    type: "text/javascript; charset=utf-8",
  },
  "/icons/app-icon.svg": {
    body: await readFile(path.join(distRoot, "icons", "app-icon.svg"), "utf8"),
    type: "image/svg+xml; charset=utf-8",
  },
};

for (const filename of [
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
]) {
  staticFiles[`/icons/${filename}`] = {
    body: await readFile(path.join(distRoot, "icons", filename), "base64"),
    type: "image/png",
    encoding: "base64",
  };
}

for (const filename of await readdir(assetsRoot)) {
  const extension = path.extname(filename);
  if (![".js", ".css"].includes(extension)) continue;
  staticFiles[`/assets/${filename}`] = {
    body: await readFile(path.join(assetsRoot, filename), "utf8"),
    type:
      extension === ".js"
        ? "text/javascript; charset=utf-8"
        : "text/css; charset=utf-8",
  };
}

const yieldRuntime = (await readFile(path.join(projectRoot, "server", "dividend-yields.mjs"), "utf8")).replace(/^export /gm, "");

const runtime = String.raw`
const API_JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

const PAGE_SECURITY_HEADERS = {
  "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
};

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: API_JSON_HEADERS,
  });
}

function finiteNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function firstPositive(...values) {
  for (const value of values) {
    const parsed = finiteNumber(value);
    if (parsed !== null && parsed > 0) return parsed;
  }
  return null;
}

async function fetchJson(url, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", ...headers },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const text = await response.text();
    return JSON.parse(text.trim());
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchUsdTwd() {
  const data = await fetchJson("https://api.frankfurter.dev/v2/rate/usd/twd");
  const rate = finiteNumber(data && data.rate);
  if (rate === null || rate <= 0) throw new Error("invalid USD/TWD rate");
  return {
    rate,
    asOf: typeof data.date === "string" ? data.date : new Date().toISOString(),
    source: "Frankfurter 官方參考匯率",
  };
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function fetchTaiwanQuotes(symbols, fetchedAt) {
  const quotes = [];
  for (const group of chunks(symbols, 20)) {
    const channels = group.flatMap((symbol) => [
      "tse_" + symbol + ".tw",
      "otc_" + symbol + ".tw",
    ]);
    const url = new URL("https://mis.twse.com.tw/stock/api/getStockInfo.jsp");
    url.searchParams.set("ex_ch", channels.join("|"));
    url.searchParams.set("json", "1");
    url.searchParams.set("delay", "0");
    const data = await fetchJson(url.toString(), {
      referer: "https://mis.twse.com.tw/stock/index.jsp",
      "user-agent": "Mozilla/5.0 (compatible; SmartPortfolio/1.2)",
    });
    const rows = Array.isArray(data && data.msgArray) ? data.msgArray : [];
    for (const row of rows) {
      const symbol = String((row && row.c) || "").toUpperCase();
      if (!group.includes(symbol)) continue;
      const price = firstPositive(row.z, row.pz, row.y);
      if (price === null) continue;
      const previousClose = firstPositive(row.y);
      const changePercent =
        previousClose && previousClose > 0
          ? ((price - previousClose) / previousClose) * 100
          : 0;
      const timestampValue = finiteNumber(row.tlong);
      const hasLastTrade = (finiteNumber(row.z) || 0) > 0;
      const marketTimestampKnown = hasLastTrade && Boolean(timestampValue && timestampValue > 0);
      const asOf =
        marketTimestampKnown
          ? new Date(timestampValue).toISOString()
          : fetchedAt;
      quotes.push({
        category: "台股",
        symbol,
        price,
        changePercent,
        source: "TWSE 最新成交／收盤",
        asOf,
        providerTimestamp:
          typeof row.d === "string" && typeof row.t === "string"
            ? row.d + " " + row.t
            : null,
        isRealtime: hasLastTrade,
        marketTimestampKnown,
      });
    }
  }
  return Array.from(new Map(quotes.map((quote) => [quote.symbol, quote])).values());
}

async function fetchNasdaqQuote(symbol, fetchedAt) {
  let lastError = null;
  for (const assetClass of ["stocks", "etf"]) {
    try {
      const url =
        "https://api.nasdaq.com/api/quote/" +
        encodeURIComponent(symbol) +
        "/info?assetclass=" +
        assetClass;
      const payload = await fetchJson(url, {
        referer: "https://www.nasdaq.com/",
        "user-agent": "Mozilla/5.0 (compatible; SmartPortfolio/1.2)",
      });
      const primary = payload && payload.data && payload.data.primaryData;
      const price = firstPositive(primary && primary.lastSalePrice);
      if (price === null) throw new Error("quote unavailable");
      const changePercent = finiteNumber(primary && primary.percentageChange) || 0;
      const isRealtime = Boolean(primary && (primary.isRealTime === true || primary.isRealTime === "true"));
      return {
        category: "美股",
        symbol,
        price,
        changePercent,
        source: isRealtime ? "Nasdaq 即時行情" : "Nasdaq 最新成交",
        asOf: fetchedAt,
        providerTimestamp:
          typeof primary.lastTradeTimestamp === "string"
            ? primary.lastTradeTimestamp
            : null,
        isRealtime,
        marketTimestampKnown: false,
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("quote unavailable");
}

function uniqueSymbols(instruments, category, pattern) {
  const symbols = instruments
    .filter((item) => item && item.category === category)
    .map((item) => String(item.symbol || "").trim().toUpperCase())
    .filter((symbol) => pattern.test(symbol));
  return Array.from(new Set(symbols)).slice(0, 40);
}

async function handleMarketData(request) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 20_000) return jsonResponse({ error: "Request too large" }, 413);

  let input;
  try {
    input = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  const instruments = Array.isArray(input && input.instruments)
    ? input.instruments.slice(0, 80)
    : [];
  const twSymbols = uniqueSymbols(instruments, "台股", /^[0-9A-Z]{2,12}$/);
  const usSymbols = uniqueSymbols(instruments, "美股", /^[A-Z0-9.^-]{1,16}$/);
  const fetchedAt = new Date().toISOString();
  const errors = [];

  const [fxResult, twResult, usResult] = await Promise.allSettled([
    Promise.resolve().then(fetchUsdTwd),
    twSymbols.length
      ? fetchTaiwanQuotes(twSymbols, fetchedAt)
      : Promise.resolve([]),
    Promise.allSettled(
      usSymbols.map((symbol) => fetchNasdaqQuote(symbol, fetchedAt)),
    ),
  ]);

  let fx = null;
  let twQuotes = [];
  let usSettled = [];

  if (fxResult && fxResult.status === "fulfilled") fx = fxResult.value;
  else errors.push("USD/TWD 匯率暫時無法取得");
  if (twResult && twResult.status === "fulfilled") twQuotes = twResult.value;
  else errors.push("台股行情暫時無法取得");
  if (usResult && usResult.status === "fulfilled") usSettled = usResult.value;
  else errors.push("美股行情暫時無法取得");

  const usQuotes = [];
  usSettled.forEach((result, index) => {
    if (result.status === "fulfilled") usQuotes.push(result.value);
    else errors.push("找不到美股代號 " + usSymbols[index]);
  });

  const twFound = new Set(twQuotes.map((quote) => quote.symbol));
  twSymbols.forEach((symbol) => {
    if (!twFound.has(symbol)) errors.push("找不到台股代號 " + symbol);
  });

  return jsonResponse({
    fetchedAt,
    fx,
    quotes: [...twQuotes, ...usQuotes],
    errors,
  });
}

// Bounded isolate-local cache and throttle; this is not a global quota.
const marketCache = new Map();
const marketClients = new Map();
async function handleMarketGateway(request) {
  const isYield = new URL(request.url).pathname === "/api/dividend-yields";
  const origin = request.headers.get("origin");
  const ownOrigin = new URL(request.url).origin;
  const allowed = !origin || origin === ownOrigin || origin === "https://sparcgx.github.io";
  if (!allowed) return jsonResponse({ error: "Origin not allowed" }, 403);
  const cors = origin ? {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
    "vary": "Origin",
  } : {};
  const wrap = (response) => {
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(cors)) headers.set(key, value);
    return new Response(response.body, { status: response.status, headers });
  };
  if (request.method === "OPTIONS") {
    if (request.headers.get("access-control-request-method") !== "POST" ||
        (request.headers.get("access-control-request-headers") || "").split(",").some(h => h.trim() && h.trim().toLowerCase() !== "content-type")) {
      return wrap(jsonResponse({ error: "Preflight not allowed" }, 403));
    }
    return wrap(new Response(null, { status: 204 }));
  }
  if (request.method !== "POST") return wrap(jsonResponse({ error: "Method not allowed" }, 405));
  const body = await request.text();
  if (new TextEncoder().encode(body).length > 20_000) return wrap(jsonResponse({ error: "Request too large" }, 413));
  let input;
  try { input = JSON.parse(body); } catch { return wrap(jsonResponse({ error: "Invalid JSON" }, 400)); }
  if (!input || !Array.isArray(input.instruments) || input.instruments.some(i => !i || typeof i.symbol !== "string" || !(isYield ? ["台股", "美股", "公募基金"] : ["台股", "美股"]).includes(i.category))) {
    return wrap(jsonResponse({ error: "Invalid instruments" }, 400));
  }
  if (isYield && (input.instruments.length > 12 || input.instruments.some(i => !/^[A-Za-z0-9.^_-]{1,40}$/.test(i.symbol.trim())))) return wrap(jsonResponse({error:"Invalid yield instruments"},400));
  const now = Date.now();
  const client = request.headers.get("cf-connecting-ip");
  if (client) {
    let entry = marketClients.get(client);
    if (!entry || now - entry.start >= 60_000) entry = { start: now, count: 0 };
    if (++entry.count > 15) return wrap(jsonResponse({ error: "Too many requests" }, 429));
    if (marketClients.size >= 512 && !marketClients.has(client)) marketClients.delete(marketClients.keys().next().value);
    marketClients.set(client, entry);
  }
  const key = (isYield ? "yields:" : "quotes:") + JSON.stringify(input.instruments.slice(0, 80).map(i => [i.category, i.symbol.trim().toUpperCase()]).sort());
  const cached = marketCache.get(key);
  if (cached && now - cached.at < (isYield ? 3_600_000 : 60_000)) return wrap(jsonResponse(cached.data));
  const response = isYield ? jsonResponse(await fetchOfficialYields(input.instruments, new Date().toISOString(), fetchJson)) : await handleMarketData(new Request(request.url, { method: "POST", headers: { "content-type": "application/json" }, body }));
  if (response.ok) {
    const data = await response.clone().json();
    // Never cache failures or partial snapshots; let recovery retry upstream.
    if ((isYield || data.fx) && data.errors.length === 0) {
      if (marketCache.size >= 128) marketCache.delete(marketCache.keys().next().value);
      marketCache.set(key, { at: now, data });
    }
  }
  return wrap(response);
}

function serveStatic(pathname, method) {
  const file = STATIC_FILES[pathname];
  if (!file) return null;
  const requiresRevalidation =
    pathname === "/" ||
    pathname === "/index.html" ||
    pathname === "/sw.js" ||
    pathname === "/manifest.webmanifest";
  const headers = {
    "content-type": file.type,
    "cache-control": requiresRevalidation
      ? "no-cache"
      : "public, max-age=31536000, immutable",
    ...PAGE_SECURITY_HEADERS,
  };
  if (pathname === "/sw.js") headers["service-worker-allowed"] = "/";
  const body =
    method === "HEAD"
      ? null
      : file.encoding === "base64"
        ? Uint8Array.from(atob(file.body), (character) => character.charCodeAt(0))
        : file.body;
  return new Response(body, { headers });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/market-data" || url.pathname === "/api/dividend-yields") {
      return handleMarketGateway(request);
    }
    if (url.pathname.startsWith("/api/")) {
      return jsonResponse({ error: "Not found" }, 404);
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }
    const response = serveStatic(url.pathname, request.method);
    return response || new Response("Not found", { status: 404 });
  },
};
`;

const workerSource = `const STATIC_FILES = ${JSON.stringify(staticFiles)};\n${yieldRuntime}\n${runtime}`;
await rm(path.join(distRoot, ".openai", "drizzle"), {
  recursive: true,
  force: true,
});
await mkdir(path.join(distRoot, "server"), { recursive: true });
await writeFile(path.join(distRoot, "server", "index.js"), workerSource, "utf8");
