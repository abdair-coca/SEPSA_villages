const CACHE_PREFIX = "sepsa-field-shell-v3-";
const LEGACY_CACHE_PREFIX = "sepsa-field-shell-";
const META_CACHE = `${CACHE_PREFIX}meta`;
const ACTIVE_CACHE_KEY = "/__sepsa_active_cache__";
const CANDIDATE_CACHE_KEY = "/__sepsa_candidate_cache__";
const STATIC_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/favicon.svg", "/icon-192.svg", "/icon-512.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(stageShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(activateStagedShell().then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/v1/") || url.pathname === "/healthz") return;
  event.respondWith(request.mode === "navigate" ? serveNavigation(request) : serveStatic(request));
});

async function stageShell() {
  const candidateName = `${CACHE_PREFIX}${crypto.randomUUID()}`;
  const cache = await caches.open(candidateName);
  try {
    const urls = new Set(STATIC_SHELL);
    const indexResponse = await fetch("/index.html", { cache: "no-store" });
    if (!indexResponse.ok) throw new Error(`Essential shell resource failed: /index.html (${indexResponse.status})`);
    await cache.put("/index.html", indexResponse.clone());
    for (const asset of assetsFromHtml(await indexResponse.text(), "/index.html")) urls.add(asset);
    for (const url of urls) {
      if (url !== "/index.html") await cacheEssentialResource(cache, url);
    }
    for (const cssUrl of [...urls].filter((url) => url.endsWith(".css"))) {
      const cssResponse = await cache.match(cssUrl, { ignoreVary: true });
      if (!cssResponse) throw new Error(`Essential shell stylesheet was not cached: ${cssUrl}`);
      for (const asset of assetsFromCss(await cssResponse.text(), cssUrl)) await cacheEssentialResource(cache, asset);
    }
    await writeCachePointer(CANDIDATE_CACHE_KEY, candidateName);
  } catch (error) {
    await caches.delete(candidateName);
    throw error;
  }
}

async function activateStagedShell() {
  const candidateName = await readCachePointer(CANDIDATE_CACHE_KEY);
  if (!candidateName?.startsWith(CACHE_PREFIX) || candidateName === META_CACHE) {
    throw new Error("No complete staged shell is available for activation.");
  }
  await writeCachePointer(ACTIVE_CACHE_KEY, candidateName);
  const keys = await caches.keys();
  await Promise.all(keys
    .filter((key) => (key.startsWith(CACHE_PREFIX) || key.startsWith(LEGACY_CACHE_PREFIX)) && key !== META_CACHE && key !== candidateName)
    .map((key) => caches.delete(key)));
}

async function serveNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) await putInActiveCache(request, response.clone());
    return response;
  } catch {
    const cache = await activeCache();
    return (await cache?.match(request, { ignoreVary: true }))
      || (await cache?.match("/", { ignoreVary: true }))
      || (await cache?.match("/index.html", { ignoreVary: true }))
      || Response.error();
  }
}

async function serveStatic(request) {
  const cache = await activeCache();
  const cached = await cache?.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await putInActiveCache(request, response.clone());
  return response;
}

async function activeCache() {
  const cacheName = await readCachePointer(ACTIVE_CACHE_KEY);
  return cacheName?.startsWith(CACHE_PREFIX) && cacheName !== META_CACHE
    ? caches.open(cacheName)
    : undefined;
}

async function putInActiveCache(request, response) {
  const cache = await activeCache();
  if (cache) await cache.put(request, response);
}

async function writeCachePointer(key, value) {
  const metadata = await caches.open(META_CACHE);
  await metadata.put(key, new Response(value, { headers: { "content-type": "text/plain" } }));
}

async function readCachePointer(key) {
  const metadata = await caches.open(META_CACHE);
  const response = await metadata.match(key);
  return response ? response.text() : undefined;
}

function assetsFromHtml(html, htmlUrl) {
  return [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)]
    .map((match) => sameOriginPath(match[1], htmlUrl))
    .filter(Boolean);
}

function assetsFromCss(css, cssUrl) {
  return [...css.matchAll(/url\(["']?([^"')]+)["']?\)/gi)]
    .map((match) => sameOriginPath(match[1], cssUrl))
    .filter(Boolean);
}

function sameOriginPath(value, baseUrl = "/") {
  try {
    const url = new URL(value, new URL(baseUrl, self.location.origin));
    return url.origin === self.location.origin ? `${url.pathname}${url.search}` : false;
  } catch {
    return false;
  }
}

async function cacheEssentialResource(cache, url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Essential shell resource failed: ${url} (${response.status})`);
  await cache.put(url, response);
}
