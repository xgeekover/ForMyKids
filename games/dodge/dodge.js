/* ===================================================================
   우주선 똥 피하기 (Spaceship Poop Dodge)
   -------------------------------------------------------------------
   · 2D Canvas + requestAnimationFrame, 델타타임 기반 루프(프레임률 독립)
   · 조작: 키보드 ← → / 화면 하단 터치 버튼(모바일)
   · 위에서 💩 🍌 ☄️ 등이 랜덤하게 떨어지고, 시간이 갈수록 단계적으로 빨라짐
   · 보상: 점수 100·200·350 도달 시 우주선 '진화'(외형 화려)+보호막 보너스
   · 보호막 🛡️ 아이템(1회 방어)이 주기적으로 떨어짐
   · 충돌 시 게임 종료 → 격려 문구 + 다시하기
   · 점수/기록/업적은 플랫폼 공통 저장소(shared/fmk-store.js)에 통합 저장
   =================================================================== */
import { recordPlay, getGameStats } from '../../shared/fmk-store.js'
import { installCrashGuard, registerServiceWorker } from '../../shared/fmk-guard.js'
import { installGameGuard } from '../../shared/fmk-screentime.js'
import * as sfx from '../../shared/fmk-sound.js'

installCrashGuard({ homeHref: '../../index.html' }) // 하얀 화면 방지 → 런처 복구
registerServiceWorker('../../sw.js')                // 오프라인 캐싱(운영 빌드)
sfx.armBGM('lively')                                // 첫 제스처에 경쾌한 게임 BGM 루프
installGameGuard({ homeHref: '../../index.html' })  // 스크린 타임: 초과 시 잠금

;(() => {
  'use strict';

  // ---------- DOM ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const stageLabelEl = document.getElementById('stageLabel');
  const shieldPill = document.getElementById('shieldPill');
  const startScreen = document.getElementById('startScreen');
  const overScreen = document.getElementById('overScreen');
  const finalScoreEl = document.getElementById('finalScore');
  const bestScoreEl = document.getElementById('bestScore');
  const overEmoji = document.getElementById('overEmoji');
  const btnStart = document.getElementById('btnStart');
  const btnRetry = document.getElementById('btnRetry');
  const btnLeft = document.getElementById('btnLeft');
  const btnRight = document.getElementById('btnRight');
  const newAchievesEl = document.getElementById('newAchieves');

  // ---------- 화면(논리 픽셀) 크기 & 고해상도 대응 ----------
  let W = 0, H = 0, dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // 이후 모든 좌표는 CSS 픽셀 기준
    computeSizes();
    makeStars();
    if (ship) {
      ship.y = shipCenterY();
      // 진화 단계 배율을 반영해 충돌 반경도 새 SHIP_SIZE 기준으로 갱신(리사이즈/회전 시 히트박스 일치)
      ship.r = (SHIP_SIZE * STAGES[stageIndex].scale) / 2;
      ship.x = clamp(ship.x, ship.r, W - ship.r);
    }
  }

  // ---------- 크기 토큰 ----------
  let SHIP_SIZE = 64;
  function computeSizes() {
    const base = Math.min(W, H);
    SHIP_SIZE = Math.max(48, Math.min(base * 0.16, 100));
  }
  function shipCenterY() {
    // 하단 터치 버튼 영역 위에 우주선이 놓이도록 여백 확보
    const bottomSafe = clamp(H * 0.1, 96, 150);
    return H - SHIP_SIZE * 0.5 - bottomSafe;
  }

  // ---------- 유틸 ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const choice = (arr) => arr[(Math.random() * arr.length) | 0];

  // 최고 점수는 플랫폼 공통 저장소(fmk-store)에서 읽는다(게임별 개별 키 대신 통합 관리)
  function loadBest() { return getGameStats('dodge').bestScore || 0; }

  // ---------- 떨어지는 물체 종류 (가중치) ----------
  // weight 가 클수록 자주 등장. 💩 가 가장 흔함.
  const HAZARDS = [
    { emoji: '💩', weight: 5, spin: 0 },
    { emoji: '🍌', weight: 4, spin: 0 },
    { emoji: '☄️', weight: 3, spin: 1 },
    { emoji: '🪨', weight: 2, spin: 1 },
    { emoji: '👾', weight: 1, spin: 0 },
  ];
  const HAZARD_BAG = HAZARDS.flatMap((h) => Array(h.weight).fill(h));

  // ---------- 우주선 진화 단계 ----------
  // score 가 threshold 이상이면 해당 단계로 진화. 외형/오라가 점점 화려해진다.
  const STAGES = [
    { threshold: 0,   emoji: '🚀', scale: 1.0,  glow: null,                       label: 'Lv.1' },
    { threshold: 100, emoji: '🚀', scale: 1.08, glow: 'rgba(255,210,90,0.55)',    label: 'Lv.2' },
    { threshold: 200, emoji: '🛸', scale: 1.16, glow: 'rgba(150,200,255,0.6)',    label: 'Lv.3' },
    { threshold: 350, emoji: '🛸', scale: 1.26, glow: 'rgba(200,150,255,0.7)',    label: 'MAX', rainbow: true },
  ];

  // ---------- 게임 상태 ----------
  let state = 'start';           // 'start' | 'playing' | 'over'
  let ship = null;
  let hazards = [];
  let items = [];                // 보호막 등 획득 아이템
  let particles = [];
  let stars = [];
  let score = 0;
  let best = loadBest();
  let elapsed = 0;               // 플레이 경과(초)
  let tier = 0;                  // 난이도 단계
  let stageIndex = 0;            // 진화 단계 인덱스
  let spawnTimer = 0;            // 다음 물체까지 남은 시간(초)
  let shieldTimer = 0;           // 다음 보호막까지 남은 시간(초)
  let invuln = 0;                // 피격 후 잠깐 무적(초)
  let banner = null;             // { text, life } 화면 중앙 토스트
  let leftPressed = false, rightPressed = false;
  let lastTime = 0;
  let rafId = 0;                 // 현재 진행 중인 requestAnimationFrame 핸들(중복 스케줄 방지)
  const FLAME_COLORS = ['#ffd93b', '#ff9d6c', '#ff6fa3', '#ffe3a3'];
  const RAINBOW = ['#ff8fb1', '#ffd93b', '#9fe3b0', '#a8d8ff', '#d7c3ff'];

  // ---------- 별 배경 ----------
  function makeStars() {
    const n = Math.round((W * H) / 18000);
    stars = [];
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: rand(1, 2.6),
        sp: rand(8, 26),        // 아래로 흐르는 속도(px/s)
        tw: Math.random() * Math.PI * 2,
        col: choice(['#ffffff', '#ffe9f6', '#e7f0ff', '#fff6d6']),
      });
    }
  }

  // ---------- 난이도 곡선 ----------
  function hazardFallSpeed() {
    // 화면 높이의 일정 비율/초 — 단계가 오를수록 빨라짐
    return H * (0.34 + tier * 0.05);
  }
  function spawnInterval() {
    return Math.max(0.36, 0.95 - tier * 0.06);   // 초
  }

  // ---------- 시작/리셋 ----------
  function resetGame() {
    score = 0;
    elapsed = 0;
    tier = 0;
    stageIndex = 0;
    hazards = [];
    items = [];
    particles = [];
    invuln = 0;
    banner = null;
    spawnTimer = 0.5;
    shieldTimer = rand(8, 12);
    leftPressed = rightPressed = false;
    ship = {
      x: W / 2,
      y: shipCenterY(),
      r: SHIP_SIZE / 2,
      hasShield: false,
      flameAcc: 0,
    };
    updateHud();
  }

  function startGame() {
    resetGame();
    state = 'playing';
    startScreen.classList.remove('is-open');
    overScreen.classList.remove('is-open');
    lastTime = performance.now();
  }

  function gameOver() {
    state = 'over';
    // 플랫폼 공통 저장소에 기록(최고 점수·최고 진화 단계·플레이 횟수·업적 자동 판정)
    const res = recordPlay('dodge', { score: score, stage: stageIndex });
    best = getGameStats('dodge').bestScore || Math.max(best, score);
    finalScoreEl.textContent = score;
    bestScoreEl.textContent = best;
    overEmoji.textContent = score >= 200 ? '🏆' : score >= 100 ? '🌟' : '💫';
    showNewAchievements(res && res.newlyUnlocked);
    overScreen.classList.add('is-open');
  }

  // 이번 판에 새로 딴 '칭찬 도장'(업적)을 게임오버 화면에 보여준다
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

  // ---------- HUD ----------
  function updateHud() {
    scoreEl.textContent = score;
    stageLabelEl.textContent = STAGES[stageIndex].label;
    stageLabelEl.previousElementSibling.textContent = STAGES[stageIndex].emoji;
    shieldPill.classList.toggle('is-hidden', !(ship && ship.hasShield));
  }

  // ---------- 스폰 ----------
  function spawnHazard() {
    const def = choice(HAZARD_BAG);
    const size = SHIP_SIZE * rand(0.62, 0.95);
    hazards.push({
      emoji: def.emoji,
      x: rand(size * 0.6, W - size * 0.6),
      y: -size,
      r: size / 2,
      size,
      vy: hazardFallSpeed() * rand(0.88, 1.16),
      vx: rand(-W * 0.04, W * 0.04),
      rot: 0,
      spin: def.spin ? rand(-2.5, 2.5) : 0,
    });
  }

  function spawnShieldItem() {
    const size = SHIP_SIZE * 0.8;
    items.push({
      kind: 'shield',
      emoji: '🛡️',
      x: rand(size, W - size),
      y: -size,
      r: size / 2,
      size,
      vy: hazardFallSpeed() * 0.8,
      bob: 0,
    });
  }

  // ---------- 파티클 ----------
  function burst(x, y, colors, count, opts = {}) {
    const spd = opts.speed || 220;
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(spd * 0.3, spd);
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - (opts.up || 0),
        life: 0, maxLife: rand(0.4, 0.8),
        size: rand(4, 9),
        col: choice(colors),
        grav: opts.grav != null ? opts.grav : 320,
      });
    }
  }
  function flame(x, y) {
    particles.push({
      x: x + rand(-6, 6), y,
      vx: rand(-20, 20), vy: rand(60, 140),
      life: 0, maxLife: rand(0.25, 0.5),
      size: rand(5, 10), col: choice(FLAME_COLORS), grav: 0,
    });
  }

  function showBanner(text) { banner = { text, life: 0, max: 1.3 }; }

  // ---------- 진화 체크 ----------
  function checkEvolve() {
    let ni = stageIndex;
    for (let i = STAGES.length - 1; i >= 0; i--) {
      if (score >= STAGES[i].threshold) { ni = i; break; }
    }
    if (ni > stageIndex) {
      stageIndex = ni;
      const s = STAGES[stageIndex];
      ship.r = (SHIP_SIZE * s.scale) / 2;
      burst(ship.x, ship.y, RAINBOW, 26, { speed: 300, grav: 120 });
      showBanner('진화! ' + s.emoji + '✨');
      // 진화 보상: 보호막 한 개 선물 (이미 있으면 점수 보너스)
      if (!ship.hasShield) {
        ship.hasShield = true;
      } else {
        score += 30;
      }
      updateHud();
    }
  }

  // ---------- 업데이트 ----------
  function update(dt) {
    elapsed += dt;
    const newTier = Math.min(12, Math.floor(elapsed / 9));
    if (newTier > tier) { tier = newTier; showBanner('🚀 빨라진다!'); }

    // 우주선 이동
    let dir = 0;
    if (leftPressed) dir -= 1;
    if (rightPressed) dir += 1;
    const moveSpeed = W * 1.15;
    ship.x = clamp(ship.x + dir * moveSpeed * dt, ship.r, W - ship.r);
    if (invuln > 0) invuln -= dt;

    // 진화 단계 화염 트레일
    if (stageIndex >= 1) {
      ship.flameAcc += dt;
      const step = 0.04;
      while (ship.flameAcc >= step) { ship.flameAcc -= step; flame(ship.x, ship.y + ship.r * 0.7); }
    }

    // 물체 스폰
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnHazard();
      // 단계가 높으면 가끔 2개 동시 스폰
      if (tier >= 4 && Math.random() < 0.35) spawnHazard();
      spawnTimer = spawnInterval() * rand(0.8, 1.2);
    }

    // 보호막 아이템 스폰 (보호막이 없을 때만, 화면에 하나만)
    shieldTimer -= dt;
    if (shieldTimer <= 0) {
      if (!ship.hasShield && !items.some((it) => it.kind === 'shield')) {
        spawnShieldItem();
        shieldTimer = rand(14, 22);
      } else {
        shieldTimer = 3; // 잠시 후 재시도
      }
    }

    // 물체 이동 / 충돌 / 점수
    for (let i = hazards.length - 1; i >= 0; i--) {
      const o = hazards[i];
      o.y += o.vy * dt;
      o.x += o.vx * dt;
      if (o.x < o.r || o.x > W - o.r) o.vx *= -1; // 벽 반사
      o.rot += o.spin * dt;

      if (hit(ship, o)) {
        if (invuln > 0) continue;
        if (ship.hasShield) {
          ship.hasShield = false;
          invuln = 0.7;
          burst(o.x, o.y, ['#8ee9cf', '#d9fff0', '#a8d8ff'], 20, { speed: 260 });
          hazards.splice(i, 1);
          updateHud();
          continue;
        }
        // 보호막 없음 → 게임 종료
        burst(ship.x, ship.y, ['#ff9d6c', '#ff6fa3', '#ffd93b'], 30, { speed: 320 });
        hazards.splice(i, 1);
        gameOver();
        return;
      }

      if (o.y - o.r > H) {
        // 무사히 피함 → 점수
        hazards.splice(i, 1);
        score += 10;
        updateHud();
        checkEvolve();
      }
    }

    // 아이템 이동 / 획득
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.y += it.vy * dt;
      it.bob += dt;
      if (it.kind === 'shield' && hit(ship, it)) {
        items.splice(i, 1);
        if (ship.hasShield) score += 20;        // 이미 있으면 보너스 점수
        else ship.hasShield = true;
        burst(it.x, it.y, ['#8ee9cf', '#ffffff', '#a8d8ff'], 22, { speed: 240 });
        showBanner('보호막 GET! 🛡️');
        updateHud();
        continue;
      }
      if (it.y - it.r > H) items.splice(i, 1);
    }

    // 파티클
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) { particles.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    // 별 배경 흐름
    for (const s of stars) {
      s.y += s.sp * dt;
      s.tw += dt * 3;
      if (s.y > H + 4) { s.y = -4; s.x = Math.random() * W; }
    }

    if (banner) { banner.life += dt; if (banner.life >= banner.max) banner = null; }
  }

  function hit(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    const rr = a.r * 0.62 + b.r * 0.66;   // 살짝 너그러운 히트박스(아이 친화)
    return dx * dx + dy * dy < rr * rr;
  }

  // ---------- 그리기 ----------
  function drawEmoji(emoji, x, y, size, rot) {
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.font = size + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 0, 0);
    ctx.restore();
  }

  function drawStars() {
    for (const s of stars) {
      const a = 0.4 + Math.sin(s.tw) * 0.35;
      ctx.globalAlpha = clamp(a, 0.12, 0.85);
      ctx.fillStyle = s.col;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawShip() {
    if (!ship) return;
    const st = STAGES[stageIndex];
    const size = SHIP_SIZE * st.scale;

    // 진화 오라(글로우)
    if (st.glow) {
      const t = performance.now() / 1000;
      const pulse = 1 + Math.sin(t * 4) * 0.08;
      const R = ship.r * 1.7 * pulse;
      const g = ctx.createRadialGradient(ship.x, ship.y, ship.r * 0.4, ship.x, ship.y, R);
      g.addColorStop(0, st.glow);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ship.x, ship.y, R, 0, Math.PI * 2);
      ctx.fill();
    }
    // MAX 단계: 궤도를 도는 작은 별
    if (st.rainbow) {
      const t = performance.now() / 700;
      for (let i = 0; i < 5; i++) {
        const ang = t + (i / 5) * Math.PI * 2;
        const ox = ship.x + Math.cos(ang) * ship.r * 1.5;
        const oy = ship.y + Math.sin(ang) * ship.r * 1.5;
        ctx.globalAlpha = 0.9;
        drawEmoji('✨', ox, oy, size * 0.3, 0);
      }
      ctx.globalAlpha = 1;
    }

    // 피격 무적 중엔 깜빡임
    const blink = invuln > 0 ? (Math.sin(performance.now() / 60) > 0 ? 0.45 : 1) : 1;

    // 보호막 버블
    if (ship.hasShield) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#7fe6c8';
      ctx.fillStyle = 'rgba(160,240,210,0.18)';
      ctx.beginPath();
      ctx.arc(ship.x, ship.y, ship.r * 1.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.globalAlpha = blink;
    drawEmoji(st.emoji, ship.x, ship.y, size, 0);
    ctx.globalAlpha = 1;
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = clamp(1 - p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawBanner() {
    if (!banner) return;
    const t = banner.life / banner.max;
    const scale = t < 0.2 ? t / 0.2 : 1;        // 팝 인
    const alpha = t > 0.75 ? (1 - t) / 0.25 : 1; // 페이드 아웃
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.translate(W / 2, H * 0.32);
    ctx.scale(scale, scale);
    ctx.font = '700 ' + clamp(W * 0.07, 26, 52) + 'px "Jua","Fredoka",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeText(banner.text, 0, 0);
    ctx.fillStyle = '#8a5cc7';
    ctx.fillText(banner.text, 0, 0);
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawStars();
    for (const o of hazards) drawEmoji(o.emoji, o.x, o.y, o.size, o.rot);
    for (const it of items) {
      const yoff = Math.sin(it.bob * 4) * 3;
      // 보호막 아이템 반짝임
      ctx.save();
      ctx.globalAlpha = 0.4 + Math.abs(Math.sin(it.bob * 5)) * 0.4;
      ctx.fillStyle = 'rgba(150,240,210,0.5)';
      ctx.beginPath();
      ctx.arc(it.x, it.y + yoff, it.r * 1.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      drawEmoji(it.emoji, it.x, it.y + yoff, it.size, 0);
    }
    drawParticles();
    drawShip();
    drawBanner();
  }

  // ---------- 메인 루프 ----------
  function loop(now) {
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (!isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.05);          // 탭 전환 등으로 인한 큰 점프 방지
    if (state === 'playing') update(dt);
    else {
      // 시작/종료 화면에서도 별과 우주선은 은은하게 움직임
      for (const s of stars) { s.y += s.sp * dt; s.tw += dt * 3; if (s.y > H + 4) { s.y = -4; s.x = Math.random() * W; } }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]; p.life += dt;
        if (p.life >= p.maxLife) { particles.splice(i, 1); continue; }
        p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      }
    }
    draw();
    rafId = requestAnimationFrame(loop);
  }

  // ---------- 입력 ----------
  function onKeyDown(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { leftPressed = true; e.preventDefault(); }
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { rightPressed = true; e.preventDefault(); }
    else if ((e.key === 'Enter' || e.key === ' ') && state !== 'playing') {
      e.preventDefault(); startGame();
    }
  }
  function onKeyUp(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') leftPressed = false;
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') rightPressed = false;
  }

  function bindHold(btn, setter) {
    // 버튼 위에서의 입력만 기본동작 취소(더블탭 줌/선택 방지)
    const press = (e) => { e.preventDefault(); setter(true); btn.classList.add('is-pressed'); };
    const release = (e) => { if (e) e.preventDefault(); setter(false); btn.classList.remove('is-pressed'); };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('pointercancel', release);
    // 포인터가 버튼 밖에서 떼지는 경우 대비 — 전역에선 '상태만' 해제(preventDefault 금지:
    // 시작/다시하기/홈 버튼의 click 이 막히지 않도록)
    window.addEventListener('pointerup', () => { setter(false); btn.classList.remove('is-pressed'); });
  }

  // ---------- 초기화 ----------
  function init() {
    resize();
    bestScoreEl.textContent = best;
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    bindHold(btnLeft, (v) => (leftPressed = v));
    bindHold(btnRight, (v) => (rightPressed = v));
    btnStart.addEventListener('click', startGame);
    btnRetry.addEventListener('click', startGame);
    // 탭이 가려지면 rAF 루프 정지(배터리/CPU 절약), 돌아오면 델타타임 기준 리셋 후 재개.
    // rafId 로 중복 스케줄을 방지한다(단일 루프 보장).
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
        // 누른 채 가려지면 pointerup 을 못 받아 입력이 고착될 수 있으므로 상태/표시 초기화.
        leftPressed = false; rightPressed = false;
        btnLeft.classList.remove('is-pressed'); btnRight.classList.remove('is-pressed');
      } else if (!rafId) {
        lastTime = performance.now();   // 가려진 동안 쌓인 시간 점프 방지
        rafId = requestAnimationFrame(loop);
      }
    });
    // 시작 화면 뒤에 보일 우주선(미리보기)
    ship = { x: W / 2, y: shipCenterY(), r: SHIP_SIZE / 2, hasShield: false, flameAcc: 0 };
    lastTime = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  init();
})();
