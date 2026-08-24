/*************************************************************
 * N-CORE 출퇴근 PWA 런처 · service-worker.js
 * 계정 이전 대응본 · 2026-08-24
 *
 * - 기존 캐시 강제 교체
 * - 런처(index.html)는 항상 최신본 우선
 * - Apps Script 웹앱은 서비스워커가 건드리지 않음
 *************************************************************/

const CACHE_NAME = "ncore-attendance-v3";

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
          CORE_ASSETS.map((url) =>
            cache.add(url).catch(() => null)
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});


/* ============================================================
 * 활성화
 * - 이전 버전 캐시 전부 삭제
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

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);


  /*
   * Google Apps Script 등 외부 도메인은
   * 이 서비스워커에서 절대 건드리지 않는다.
   */
  if (url.origin !== self.location.origin) {
    return;
  }


  /*
   * 런처 화면
   *
   * 온라인:
   *   무조건 최신 index.html 먼저 가져옴
   *
   * 오프라인:
   *   저장된 캐시 사용
   */
  if (
    request.mode === "navigate" ||
    url.pathname.endsWith("/index.html")
  ) {
    event.respondWith(
      fetch(request, {
        cache: "no-store"
      })
        .then((response) => {

          if (response && response.ok) {
            const clone = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) =>
                cache.put(request, clone)
              );
          }

          return response;
        })

        .catch(async () => {

          return (
            (await caches.match(request, {
              ignoreSearch: true
            })) ||

            (await caches.match("./index.html")) ||

            new Response(
              "오프라인 상태입니다.\n인터넷 연결 후 다시 시도해 주세요.",
              {
                status: 503,
                headers: {
                  "Content-Type":
                    "text/plain; charset=utf-8"
                }
              }
            )
          );
        })
    );

    return;
  }


  /*
   * 아이콘 / 로고 / manifest 등
   * 정적 파일은 캐시 우선
   *
   * 뒤에서는 최신 파일을 받아
   * 캐시를 갱신한다.
   */
  event.respondWith(
    caches.match(request)
      .then((cached) => {

        const network =
          fetch(request)
            .then((response) => {

              if (response && response.ok) {

                const clone =
                  response.clone();

                caches.open(CACHE_NAME)
                  .then((cache) =>
                    cache.put(request, clone)
                  );
              }

              return response;
            })

            .catch(() => cached);


        return cached || network;
      })
  );
});
