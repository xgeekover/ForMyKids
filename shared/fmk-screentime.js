/* ===================================================================
   ForMyKids · 건강한 플레이 타임(스크린 타임) — 게임 페이지용 가드 + 잠금 화면
   -------------------------------------------------------------------
   · 데이터(제한/누적)는 fmk-store 의 활성 프로필에 저장된다(여기선 UI/타이머만).
   · installGameGuard(): 게임 진입 시 초과면 즉시 잠금, 아니면 주기적으로 사용량을 누적하고
     제한에 도달하는 순간 친근한 잠금 오버레이를 띄운다(게임 위 전체 덮음).
   · 브라우저 가드(Node 안전 no-op).
   =================================================================== */
import { addUsageToday, isOverLimit, getActiveProfileId } from './fmk-store.js';

const TICK_SEC = 20; // 누적 주기(초). 30분 제한 기준 충분히 정밀하면서 동기화 부담은 낮게.
let _timer = 0;
let _pageshowHooked = false;

/** 친근한 잠금 오버레이 주입(이미 떠 있으면 무시). */
export function lockOverlay(opts = {}) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('fmk-screentime-lock')) return;
  const homeHref = opts.homeHref;
  const ov = document.createElement('div');
  ov.id = 'fmk-screentime-lock';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-label', '오늘의 플레이 시간 종료');
  Object.assign(ov.style, {
    position: 'fixed', inset: '0', zIndex: '100000', display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: '24px',
    background: 'rgba(60,50,80,.74)', backdropFilter: 'blur(6px)',
    fontFamily: '"Jua","Gaegu",sans-serif', textAlign: 'center',
  });
  const homeBtn = homeHref
    ? `<a href="${homeHref}" style="display:inline-block;margin-top:18px;padding:12px 26px;border-radius:999px;background:linear-gradient(160deg,#ffd6ec,#ff9dc4);color:#5d3f59;font-size:1.15rem;text-decoration:none;box-shadow:0 6px 16px rgba(0,0,0,.18)">🏠 홈으로</a>`
    : '';
  ov.innerHTML = `
    <div style="max-width:420px;width:100%;background:linear-gradient(165deg,#fffdf8,#fff0f7);border-radius:28px;padding:32px 26px;box-shadow:0 18px 50px rgba(0,0,0,.3),inset 0 0 0 5px rgba(255,255,255,.7)">
      <div style="font-size:3.6rem;line-height:1">👋</div>
      <h2 style="margin:8px 0 6px;font-size:1.8rem;color:#8a5cc7">오늘은 여기까지!</h2>
      <p style="margin:0;font-size:1.15rem;color:#5d3f59;line-height:1.5">다음에 또 만나요 😊<br/>내일 다시 신나게 놀 수 있어요!</p>
      ${homeBtn}
      <p style="margin:16px 0 0;font-size:.86rem;color:#9a8aa6;line-height:1.4">부모님은 <b>부모님 방 → 플레이 시간</b>에서 시간을 조절할 수 있어요.</p>
    </div>`;
  (document.body || document.documentElement).appendChild(ov);
}
export function hideLockOverlay() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('fmk-screentime-lock');
  if (el && el.parentNode) el.parentNode.removeChild(el);
}
function _stop() { if (_timer) { clearInterval(_timer); _timer = 0; } }

/**
 * 게임 페이지용 가드. 진입 시 초과면 즉시 잠금, 아니면 주기적으로 사용량 누적 후 초과 시 잠금.
 * @param {{homeHref?:string}} [opts]
 */
export function installGameGuard(opts = {}) {
  if (typeof window === 'undefined') return undefined; // Node 안전
  // 활성 프로필 없이 게임 페이지에 '직접' 진입(북마크/딥링크/히스토리) → 런처로 보내 '누가 놀까요?'
  // 선택과 진입 게이트를 거치게 한다. (그냥 통과시키면 스크린 타임 제한을 우회할 수 있음)
  if (!getActiveProfileId()) {
    if (opts.homeHref) { try { window.location.replace(opts.homeHref); } catch (e) {} }
    return undefined;
  }
  // bfcache/뒤로·앞으로 가기로 복원될 때도 잠금을 다시 평가(모듈 스크립트는 재실행되지 않으므로) — 1회만 등록
  if (!_pageshowHooked) {
    _pageshowHooked = true;
    window.addEventListener('pageshow', () => { if (getActiveProfileId() && isOverLimit()) { _stop(); lockOverlay(opts); } });
  }
  if (isOverLimit()) { _stop(); lockOverlay(opts); return _stop; } // 이미 초과 → 바로 잠금
  _stop();
  _timer = window.setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return; // 안 보이는 동안은 누적 안 함
    addUsageToday(TICK_SEC);
    if (isOverLimit()) { _stop(); lockOverlay(opts); }
  }, TICK_SEC * 1000);
  return _stop; // React useEffect cleanup 용 disposer(언마운트 시 타이머 정리)
}
