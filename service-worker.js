/* service-worker.js */
"use strict";

var cacheName = "duty-system-cache-v1";
var cacheFiles = [
  "./",
  "./index.html",
  "./manifest.json"
  // 若你有本機 css/js/icon，也可以加進來
];

self.addEventListener("install", function (evt) {
  evt.waitUntil(
    caches.open(cacheName).then(function (cache) {
      return cache.addAll(cacheFiles);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (evt) {
  evt.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== cacheName) return caches.delete(k);
        return Promise.resolve();
      }));
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (evt) {
  evt.respondWith(
    caches.match(evt.request).then(function (cached) {
      return cached || fetch(evt.request);
    })
  );
});

// 通知點擊後把 app 打開/切回來
self.addEventListener("notificationclick", function (evt) {
  evt.notification.close();
  evt.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c && "focus" in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow("./index.html");
      return Promise.resolve();
    })
  );
});
