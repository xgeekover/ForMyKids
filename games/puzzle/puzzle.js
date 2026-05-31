/* ===================================================================
   조각조각 퍼즐 (Jigsaw Puzzle)
   -------------------------------------------------------------------
   · 시작 화면: 카테고리(명화/캐릭터) 토글 → 그림 썸네일 선택 → 난이도(10단계) 선택.
   · 이미지 미리 로드 + 실패 시 canvas 폴백 그림(bg 그라데이션 + fallbackEmoji + title).
   · 조각은 CSS background-image 슬라이스로 렌더(cross-origin 이미지도 안전 표시).
   · 조작: Pointer Events(HTML5 DnD 금지). 드래그 → 정답 슬롯 근처면 '착!' 스냅 잠금.
   · 모든 조각 스냅 시 1회만 recordPlay('puzzle', { timeMs, level }).
   · 순수 로직/에셋은 ./puzzle-logic.js, 기록/업적은 ../../shared/fmk-store.js.
   =================================================================== */
import { recordPlay, getGameStats } from '../../shared/fmk-store.js'
import { celebrate } from '../../shared/fmk-confetti.js'
import { installCrashGuard, registerServiceWorker } from '../../shared/fmk-guard.js'
import { installGameGuard } from '../../shared/fmk-screentime.js'
import * as sfx from '../../shared/fmk-sound.js'
import { LEVELS, LEVEL_ORDER, CATEGORIES, IMAGES, imagesByCategory, imageById, buildPieces, snapRadius } from './puzzle-logic.js'
import { getCustomPuzzleId } from '../../shared/fmk-store.js'
import { loadPhoto } from '../../shared/fmk-photos.js'

installCrashGuard({ homeHref: '../../index.html' }) // 하얀 화면 방지 → 런처 복구
registerServiceWorker('../../sw.js')                // 오프라인 캐싱(운영 빌드)
sfx.armBGM('lively')                                // 첫 제스처에 경쾌한 게임 BGM 루프
installGameGuard({ homeHref: '../../index.html' })  // 스크린 타임: 초과 시 잠금

;(() => {
  'use strict';

  // ---------- DOM ----------
  const hud = document.getElementById('hud');
  const timeLabel = document.getElementById('timeLabel');
  const progressLabel = document.getElementById('progressLabel');
  const btnHint = document.getElementById('btnHint');

  const playfield = document.getElementById('playfield');
  const board = document.getElementById('board');
  const boardPreview = document.getElementById('boardPreview');
  const boardSlots = document.getElementById('boardSlots');
  const trayHint = document.getElementById('trayHint');
  const pieceLayer = document.getElementById('pieceLayer');

  const startScreen = document.getElementById('startScreen');
  const catToggle = document.getElementById('catToggle');
  const thumbGrid = document.getElementById('thumbGrid');
  const levelGrid = document.getElementById('levelGrid');

  const winScreen = document.getElementById('winScreen');
  const winTimeEl = document.getElementById('winTime');
  const bestTimeEl = document.getElementById('bestTime');
  const winPraiseEl = document.getElementById('winPraise');
  const newAchievesEl = document.getElementById('newAchieves');
  const btnReplay = document.getElementById('btnReplay');
  const btnChoose = document.getElementById('btnChoose');

  // ---------- 유틸 ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // 보드 최대 크기(큰 화면에서 과도하게 커지지 않도록 한 변을 캡)
  const MAX_BOARD = 560;

  // 안전영역(노치/홈바) 인셋을 JS 로 읽는 프로브. 한 번만 만들어 재사용.
  let safeProbe = null;
  function readSafeInsets() {
    if (!safeProbe) {
      safeProbe = document.createElement('div');
      safeProbe.setAttribute('aria-hidden', 'true');
      safeProbe.style.cssText =
        'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
        'padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);';
      document.body.appendChild(safeProbe);
    }
    const cs = getComputedStyle(safeProbe);
    return {
      top: parseFloat(cs.paddingTop) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
    };
  }
  function fmtTime(ms) {
    const t = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(t / 60);
    const s = t % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  const PRAISE = [
    '우와, 정말 멋지게 맞췄어요!',
    '대단해요! 퍼즐 박사님 인정! 🏅',
    '와아~ 완벽하게 완성했어요!',
    '집중력 최고! 정말 잘했어요! ⭐',
    '짝짝짝! 조각 마법사 같아요! ✨',
  ];

  // ---------- 폴백 그림 생성 (이미지 로드 실패 시) ----------
  // 자체 canvas 로 그리므로 cross-origin 오염 없이 toDataURL 안전.
  function fallbackDataURL(img, size) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    const bg = (img && img.bg) || ['#ffe3f1', '#ff9dc4'];
    const grad = g.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, bg[0]);
    grad.addColorStop(1, bg[1] || bg[0]);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);

    // 부드러운 동그라미 장식
    g.globalAlpha = 0.18;
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.arc(Math.random() * size, Math.random() * size, size * (0.06 + Math.random() * 0.1), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    // 가운데 큰 이모지
    g.font = Math.round(size * 0.42) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText((img && img.fallbackEmoji) || '🧩', size / 2, size * 0.42);

    // 제목 텍스트
    g.font = '700 ' + Math.round(size * 0.085) + 'px "Jua","Gaegu",sans-serif';
    g.fillStyle = 'rgba(60,40,70,0.85)';
    g.fillText((img && img.title) || '퍼즐', size / 2, size * 0.78);
    return c.toDataURL();
  }

  // 이미지를 미리 로드해 해결된 src 를 콜백으로 전달. 실패 시 폴백 dataURL.
  function resolveImageSrc(img, cb) {
    if (!img) { cb(fallbackDataURL(null, 512)); return; }
    const probe = new Image();
    let done = false;
    const finish = (src) => { if (done) return; done = true; cb(src); };
    probe.onload = () => {
      if (probe.naturalWidth > 0) finish(img.src);
      else finish(fallbackDataURL(img, 512));
    };
    probe.onerror = () => finish(fallbackDataURL(img, 512));
    // 안전망: 너무 오래 걸리면 폴백(오프라인 등)
    setTimeout(() => finish(fallbackDataURL(img, 512)), 6000);
    probe.src = img.src;
  }

  // ---------- 상태 ----------
  let state = 'start';        // 'start' | 'playing' | 'win'
  let selectedCat = CATEGORIES[0] ? CATEGORIES[0].id : 'masterpiece';
  let selectedImageId = null;
  let level = 1;
  let cols = 4, rows = 4;
  let resolvedSrc = '';       // 현재 게임의 이미지 src(원본 또는 폴백 dataURL)
  let pieces = [];            // { id, col, row, el, placed, x, y }
  let placedCount = 0;
  let total = 0;
  let hintOn = false;
  let customDataURL = null; // 가족 사진 dataURL(IndexedDB 에서 로드되면 채워짐)
  let lastCustom = false;   // 마지막 시작이 가족 사진이었는지(다시하기용)

  // 보드 배치(논리 픽셀)
  let layout = { boardX: 0, boardY: 0, boardW: 0, boardH: 0, pieceW: 0, pieceH: 0 };

  // 타이머
  let startedAt = 0;
  let elapsedMs = 0;
  let recorded = false;
  let timerId = 0;

  // 드래그 — pointerId 별로 따로 관리(멀티터치: 두 손가락으로 서로 다른 조각 동시 드래그 OK)
  const drags = new Map();    // pointerId → { piece, offX, offY }
  let topZ = 100;

  // ---------- 시작 화면 구성 ----------
  function buildStartScreen() {
    // (a) 카테고리 토글
    catToggle.innerHTML = '';
    CATEGORIES.forEach((c) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cat-btn';
      btn.setAttribute('role', 'tab');
      btn.dataset.cat = c.id;
      btn.innerHTML = '<span class="cat-icon" aria-hidden="true">' + c.icon + '</span><span class="cat-label">' + c.label + '</span>';
      btn.addEventListener('click', () => selectCategory(c.id));
      catToggle.appendChild(btn);
    });

    // (c) 난이도 버튼 10개
    levelGrid.innerHTML = '';
    LEVEL_ORDER.forEach((lv) => {
      const def = LEVELS[lv];
      if (!def) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'level-btn level-btn--puzzle';
      btn.dataset.level = String(lv);
      btn.innerHTML =
        '<span class="level-emoji" aria-hidden="true">' + def.icon + '</span>' +
        '<span class="level-name">' + def.name + '</span>' +
        '<span class="level-size">' + (def.cols * def.rows) + '조각</span>';
      btn.addEventListener('click', () => startGame(lv));
      levelGrid.appendChild(btn);
    });

    selectCategory(selectedCat);
  }

  function selectCategory(catId) {
    selectedCat = catId;
    Array.prototype.forEach.call(catToggle.children, (b) => {
      const on = b.dataset.cat === catId;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    buildThumbs();
  }

  function buildThumbs() {
    thumbGrid.innerHTML = '';
    const list = imagesByCategory(selectedCat);
    // 카테고리가 바뀌면 기본 = 첫 이미지
    if (!list.some((i) => i.id === selectedImageId)) {
      selectedImageId = list[0] ? list[0].id : null;
    }
    list.forEach((img) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'thumb' + (img.id === selectedImageId ? ' is-selected' : '');
      btn.setAttribute('role', 'option');
      btn.dataset.imageId = img.id;
      btn.setAttribute('aria-label', img.title);

      const pic = document.createElement('div');
      pic.className = 'thumb-pic';
      // 우선 원본을 배경으로(표시는 CORS 불필요), 실패하면 폴백 dataURL 로 교체
      pic.style.backgroundImage = "url('" + img.src + "')";
      resolveImageSrc(img, (src) => { pic.style.backgroundImage = "url('" + src + "')"; });

      const cap = document.createElement('div');
      cap.className = 'thumb-cap';
      cap.textContent = img.title;

      btn.appendChild(pic);
      btn.appendChild(cap);
      btn.addEventListener('click', () => selectImage(img.id));
      thumbGrid.appendChild(btn);
    });
  }

  function selectImage(id) {
    selectedImageId = id;
    Array.prototype.forEach.call(thumbGrid.children, (b) => {
      b.classList.toggle('is-selected', b.dataset.imageId === id);
    });
  }

  // ---------- 게임 시작 ----------
  function startGame(lv, custom) {
    level = lv;
    lastCustom = !!(custom && customDataURL); // 가족 사진 모드 여부
    const def = LEVELS[lv] || LEVELS[1];
    cols = def.cols; rows = def.rows;
    total = cols * rows;

    // 화면 전환
    state = 'playing';
    startScreen.classList.remove('is-open');
    winScreen.classList.remove('is-open');
    playfield.classList.remove('is-hidden'); playfield.setAttribute('aria-hidden', 'false');
    hud.classList.remove('is-hidden'); hud.setAttribute('aria-hidden', 'false');

    // 리셋
    placedCount = 0;
    recorded = false;
    startedAt = 0;
    elapsedMs = 0;
    hintOn = false;
    btnHint.setAttribute('aria-pressed', 'false');
    btnHint.classList.remove('is-on');
    clearPieces();
    updateHud();
    sfx.resume();

    if (lastCustom) {
      // 가족 사진: dataURL 을 바로 사용(네트워크 프로브 불필요, CORS 안전)
      resolvedSrc = customDataURL;
      boardPreview.style.backgroundImage = "url('" + customDataURL + "')";
      buildBoard();
    } else {
      // 기본(명화/캐릭터): 이미지 해결 후 보드/조각 생성
      const img = imageById(selectedImageId) || imagesByCategory(selectedCat)[0] || IMAGES[0];
      resolveImageSrc(img, (src) => {
        resolvedSrc = src;
        boardPreview.style.backgroundImage = "url('" + src + "')";
        buildBoard();
      });
    }
  }

  // ---------- 커스텀(가족 사진) 퍼즐 ----------
  // 활성 프로필에 등록된 사진 id 가 있으면 IndexedDB 에서 dataURL 을 불러와 시작 화면에 진입 버튼을 추가.
  function loadCustomPhoto() {
    let id = null;
    try { id = getCustomPuzzleId(); } catch (e) { id = null; }
    if (!id) return;
    loadPhoto(id).then((url) => { if (url) { customDataURL = url; addCustomEntry(); } }).catch(() => {});
  }
  function addCustomEntry() {
    if (!customDataURL || !startScreen || document.getElementById('customPuzzleBtn')) return;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'text-align:center;margin:0 0 14px';
    const btn = document.createElement('button');
    btn.id = 'customPuzzleBtn';
    btn.type = 'button';
    btn.className = 'level-btn level-btn--puzzle';
    btn.style.cssText = 'margin:0 auto;min-width:200px;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.7);' +
      'background-image:linear-gradient(rgba(0,0,0,.18),rgba(0,0,0,.32)),url("' + customDataURL + '");background-size:cover;background-position:center';
    btn.innerHTML =
      '<span class="level-emoji" aria-hidden="true">👨‍👩‍👧</span>' +
      '<span class="level-name">우리 가족 사진</span>' +
      '<span class="level-size">16조각</span>';
    btn.addEventListener('click', () => startGame(1, true));
    wrap.appendChild(btn);
    // 시작 카드(.screen-card--start) 안, 카테고리 토글 위에 배치(카드 밖 오버레이에 떠 보이지 않도록)
    const card = startScreen.querySelector('.screen-card--start') || startScreen;
    if (catToggle && catToggle.parentNode === card) card.insertBefore(wrap, catToggle);
    else card.insertBefore(wrap, card.firstChild);
  }

  function clearPieces() {
    drags.clear(); // 진행 중 드래그가 있었어도 정리
    for (const p of pieces) { if (p.el && p.el.parentNode) p.el.parentNode.removeChild(p.el); }
    pieces = [];
    boardSlots.innerHTML = '';
  }

  // 보드 격자 + 조각 div 생성
  function buildBoard() {
    computeLayout();

    // 슬롯 외곽선
    boardSlots.innerHTML = '';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const slot = document.createElement('div');
        slot.className = 'slot';
        slot.style.left = (c * layout.pieceW) + 'px';
        slot.style.top = (r * layout.pieceH) + 'px';
        slot.style.width = layout.pieceW + 'px';
        slot.style.height = layout.pieceH + 'px';
        boardSlots.appendChild(slot);
      }
    }

    // 조각 생성
    const defs = buildPieces(cols, rows);
    pieces = defs.map((d) => {
      const el = document.createElement('div');
      el.className = 'piece';
      el.style.width = layout.pieceW + 'px';
      el.style.height = layout.pieceH + 'px';
      el.style.backgroundImage = "url('" + resolvedSrc + "')";
      el.style.backgroundSize = layout.boardW + 'px ' + layout.boardH + 'px';
      el.style.backgroundPosition = (-(d.col * layout.pieceW)) + 'px ' + (-(d.row * layout.pieceH)) + 'px';
      const piece = { id: d.id, col: d.col, row: d.row, el, placed: false, x: 0, y: 0 };
      el.addEventListener('pointerdown', (e) => onPointerDown(e, piece));
      pieceLayer.appendChild(el);
      return piece;
    });

    scatterPieces();
    applyHint();
  }

  // 트레이(보드 아래/옆 빈 공간)에 조각을 셔플해 흩뿌림
  function scatterPieces() {
    const W = window.innerWidth, H = window.innerHeight;
    const tray = trayRect();
    const order = shuffle(pieces.slice());
    order.forEach((p, i) => {
      if (p.placed) return;
      // 트레이 영역 안에서 약간의 격자 + 랜덤 지터로 보기 좋게 배치
      // 가로로 더 촘촘히 펼쳐 행 수를 줄이고(세로 겹침↓), 세로 간격은 조각 높이 아래로 과하게 압축하지 않음
      const cellsPerRow = Math.max(1, Math.floor(tray.w / (layout.pieceW * 0.8)));
      const gx = i % cellsPerRow;
      const gy = Math.floor(i / cellsPerRow);
      const stepX = tray.w / cellsPerRow;
      const stepY = Math.max(layout.pieceH * 0.7, tray.h / Math.max(1, Math.ceil(order.length / cellsPerRow)));
      let x = tray.x + gx * stepX + (stepX - layout.pieceW) * 0.5 + (Math.random() - 0.5) * stepX * 0.25;
      let y = tray.y + gy * stepY + (Math.random() - 0.5) * 10;
      x = clamp(x, 4, W - layout.pieceW - 4);
      y = clamp(y, 4, H - layout.pieceH - 4);
      placeFree(p, x, y);
    });
  }

  // 트레이 영역(보드를 제외한 가용 공간) 계산: 보드 아래가 넓으면 아래, 아니면 가로 옆.
  function trayRect() {
    const W = window.innerWidth, H = window.innerHeight;
    const belowY = layout.boardY + layout.boardH + 12;
    const belowH = H - belowY - 12;
    const sideX = layout.boardX + layout.boardW + 12;
    const sideW = W - sideX - 12;
    if (belowH >= layout.pieceH * 1.2 || belowH >= sideW) {
      return { x: 10, y: belowY, w: W - 20, h: Math.max(belowH, layout.pieceH * 1.2) };
    }
    return { x: sideX, y: layout.boardY, w: Math.max(sideW, layout.pieceW * 1.2), h: layout.boardH };
  }

  // 조각을 자유 좌표에 놓음(미배치 상태)
  function placeFree(p, x, y) {
    p.x = x; p.y = y;
    p.el.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  }

  // ---------- 보드 레이아웃(반응형) ----------
  function computeLayout() {
    const W = window.innerWidth, H = window.innerHeight;
    // 안전영역(노치/홈바) 만큼 위/아래 여백을 추가 확보
    const safe = readSafeInsets();
    const marginTop = clamp(H * 0.085, 60, 100) + safe.top;
    const marginBottom = 16 + safe.bottom;
    const sideMargin = clamp(W * 0.04, 12, 40);

    // 세로가 길면 보드 위쪽, 조각 트레이는 아래. 가로가 길면 보드 왼쪽, 트레이 오른쪽.
    const portrait = H >= W;
    let availW, availH;
    if (portrait) {
      availW = W - sideMargin * 2;
      availH = (H - marginTop - marginBottom) * 0.62; // 위 62% 를 보드에, 아래를 트레이에
    } else {
      availW = (W - sideMargin * 2) * 0.6;   // 왼쪽 60% 를 보드에
      availH = H - marginTop - marginBottom;
    }
    availW = Math.max(40, availW);
    availH = Math.max(40, availH);

    // 조각 정수 픽셀 + 화면 안에 들어오도록 cols/rows 비율 맞춤
    let pieceW = Math.floor(Math.min(availW / cols, availH / rows));
    // 큰 화면에서 보드가 과도하게 커지지 않도록 한 변을 MAX_BOARD 로 캡(중앙 정렬 유지)
    pieceW = Math.min(pieceW, Math.floor(MAX_BOARD / cols));
    pieceW = Math.max(8, pieceW);
    const pieceH = pieceW; // 정사각 조각(이미지 background-size 가 보드에 맞춰져 비율 유지)

    const boardW = pieceW * cols;
    const boardH = pieceH * rows;
    const boardX = portrait
      ? Math.round((W - boardW) / 2)
      : Math.round(sideMargin + ((W - sideMargin * 2) * 0.6 - boardW) / 2);
    const boardY = Math.round(marginTop + (availH - boardH) / 2);

    layout = { boardX, boardY, boardW, boardH, pieceW, pieceH };

    board.style.left = boardX + 'px';
    board.style.top = boardY + 'px';
    board.style.width = boardW + 'px';
    board.style.height = boardH + 'px';
  }

  // 슬롯의 정답(픽셀) 좌표 = 보드 안 위치
  function slotXY(p) {
    return { x: layout.boardX + p.col * layout.pieceW, y: layout.boardY + p.row * layout.pieceH };
  }

  // ---------- 드래그(Pointer Events) ----------
  function onPointerDown(e, p) {
    if (state !== 'playing' || p.placed || p._dragging) return; // 한 조각은 한 포인터만
    e.preventDefault();
    if (startedAt === 0) { startedAt = performance.now(); startTimer(); } // 첫 드래그에 타이머 시작
    try { p.el.setPointerCapture(e.pointerId); } catch (_) {}
    topZ += 1;
    p.el.style.zIndex = String(topZ);
    p.el.classList.add('is-dragging');
    p._dragging = true;
    drags.set(e.pointerId, { piece: p, offX: e.clientX - p.x, offY: e.clientY - p.y });
    p.el.addEventListener('pointermove', onPointerMove);
    p.el.addEventListener('pointerup', onPointerUp);
    p.el.addEventListener('pointercancel', onPointerCancel);
  }

  function onPointerMove(e) {
    const d = drags.get(e.pointerId);
    if (!d) return;
    e.preventDefault();
    const W = window.innerWidth, H = window.innerHeight;
    const x = clamp(e.clientX - d.offX, -layout.pieceW * 0.3, W - layout.pieceW * 0.7);
    const y = clamp(e.clientY - d.offY, -layout.pieceH * 0.3, H - layout.pieceH * 0.7);
    placeFree(d.piece, x, y);
  }

  function onPointerUp(e) {
    const d = drags.get(e.pointerId);
    if (!d) return;
    e.preventDefault();
    const p = d.piece;
    detachDrag(p, e.pointerId);
    drags.delete(e.pointerId);

    const goal = slotXY(p);
    if (Math.hypot(p.x - goal.x, p.y - goal.y) <= snapRadius(layout.pieceW, layout.pieceH)) {
      snapPiece(p, goal);
    }
  }

  function onPointerCancel(e) {
    const d = drags.get(e.pointerId);
    if (!d) return;
    detachDrag(d.piece, e.pointerId);
    drags.delete(e.pointerId);
  }

  function detachDrag(p, pointerId) {
    p._dragging = false;
    p.el.classList.remove('is-dragging');
    try { p.el.releasePointerCapture(pointerId); } catch (_) {}
    p.el.removeEventListener('pointermove', onPointerMove);
    p.el.removeEventListener('pointerup', onPointerUp);
    p.el.removeEventListener('pointercancel', onPointerCancel);
  }

  function snapPiece(p, goal) {
    p.placed = true;
    placeFree(p, goal.x, goal.y);
    p.el.classList.add('is-placed');
    p.el.classList.add('snap-pop');
    p.el.style.zIndex = '1'; // 맞춰진 조각은 뒤로
    sfx.pop();
    setTimeout(() => p.el && p.el.classList.remove('snap-pop'), 320);

    placedCount++;
    updateHud();
    if (placedCount >= total) win();
  }

  // ---------- HUD / 타이머 ----------
  function updateHud() {
    timeLabel.textContent = fmtTime(elapsedMs);
    progressLabel.textContent = placedCount + '/' + total;
  }
  function startTimer() {
    stopTimer();
    timerId = window.setInterval(() => {
      if (state === 'playing' && startedAt) {
        elapsedMs = performance.now() - startedAt;
        updateHud();
      }
    }, 250);
  }
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = 0; } }

  // ---------- 미리보기(힌트) ----------
  function toggleHint() {
    hintOn = !hintOn;
    btnHint.setAttribute('aria-pressed', hintOn ? 'true' : 'false');
    btnHint.classList.toggle('is-on', hintOn);
    applyHint();
  }
  function applyHint() {
    boardPreview.style.opacity = hintOn ? '0.42' : '0.12';
  }

  // ---------- 승리 ----------
  function win() {
    if (state !== 'playing') return;
    state = 'win';
    stopTimer();
    elapsedMs = startedAt ? (performance.now() - startedAt) : elapsedMs;
    updateHud();

    let res = null;
    if (!recorded) {
      recorded = true;
      res = recordPlay('puzzle', { timeMs: Math.max(1, Math.round(elapsedMs)), level: level });
    }
    // 어려운 난이도(5단계 이상)는 웅장한 팡파레, 그 외엔 산뜻한 클리어 징글
    if (level >= 5) sfx.fanfare(); else sfx.win();

    const best = getGameStats('puzzle').bestTimeMs;
    winTimeEl.textContent = fmtTime(elapsedMs);
    bestTimeEl.textContent = (best != null) ? fmtTime(best) : '-';
    winPraiseEl.textContent = PRAISE[(Math.random() * PRAISE.length) | 0];
    showNewAchievements(res && res.newlyUnlocked);

    confettiBurst();
    celebrate(); // 퍼즐 완성! 화면 전체 폭죽으로 확실한 시각 보상
    hud.classList.add('is-hidden'); hud.setAttribute('aria-hidden', 'true');
    setTimeout(() => {
      playfield.classList.add('is-hidden'); playfield.setAttribute('aria-hidden', 'true');
      winScreen.classList.add('is-open');
    }, 700);
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

  // 간단 색종이(완성 축하) — DOM 파티클
  function confettiBurst() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const COLORS = ['#ff8fb1', '#ffd93b', '#9fe3b0', '#a8d8ff', '#d7c3ff', '#ffb38a'];
    const cx = layout.boardX + layout.boardW / 2;
    const cy = layout.boardY + layout.boardH / 2;
    for (let i = 0; i < 28; i++) {
      const bit = document.createElement('div');
      bit.className = 'confetti-bit';
      bit.style.left = cx + 'px';
      bit.style.top = cy + 'px';
      bit.style.background = COLORS[(Math.random() * COLORS.length) | 0];
      const dx = (Math.random() - 0.5) * 2 * (120 + Math.random() * 180);
      const dy = -(80 + Math.random() * 220);
      bit.style.setProperty('--dx', dx + 'px');
      bit.style.setProperty('--dy', dy + 'px');
      bit.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
      pieceLayer.appendChild(bit);
      setTimeout(() => bit.parentNode && bit.parentNode.removeChild(bit), 1200);
    }
  }

  // ---------- 화면 전환 ----------
  function backToChoose() {
    state = 'start';
    stopTimer();
    clearPieces();
    confettiCleanup();
    hud.classList.add('is-hidden'); hud.setAttribute('aria-hidden', 'true');
    playfield.classList.add('is-hidden'); playfield.setAttribute('aria-hidden', 'true');
    winScreen.classList.remove('is-open');
    startScreen.classList.add('is-open');
  }
  function confettiCleanup() {
    const bits = pieceLayer.querySelectorAll('.confetti-bit');
    Array.prototype.forEach.call(bits, (b) => b.parentNode && b.parentNode.removeChild(b));
  }

  // ---------- 리사이즈(반응형 재배치) ----------
  function resize() {
    if (state !== 'playing' || !pieces.length) {
      if (state === 'playing') computeLayout();
      return;
    }
    const prev = { boardX: layout.boardX, boardY: layout.boardY, boardW: layout.boardW, boardH: layout.boardH, pieceW: layout.pieceW, pieceH: layout.pieceH };
    const W = window.innerWidth, H = window.innerHeight;

    // 미배치 조각의 현재 위치를 화면 비율로 기록(재배치 기준)
    const ratios = pieces.map((p) => p.placed ? null : { rx: p.x / Math.max(1, W), ry: p.y / Math.max(1, H) });

    computeLayout();

    // 조각/슬롯 크기 갱신
    boardSlots.innerHTML = '';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const slot = document.createElement('div');
        slot.className = 'slot';
        slot.style.left = (c * layout.pieceW) + 'px';
        slot.style.top = (r * layout.pieceH) + 'px';
        slot.style.width = layout.pieceW + 'px';
        slot.style.height = layout.pieceH + 'px';
        boardSlots.appendChild(slot);
      }
    }

    pieces.forEach((p, i) => {
      p.el.style.width = layout.pieceW + 'px';
      p.el.style.height = layout.pieceH + 'px';
      p.el.style.backgroundSize = layout.boardW + 'px ' + layout.boardH + 'px';
      p.el.style.backgroundPosition = (-(p.col * layout.pieceW)) + 'px ' + (-(p.row * layout.pieceH)) + 'px';
      if (p.placed) {
        const goal = slotXY(p);
        placeFree(p, goal.x, goal.y);
      } else {
        const rr = ratios[i] || { rx: 0.1, ry: 0.5 };
        let x = clamp(rr.rx * W, 4, W - layout.pieceW - 4);
        let y = clamp(rr.ry * H, 4, H - layout.pieceH - 4);
        placeFree(p, x, y);
      }
    });
  }

  // ---------- 초기화 ----------
  function init() {
    buildStartScreen();
    loadCustomPhoto(); // 가족 사진이 등록돼 있으면 시작 화면에 진입 버튼 추가(비동기)

    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);

    btnHint.addEventListener('click', toggleHint);
    btnReplay.addEventListener('click', () => startGame(level, lastCustom));
    btnChoose.addEventListener('click', backToChoose);

    document.addEventListener('visibilitychange', () => {
      // 백그라운드 동안의 시간 점프 방지: 다시 보일 때 경과시간 기준점 보정
      if (!document.hidden && state === 'playing' && startedAt) {
        startedAt = performance.now() - elapsedMs;
      }
    });
  }

  init();
})();
