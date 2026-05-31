/* PWA 패키징 무결성 테스트 (node tests/pwa.test.mjs)
   - manifest.json: 유효한 JSON + 필수 필드(이름/standalone/landscape/아이콘)
   - sw.js: CACHE_VERSION + activate 시 옛 캐시 폐기(clean up) + 진입 HTML precache + /api 패스 */
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

let passed = 0
const ok = (l) => { passed++; console.log('  ✓', l) }

// ── manifest.json ──
assert.ok(existsSync('public/manifest.json'), 'public/manifest.json 존재')
assert.ok(!existsSync('public/manifest.webmanifest'), '옛 manifest.webmanifest 제거됨(중복 방지)')
let mani
assert.doesNotThrow(() => { mani = JSON.parse(readFileSync('public/manifest.json', 'utf8')) }, 'manifest 는 유효한 JSON')
assert.equal(mani.name, '우리 아이 추억 놀이터', 'name')
assert.equal(mani.short_name, '추억놀이터', 'short_name')
assert.equal(mani.display, 'standalone', 'display=standalone')
assert.equal(mani.orientation, 'landscape', 'orientation=landscape(태블릿 가로)')
assert.ok(mani.start_url && mani.scope, 'start_url/scope')
assert.ok(Array.isArray(mani.icons) && mani.icons.length >= 1 && mani.icons.every((i) => i.src), 'icons 정의')
assert.ok(mani.icons.some((i) => i.type === 'image/png' && /\d+x\d+/.test(i.sizes || '')), 'PNG 아이콘(설치 호환) 포함')
assert.ok(mani.icons.some((i) => (i.purpose || '').includes('maskable')), 'maskable 아이콘 포함')
assert.ok(existsSync('public/icon-512.png') && existsSync('public/apple-touch-icon.png'), 'PNG 아이콘 파일 존재')
assert.ok(/^#/.test(mani.theme_color) && /^#/.test(mani.background_color), 'theme/background color')
ok('manifest.json: 유효 JSON + 필수 필드(이름·standalone·landscape·아이콘)')

// ── head 주입(메인 HTML) ──
const html = readFileSync('index.html', 'utf8')
assert.ok(/rel="manifest"\s+href="[^"]*manifest\.json"/.test(html), 'manifest.json 링크 주입')
assert.ok(/name="apple-mobile-web-app-capable"\s+content="yes"/.test(html), 'apple-mobile-web-app-capable')
assert.ok(/name="apple-mobile-web-app-title"/.test(html), 'apple-mobile-web-app-title')
assert.ok(/name="mobile-web-app-capable"\s+content="yes"/.test(html), 'mobile-web-app-capable')
ok('index.html: 매니페스트 링크 + 모바일 앱 메타 태그 주입')

// ── sw.js ──
const sw = readFileSync('public/sw.js', 'utf8')
assert.ok(/CACHE_VERSION\s*=/.test(sw), 'CACHE_VERSION 관리')
assert.ok(/addEventListener\(\s*'install'/.test(sw), 'install(precache)')
assert.ok(/addEventListener\(\s*'activate'/.test(sw), 'activate(cleanup)')
assert.ok(/caches\.delete/.test(sw), 'activate 시 옛 캐시 폐기')
assert.ok(/addEventListener\(\s*'fetch'/.test(sw), 'fetch 핸들러')
assert.ok(sw.includes('./manifest.json') && sw.includes('./index.html'), '핵심 진입 자산 precache')
assert.ok(/startsWith\('\/api\/'\)/.test(sw), '/api 동기화는 캐시 안 함(패스)')
ok('sw.js: CACHE_VERSION·precache·activate 정리·fetch·api 패스')

console.log(`\n✅ pwa 테스트 ${passed}개 통과`)
