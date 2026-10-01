const CACHE_NAME = "smartportfolio-pwa-v1.10.0";
const STATIC_ASSETS = [
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
];

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const response = await fetch(new Request("/", { cache: "reload" }));
  if (!response.ok) throw new Error("Unable to cache app shell");

  const html = await response.clone().text();
  await cache.put("/", response.clone());
  await cache.put("/index.html", response);

  const linkedAssets = Array.from(
    html.matchAll(/(?:src|href)=["']([^"']+)["']/g),
    (match) => new URL(match[1], self.location.origin).pathname,
  ).filter((pathname) => pathname.startsWith("/assets/"));

  await Promise.allSettled(
    [...STATIC_ASSETS, ...linkedAssets].map((asset) => cache.add(asset)),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("smartportfolio-pwa-") && key !== CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname === "/sw.js"
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(new Request(request, { cache: "no-store" }))
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put("/", response.clone());
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match("/");
          return (
            cached ||
            new Response(
              "<!doctype html><html lang='zh-Hant'><meta name='viewport' content='width=device-width'><title>SmartPortfolio</title><body><p>目前離線，且尚未完成離線資料準備。請連線後再開啟一次。</p></body></html>",
              { headers: { "Content-Type": "text/html; charset=utf-8" } },
            )
          );
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    }),
  );
});
