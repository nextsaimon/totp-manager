// This is the service worker with the offline-first behavior
// The Cache Storage API is used to cache resources for offline use
// This code is handled by next-pwa, no need to register it manually
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open("offline-cache").then(function (cache) {
      return cache.addAll([
        "/", // Cache the main page
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
