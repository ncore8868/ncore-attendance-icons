/*************************************************************
 * N-CORE 출퇴근 PWA 런처 · service-worker.js
 * 저장소: ncore8868/ncore-attendance-icons   (2026-08-19 교체본)
 *
 * 이전 파일은 현장견적앱의 캐시 목록(PretendardVariable.woff2 등)을
 * 담고 있어서, 저장소에 없는 파일 때문에 설치 자체가 실패했습니다.
 * 이 파일은 출퇴근 런처에 실제로 있는 파일만 캐시하고,
 * 일부 파일이 없어도 설치가 중단되지 않게 처리합니다.
 *************************************************************/

const CACHE_NAME = "ncore-attendance-v2";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./apple-touch-icon-180.png",
  "./ncore-logo.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) =>
        // 파일 하나가 없어도 설치가 실패하지 않도록 개별로 담는다
        Promise.all(
          CORE_ASSETS.map((url) => cache.add(url).catch(() => null))
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 다른 도메인(=Apps Script 웹앱)은 서비스워커가 건드리지 않는다
  if (url.origin !== self.location.origin) return;

  // 런처 화면은 항상 최신을 먼저 시도하고, 실패하면 캐시로 대체
  if (request.mode === "navigate" || url.pathname.endsWith("/index.html")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () =>
          (await caches.match(request, { ignoreSearch: true })) ||
          (await caches.match("./index.html")) ||
          new Response("오프라인 상태입니다.\n인터넷 연결 후 다시 시도해 주세요.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          })
        )
    );
    return;
  }

  // 아이콘 등 정적 파일은 캐시 우선
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
