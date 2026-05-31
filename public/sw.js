/* ForMyKids · 커스텀 서비스워커 (외부 라이브러리 없음) — PWA 오프라인 패키징
   - install : HTML 셸 + 그 셸이 로드하는 해시된 JS/CSS 까지 파싱해 통째로 precache
               → 한 번도 안 연 게임도 설치 시점(온라인)에 캐시되어 '콜드' 비행기 모드 실행 OK
   - activate: CACHE_VERSION 이 다른 옛 캐시를 모두 폐기(clean up) → 새 배포 시 캐시 꼬임 방지
   - fetch   :
       · 페이지 이동(HTML) → Stale-While-Revalidate(즉시 캐시 + 백그라운드 갱신, 폴백은 항상 Response 보장)
       · 그 외 GET → Cache-First + 런타임 캐싱(해시 자산 안전)
       · /api/ (클라우드 동기화) → 캐시 안 함(항상 네트워크; 오프라인이면 fmk-store 큐가 폴백)
   ※ 배포 때 콘텐츠가 바뀌면 CACHE_VERSION 만 올리면 옛 캐시가 깔끔히 교체된다.
   ※ 효과음/BGM 은 mp3 가 아니라 절차적 WebAudio(JS) → JS 번들 캐시로 함께 오프라인 동작. */
const CACHE_VERSION = 'v8';                    // ← 배포 시 콘텐츠가 바뀌면 이 값을 올린다
const CACHE = 'fmk-cache-' + CACHE_VERSION;

// 파싱해서 내부 해시 자산까지 캐시할 HTML 셸(런처 + 6게임)
const HTML_SHELLS = [
  './index.html',
  './games/memory/index.html', './games/popnpop/index.html', './games/dodge/index.html',
  './games/maze/index.html', './games/spot/index.html', './games/puzzle/index.html',
];
// 고정 이름 정적 자산(없으면 무시). 명화 원격 URL 은 런타임 캐싱.
const STATIC = [
  './', './manifest.json', './icon.svg',
  './icon-192.png', './icon-512.png', './icon-512-maskable.png', './apple-touch-icon.png',
  './assets/puzzle/pokemon.jpg', './assets/puzzle/pokemon2.jpg',
  './assets/puzzle/sanrio.jpg', './assets/puzzle/onepiece.jpg',
];

// 폰트 CDN(opaque) 만 화이트리스트로 캐시 허용 — 그 외 opaque(에러 가능)는 캐시하지 않음(캐시 오염 방지)
const OPAQUE_HOSTS = ['fonts.gstatic.com', 'fonts.googleapis.com'];
function shouldCache(req, res) {
  if (!res) return false;
  if (res.ok) return true; // same-origin/CORS 정상
  if (res.type === 'opaque') {
    try { return OPAQUE_HOSTS.includes(new URL(req.url).hostname); } catch (e) { return false; }
  }
  return false;
}

// HTML 셸을 캐시하고, 그 안의 해시된 /assets/*.js|css 까지 추출해 함께 캐시
async function precacheShell(c, htmlUrl) {
  try {
    const res = await fetch(htmlUrl, { cache: 'no-cache' });
    if (!res || !res.ok) return;
    await c.put(htmlUrl, res.clone());
    const text = await res.text();
    const base = new URL(htmlUrl, self.location.href);
    const assets = new Set();
    const re = /(?:src|href)\s*=\s*["']([^"']+\.(?:js|css))["']/g;
    let m;
    while ((m = re.exec(text))) { try { assets.add(new URL(m[1], base).href); } catch (_) {} }
    await Promise.all([...assets].map((u) => c.add(u).catch(() => {})));
  } catch (e) {}
}

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(STATIC.map((u) => c.add(u).catch(() => {})));
    await Promise.all(HTML_SHELLS.map((h) => precacheShell(c, h)));
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))) // 옛 버전 폐기
      .then(() => self.clients.claim())
  );
});

// 페이지(HTML): SWR — 캐시 즉시 + 백그라운드 갱신. 폴백은 항상 Response 보장(respondWith undefined 방지).
async function staleWhileRevalidate(req) {
  const c = await caches.open(CACHE);
  const cached = await c.match(req);
  const network = fetch(req).then((res) => { if (shouldCache(req, res)) c.put(req, res.clone()).catch(() => {}); return res; }).catch(() => null);
  if (cached) { network; return cached; } // 백그라운드 갱신(부동 프로미스)
  const net = await network;
  if (net) return net;
  return (await c.match('./index.html')) || (await c.match('./')) || Response.error();
}

// 해시된 정적 자산: Cache-First + 런타임 캐싱
async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (shouldCache(req, res)) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
    return res;
  } catch (e) { return Response.error(); }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  try { if (new URL(req.url).pathname.startsWith('/api/')) return; } catch (_) {} // 동기화 API 는 패스(캐시 X)
  const isNav = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  e.respondWith(isNav ? staleWhileRevalidate(req) : cacheFirst(req));
});
