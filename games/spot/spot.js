/* ===================================================================
   틀린그림찾기 (Spot the Difference) — 한 장의 사진 기반
   -------------------------------------------------------------------
   · 같은 이미지를 두 Canvas(A=원본, B=변형)에 그리고, B 에만 '자연스러운 변형'을 N군데 생성.
     변형(부자연스러운 왜곡 제거): hueshift(색조만 자연스럽게) · flip(좌우 반전) · decal(작은 자연 요소 합성). 모두 경계 페더링.
   · 📸 내가 찍은 사진(카메라/갤러리)도 장면으로 사용 가능(fmk-photoinput, 1024px 리사이즈).
   · 이미지/난이도/변형 스펙·탭 판정은 ./spot-logic.js (순수·테스트 가능).
   · 두 그림 중 어디를 눌러도 됨 → 정규화 좌표로 가장 가까운 미발견 변형 판정.
   · 이미지 로드 실패(오프라인 등)면 그라데이션+이모지 폴백 장면을 그려 그대로 플레이.
   · 점수/기록/업적은 공통 저장소(shared/fmk-store.js)에 통합 저장(payload 호환 유지).
   =================================================================== */
import { recordPlay, getGameStats } from '../../shared/fmk-store.js'
import { celebrate } from '../../shared/fmk-confetti.js'
import { awardPassportStamp } from '../../shared/fmk-store.js' // 여권 스탬프 지급
import { dropStamp } from '../../shared/fmk-stamp.js' // 여권 스탬프 '쾅!' 획득 연출
import { openPhotoPicker } from '../../shared/fmk-photoinput.js' // 📸 내가 찍은 사진으로
import { installCrashGuard, registerServiceWorker } from '../../shared/fmk-guard.js'
import { installGameGuard } from '../../shared/fmk-screentime.js'
import { DIFFS, buildDifferences, hitTest, pickSpotImage } from './spot-logic.js'
import * as sfx from '../../shared/fmk-sound.js'

installCrashGuard({ homeHref: '../../index.html' }) // 하얀 화면 방지 → 런처 복구
registerServiceWorker('../../sw.js')                // 오프라인 캐싱(운영 빌드)
sfx.armBGM('lively')                                // 첫 제스처에 경쾌한 게임 BGM 루프
installGameGuard({ homeHref: '../../index.html' })  // 스크린 타임: 초과 시 잠금

;(() => {
  'use strict';

  // ---------- DOM ----------
  const board = document.getElementById('board');
  const stageA = document.getElementById('stageA');
  const stageB = document.getElementById('stageB');
  const canvasA = document.getElementById('canvasA');
  const canvasB = document.getElementById('canvasB');
  const marksA = document.getElementById('marksA');
  const marksB = document.getElementById('marksB');
  const timeValue = document.getElementById('timeValue');
  const foundValue = document.getElementById('foundValue');
  const comboPill = document.getElementById('comboPill');
  const comboValue = document.getElementById('comboValue');
  const timePill = document.getElementById('timePill');
  const btnHint = document.getElementById('btnHint');
  const toast = document.getElementById('toast');

  const startScreen = document.getElementById('startScreen');
  const overScreen = document.getElementById('overScreen');
  const overEmoji = document.getElementById('overEmoji');
  const overTitle = document.getElementById('overTitle');
  const overMsg = document.getElementById('overMsg');
  const finalScoreEl = document.getElementById('finalScore');
  const bestScoreEl = document.getElementById('bestScore');
  const newAchievesEl = document.getElementById('newAchieves');

  const btnEasy = document.getElementById('btnEasy');
  const btnNormal = document.getElementById('btnNormal');
  const btnHard = document.getElementById('btnHard');
  const btnRetry = document.getElementById('btnRetry');
  const btnChangeDiff = document.getElementById('btnChangeDiff');

  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  const choice = (arr) => arr[(Math.random() * arr.length) | 0];
  function loadBest() { return getGameStats('spot').bestScore || 0; }

  // ---------- 게임 상태 ----------
  let state = 'start';       // 'start' | 'playing' | 'over'
  let diff = DIFFS[1];
  let lastLevel = 1;
  let diffs = [];            // 변형 스펙 배열(spot-logic)
  let foundSet = new Set();
  let markedIds = new Set(); // 이미 마커(동그라미)를 그린 정답 id — 재터치 시 애니메이션 반복 방어
  let imgTitle = '';
  let loadedImg = null;      // 로드된 Image(실패 시 null → 폴백)
  let _customSpotUrl = null; // 📸 내가 찍은 사진(리사이즈된 objectURL)
  let _customSpotPhoto = null; // { url, revoke } — 교체/언마운트 시 revoke
  let imgAspect = 1;         // 캔버스 종횡비(이미지 종횡비)
  let fbBg = ['#ffe3b0', '#ff9d3a'];
  let fbObjects = [];        // 폴백 장면 오브젝트(라운드 내 고정)
  let timeLeft = 0;
  let combo = 0;
  let maxCombo = 0;
  let hintUsed = false;
  let ticking = false;
  let lastTick = 0;
  let ended = false;
  let toastTimer = 0;

  // ---------- 폴백 장면(이미지 로드 실패 시) ----------
  function buildFallbackObjects(spec, diffSpecs) {
    const set = ['⭐', '🌸', '🍎', '🎈', '🐶', '🐱', '🌟', '🍀', '🦋', '🌈', '🚗', '🏠', spec.fallbackEmoji];
    fbObjects = [];
    const cols = 5, rows = 4;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        fbObjects.push({
          e: choice(set),
          x: (c + 0.5 + (Math.random() - 0.5) * 0.4) / cols,
          y: (r + 0.5 + (Math.random() - 0.5) * 0.4) / rows,
          s: 0.07 + Math.random() * 0.03,
        });
      }
    }
    // 폴백 장면에서도 모든 변형이 반드시 보이도록, 각 변형 중심에 '확실히 존재하는' 오브젝트를 하나씩 둔다.
    // (특히 erase 는 평탄한 그라데이션 위에선 주변 복제가 동일해 안 보일 수 있음 → 중심 오브젝트가 이동하며 차이 발생)
    for (const d of (diffSpecs || [])) {
      fbObjects.push({ e: choice(set), x: d.cx, y: d.cy, s: 0.085 });
    }
  }

  // ---------- 장면 그리기(이미지 또는 폴백). offX/offY = erase 용 소스 오프셋 ----------
  function drawScene(ctx, W, H, offX, offY) {
    offX = offX || 0; offY = offY || 0;
    if (loadedImg) {
      ctx.drawImage(loadedImg, offX, offY, W, H);
    } else {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, fbBg[0]); g.addColorStop(1, fbBg[1] || fbBg[0]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const minWH = Math.min(W, H);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const o of fbObjects) {
        ctx.font = (o.s * minWH) + 'px ' + EMOJI_FONT;
        ctx.fillText(o.e, o.x * W + offX, o.y * H + offY);
      }
    }
  }

  // ---------- 자연스러운 변형 합성 헬퍼 ----------
  // 변형된 '전체 장면'을 임시 캔버스에 그린 뒤, 부드러운 원형 알파 마스크로 영역만 페더링 합성한다
  // (딱딱한 원형 clip 대신 가장자리를 부드럽게 → 경계가 티 안 남).
  function featherComposite(ctx, W, H, cx, cy, R, dpr, renderFn) {
    const d = dpr || 1;
    const tmp = document.createElement('canvas');
    tmp.width = Math.max(1, Math.round(W * d)); tmp.height = Math.max(1, Math.round(H * d)); // 디바이스 해상도(HiDPI 선명)
    const t = tmp.getContext('2d');
    if (!t) return;
    t.setTransform(d, 0, 0, d, 0, 0); // 이후 CSS 좌표(cx,cy,R,W,H) 그대로 사용
    renderFn(t);
    t.globalCompositeOperation = 'destination-in';
    const g = t.createRadialGradient(cx, cy, Math.max(1, R * 0.5), cx, cy, R * 1.18);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.72, 'rgba(0,0,0,0.9)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    t.fillStyle = g; t.fillRect(0, 0, W, H);
    ctx.drawImage(tmp, 0, 0, W, H); // ctx 는 dpr 스케일 → device px 1:1 매핑(선명)
  }
  // 변형 자리의 배경 밝기(0~255) — decal 색을 배경에 맞춰 고르기 위해. tainted/실패 시 중간값.
  function avgBrightness(ctx, cx, cy, dpr) {
    try {
      const x = Math.max(0, Math.round(cx * dpr)), y = Math.max(0, Math.round(cy * dpr));
      const d = ctx.getImageData(x, y, 1, 1).data;
      return 0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2];
    } catch (e) { return 150; }
  }
  // 원본에 없던 작은 자연 요소(새/구름/나뭇잎/별)를 Canvas 도형으로 그림 — 외부 에셋 없음, 주변 밝기 매칭.
  function drawDecal(ctx, kind, cx, cy, R, bright) {
    const light = bright < 130;
    const col = light ? 'rgba(255,255,255,0.92)' : 'rgba(70,70,82,0.9)';
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = col; ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(2, R * 0.16); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.shadowColor = light ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.35)';
    ctx.shadowBlur = R * 0.4;
    const s = R;
    if (kind === 'bird') {
      ctx.beginPath();
      ctx.arc(-s * 0.42, 0, s * 0.5, -0.12 * Math.PI, -0.88 * Math.PI, true);
      ctx.arc(s * 0.42, 0, s * 0.5, -0.12 * Math.PI, -0.88 * Math.PI, true);
      ctx.stroke();
    } else if (kind === 'cloud') {
      ctx.beginPath();
      ctx.arc(-s * 0.45, s * 0.12, s * 0.48, 0, Math.PI * 2);
      ctx.arc(s * 0.02, -s * 0.18, s * 0.6, 0, Math.PI * 2);
      ctx.arc(s * 0.55, s * 0.12, s * 0.44, 0, Math.PI * 2);
      ctx.rect(-s * 0.5, s * 0.12, s * 1.1, s * 0.46);
      ctx.fill();
    } else if (kind === 'leaf') {
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.4, s * 0.75, Math.PI / 5, 0, Math.PI * 2);
      ctx.fill();
    } else { // star
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
        const a2 = a + Math.PI / 5;
        ctx.lineTo(Math.cos(a) * s * 0.8, Math.sin(a) * s * 0.8);
        ctx.lineTo(Math.cos(a2) * s * 0.34, Math.sin(a2) * s * 0.34);
      }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // ---------- B 캔버스에 자연스러운 변형 적용 ----------
  function applyDiffs(ctx, W, H, dpr) {
    const minWH = Math.min(W, H);
    for (const d of diffs) {
      const cx = d.cx * W, cy = d.cy * H, R = d.r * minWH;
      if (d.kind === 'hueshift') {
        // 색조만 자연스럽게 변경(명암/디테일 유지) + 경계 페더링
        featherComposite(ctx, W, H, cx, cy, R, dpr, (t) => {
          if ('filter' in t) { t.filter = 'hue-rotate(' + d.hue + 'deg) saturate(1.2)'; drawScene(t, W, H); t.filter = 'none'; }
          else { drawScene(t, W, H); t.globalCompositeOperation = 'color'; t.fillStyle = 'hsl(' + d.hue + ',75%,55%)'; t.fillRect(0, 0, W, H); }
        });
      } else if (d.kind === 'flip') {
        // 영역 중심 기준 좌우 반전 + 경계 페더링
        featherComposite(ctx, W, H, cx, cy, R, dpr, (t) => {
          t.save(); t.translate(cx * 2, 0); t.scale(-1, 1); drawScene(t, W, H); t.restore();
        });
      } else if (d.kind === 'decal') {
        // 원본에 없던 작은 요소를 주변 밝기에 맞춰 은은하게 합성
        drawDecal(ctx, d.decal, cx, cy, R, avgBrightness(ctx, cx, cy, dpr || 1));
      }
    }
  }

  // ---------- 캔버스 크기 맞추고 그리기 ----------
  function sizeAndDraw(canvas, stage, withDiffs) {
    const rect = stage.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    drawScene(ctx, cssW, cssH);
    if (withDiffs) applyDiffs(ctx, cssW, cssH, dpr);
  }

  function render() {
    stageA.style.setProperty('--ar', imgAspect);
    stageB.style.setProperty('--ar', imgAspect);
    // 레이아웃(aspect-ratio) 반영 후 측정/그리기
    requestAnimationFrame(() => {
      sizeAndDraw(canvasA, stageA, false);
      sizeAndDraw(canvasB, stageB, true);
    });
  }

  // ---------- 마커(찾음 ⭕ / 힌트 👀) — 캔버스 위 오버레이에 % 좌표로 배치 ----------
  function clearMarks() { marksA.innerHTML = ''; marksB.innerHTML = ''; }
  // 크레파스로 슥— 그린 듯한 동그라미: SVG 원을 stroke-dasharray 로 '그려지는' 애니메이션.
  // (딱딱한 ⭕ 이모지 대신 따뜻한 노란/화이트 반투명 stroke + 부드러운 빛 번짐)
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function placeMark(layer, nx, ny, cls) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'spot-mark ' + (cls || '')); // SVG 는 className 직접대입 불가 → setAttribute
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.left = (nx * 100) + '%';
    svg.style.top = (ny * 100) + '%';
    const ring = document.createElementNS(SVG_NS, 'circle');
    ring.setAttribute('class', 'spot-ring');
    ring.setAttribute('cx', '50');
    ring.setAttribute('cy', '50');
    ring.setAttribute('r', '38'); // 둘레 ≈ 239 → CSS stroke-dasharray/offset 239
    svg.appendChild(ring);
    layer.appendChild(svg);
    return svg;
  }
  function markFound(d) {
    if (markedIds.has(d.id)) return; // 이미 그린 정답이면 마커/애니메이션을 다시 만들지 않음(반복 방어)
    markedIds.add(d.id);
    placeMark(marksA, d.cx, d.cy, 'is-found');
    placeMark(marksB, d.cx, d.cy, 'is-found');
  }

  // ---------- 입력(두 그림 어디든 탭) ----------
  function onStageTap(e) {
    if (state !== 'playing') return;
    e.preventDefault();
    const stage = e.currentTarget;
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const tx = (e.clientX - rect.left) / rect.width;
    const ty = (e.clientY - rect.top) / rect.height;
    if (tx < 0 || tx > 1 || ty < 0 || ty > 1) return;

    const d = hitTest(diffs, foundSet, tx, ty);
    if (d) {
      foundSet.add(d.id);
      combo += 1;
      maxCombo = Math.max(maxCombo, combo);
      markFound(d);
      sfx.correct();
      updateHud();
      if (combo >= 2) showToast('🔥 ' + combo + ' 콤보!', 'combo');
      else showToast(choice(['좋아! 👍', '찾았다! ⭕', '예리해! 👀']), 'good');
      if (foundSet.size >= diffs.length) win();
    } else {
      combo = 0;
      sfx.wrong();
      updateHud();
      shakeStage(stage);
    }
  }
  function shakeStage(stage) {
    stage.classList.remove('is-wrong');
    void stage.offsetWidth;
    stage.classList.add('is-wrong');
    // 모션 줄이기면 stage-shake 가 안 돌아 animationend 가 안 옴 → 리스너 누적 방지: 즉시 해제하고 끝.
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      stage.classList.remove('is-wrong');
      stage.removeEventListener('animationend', clear);
      clearTimeout(timer);
    };
    const clear = (ev) => {
      // 자식 마커(.spot-ring)의 animationend 가 버블링되어 흔들림을 일찍 끊지 않도록 가드
      if (ev.target !== stage || ev.animationName !== 'stage-shake') return;
      finish();
    };
    let reduce = false;
    try { reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    if (reduce) { stage.classList.remove('is-wrong'); return; } // 애니메이션 없음 → 리스너 달지 않음
    stage.addEventListener('animationend', clear);
    const timer = setTimeout(finish, 600); // animationend 누락 대비 안전 폴백(리스너 확실히 정리)
  }

  // ---------- 힌트 ----------
  function useHint() {
    if (state !== 'playing') return;
    const remaining = diffs.filter((d) => !foundSet.has(d.id));
    if (!remaining.length) return;
    hintUsed = true;
    btnHint.classList.add('is-used');
    const d = choice(remaining);
    const m1 = placeMark(marksA, d.cx, d.cy, 'is-hint');
    const m2 = placeMark(marksB, d.cx, d.cy, 'is-hint');
    showToast('여기 근처를 잘 봐! 💡', 'hint');
    window.setTimeout(() => { m1.remove(); m2.remove(); }, 2200);
  }

  // ---------- HUD ----------
  function updateHud() {
    timeValue.textContent = Math.ceil(timeLeft);
    foundValue.textContent = foundSet.size + '/' + diffs.length;
    if (combo >= 2) { comboPill.classList.remove('is-hidden'); comboValue.textContent = combo; }
    else { comboPill.classList.add('is-hidden'); }
    timePill.classList.toggle('is-low', timeLeft <= 10);
  }

  // ---------- 토스트 ----------
  function showToast(text, kind, dur) {
    toast.textContent = text;
    toast.className = 'spot-toast is-show' + (kind ? ' spot-toast--' + kind : '');
    toastTimer = dur || 0.9;
  }

  // ---------- 카운트다운 루프 ----------
  function tick(now) {
    if (!ticking) return;
    let dt = (now - lastTick) / 1000;
    lastTick = now;
    if (!isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.25);

    if (state === 'playing') {
      timeLeft -= dt;
      if (timeLeft <= 0) { timeLeft = 0; updateHud(); timeUp(); return; }
      timeValue.textContent = Math.ceil(timeLeft);
      timePill.classList.toggle('is-low', timeLeft <= 10);
    }
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) toast.classList.remove('is-show');
    }
    requestAnimationFrame(tick);
  }

  // ---------- 점수 ----------
  function computeScore() {
    const timeBonus = Math.round(timeLeft) * 10;
    const comboBonus = maxCombo * 15;
    const clearBonus = (foundSet.size >= diffs.length) ? 50 : 0;
    return Math.max(0, timeBonus + comboBonus + clearBonus);
  }

  // ---------- 라운드 시작 ----------
  function startGame(levelKey) {
    diff = DIFFS[levelKey] || DIFFS[1];
    lastLevel = diff.level;
    combo = 0; maxCombo = 0; hintUsed = false; ended = false;
    timeLeft = diff.time;
    btnHint.classList.remove('is-used');
    foundSet = new Set();
    markedIds = new Set(); // 새 라운드 → 마커 그림 기록 초기화
    clearMarks();

    const spec = pickSpotImage();
    imgTitle = _customSpotUrl ? '내 사진' : spec.title; // 📸 내가 찍은 사진이면 그걸로
    fbBg = spec.bg;
    diffs = buildDifferences(diff);
    buildFallbackObjects(spec, diffs); // 로드 실패 대비 폴백 장면(모든 변형이 보이도록 중심 오브젝트 포함)

    // 이미지 로드(crossOrigin 미설정 — drawImage 표시만 하므로 taint 무관). 실패/지연 시 폴백.
    loadedImg = null;
    imgAspect = 1;
    let done = false;
    const probe = new Image();
    const finish = (img) => {
      if (done) return; done = true;
      loadedImg = img;
      imgAspect = img && img.naturalWidth ? (img.naturalWidth / img.naturalHeight) : 1;
      render();
    };
    probe.onload = () => finish(probe.naturalWidth > 0 ? probe : null);
    probe.onerror = () => finish(null);
    window.setTimeout(() => finish(null), 6000);
    probe.src = _customSpotUrl || spec.src; // 커스텀 사진 우선

    startScreen.classList.remove('is-open');
    overScreen.classList.remove('is-open');
    board.setAttribute('aria-hidden', 'false');
    board.classList.add('is-active');

    render();        // 폴백/대기 동안에도 즉시 한 번 그림(로드되면 finish 에서 재렌더)
    updateHud();
    sfx.resume();

    state = 'playing';
    ticking = true;
    lastTick = performance.now();
    requestAnimationFrame(tick);

    showToast(`${imgTitle} — 다른 곳 ${diff.diffs}군데! 🔍`, 'hint', 2.6);
  }

  // ---------- 승리 / 시간초과 ----------
  function win() {
    if (ended) return;
    ended = true; state = 'over'; ticking = false;

    const score = computeScore();
    const payload = { score: score, level: diff.level };
    if (!hintUsed) payload.noHintLevel = diff.level; // 힌트 없이 클리어 → 돋보기 탐정 후보
    const res = recordPlay('spot', payload);
    if (diff.level >= 3) sfx.fanfare(); else sfx.win();

    overEmoji.textContent = hintUsed ? '🎉' : (diff.level >= 2 ? '🏆' : '🌟');
    overTitle.textContent = '우와! 다 찾았다!';
    overMsg.innerHTML = '대단한 눈썰미야! 🔍✨';
    showResult(score, res && res.newlyUnlocked);
    celebrate(); // 성공! 화면 전체 폭죽 — 시간초과(timeUp)에는 호출하지 않음
    const award = awardPassportStamp(); if (award) dropStamp(award); // 여권 스탬프 '쾅!'
  }

  function timeUp() {
    if (ended) return;
    ended = true; state = 'over'; ticking = false;

    const score = computeScore();
    const res = recordPlay('spot', { score: score, level: diff.level }); // 실패도 플레이 횟수 누적(1회)

    overEmoji.textContent = '⏰';
    overTitle.textContent = '시간 초과!';
    overMsg.innerHTML = '다시 해볼까? 거의 다 왔어! 💪';
    showResult(score, res && res.newlyUnlocked);
  }

  function showResult(score, newlyUnlocked) {
    board.classList.remove('is-active');
    finalScoreEl.textContent = score;
    bestScoreEl.textContent = getGameStats('spot').bestScore || Math.max(loadBest(), score);
    showNewAchievements(newlyUnlocked);
    overScreen.classList.add('is-open');
  }

  function showNewAchievements(list) {
    if (!newAchievesEl) return;
    if (!list || !list.length) { newAchievesEl.innerHTML = ''; newAchievesEl.classList.add('is-hidden'); return; }
    newAchievesEl.classList.remove('is-hidden');
    newAchievesEl.innerHTML =
      '<div class="na-title">새 칭찬 도장! 🎉</div>' +
      list.map((a) => '<div class="na-item"><span class="na-icon">' + a.icon + '</span><span class="na-name">' + a.title + '</span></div>').join('');
  }

  function goStart() {
    state = 'start'; ticking = false; ended = false;
    overScreen.classList.remove('is-open');
    board.classList.remove('is-active');
    board.setAttribute('aria-hidden', 'true');
    startScreen.classList.add('is-open');
  }

  // ---------- 리사이즈(재렌더) ----------
  let resizeTimer = 0;
  function onResize() {
    if (state !== 'playing') return;
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(render, 120);
  }

  // ---------- 초기화/입력 ----------
  function init() {
    bestScoreEl.textContent = loadBest();

    btnEasy.addEventListener('click', () => startGame(1));
    btnNormal.addEventListener('click', () => startGame(2));
    btnHard.addEventListener('click', () => startGame(3));
    btnHint.addEventListener('click', useHint);
    btnRetry.addEventListener('click', () => startGame(lastLevel));
    btnChangeDiff.addEventListener('click', goStart);

    // 📸 내가 찍은 사진으로 — 사진 고른 뒤 난이도를 누르면 그 사진으로 플레이
    const btnPhotoSpot = document.getElementById('btnPhotoSpot');
    const photoSpotState = document.getElementById('photoSpotState');
    if (btnPhotoSpot) btnPhotoSpot.addEventListener('click', () => {
      sfx.pop();
      openPhotoPicker({
        maxSize: 1024,
        onReady: (r) => {
          if (_customSpotPhoto) { try { _customSpotPhoto.revoke() } catch (e) {} } // 이전 사진 해제(누수 방지)
          _customSpotPhoto = r; _customSpotUrl = r.url;
          if (photoSpotState) photoSpotState.textContent = '✓ 난이도 골라요!';
          btnPhotoSpot.classList.add('is-used');
        },
        onError: () => {}, // 취소/실패 → 무시
      });
    });
    // 언마운트(페이지 이탈) 시 카메라 사진 objectURL 해제(메모리 누수 방지)
    window.addEventListener('pagehide', () => { if (_customSpotPhoto) { try { _customSpotPhoto.revoke() } catch (e) {} _customSpotPhoto = null; _customSpotUrl = null; } });

    stageA.addEventListener('pointerdown', onStageTap);
    stageB.addEventListener('pointerdown', onStageTap);

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && ticking) lastTick = performance.now();
    });

    window.addEventListener('keydown', (e) => {
      if (state === 'start') {
        if (e.key === '1') startGame(1);
        else if (e.key === '2') startGame(2);
        else if (e.key === '3') startGame(3);
      } else if (state === 'playing') {
        if (e.key === 'h' || e.key === 'H') useHint();
      } else if (state === 'over') {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startGame(lastLevel); }
      }
    });
  }

  init();
})();
