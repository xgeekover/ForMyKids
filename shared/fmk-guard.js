/* ===================================================================
   ForMyKids · 전역 크래시 가드 + (배포 시) 서비스워커 등록
   -------------------------------------------------------------------
   - window.onerror / unhandledrejection 를 잡아 하얀 화면(White Screen) 대신
     귀여운 폴백 UI 를 띄우고, 게임에선 잠시 후 메인 런처로 안전 복구한다.
   - 크래시 원인이 데이터 오염일 수 있으므로 selfHeal() 로 자가 치유한다.
   - registerServiceWorker 는 운영 빌드(PROD)에서만 동작(오프라인 캐싱).
   =================================================================== */
import { selfHeal } from './fmk-store.js'

let _shown = false
const IGNORE = /ResizeObserver|Script error\.?/i
const BTN = 'font-family:inherit;border:none;cursor:pointer;border-radius:999px;padding:12px 22px;font-size:1.1rem;color:#fff;text-decoration:none;box-shadow:0 8px 18px rgba(150,110,160,.3),inset 0 -5px 0 rgba(0,0,0,.12);'

function showFallback(homeHref, isLauncher) {
  if (_shown) return
  _shown = true
  try { selfHeal() } catch (e) {} // 데이터 오염이 원인일 수 있으니 안전 치유

  const o = document.createElement('div')
  o.setAttribute('role', 'alertdialog')
  o.setAttribute('aria-label', '오류 안내')
  // 테마 CSS 가 깨졌을 수도 있으니 핵심 스타일은 인라인으로(크래시 견고성)
  o.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;' +
    'padding:20px;background:linear-gradient(160deg,#fff0f7,#e3f3ff);' +
    "font-family:'Jua','Gaegu',system-ui,sans-serif;color:#6b4a6b;text-align:center;"
  o.innerHTML =
    '<div style="background:#fff;border-radius:32px;padding:30px 26px;max-width:380px;width:100%;box-shadow:0 18px 38px rgba(150,110,160,.32);">' +
    '<div style="font-size:4rem;line-height:1">🧹</div>' +
    '<h1 style="font-size:1.8rem;margin:.15em 0;color:#ff6fa3">어라라?</h1>' +
    '<p style="font-size:1.2rem;margin:.2em 0">게임방을 다시 정돈할게요!</p>' +
    (isLauncher ? '' : '<p style="opacity:.75;margin:.5em 0 0">잠시 후 놀이터로 데려다줄게요…</p>') +
    '<div style="display:flex;gap:10px;justify-content:center;margin-top:18px;flex-wrap:wrap">' +
    (isLauncher ? '' : '<a href="' + homeHref + '" style="' + BTN + 'background:linear-gradient(160deg,#9fd0ff,#7aa8ff)">🏠 홈으로</a>') +
    '<button id="fmk-retry" type="button" style="' + BTN + 'background:linear-gradient(160deg,#ff9dc4,#ff6fa3)">🔄 다시 시도</button>' +
    '</div></div>'

  const mount = () => {
    if (!document.body) { setTimeout(mount, 50); return }
    document.body.appendChild(o)
    const retry = o.querySelector('#fmk-retry')
    if (retry) retry.addEventListener('click', () => location.reload())
    if (!isLauncher) setTimeout(() => { try { location.href = homeHref } catch (e) {} }, 3200)
  }
  mount()
}

/**
 * 전역 에러 폴백 설치.
 * @param {{ homeHref?:string, isLauncher?:boolean }} opts
 */
export function installCrashGuard(opts = {}) {
  const homeHref = opts.homeHref || '../../index.html'
  const isLauncher = !!opts.isLauncher
  window.addEventListener('error', (e) => {
    if (!e || (!e.error && !e.message)) return                 // 빈 이벤트 무시
    if (e.target && e.target !== window && e.target.tagName) return // 리소스 로드 실패는 무시
    if (IGNORE.test(e.message || '')) return                   // 무해한 잡음 무시
    showFallback(homeHref, isLauncher)
  })
  window.addEventListener('unhandledrejection', () => showFallback(homeHref, isLauncher))
}

/** 운영 빌드에서만 서비스워커 등록(오프라인 캐싱). dev/file:// 에선 건너뜀. */
export function registerServiceWorker(swPath) {
  try { if (!import.meta || !import.meta.env || !import.meta.env.PROD) return } catch (e) { return }
  if (!('serviceWorker' in navigator)) return
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(swPath).catch(() => {})
  })
}
