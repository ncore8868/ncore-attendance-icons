/*************************************************************
 * N-CORE 출퇴근 PWA · service-worker.js
 * 화면 분리 대응본 · 2026-08-26
 *
 * - v3 캐시 전부 폐기 (기존 런처 화면이 남지 않도록)
 * - index.html 은 항상 최신본 우선, 오프라인일 때만 캐시
 * - 앱스스크립트(script.google.com) 요청은 절대 손대지 않는다
 *************************************************************/

const CACHE_NAME = "ncore-attendance-v7";

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


/* ============================================================
 * 설치
 * ========================================================== */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) =>
        Promise.all(
          CORE_ASSETS.map((url) => cache.add(url).catch(() => null))
        )
      )
      .then(() => self.skipWaiting())
  );
});


/* ============================================================
 * 활성화 · 이전 캐시 삭제
 * ========================================================== */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});


/* ============================================================
 * 요청 처리
 * ========================================================== */
self.addEventListener("fetch", (event) => {
  const request = event.request;

  /* 출퇴근 기록 전송(POST)은 건드리지 않는다 */
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  /* 앱스스크립트 등 외부 도메인은 그대로 통과시킨다 */
  if (url.origin !== self.location.origin) {
    return;
  }


  /*
   * 앱 화면
   * 온라인이면 항상 최신 index.html, 오프라인이면 캐시
   */
  if (request.mode === "navigate" || url.pathname.endsWith("/index.html")) {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          return (
            (await caches.match(request, { ignoreSearch: true })) ||
            (await caches.match("./index.html")) ||
            new Response(
              "오프라인 상태입니다.\n인터넷 연결 후 다시 실행해 주세요.",
              {
                status: 503,
                headers: { "Content-Type": "text/plain; charset=utf-8" }
              }
            )
          );
        })
    );
    return;
  }


  /*
   * 아이콘 · 로고 · manifest 는 캐시 우선,
   * 뒤에서 최신본을 받아 캐시를 갱신한다
   */
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
