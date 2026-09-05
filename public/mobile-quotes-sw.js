const CACHE_NAME = "mobile-quotes-shell-v2";
const SHELL_PATH = "/crm/mobile/quotes";
const STATIC_PREFIX = "/_next/static/";

function isShellUrl(url) {
  return url.origin === self.location.origin && (url.pathname === SHELL_PATH || url.pathname === `${SHELL_PATH}/`);
}

function isAllowedStaticUrl(value) {
  try {
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin && url.pathname.startsWith(STATIC_PREFIX);
  } catch {
    return false;
  }
}

async function cacheShell() {
  try {
    const response = await fetch(`${SHELL_PATH}/`, { credentials: "same-origin", redirect: "follow" });
    const finalUrl = new URL(response.url);
    if (!response.ok || !isShellUrl(finalUrl)) return;
    const cache = await caches.open(CACHE_NAME);
    await cache.put(SHELL_PATH, response);
  } catch {
    // Installation can complete while offline; a controlled navigation can fill the shell later.
  }
}

async function cacheStaticUrls(values) {
  const urls = [...new Set(values)].filter(isAllowedStaticUrl);
  if (!urls.length) return;
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(urls.map(async (url) => {
    try {
      const response = await fetch(url, { credentials: "same-origin" });
      if (response.ok) await cache.put(url, response);
    } catch {
      // A later controlled load can fill any chunk that was unavailable here.
    }
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(Promise.all([self.skipWaiting(), cacheShell()]));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("mobile-quotes-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_MOBILE_QUOTES_STATIC" || !Array.isArray(event.data.urls)) return;
  event.waitUntil(Promise.all([cacheShell(), cacheStaticUrls(event.data.urls)]));
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;

  if (isShellUrl(url) && event.request.mode === "navigate") {
    const network = fetch(event.request).then((response) => ({
      response,
      cacheCopy: response.ok ? response.clone() : null,
    }));
    event.respondWith(network.then(({ response }) => response).catch(async () => {
      const cached = await caches.match(SHELL_PATH) || await caches.match(`${SHELL_PATH}/`);
      return cached || Response.error();
    }));
    event.waitUntil(network.then(async ({ cacheCopy }) => {
      if (!cacheCopy) return;
      const cache = await caches.open(CACHE_NAME);
      await cache.put(SHELL_PATH, cacheCopy);
    }).catch(() => undefined));
    return;
  }

  if (!isAllowedStaticUrl(url.href)) return;
  const network = fetch(event.request).then((response) => ({
    response,
    cacheCopy: response.ok ? response.clone() : null,
  }));
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    return (await network).response;
  })());
  event.waitUntil(network.then(async ({ cacheCopy }) => {
    if (!cacheCopy) return;
    const cache = await caches.open(CACHE_NAME);
    await cache.put(event.request, cacheCopy);
  }).catch(() => undefined));
});
