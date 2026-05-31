/* ===================================================================
   틀린그림찾기 (Spot the Difference) — 한 장의 사진 기반
   -------------------------------------------------------------------
   · 같은 이미지를 두 Canvas(A=원본, B=변형)에 그리고, B 에만 국소 변형을 N군데 생성.
     변형: recolor(부위 색 바꿈) · erase(주변 복제로 지움) · flip(부위 좌우 뒤집기) · sticker(B에만 등장).
   · 이미지/난이도/변형 스펙·탭 판정은 ./spot-logic.js (순수·테스트 가능).
   · 두 그림 중 어디를 눌러도 됨 → 정규화 좌표로 가장 가까운 미발견 변형 판정.
   · 이미지 로드 실패(오프라인 등)면 그라데이션+이모지 폴백 장면을 그려 그대로 플레이.
   · 점수/기록/업적은 공통 저장소(shared/fmk-store.js)에 통합 저장(payload 호환 유지).
   =================================================================== */
import { recordPlay, getGameStats } from '../../shared/fmk-store.js'
import { celebrate } from '../../shared/fmk-confetti.js'
import { awardPassportStamp } from '../../shared/fmk-store.js' // 여권 스탬프 지급
import { dropStamp } from '../../shared/fmk-stamp.js' // 여권 스탬프 '쾅!' 획득 연출
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

  // ---------- B 캔버스에 변형 적용 ----------
  function applyDiffs(ctx, W, H) {
    const minWH = Math.min(W, H);
    for (const d of diffs) {
      const cx = d.cx * W, cy = d.cy * H, R = d.r * minWH;
      if (d.kind === 'recolor') {
        // 'color' 합성 → 디테일(명암) 유지하며 색만 바꿈(필터 미지원 브라우저에서도 동작)
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
        ctx.globalCompositeOperation = 'color';
        ctx.fillStyle = `hsl(${d.hue}, 78%, 55%)`;
        ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
        ctx.restore();
      } else if (d.kind === 'erase') {
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
        drawScene(ctx, W, H, d.sxOff * W, d.syOff * H); // 주변 픽셀 복제로 덮기
        ctx.restore();
      } else if (d.kind === 'flip') {
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
        ctx.translate(cx * 2, 0); ctx.scale(-1, 1); // 영역 중심 기준 좌우 반전
        drawScene(ctx, W, H);
        ctx.restore();
      } else if (d.kind === 'sticker') {
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = (R * 1.7) + 'px ' + EMOJI_FONT;
        ctx.fillText(d.emoji, cx, cy);
        ctx.restore();
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
    if (withDiffs) applyDiffs(ctx, cssW, cssH);
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
    imgTitle = spec.title;
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
    probe.src = spec.src;

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
