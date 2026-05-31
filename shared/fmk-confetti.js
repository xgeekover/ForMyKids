/* ===================================================================
   ForMyKids · 가벼운 폭죽(Confetti) — 의존성 없음 / 오프라인 PWA 안전 / Node 안전
   -------------------------------------------------------------------
   · canvas-confetti 같은 외부 라이브러리/CDN 없이 순수 <canvas> 로 구현 → 오프라인에서도 동작.
   · 모든 함수는 브라우저 가드(typeof window/document) → Node 유닛테스트에서 안전 no-op.
   · prefers-reduced-motion 이면 시각효과는 생략(단, 호출 카운터는 증가시켜 '호출됨'은 보장).
   사용:  import { celebrate, fire } from '.../shared/fmk-confetti.js'
          celebrate()   // 클리어/도장 해금 같은 큰 축하(멀티 버스트)
   =================================================================== */

const COLORS = ['#ff8fb1', '#ffd93b', '#9fe3b0', '#a8d8ff', '#d7c3ff', '#ffb38a', '#ff6fa3'];

const _reduce = () => {
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
};

let _canvas = null, _ctx = null, _raf = 0, _particles = [];
let _lifecycleHooked = false;

// 화면 전환(탭 숨김) · 페이지 이탈 시 rAF/canvas 를 확실히 정리(메모리 누수 방지) — 1회만 등록.
function _ensureLifecycleHook() {
  if (_lifecycleHooked || typeof window === 'undefined' || !window.addEventListener) return;
  _lifecycleHooked = true;
  try {
    window.addEventListener('pagehide', _cleanup);
    document.addEventListener('visibilitychange', () => { if (document.hidden) _cleanup(); });
  } catch (e) {}
}

function _resize() {
  if (!_canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  _canvas.width = Math.floor(window.innerWidth * dpr);
  _canvas.height = Math.floor(window.innerHeight * dpr);
  if (_ctx) _ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function _ensureCanvas() {
  if (_canvas) return;
  _canvas = document.createElement('canvas');
  _canvas.className = 'fmk-confetti-canvas';
  _canvas.setAttribute('aria-hidden', 'true');
  Object.assign(_canvas.style, {
    position: 'fixed', left: '0', top: '0', width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: '99999',
  });
  (document.body || document.documentElement).appendChild(_canvas);
  _ctx = _canvas.getContext('2d');
  _resize();
  window.addEventListener('resize', _resize);
}
function _cleanup() {
  if (_raf) cancelAnimationFrame(_raf);
  _raf = 0;
  try { window.removeEventListener('resize', _resize); } catch (e) {}
  if (_canvas) { try { _canvas.remove(); } catch (e) {} }
  _canvas = null; _ctx = null; _particles = [];
}
function _spawn(count, ox, oy, spread, power) {
  const W = window.innerWidth, H = window.innerHeight;
  const x0 = (ox == null) ? W / 2 : ox;
  const y0 = (oy == null) ? H * 0.34 : oy;
  for (let i = 0; i < count; i++) {
    const angle = (-Math.PI / 2) + (Math.random() - 0.5) * spread;
    const speed = power * (0.55 + Math.random() * 0.9);
    _particles.push({
      x: x0, y: y0,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      g: 0.16 + Math.random() * 0.12,
      size: 6 + Math.random() * 7,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.34,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      life: 1, decay: 0.007 + Math.random() * 0.009,
      shape: Math.random() < 0.5 ? 'rect' : 'circle',
    });
  }
}
function _tick() {
  if (!_ctx) return;
  const W = window.innerWidth, H = window.innerHeight;
  _ctx.clearRect(0, 0, W, H);
  for (const p of _particles) {
    p.vy += p.g; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= p.decay;
    _ctx.save();
    _ctx.globalAlpha = Math.max(0, p.life);
    _ctx.translate(p.x, p.y); _ctx.rotate(p.rot);
    _ctx.fillStyle = p.color;
    if (p.shape === 'rect') _ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    else { _ctx.beginPath(); _ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); _ctx.fill(); }
    _ctx.restore();
  }
  _particles = _particles.filter((p) => p.life > 0 && p.y < H + 50);
  if (_particles.length) _raf = requestAnimationFrame(_tick);
  else _cleanup();
}

/**
 * 한 번 분사. @param {{count?:number,x?:number,y?:number,spread?:number,power?:number}} [opts]
 * 브라우저에서만 동작(Node 안전 no-op). 호출되면 window.__fmkConfettiCount 를 증가(테스트/연동 확인용).
 */
export function fire(opts = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return; // Node/SSR 안전
  try { window.__fmkConfettiCount = (window.__fmkConfettiCount || 0) + 1; } catch (e) {}
  if (_reduce()) return; // 모션 줄이기 → 시각효과 생략(카운터는 이미 증가 → '호출됨' 보장)
  _ensureCanvas();
  _spawn(opts.count || 80, opts.x, opts.y, opts.spread || 1.3, opts.power || 11);
  if (!_raf && _ctx) _raf = requestAnimationFrame(_tick);
}

/** 큰 축하(게임 클리어 / 칭찬 도장 해금) — 가운데 + 좌/우에서 약간의 시차로 터지는 멀티 버스트. */
export function celebrate() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return; // Node 안전
  const W = window.innerWidth || 800;
  fire({ count: 80, x: W * 0.5, spread: 1.5, power: 12 });
  setTimeout(() => fire({ count: 48, x: W * 0.18, spread: 1.0, power: 13 }), 130);
  setTimeout(() => fire({ count: 48, x: W * 0.82, spread: 1.0, power: 13 }), 230);
}
