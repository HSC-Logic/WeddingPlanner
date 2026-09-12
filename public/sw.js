const CACHE = "vow-shell-v3";
self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const base = new URL("./", self.location.href);
      const response = await fetch(new URL("index.html", base), {
        cache: "reload",
      });
      if (!response.ok) throw new Error("App shell download failed");
      const html = await response.text();
      const assets = [
        ...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))["']/g),
      ]
        .map((match) => new URL(match[1], base).href)
        .filter((url) => new URL(url).origin === self.location.origin);
      await cache.addAll([
        base.href,
        new URL("index.html", base).href,
        new URL("manifest.webmanifest", base).href,
        new URL("icon.svg", base).href,
        ...assets,
      ]);
      await self.skipWaiting();
    })(),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      await Promise.all(
        (await caches.keys())
          .filter((key) => key.startsWith("vow-shell-") && key !== CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    new URL(event.request.url).origin !== self.location.origin
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (event.request.mode !== "navigate") {
        const cached = await cache.match(event.request);
        if (cached) return cached;
      }
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      } catch (error) {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate")
          return (
            (await cache.match(new URL("index.html", self.location.href))) ||
            Response.error()
          );
        return Response.error();
      }
    })(),
  );
});
