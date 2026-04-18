const CACHE_NAME = 'attendance-pwa-v1';
const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './api.js',
    './location.js',
    './manifest.webmanifest',
    './icons/icon-192.png',
    './icons/icon-512.png',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.0.1/css/all.min.css',
    'https://code.jquery.com/jquery-3.7.1.min.js',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js'
];

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(
                keys.map(function (key) {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                    return Promise.resolve();
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', function (event) {
    const request = event.request;
    const url = new URL(request.url);

    // Google Apps Script API：走網路優先，避免資料過舊
    if (url.origin.includes('script.google.com') || url.origin.includes('script.googleusercontent.com')) {
        event.respondWith(
            fetch(request).catch(function () {
                return new Response(
                    JSON.stringify({
                        success: false,
                        message: '目前離線，無法連線到伺服器。'
                    }),
                    {
                        headers: {
                            'Content-Type': 'application/json; charset=utf-8'
                        }
                    }
                );
            })
        );
        return;
    }

    // 其他靜態資源：快取優先
    event.respondWith(
        caches.match(request).then(function (cachedResponse) {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(request).then(function (networkResponse) {
                if (!networkResponse || networkResponse.status !== 200 || request.method !== 'GET') {
                    return networkResponse;
                }

                const responseToCache = networkResponse.clone();

                caches.open(CACHE_NAME).then(function (cache) {
                    cache.put(request, responseToCache);
                });

                return networkResponse;
            });
        })
    );
});
