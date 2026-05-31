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
import { celebrate } from './fmk-confetti.js';     // 여권 완성 시 황금빛 폭죽
import { prestigePassport } from './fmk-store.js';  // 보상 확인 → 환생(여권 초기화 + 레벨업)

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

/* 여권 완성(16칸) 환생 보상 팝업 — 화면을 덮고 확인 버튼으로만 닫힘 */
.fmk-prestige-overlay { position: fixed; inset: 0; z-index: 99999; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(60,45,20,.55); backdrop-filter: blur(4px); }
.fmk-prestige-card {
  max-width: 380px; width: 100%; text-align: center; border-radius: 28px; padding: 30px 24px;
  background: linear-gradient(165deg, #fffdf0, #ffeaa0); color: #8a5a1f;
  box-shadow: 0 20px 60px rgba(0,0,0,.35), inset 0 0 0 5px rgba(255,255,255,.7), inset 0 0 0 9px rgba(226,180,0,.5);
  font-family: "Jua","Gaegu",sans-serif; animation: fmk-prestige-in .5s cubic-bezier(.2,.9,.3,1.5) both;
}
.fmk-prestige-emoji { font-size: 4rem; line-height: 1; filter: drop-shadow(0 4px 10px rgba(160,110,0,.4)); }
.fmk-prestige-card h2 { margin: 8px 0 6px; font-size: 1.9rem; color: #b8860b; }
.fmk-prestige-card p { margin: 0 0 18px; font-size: 1.12rem; line-height: 1.5; color: #7a5a2a; }
.fmk-prestige-btn { font: inherit; font-weight: 800; font-size: 1.2rem; cursor: pointer; border: none; min-height: 52px; padding: 12px 26px; border-radius: 999px; color: #fff; background: linear-gradient(160deg, #ffcf3a, #e2a400); box-shadow: 0 8px 20px rgba(200,150,0,.45); }
.fmk-prestige-btn:active { transform: scale(.96); }
@keyframes fmk-prestige-in { 0% { transform: scale(.4) rotate(-8deg); opacity: 0; } 60% { transform: scale(1.06); } 100% { transform: scale(1) rotate(0); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .fmk-prestige-card { animation: none; } }
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
  const reward = () => { if (award.full) passportRewardPopup(award); }; // 16칸 완성 → 환생 보상
  if (_reduce()) { reward(); return; } // 모션 줄이기 → 큰 연출 생략, 보상은 표시
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
    setTimeout(() => { finish(); reward(); }, 1700); // 스탬프 사라진 뒤 여권 완성 보상
  } catch (e) {}
}

// 여권 16칸 완성 → 황금빛 폭죽 + 보상 팝업. '새 여권 받기' 확인 시에만 prestigePassport(정확히 1회 초기화).
function passportRewardPopup(award) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('fmk-prestige')) return; // 중복 방지(정확히 한 번)
  try {
    _ensureStyle();
    try { celebrate(); } catch (e) {} // 황금빛(멀티 버스트) 폭죽
    const ov = document.createElement('div');
    ov.className = 'fmk-prestige-overlay';
    ov.id = 'fmk-prestige';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-label', '여권 완성 보상');
    ov.innerHTML =
      '<div class="fmk-prestige-card">' +
      '<div class="fmk-prestige-emoji" aria-hidden="true">🏆</div>' +
      '<h2>여권 완성!</h2>' +
      '<p>스탬프 16개를 모두 모았어! 🎉<br/>새 여권을 받아 더 모아볼까?</p>' +
      '<button class="fmk-prestige-btn" type="button">✨ 새 여권 받기</button>' +
      '</div>';
    (document.body || document.documentElement).appendChild(ov);
    const close = () => {
      // 16칸 채운 프로필만 환생(여권 0칸 초기화 + 레벨업). 버튼 클릭 1회로만.
      const ids = (award.fullProfileIds && award.fullProfileIds.length) ? award.fullProfileIds : undefined;
      try { prestigePassport(ids); } catch (e) {}
      if (ov.parentNode) ov.parentNode.removeChild(ov);
    };
    const btn = ov.querySelector('.fmk-prestige-btn');
    if (btn) btn.addEventListener('click', () => { try { sfx.resume(); sfx.fanfare(); } catch (e) {} close(); });
  } catch (e) {}
}
