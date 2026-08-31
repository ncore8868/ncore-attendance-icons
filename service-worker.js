/*************************************************************
 * N-CORE 출퇴근 PWA · service-worker.js
 * 2026-08-29 · 속도
 *
 * - 앱스스크립트(script.google.com) 요청은 절대 손대지 않는다
 * - index.html 은 예전과 똑같이 '항상 최신 우선' 이다
 *
 * ★ 달라진 것 하나 — cache:"no-store" → "no-cache"
 *     no-store = "저장하지 말고 매번 통째로 다시 받아라"
 *     no-cache = "쓰기 전에 서버에 물어보고, 바뀌었을 때만 다시 받아라"
 *   서버는 안 바뀐 파일에 '그대로다(304)' 한 줄만 보냅니다.
 *   최신을 확인하는 규칙은 그대로이고, 안 바뀐 날에 다시 안 받을 뿐입니다.
 *
 * ★ 통신이 느릴 때 앱이 안 열리던 것도 고쳤습니다.
 *   캐시에 화면이 있으면 2.5초까지만 기다리고 먼저 띄웁니다.
 *   장갑 낀 손으로 아침에 5초 안에 찍어야 하는 앱입니다.
 *************************************************************/

const CACHE_NAME = "ncore-attendance-v12";

/* 캐시가 있을 때 네트워크를 기다려주는 시간 */
const NET_WAIT_MS = 2500;

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


/* 물음표 뒤를 떼어낸 주소. 같은 파일이 여러 칸에 쌓이지 않게 합니다. */
function cacheKey(request) {
  const url = new URL(request.url);
  return url.origin + url.pathname;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}

function keep(cache, request, response) {
  if (!response || !response.ok || response.redirected) return;
  try {
    cache.put(cacheKey(request), response.clone()).catch(() => {});
  } catch (err) { /* 넣지 못해도 화면에는 영향이 없습니다 */ }
}


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
   * 앱 화면 — 항상 최신 우선.
   * 다만 캐시가 있으면 통신을 오래 기다리지 않는다.
   */
  if (request.mode === "navigate" || url.pathname.endsWith("/index.html")) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(cacheKey(request), { ignoreSearch: true });

      const fromNet = fetch(request, { cache: "no-cache" })
        .then((response) => {
          keep(cache, request, response);
          return response && response.ok ? response : null;
        })
        .catch(() => null);

      const fresh = cached
        ? await Promise.race([fromNet, wait(NET_WAIT_MS)])
        : await fromNet;

      if (fresh) return fresh;
      if (cached) return cached;

      const fallback = await caches.match("./index.html", { ignoreSearch: true });
      if (fallback) return fallback;

      return new Response(
        "오프라인 상태입니다.\n인터넷 연결 후 다시 실행해 주세요.",
        { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
      );
    })());
    return;
  }


  /*
   * 아이콘 · 로고 · manifest 는 캐시 우선,
   * 뒤에서 최신본을 받아 캐시를 갱신한다
   */
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(cacheKey(request), { ignoreSearch: true }).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            keep(cache, request, response);
            return response;
          })
          .catch(() => cached);

        return cached || network;
      })
    )
  );
});
