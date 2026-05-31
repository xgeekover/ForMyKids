/* ForMyKids · 가벼운 커스텀 서비스워커 (외부 라이브러리 없음)
   - install: 런처/게임 진입 HTML(고정 이름)을 미리 캐시
   - fetch: cache-first + 런타임 캐싱 → 첫 방문(온라인) 이후 오프라인 플레이 가능
            (해시 붙은 JS/CSS, 폰트 등은 처음 받아올 때 캐시에 저장)
   - activate: 옛 버전 캐시 정리 */
// 새 페이지/콘텐츠를 배포할 때마다 버전을 올려야 기존 설치 사용자의 옛 캐시가 정리된다.
// v5: 신규 게임 '조각조각 퍼즐' 추가.
const CACHE = 'fmk-cache-v6'
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './games/memory/index.html',
  './games/popnpop/index.html',
  './games/dodge/index.html',
  './games/maze/index.html',
  './games/spot/index.html',
  './games/puzzle/index.html',
  // 퍼즐 캐릭터 에셋(있을 때만 캐시; 없으면 무시) — 명화 원격 URL 은 런타임 캐싱
  './assets/puzzle/pokemon.jpg',
  './assets/puzzle/sanrio.jpg',
  './assets/puzzle/onepiece.jpg',
]

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {}))))
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  // 클라우드 동기화 API(/api/...)는 절대 캐시하지 않음 — 항상 네트워크(오프라인이면 fmk-store 가 알아서 폴백)
  try { if (new URL(req.url).pathname.startsWith('/api/')) return } catch (_) {}
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached
      return fetch(req)
        .then((res) => {
          // 정상/불투명(폰트 등 cross-origin) 응답을 런타임 캐시에 저장
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
          }
          return res
        })
        .catch(() => {
          // 오프라인 + 미캐시: 페이지 이동이면 런처로 폴백
          if (req.mode === 'navigate') return caches.match('./index.html')
          return Response.error()
        })
    })
  )
})
