/* ===================================================================
   동화책 미로 탈출 (Storybook Maze Escape)
   -------------------------------------------------------------------
   · 좌상단 출발(🐱) → 우하단 도착(🐟) 으로 이동하면 탈출 성공.
   · 난이도 6단계: 🐣3×3 / 🐥5×5 / 🦄7×7 / 👑9×9 / 🌋13×13 / 🌌17×17 (level 1~6)
   · 미로 생성/난이도/별 배치는 ./maze-logic.js (순수·테스트 가능)
   · 조작: 키보드 ↑↓←→ / 스와이프 / 가상 D-패드. 셀 사이를 Lerp 로 부드럽게 글라이드.
   · 이동 중 입력은 큐에 쌓여 자연스럽게 연결됨(연속 이동/방향 전환).
   · 도착 시 recordPlay('maze', { timeMs, level, stars }) 를 정확히 1회 호출.
   =================================================================== */
import { recordPlay } from '../../shared/fmk-store.js'
import { celebrate } from '../../shared/fmk-confetti.js'
import { installCrashGuard, registerServiceWorker } from '../../shared/fmk-guard.js'
import { installGameGuard } from '../../shared/fmk-screentime.js'
import { N, E, S, W, DX, DY, LEVELS, buildMaze, placeStars } from './maze-logic.js'
import * as sfx from '../../shared/fmk-sound.js'

installCrashGuard({ homeHref: '../../index.html' }) // 하얀 화면 방지 → 런처 복구
registerServiceWorker('../../sw.js')                // 오프라인 캐싱(운영 빌드)
sfx.armBGM('lively')                                // 첫 제스처에 경쾌한 게임 BGM 루프
installGameGuard({ homeHref: '../../index.html' })  // 스크린 타임: 초과 시 잠금

;(() => {
  'use strict';

  // ---------- DOM ----------
  const canvas = document.getElementById('maze');
  const ctx = canvas.getContext('2d');
  const hud = document.getElementById('hud');
  const dpad = document.getElementById('dpad');
  const lvIcon = document.getElementById('lvIcon');
  const lvLabel = document.getElementById('lvLabel');
  const timeLabel = document.getElementById('timeLabel');
  const starLabel = document.getElementById('starLabel');
  const startScreen = document.getElementById('startScreen');
  const winScreen = document.getElementById('winScreen');
  const winTimeEl = document.getElementById('winTime');
  const winStarsEl = document.getElementById('winStars');
  const newAchievesEl = document.getElementById('newAchieves');
  const btnReplay = document.getElementById('btnReplay');
  const btnChoose = document.getElementById('btnChoose');

  // ---------- 유틸 ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  function fmtTime(ms) {
    const t = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(t / 60);
    const s = t % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  // ---------- 게임 상태 ----------
  let state = 'start';        // 'start' | 'playing' | 'win'
  let level = 2;
  let cols = 5, rows = 5;
  let grid = [];
  let stars = [];
  let starsGot = 0;
  let cat = { cx: 0, cy: 0 };
  let catPix = { x: 0, y: 0 };   // 보간 중인 픽셀 위치
  let catTarget = { x: 0, y: 0 };
  let moving = false;
  let queuedDir = 0;             // 이동 중 들어온 다음 입력(큐)

  let startedAt = 0;
  let elapsedMs = 0;
  let finishedMs = 0;
  let recorded = false;

  const MOVE_DUR = 0.14;         // 한 칸 글라이드 시간(초) — 부드럽게

  // ---------- 화면 크기 / DPR ----------
  let dpr = 1;
  let board = { px: 0, py: 0, size: 0, cell: 0 };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const Wp = window.innerWidth;
    const Hp = window.innerHeight;

    const marginTop = clamp(Hp * 0.09, 64, 110);
    const marginBottom = clamp(Hp * 0.16, 120, 220);
    const availH = Hp - marginTop - marginBottom;
    const availW = Wp - clamp(Wp * 0.06, 16, 48) * 2;

    // 큰 미로(13×13·17×17)도 화면 밖으로 안 나가도록: 가용 영역에 꽉 맞추고 셀을 동적 축소.
    let size = Math.max(1, Math.min(availW, availH));
    // 큰 태블릿/PC 에서 보드가 지나치게 커지지 않도록 상한선(600px). board.px/py 가 중앙 정렬을 유지.
    size = Math.min(size, 600);
    const cell = Math.max(1, Math.floor(size / cols));
    size = cell * cols;

    board.cell = cell;
    board.size = size;
    board.px = Math.round((Wp - size) / 2);
    board.py = Math.round(marginTop + (availH - size) / 2);

    canvas.width = Math.round(Wp * dpr);
    canvas.height = Math.round(Hp * dpr);
    canvas.style.width = Wp + 'px';
    canvas.style.height = Hp + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!moving) {
      catPix = cellCenter(cat.cx, cat.cy);
      catTarget = { x: catPix.x, y: catPix.y };
    } else {
      // 리사이즈/회전 중 진행 중인 이동: 좌표계 불일치로 인한 슬라이드 점프 방지 위해
      // 목적지 칸으로 즉시 스냅(고양이는 논리적으로 이미 목적 칸에 있음).
      catTarget = cellCenter(cat.cx, cat.cy);
      catPix = { x: catTarget.x, y: catTarget.y };
      moving = false;
      if (reachedGoal()) win();
      else if (queuedDir) { const d = queuedDir; queuedDir = 0; startMove(d); }
    }
  }

  function cellCenter(cx, cy) {
    return {
      x: board.px + cx * board.cell + board.cell / 2,
      y: board.py + cy * board.cell + board.cell / 2,
    };
  }

  // ---------- 시작 / 리셋 ----------
  function startGame(lv) {
    level = lv;
    const def = LEVELS[lv] || LEVELS[2];
    cols = rows = def.size;
    lvIcon.textContent = def.icon;
    lvLabel.textContent = def.name;

    grid = buildMaze(cols, rows);
    stars = placeStars(cols, rows, def.stars);
    starsGot = 0;

    cat.cx = 0; cat.cy = 0;
    moving = false;
    queuedDir = 0;
    startedAt = 0;
    elapsedMs = 0;
    finishedMs = 0;
    recorded = false;

    resize();
    catPix = cellCenter(0, 0);
    catTarget = { x: catPix.x, y: catPix.y };

    updateHud();

    state = 'playing';
    startScreen.classList.remove('is-open');
    winScreen.classList.remove('is-open');
    hud.classList.remove('is-hidden'); hud.setAttribute('aria-hidden', 'false');
    dpad.classList.remove('is-hidden'); dpad.setAttribute('aria-hidden', 'false');
  }

  function backToChoose() {
    state = 'start';
    queuedDir = 0;
    hud.classList.add('is-hidden'); hud.setAttribute('aria-hidden', 'true');
    dpad.classList.add('is-hidden'); dpad.setAttribute('aria-hidden', 'true');
    winScreen.classList.remove('is-open');
    startScreen.classList.add('is-open');
  }

  function updateHud() {
    timeLabel.textContent = fmtTime(elapsedMs);
    starLabel.textContent = String(starsGot);
  }

  // ---------- 이동 (Lerp 글라이드 + 입력 큐) ----------
  // 즉시 한 칸 이동 시작(벽/경계 검사 통과 시). 성공하면 true.
  function startMove(dir) {
    if (state !== 'playing') return false;
    const idx = cat.cy * cols + cat.cx;
    if (grid[idx] & dir) return false;            // 그 방향에 벽
    const nx = cat.cx + DX[dir];
    const ny = cat.cy + DY[dir];
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return false;

    if (startedAt === 0) startedAt = performance.now(); // 첫 이동에 타이머 시작

    cat.cx = nx;
    cat.cy = ny;
    catTarget = cellCenter(nx, ny);
    moving = true;

    for (const s of stars) {
      if (!s.got && s.x === nx && s.y === ny) {
        s.got = true; starsGot++; burst(catTarget.x, catTarget.y); sfx.star(); updateHud();
      }
    }
    return true;
  }

  // 입력 진입점: 이동 중이면 큐에 쌓아 자연스럽게 연결, 아니면 즉시 이동.
  function requestMove(dir) {
    if (state !== 'playing') return;
    if (moving) { queuedDir = dir; return; }
    startMove(dir);
  }

  function reachedGoal() {
    return cat.cx === cols - 1 && cat.cy === rows - 1;
  }

  function win() {
    if (state !== 'playing') return;
    state = 'win';
    queuedDir = 0;
    // 최고 난이도(불타는·우주 미로)는 웅장한 팡파레, 그 외엔 산뜻한 클리어 징글
    if (level >= 5) sfx.fanfare(); else sfx.win();
    finishedMs = startedAt ? (performance.now() - startedAt) : 0;
    elapsedMs = finishedMs;

    let res = null;
    if (!recorded) {
      recorded = true;
      res = recordPlay('maze', { timeMs: Math.max(1, Math.round(finishedMs)), level: level, stars: starsGot });
    }

    winTimeEl.textContent = fmtTime(finishedMs);
    winStarsEl.textContent = '⭐ ' + starsGot;
    showNewAchievements(res && res.newlyUnlocked);

    confetti();
    celebrate(); // 미로 탈출 성공! 화면 전체 폭죽
    hud.classList.add('is-hidden'); hud.setAttribute('aria-hidden', 'true');
    dpad.classList.add('is-hidden'); dpad.setAttribute('aria-hidden', 'true');
    winScreen.classList.add('is-open');
  }

  function showNewAchievements(list) {
    if (!newAchievesEl) return;
    if (!list || !list.length) { newAchievesEl.innerHTML = ''; newAchievesEl.classList.add('is-hidden'); return; }
    newAchievesEl.classList.remove('is-hidden');
    newAchievesEl.innerHTML =
      '<div class="na-title">새 칭찬 도장! 🎉</div>' +
      list.map((a) =>
        '<div class="na-item"><span class="na-icon">' + a.icon + '</span><span class="na-name">' + a.title + '</span></div>'
      ).join('');
  }

  // ---------- 파티클 ----------
  let particles = [];
  const PARTY = ['#ff8fb1', '#ffd93b', '#9fe3b0', '#a8d8ff', '#d7c3ff', '#ffb38a'];
  function burst(x, y) {
    for (let i = 0; i < 14; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(60, 200);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, maxLife: rand(0.4, 0.8), size: rand(3, 7), col: PARTY[(Math.random() * PARTY.length) | 0], grav: 240 });
    }
  }
  function confetti() {
    const g = cellCenter(cols - 1, rows - 1);
    for (let i = 0; i < 40; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(80, 320);
      particles.push({ x: g.x, y: g.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: 0, maxLife: rand(0.6, 1.2), size: rand(4, 9), col: PARTY[(Math.random() * PARTY.length) | 0], grav: 300 });
    }
  }

  // ---------- 그리기 ----------
  function drawEmoji(emoji, x, y, size) {
    ctx.font = size + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, x, y);
  }

  function drawBoard() {
    const { px, py, size, cell } = board;
    if (!size) return;

    const r = Math.min(22, cell * 0.5);
    ctx.save();
    ctx.shadowColor = 'rgba(150,110,160,0.25)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 10;
    roundRect(px - 6, py - 6, size + 12, size + 12, r + 6);
    ctx.fillStyle = '#fffdf8';
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(159, 230, 176, 0.35)';
    ctx.fillRect(px + (cols - 1) * cell, py + (rows - 1) * cell, cell, cell);
    ctx.fillStyle = 'rgba(255, 195, 221, 0.30)';
    ctx.fillRect(px, py, cell, cell);

    ctx.strokeStyle = '#b69bff';
    ctx.lineWidth = Math.max(2, cell * 0.07);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const wbits = grid[y * cols + x];
        const x0 = px + x * cell, y0 = py + y * cell, x1 = x0 + cell, y1 = y0 + cell;
        if (wbits & N) { ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); }
        if (wbits & W) { ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); }
        if (wbits & E) { ctx.moveTo(x1, y0); ctx.lineTo(x1, y1); }
        if (wbits & S) { ctx.moveTo(x0, y1); ctx.lineTo(x1, y1); }
      }
    }
    ctx.stroke();

    const es = cell * 0.5;
    for (const s of stars) {
      if (s.got) continue;
      const c = cellCenter(s.x, s.y);
      const bob = Math.sin(performance.now() / 400 + s.x + s.y) * cell * 0.05;
      drawEmoji('⭐', c.x, c.y + bob, es);
    }

    const goal = cellCenter(cols - 1, rows - 1);
    const gbob = Math.sin(performance.now() / 350) * cell * 0.06;
    drawEmoji('🐟', goal.x, goal.y + gbob, cell * 0.62);

    for (const p of particles) {
      ctx.globalAlpha = clamp(1 - p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    drawEmoji('🐱', catPix.x, catPix.y, cell * 0.66);
  }

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- 메인 루프 ----------
  let lastTime = 0;
  let rafId = 0;            // 진행 중인 rAF 핸들(탭 숨김 시 취소용)
  function loop(now) {
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (!isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.05);

    if (moving) {
      const dx = catTarget.x - catPix.x;
      const dy = catTarget.y - catPix.y;
      const dist = Math.hypot(dx, dy);
      const step = (board.cell / MOVE_DUR) * dt; // 한 칸 = MOVE_DUR 초
      if (dist <= step || dist < 0.5) {
        catPix.x = catTarget.x;
        catPix.y = catTarget.y;
        moving = false;
        if (reachedGoal()) win();
        else if (queuedDir) { const d = queuedDir; queuedDir = 0; startMove(d); } // 큐 입력 연결
      } else {
        catPix.x += (dx / dist) * step;
        catPix.y += (dy / dist) * step;
      }
    }

    if (state === 'playing' && startedAt) {
      elapsedMs = performance.now() - startedAt;
      updateHud();
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) { particles.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    drawBoard();
    rafId = requestAnimationFrame(loop);
  }

  // ---------- 입력 ----------
  function onKeyDown(e) {
    if (state === 'playing') {
      if (e.key === 'ArrowUp')    { e.preventDefault(); requestMove(N); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); requestMove(E); return; }
      if (e.key === 'ArrowDown')  { e.preventDefault(); requestMove(S); return; }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); requestMove(W); return; }
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
  }

  let touchStart = null;
  function onTouchStart(e) {
    if (state !== 'playing') return;
    const t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e) {
    if (state !== 'playing' || !touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (Math.max(adx, ady) < 24) return;
    if (adx > ady) requestMove(dx > 0 ? E : W);
    else requestMove(dy > 0 ? S : N);
  }

  function bindPad(btn, dir) {
    if (!btn) return;
    const press = (e) => { e.preventDefault(); btn.classList.add('is-pressed'); requestMove(dir); };
    const release = () => btn.classList.remove('is-pressed');
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('pointercancel', release);
  }

  // ---------- 초기화 ----------
  function init() {
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    window.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchend', onTouchEnd, { passive: true });

    bindPad(document.getElementById('btnUp'), N);
    bindPad(document.getElementById('btnRight'), E);
    bindPad(document.getElementById('btnDown'), S);
    bindPad(document.getElementById('btnLeft'), W);

    startScreen.querySelectorAll('.level-btn').forEach((b) => {
      b.addEventListener('click', () => {
        const lv = parseInt(b.getAttribute('data-level'), 10) || 2;
        startGame(lv);
      });
    });

    btnReplay.addEventListener('click', () => startGame(level));
    btnChoose.addEventListener('click', backToChoose);

    let pausedTimerMs = -1; // 가려질 때의 경과시간(타이머가 시작된 경우만)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // 탭이 가려지면 rAF 폭주/긴 dt 점프를 막기 위해 루프 일시정지.
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
        // 완주시간(=점수)에 가려진 동안의 벽시계 시간이 포함되지 않도록 경과시간을 보관.
        pausedTimerMs = startedAt ? (performance.now() - startedAt) : -1;
      } else {
        // 가려진 동안 흐른 시간을 빼고 타이머를 멈춘 지점부터 이어가도록 startedAt 재기준.
        if (pausedTimerMs >= 0 && startedAt) { startedAt = performance.now() - pausedTimerMs; }
        pausedTimerMs = -1;
        // 다시 보이면 프레임 시간 기준을 리셋하고 루프 재시작(단일 루프 유지).
        lastTime = performance.now();
        if (!rafId) rafId = requestAnimationFrame(loop);
      }
    });

    lastTime = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  init();
})();
