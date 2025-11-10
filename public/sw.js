self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open("offline-cache").then(function (cache) {
      return cache.addAll([
        "/",
        "/manifest.json",
        "/icons/icon-512x512.png",
      ]);
    })
  );
});

self.addEventListener("fetch", function (event) {
  event.respondWith(
    caches
      .match(event.request)
      .then(function (response) {
        return response || fetch(event.request);
      })
      .catch(function () {
        return caches.match("/");
      })
  );
});
