/* ===================================================================
   ForMyKids · 여권 스탬프 '쾅!' 획득 연출 (애니메이션 + 효과음, 음성 없음)
   -------------------------------------------------------------------
   게임 클리어 보상으로 스탬프를 받는 순간, 화면 중앙에 큰 스탬프가 cubic-bezier 로
   '쾅!' 찍혔다가 사라진다. 효과음(fanfare)만 동반(어색한 TTS 는 v1.9.0 에서 제거).
   · Node/SSR 안전(no-op), prefers-reduced-motion 이면 큰 연출은 생략(소리만).
   · 오버레이는 애니메이션 종료 후 스스로 제거(폴백 타이머로 누수 방지).
   사용:  import { dropStamp } from '.../shared/fmk-stamp.js'
          const award = awardPassportStamp(); if (award) dropStamp(award)
   =================================================================== */
import * as sfx from './fmk-sound.js';

const STYLE_ID = 'fmk-stamp-style';
const CSS = `
.fmk-stamp-overlay { position: fixed; inset: 0; z-index: 99998; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.fmk-stamp-badge {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  width: clamp(140px, 42vw, 220px); height: clamp(140px, 42vw, 220px); border-radius: 50%;
  background: radial-gradient(circle at 50% 38%, #fff7fb, #ffe2f0);
  box-shadow: 0 0 0 6px rgba(255,143,177,.85), inset 0 0 0 4px rgba(255,143,177,.45), 0 18px 50px rgba(0,0,0,.3);
  color: #c0407a; animation: fmk-stamp-slam .5s cubic-bezier(.2,.9,.3,1.4) both;
}
.fmk-stamp-emoji { font-size: clamp(3.2rem, 14vw, 5rem); line-height: 1; filter: drop-shadow(0 4px 8px rgba(0,0,0,.18)); }
.fmk-stamp-label { font-family: "Jua","Gaegu",sans-serif; font-weight: 800; font-size: clamp(1rem, 4.5vw, 1.4rem); }
@keyframes fmk-stamp-slam {
  0%   { transform: scale(3) rotate(-22deg); opacity: 0; }
  55%  { transform: scale(.85) rotate(7deg); opacity: 1; }
  72%  { transform: scale(1.08) rotate(-3deg); }
  100% { transform: scale(1) rotate(0); opacity: 1; }
}
@keyframes fmk-stamp-out { to { transform: scale(1.15); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .fmk-stamp-badge { animation-duration: .01ms; } }
`;

function _reduce() {
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
}
function _ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = CSS;
  (document.head || document.documentElement).appendChild(st);
}

/**
 * 스탬프 획득 연출. award = awardPassportStamp() 의 반환값({kind:{emoji,name},...}).
 * 브라우저에서만 동작(Node 안전 no-op). 효과음은 항상, 큰 연출은 reduced-motion 이면 생략.
 */
export function dropStamp(award, opts = {}) {
  if (typeof document === 'undefined' || !award || !award.kind) return; // Node/SSR 안전
  try { sfx.resume(); sfx.fanfare(); } catch (e) {} // 효과음(팡파레)
  if (_reduce()) return; // 모션 줄이기 → 소리만, 큰 연출 생략
  try {
    _ensureStyle();
    const ov = document.createElement('div');
    ov.className = 'fmk-stamp-overlay';
    ov.setAttribute('aria-hidden', 'true');
    const label = (opts && typeof opts.label === 'string') ? opts.label : '새 스탬프!';
    const badge = document.createElement('div');
    badge.className = 'fmk-stamp-badge';
    badge.innerHTML = '<span class="fmk-stamp-emoji">' + award.kind.emoji + '</span><span class="fmk-stamp-label">' + label + '</span>';
    ov.appendChild(badge);
    (document.body || document.documentElement).appendChild(ov);

    let done = false;
    const finish = () => { if (done) return; done = true; if (ov.parentNode) ov.parentNode.removeChild(ov); };
    // 슬램(0.5s) → 잠깐 유지 → 페이드아웃 → 제거. 애니메이션 누락 대비 폴백 타이머로 항상 정리.
    setTimeout(() => { badge.style.animation = 'fmk-stamp-out .4s ease forwards'; }, 1100);
    setTimeout(finish, 1700);
  } catch (e) {}
}
