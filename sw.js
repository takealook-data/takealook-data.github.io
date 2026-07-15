/* 최소 서비스 워커 — PWA 설치 요건 충족 + 오프라인 시 홈 셸 폴백.
   에셋 캐싱은 하지 않는다(스테일 위험 > 이득). 내비게이션만 network-first. */
var CACHE = 'takealook-shell-v1';

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(['/']);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return key !== CACHE; })
            .map(function (key) { return caches.delete(key); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.mode !== 'navigate') { return; }
  event.respondWith(
    fetch(event.request).catch(function () {
      return caches.match('/');
    })
  );
});
