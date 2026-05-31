/* ===================================================================
   ForMyKids · 런처(메인 화면) 로직
   - games.config.js 레지스트리로 게임 선택 카드를 동적 생성
   - 공통 저장소(fmk-store)에서 기록/업적을 읽어 카드·칭찬 도장·대시보드에 표시
   - 🏆 칭찬 도장 모달: 새로 딴 도장은 '쾅!' 찍히는 연출 + 폭죽
   - 👪 부모님 방: 곱셈 게이트 통과 후 성장 대시보드(순수 CSS 막대그래프)
   =================================================================== */
import { GAMES } from '../games.config.js'
import {
  getGameStats,
  getAchievements,
  getUnlockedCount,
  getTotalAchievements,
  markAchievementsViewed,
  getDashboard,
  resetProfile,
  exportState,
  importState,
  getProfile,
  setProfile,
  AVATARS,
  THEME_COLORS,
  themeColorHex,
  initSync,
  getSyncStatus,
  // v2 다중 프로필
  getProfiles,
  getActiveProfileId,
  setActiveProfile,
  createProfile,
  // v1.3.0: 커스텀 퍼즐 + 스크린 타임
  setCustomPuzzleId,
  getCustomPuzzleId,
  setDailyLimit,
  getDailyLimit,
  getScreenInfo,
  isOverLimit,
  addUsageToday,
} from '../../shared/fmk-store.js'
import { compressImage, savePhoto, deletePhoto, loadPhoto } from '../../shared/fmk-photos.js'
import { installCrashGuard, registerServiceWorker } from '../../shared/fmk-guard.js'
import * as sfx from '../../shared/fmk-sound.js'
import { celebrate } from '../../shared/fmk-confetti.js'

installCrashGuard({ homeHref: 'index.html', isLauncher: true }) // 런처는 새로고침으로 복구
registerServiceWorker('sw.js')                                  // 오프라인 캐싱(운영 빌드)

// memory 난이도(레벨 1~6) 표시 라벨 (memory/src/data/levels.js 의 LEVEL_ORDER 와 동일 순서)
const MEMORY_LEVEL_LABELS = { 1: '연습', 2: '쉬움', 3: '보통', 4: '도전', 5: '어려움', 6: '많이 어려움' }
const MAZE_LEVEL_LABELS = { 1: '연습', 2: '쉬움', 3: '보통', 4: '도전', 5: '불타는 미로', 6: '우주 미로' }
const PUZZLE_LEVEL_LABELS = { 1: '16조각', 2: '20조각', 3: '25조각', 4: '30조각', 5: '36조각', 6: '42조각', 7: '48조각', 8: '56조각', 9: '64조각', 10: '80조각' }
const POPNPOP_MAX_LEVEL = 50

// 난이도별 최단 시간 막대(시간형 게임 공용). 기록 없으면 null 반환.
function levelTimeBars(meta, labels, color) {
  const byLevel = (meta && meta.bestTimeByLevel) || {}
  const levels = Object.keys(byLevel)
    .map((k) => ({ lv: parseInt(k, 10), ms: byLevel[k] }))
    .filter((x) => Number.isFinite(x.lv) && Number.isFinite(x.ms))
    .sort((a, b) => a.lv - b.lv)
  if (!levels.length) return null
  const maxMs = Math.max(...levels.map((x) => x.ms))
  return levels
    .map((x) => bar(labels[x.lv] || `Lv.${x.lv}`, maxMs ? (x.ms / maxMs) * 100 : 0, color, fmtTime(x.ms)))
    .join('')
}
const CONFETTI_COLORS = ['#ff8fb1', '#ffd93b', '#9fe3b0', '#a8d8ff', '#d7c3ff', '#ffb38a']

const $ = (id) => document.getElementById(id)
const setText = (id, v) => { const el = $(id); if (el) el.textContent = v }
const gameColor = (id) => { const g = GAMES.find((x) => x.id === id); return g ? g.c2 : '#b18cff' }
const fmtTime = (ms) => { const s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') }
// 아이 이름 등 사용자 입력을 innerHTML 에 넣기 전 이스케이프(레이아웃/주입 방지)
const escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
// 부모님 방에서 '보고 있는' 아이(통계/도장 전환용) — 활성(플레이 중) 프로필과 별개의 '뷰' 상태
let viewedProfileId = null
// '새 친구 만들기' 폼의 임시 선택값
let _newSel = { avatar: AVATARS[0], themeColor: THEME_COLORS[0].id }

// ───────────────────────── 게임 선택 카드 ─────────────────────────
function statText(id, st) {
  if (!st || st.plays === 0) return '✨ 아직 안 해봤어요!'
  if (id === 'memory') {
    const stars = Math.max(0, (st.meta && st.meta.bestStars) || 0)
    return (stars > 0 ? '⭐'.repeat(stars) + ' ' : '') + `최고 별 ${stars} · ${st.plays}판`
  }
  // 시간형 게임(미로)은 점수가 없으므로 최단 기록(시간)으로 표시
  if (id === 'maze') {
    return st.bestTimeMs ? `⏱️ 최고 ${fmtTime(st.bestTimeMs)} · ${st.plays}판` : `🎮 ${st.plays}판`
  }
  return `🏅 최고 ${st.bestScore || 0}점 · ${st.plays}판`
}

function buildCard(game) {
  const a = document.createElement('a')
  a.className = 'card'
  a.href = game.path
  a.style.setProperty('--c1', game.c1)
  a.style.setProperty('--c2', game.c2)
  a.style.color = game.ink
  a.setAttribute('aria-label', `${game.title} — ${game.sub}`)

  const floaters = (game.floaters || []).map((e) => `<span>${e}</span>`).join('')
  const st = getGameStats(game.id)
  a.innerHTML = `
    <div class="card-floaters" aria-hidden="true">${floaters}</div>
    <div class="card-icon" aria-hidden="true">${game.icon}</div>
    <h2 class="card-title">${game.title}</h2>
    <p class="card-sub">${game.sub}</p>
    <div class="card-stat">${statText(game.id, st)}</div>
    <span class="card-go"><span class="play-arrow" aria-hidden="true">▶</span> 놀러가기</span>
  `
  // 스크린 타임 초과 시: 게임 진입을 막고 친근한 잠금 안내(활성 프로필 기준)
  a.addEventListener('click', (e) => {
    if (isOverLimit()) { e.preventDefault(); showModal('screenLockModal', 'screenLockClose') }
  })
  return a
}

function renderCards() {
  const wrap = $('cards')
  if (!wrap) return
  wrap.innerHTML = ''
  GAMES.forEach((g) => wrap.appendChild(buildCard(g)))
}

// ───────────────────────── 칭찬 도장(업적) ─────────────────────────
// 종합 성적표 배지: 모은 도장 N/총, 진행바, 미니 도장 점(획득=색/새것=팝)
function renderReport() {
  const list = getAchievements()
  const total = list.length
  const got = list.filter((a) => a.unlocked).length
  const newCount = list.filter((a) => a.isNew).length
  setText('rbCount', got)
  setText('rbTotal', total)
  const fill = $('rbFill')
  if (fill) fill.style.width = (total ? (got / total) * 100 : 0) + '%'
  const stamps = $('rbStamps')
  if (stamps) {
    stamps.innerHTML = list
      .map((a) => `<span class="dot ${a.unlocked ? 'on' : ''} ${a.isNew ? 'is-new' : ''}">${a.unlocked ? a.icon : '⚪'}</span>`)
      .join('')
  }
  const badge = $('reportBadge')
  if (badge) {
    badge.classList.toggle('has-new', newCount > 0)
    badge.setAttribute('aria-label', `모은 칭찬 도장 ${got}/${total}개 보기`)
  }
}

// 은은한 별가루 배경 채우기(모션 줄이기면 정적으로 표시)
function renderStardust() {
  const wrap = $('stardust')
  if (!wrap) return
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const n = reduce ? 14 : 34
  let html = ''
  for (let i = 0; i < n; i++) {
    const size = (1 + Math.random() * 2.6).toFixed(1)
    const left = (Math.random() * 100).toFixed(1)
    const top = (Math.random() * 100).toFixed(1)
    const tw = (2.5 + Math.random() * 4).toFixed(1)
    const df = (10 + Math.random() * 12).toFixed(1)
    const delay = (Math.random() * 4).toFixed(1)
    const op = (0.3 + Math.random() * 0.5).toFixed(2)
    html += `<i style="width:${size}px;height:${size}px;left:${left}%;top:${top}%;opacity:${op};--tw:${tw}s;--df:${df}s;animation-delay:${delay}s,${delay}s"></i>`
  }
  wrap.innerHTML = html
}

// 런처 안내 토스트(복구 성공 등)
let _toastTimer = null
function launcherToast(text, ms) {
  const t = $('launcherToast')
  if (!t) return
  t.innerHTML = text
  t.classList.add('is-show')
  if (_toastTimer) clearTimeout(_toastTimer)
  _toastTimer = setTimeout(() => t.classList.remove('is-show'), ms || 3600)
}

// 도장 그리드 렌더 → 새로 딴 도장 목록 반환
function renderAchStamps() {
  const list = $('achList')
  if (!list) return []
  const items = getAchievements()
  list.innerHTML = items
    .map((a) => {
      const cls = 'ach-item ' + (a.unlocked ? 'is-unlocked' : 'is-locked') + (a.isNew ? ' is-new' : '')
      const stampStyle = a.unlocked ? `--stamp:${a.color}` : ''
      const icon = a.unlocked ? a.icon : '🔒'
      const desc = a.unlocked ? a.desc : '아직 잠겨 있어요'
      return `<div class="${cls}">
        <div class="ach-stamp" style="${stampStyle}">${icon}</div>
        <div class="ach-stamp-title">${a.title}</div>
        <div class="ach-stamp-desc">${desc}</div>
      </div>`
    })
    .join('')
  return items.filter((a) => a.isNew)
}

function spawnConfetti(container, n = 26) {
  if (!container) return
  container.innerHTML = ''
  const frag = document.createDocumentFragment()
  for (let i = 0; i < n; i++) {
    const piece = document.createElement('i')
    piece.style.left = (Math.random() * 100).toFixed(1) + '%'
    piece.style.background = CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0]
    piece.style.animationDelay = (Math.random() * 0.25).toFixed(2) + 's'
    piece.style.animationDuration = (0.9 + Math.random() * 0.6).toFixed(2) + 's'
    frag.appendChild(piece)
  }
  container.appendChild(frag)
  window.setTimeout(() => { if (container) container.innerHTML = '' }, 2200)
}

// ───────────────────────── 부모님 대시보드 ─────────────────────────
function bar(label, pct, color, valText) {
  const w = Math.max(0, Math.min(100, pct))
  return `<div class="dash-row">
    <span class="dash-label">${label}</span>
    <span class="dash-track"><span class="dash-fill" style="width:${w}%;background:linear-gradient(90deg, ${color}, ${color})"></span></span>
    <span class="dash-val">${valText}</span>
  </div>`
}

// 부모님 방 — 아이별 탭(탭 클릭 시 viewedProfileId 전환 → 통계/도장 다시 그림)
function renderChildTabs() {
  const wrap = $('childTabs')
  if (!wrap) return
  const profiles = getProfiles()
  wrap.innerHTML = profiles
    .map((p) => `<button class="child-tab ${p.id === viewedProfileId ? 'is-active' : ''}" type="button" role="tab"
        aria-selected="${p.id === viewedProfileId ? 'true' : 'false'}" data-profile="${p.id}">
        <span class="child-tab-avatar" aria-hidden="true">${p.avatar}</span>
        <span class="child-tab-name">${escapeHtml(p.name)}</span>
      </button>`)
    .join('')
  Array.prototype.forEach.call(wrap.children, (b) => b.addEventListener('click', () => {
    viewedProfileId = b.dataset.profile
    renderChildTabs()
    renderDashboard(viewedProfileId)
    renderParentControls(viewedProfileId)
    sfx.pop()
  }))
}

// 부모님 방 — 보고 있는 아이의 ⏰ 플레이 시간 + 📷 커스텀 퍼즐 컨트롤 표시 갱신
function renderParentControls(profileId) {
  const sel = $('limitSelect')
  if (sel) sel.value = String(getDailyLimit(profileId) || 0)
  const info = $('screentimeInfo')
  if (info) {
    const si = getScreenInfo(profileId)
    if (!si.limitMin) info.textContent = '제한이 없어요 — 마음껏 놀 수 있어요. 🌈'
    else {
      const usedMin = Math.floor(si.usedSec / 60)
      info.textContent = `오늘 ${usedMin}분 놀았어요 · 하루 ${si.limitMin}분 제한` + (si.locked ? ' · 오늘은 끝! 👋' : '')
    }
  }
  const prev = $('cpPreview'); const clr = $('cpClear'); const cpInfo = $('cpInfo')
  const pid = getCustomPuzzleId(profileId)
  if (prev) prev.style.backgroundImage = ''
  if (clr) clr.hidden = !pid
  if (pid) {
    loadPhoto(pid).then((url) => { if (url && prev) prev.style.backgroundImage = `url("${url}")` }).catch(() => {})
    if (cpInfo) cpInfo.textContent = "등록됨 ✓ 퍼즐에서 '우리 가족 사진(16조각)'으로 만나요."
  } else if (cpInfo) {
    cpInfo.textContent = "기기에서 사진을 고르면, 그 아이의 퍼즐에 '우리 가족 사진(16조각)'이 추가돼요."
  }
}

// 부모님 방 — 해당 아이가 모은 칭찬 도장 미니 그리드
function dashStampsHtml(profileId) {
  const items = getAchievements(profileId)
  const got = items.filter((a) => a.unlocked).length
  return `<div class="dash-section">
    <h3 class="dash-title">🏆 모은 칭찬 도장 (${got}/${items.length})</h3>
    <div class="dash-stamps">
      ${items
        .map((a) => `<div class="dash-stamp ${a.unlocked ? '' : 'is-locked'}" title="${escapeHtml(a.title)}">${a.unlocked ? a.icon : '🔒'}<span class="dash-stamp-cap">${a.unlocked ? escapeHtml(a.title) : ''}</span></div>`)
        .join('')}
    </div>
  </div>`
}

function renderDashboard(profileId) {
  const el = $('dashboard')
  if (!el) return
  const d = getDashboard(profileId)
  const mem = d.games.memory || { plays: 0, meta: {} }
  const pop = d.games.popnpop || { plays: 0, meta: {} }
  const mz = d.games.maze || { plays: 0, meta: {} }
  const pz = d.games.puzzle || { plays: 0, meta: {} }

  // A) 게임별 플레이 비율
  let secA
  if (d.totalPlays === 0) {
    secA = `<div class="dash-empty">아직 플레이 기록이 없어요.</div>`
  } else {
    secA = d.perGame
      .map((p) => bar(`${p.icon} ${p.title}`, p.pct, gameColor(p.id), `${p.plays}판 · ${p.pct}%`))
      .join('')
  }

  // B) 풍선 터트리기(학습) — 복습 횟수 / 도달 레벨
  let secB
  if (pop.plays === 0) {
    secB = `<div class="dash-empty">아직 풍선 학습 기록이 없어요.</div>`
  } else {
    const lvl = (pop.meta && pop.meta.bestLevel) || 0
    const modeLabel = { ko: '한글', en: '영어', math: '산수' }[pop.meta && pop.meta.lastMode] || '한글'
    secB =
      bar('🔁 복습 횟수', Math.min(100, (pop.plays / 10) * 100), '#8fc4ff', `${pop.plays}번`) +
      bar('📈 도달 레벨', (lvl / POPNPOP_MAX_LEVEL) * 100, '#7aa8ff', `Lv.${lvl}`) +
      `<div class="dash-val" style="text-align:left;margin-top:2px">최고 ${pop.bestScore || 0}점 · 최근 모드 ${modeLabel}</div>`
  }

  // C) 기억력(memory) 난이도별 최단 기록
  const secC = levelTimeBars(mem.meta, MEMORY_LEVEL_LABELS, '#ff9ec4')
    || `<div class="dash-empty">아직 기억력 게임 클리어 기록이 없어요.</div>`

  // C2) 미로 탈출(maze) 난이도별 최단 기록
  const secMaze = levelTimeBars(mz.meta, MAZE_LEVEL_LABELS, '#9fe0b6')
    || `<div class="dash-empty">아직 미로 탈출 기록이 없어요.</div>`

  // C3) 조각 퍼즐(puzzle) 난이도별 최단 기록
  const secPuzzle = levelTimeBars(pz.meta, PUZZLE_LEVEL_LABELS, '#b9a6f0')
    || `<div class="dash-empty">아직 퍼즐 완성 기록이 없어요.</div>`

  // D) 가이딩 텍스트
  const guides = []
  if (d.totalPlays === 0) {
    guides.push('아직 놀이 기록이 없어요. 아이와 함께 첫 놀이를 시작해 보세요! 🌱')
  } else {
    if (d.favoriteId) {
      const fav = d.perGame.find((p) => p.id === d.favoriteId)
      if (fav) guides.push(`우리 아이는 <b>${fav.icon} ${fav.title}</b> 놀이를 가장 좋아해요! (${fav.plays}번)`)
    }
    if (mem.plays > 0) {
      const lab = MEMORY_LEVEL_LABELS[(mem.meta && mem.meta.bestLevel) || 0]
      guides.push(`기억력 놀이를 <b>${mem.plays}번</b> 했고${lab ? `, 가장 어려운 <b>${lab}</b> 단계까지 도전했어요!` : ' 무럭무럭 자라고 있어요!'}`)
    }
    if (pop.plays > 0) {
      const champ = ((pop.meta && pop.meta.bestLevel) || 0) >= 5
      guides.push(`풍선 학습(글자·숫자)을 <b>${pop.plays}번</b> 복습했어요${champ ? ' — 벌써 챔피언! 🏆' : '.'}`)
    }
    if (mz.plays > 0) {
      const lab = MAZE_LEVEL_LABELS[(mz.meta && mz.meta.bestLevel) || 0]
      guides.push(`미로 탈출을 <b>${mz.plays}번</b> 했고${lab ? `, <b>${lab}</b> 까지 풀었어요!` : '!'}`)
    }
    if (pz.plays > 0) {
      const lab = PUZZLE_LEVEL_LABELS[(pz.meta && pz.meta.bestLevel) || 0]
      guides.push(`조각 퍼즐을 <b>${pz.plays}번</b> 맞췄고${lab ? `, <b>${lab}</b> 까지 완성했어요!` : '!'}`)
    }
  }

  // E) AI 맞춤형 성장 코멘트 — 5게임 플레이 비율로 흥미 영역 추정
  const coachText = coachComment(d, mem, pop, mz)

  el.innerHTML = `
    <div class="dash-section">
      <h3 class="dash-title">🎮 어떤 놀이를 좋아할까?</h3>
      ${secA}
    </div>
    <div class="dash-section">
      <h3 class="dash-title">🎈 풍선 학습(언어·산수)</h3>
      ${secB}
    </div>
    <div class="dash-section">
      <h3 class="dash-title">🐾 기억력 난이도별 최단 기록</h3>
      ${secC}
    </div>
    <div class="dash-section">
      <h3 class="dash-title">🐱 미로 탈출 난이도별 최단 기록</h3>
      ${secMaze}
    </div>
    <div class="dash-section">
      <h3 class="dash-title">🧩 조각 퍼즐 난이도별 최단 기록</h3>
      ${secPuzzle}
    </div>
    ${dashStampsHtml(profileId)}
    <div class="dash-guide">${guides.map((g) => `<p>${g}</p>`).join('')}</div>
    <div class="dash-coach dash-section">
      <h3 class="coach-title">📖 우리 아이 성장 가이드</h3>
      <p class="coach-text">${coachText}</p>
    </div>
  `
}

// 5게임 플레이 비율로 흥미 영역을 추정해 친절한 맞춤 코멘트를 만든다.
function coachComment(d, mem, pop, mz) {
  if (!d.totalPlays) {
    return '아직 첫 발자국 전이에요. 아이와 함께 첫 놀이를 시작하면, 이곳에 아이의 흥미와 강점에 맞춘 가이드가 나타나요! 🌱'
  }
  const spot = d.games.spot || { plays: 0 }
  const dodge = d.games.dodge || { plays: 0 }
  const puzzle = d.games.puzzle || { plays: 0 }
  const cats = [
    { key: 'learn', n: pop.plays },
    { key: 'spatial', n: (mz.plays || 0) + (spot.plays || 0) + (puzzle.plays || 0) },
    { key: 'memory', n: mem.plays },
    { key: 'react', n: dodge.plays },
  ].sort((a, b) => b.n - a.n)
  const top = cats[0]
  const ratio = d.totalPlays ? top.n / d.totalPlays : 0

  if (top.n === 0 || ratio < 0.4) {
    return '여러 놀이를 골고루 즐기는 균형 잡힌 아이예요! 🌈 그날그날 좋아하는 놀이로 칭찬 도장을 함께 모아보세요.'
  }
  if (top.key === 'learn') {
    return '우리 아이는 <b>논리적 사고와 언어 학습</b>에 강한 흥미를 보이고 있어요! 📚 모은 칭찬 도장을 함께 보며 오늘 배운 글자·숫자를 이야기 나눠보세요.'
  }
  if (top.key === 'spatial') {
    const mazeMax = ((mz.meta && mz.meta.bestLevel) || 0) >= 6
    const puzzleMaster = ((puzzle.meta && puzzle.meta.bestLevel) || 0) >= 5
    const tip = mazeMax
      ? '벌써 \'우주 미로🌌\' 까지 정복했어요 — 정말 대단해요!'
      : (puzzleMaster ? '\'퍼즐 마스터🧩\' 도장도 받았네요! 더 큰 조각 퍼즐에 도전해 보세요.' : '\'우주 미로🌌\' 나 \'조각 퍼즐🧩\' 같은 큰 단계에 도전해봤는지 확인해 보세요!')
    return `<b>공간 인지력과 집중력</b>이 아주 뛰어난 상태예요. 🧭 ${tip}`
  }
  if (top.key === 'memory') {
    return '<b>기억력과 패턴 인지</b>가 쑥쑥 자라고 있어요. ⭐ 짝꿍 친구 찾기에서 별 셋(암기왕🌟)에 함께 도전해 보세요!'
  }
  return '<b>순발력과 반응 속도</b>가 반짝이는 아이예요. 🚀 우주선 진화(200점, 회피 달인🛸)에 함께 도전해 보세요!'
}

// ───────────────────────── 모달 공통(포커스 관리 + 포커스 트랩) ─────────────────────────
let _lastFocus = null
// 모달 안에서 Tab 포커스가 빠져나가지 않도록(aria-modal 다이얼로그 접근성)
function focusablesIn(container) {
  return Array.from(container.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])'))
    .filter((el) => !el.disabled && el.offsetParent !== null)
}
function trapTab(modal, e) {
  if (e.key !== 'Tab') return
  const f = focusablesIn(modal)
  if (!f.length) return
  const first = f[0], last = f[f.length - 1]
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}
function showModal(modalId, focusId) {
  const m = $(modalId)
  if (!m) return
  _lastFocus = document.activeElement
  m.hidden = false
  const f = $(focusId)
  if (f) f.focus()
}
function hideModal(modalId) {
  const m = $(modalId)
  if (m) m.hidden = true
  if (_lastFocus && typeof _lastFocus.focus === 'function') _lastFocus.focus()
  _lastFocus = null
}
function closeAllModals() {
  let any = false
  ;['achModal', 'parentsModal', 'settingsModal', 'profileModal', 'screenLockModal'].forEach((id) => { const m = $(id); if (m && !m.hidden) { m.hidden = true; any = true } })
  if (any && _lastFocus && typeof _lastFocus.focus === 'function') _lastFocus.focus()
  _lastFocus = null
}

const prefersReducedMotion = () =>
  !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)

function openAchModal() {
  const newItems = renderAchStamps() // 보기 전 상태 기준으로 is-new 표시
  showModal('achModal', 'achClose')
  // 모션 줄이기 설정이면 폭죽 DOM 자체를 만들지 않음(애니메이션도 어차피 꺼짐)
  if (newItems.length && !prefersReducedMotion()) spawnConfetti($('achConfetti'))
  if (newItems.length) celebrate() // 새 칭찬 도장이 있으면 화면 전체 폭죽(reduced-motion 은 함수 내부에서 처리)
  markAchievementsViewed() // 본 것으로 표시 → 다음부터는 연출 안 함
  renderReport() // 성적표 배지의 새 도장 표시 갱신
}

function openParents() {
  // 부모님 확인 곱셈 게이트 — 7~8세가 우발적으로 진입/초기화하지 못하도록
  const a = 6 + Math.floor(Math.random() * 4) // 6~9
  const b = 6 + Math.floor(Math.random() * 4) // 6~9
  const ans = window.prompt(`부모님 확인이에요 🔒\n${a} × ${b} = ?`)
  if (ans === null) return
  if (parseInt(ans, 10) !== a * b) { window.alert('앗, 답이 달라요! 🙂'); return }
  // 기본 보기 = 현재 플레이 중인 아이(없으면 첫 프로필)
  const profiles = getProfiles()
  viewedProfileId = getActiveProfileId() || (profiles[0] && profiles[0].id) || null
  renderChildTabs()
  renderDashboard(viewedProfileId)
  renderParentControls(viewedProfileId)
  updateSyncBadge(getSyncStatus()) // 모달 열 때 최신 동기화 상태 반영
  showModal('parentsModal', 'parentsClose')
}

// ───────────────────────── 기록 백업 / 불러오기 ─────────────────────────
function downloadBackup() {
  try {
    const text = exportState()
    const date = new Date().toISOString().slice(0, 10)
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `formykids_backup_${date}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (e) {
    window.alert('백업에 실패했어요.')
  }
}

function restoreFromFile(file) {
  const reader = new FileReader()
  reader.onload = () => {
    const res = importState(String(reader.result))
    if (res.ok) {
      applyProfile()
      renderCards()
      renderReport()
      if ($('parentsModal') && !$('parentsModal').hidden) {
        viewedProfileId = getActiveProfileId() || (getProfiles()[0] && getProfiles()[0].id) || null
        renderChildTabs()
        renderDashboard(viewedProfileId)
      }
      if ($('achModal') && !$('achModal').hidden) renderAchStamps()
      const got = getUnlockedCount()
      const total = getTotalAchievements()
      launcherToast(`성공적으로 복구되었어요! 🎉<br/>아이의 소중한 칭찬 도장 <b>${got}/${total}개</b>가 다시 살아났어요.`, 4200)
      // 복구된 백업에 활성 프로필이 없으면(예: 프로필만 여럿) '누가 놀까요?' 로 유도
      if (!getActiveProfileId()) openProfileSelector({ firstRun: true })
    } else {
      window.alert('이 파일은 불러올 수 없어요 😢\n(' + res.reason + ')')
    }
  }
  reader.onerror = () => window.alert('파일을 읽지 못했어요.')
  reader.readAsText(file)
}

// ───────────────────────── 내 프로필(My Avatar) ─────────────────────────
// 선택한 테마색을 --fmk-primary 로 반영(런처 헤더 등) + 아바타 버튼 갱신
function applyProfile() {
  const p = getProfile()
  const hex = themeColorHex(p.themeColor)
  if (hex) document.documentElement.style.setProperty('--fmk-primary', hex)
  const av = $('profileAvatar')
  if (av) av.textContent = p.avatar || '🙂'
  const btn = $('profileBtn')
  if (btn) btn.setAttribute('aria-label', (p.name ? p.name + ' — ' : '') + '내 프로필 (아바타·색·이름 바꾸기)')
}
function markProfileSelection() {
  const p = getProfile()
  const ag = $('avatarGrid')
  if (ag) Array.prototype.forEach.call(ag.children, (b) => b.classList.toggle('is-selected', b.dataset.avatar === p.avatar))
  const cg = $('colorGrid')
  if (cg) Array.prototype.forEach.call(cg.children, (b) => b.classList.toggle('is-selected', b.dataset.color === p.themeColor))
  const nm = $('profileName')
  if (nm && document.activeElement !== nm) nm.value = p.name || '' // 입력 중엔 덮어쓰지 않음
}
function buildProfileModal() {
  const ag = $('avatarGrid')
  if (ag) {
    ag.innerHTML = AVATARS.map((a) => `<button class="avatar-opt" type="button" data-avatar="${a}" aria-label="아바타 ${a}">${a}</button>`).join('')
    Array.prototype.forEach.call(ag.children, (b) => b.addEventListener('click', () => {
      setProfile({ avatar: b.dataset.avatar }); applyProfile(); markProfileSelection(); sfx.pop()
    }))
  }
  const cg = $('colorGrid')
  if (cg) {
    cg.innerHTML = THEME_COLORS.map((t) => `<button class="color-opt" type="button" data-color="${t.id}" aria-label="${t.label}" title="${t.label}" style="background:${t.color}"></button>`).join('')
    Array.prototype.forEach.call(cg.children, (b) => b.addEventListener('click', () => {
      setProfile({ themeColor: b.dataset.color }); applyProfile(); markProfileSelection(); sfx.pop()
    }))
  }
  // 이름 입력(활성 프로필 이름 수정) — 입력 listener 는 1회만 등록(buildProfileModal 은 init 에서 1회 호출)
  const nm = $('profileName')
  if (nm) nm.addEventListener('input', () => { const v = nm.value.trim(); if (v) { setProfile({ name: v }); applyProfile() } })
  markProfileSelection()
}

// ───────────────────────── 프로필 선택('누가 놀까요?') ─────────────────────────
// 활성 프로필이 바뀐 뒤 화면 전체를 그 아이 기준으로 다시 그린다.
function onProfileChosen() {
  const m = $('profileSelectModal'); if (m) m.hidden = true
  const c = $('psCreate'); if (c) c.hidden = true
  const l = $('psList'); if (l) l.hidden = false
  _setGateLock(false)
  applyProfile()
  renderCards()
  renderReport()
  markProfileSelection() // 내 프로필 모달의 선택/이름 표시 갱신(listener 재등록 X)
  if (_lastFocus && typeof _lastFocus.focus === 'function') _lastFocus.focus()
  _lastFocus = null
}

function renderProfileSelector() {
  const list = $('psList')
  if (!list) return
  const profiles = getProfiles()
  const cards = profiles
    .map((p) => {
      const hex = themeColorHex(p.themeColor) || '#ffd6ec'
      return `<button class="ps-profile" type="button" data-profile="${p.id}" style="--ps-ring:${hex}" aria-label="${escapeHtml(p.name)} 으로 놀기">
        <span class="ps-avatar" aria-hidden="true">${p.avatar}</span>
        <span class="ps-name">${escapeHtml(p.name)}</span>
        <span class="ps-meta">${p.totalPlays}판 · 도장 ${p.unlocked}개</span>
      </button>`
    })
    .join('')
  const add = `<button class="ps-add" type="button" id="psAddBtn" aria-label="새 친구 만들기">
    <span class="ps-avatar" aria-hidden="true">＋</span>
    <span class="ps-name">새 친구</span>
  </button>`
  list.innerHTML = cards + add
  Array.prototype.forEach.call(list.querySelectorAll('.ps-profile'), (b) => b.addEventListener('click', () => {
    setActiveProfile(b.dataset.profile); sfx.pop(); onProfileChosen()
  }))
  const addBtn = $('psAddBtn')
  if (addBtn) addBtn.addEventListener('click', showCreateForm)
}

function markNewSelection() {
  const ag = $('psAvatarGrid')
  if (ag) Array.prototype.forEach.call(ag.children, (b) => b.classList.toggle('is-selected', b.dataset.avatar === _newSel.avatar))
  const cg = $('psColorGrid')
  if (cg) Array.prototype.forEach.call(cg.children, (b) => b.classList.toggle('is-selected', b.dataset.color === _newSel.themeColor))
}
function showCreateForm() {
  _newSel = { avatar: AVATARS[0], themeColor: THEME_COLORS[0].id }
  const nameInput = $('psName'); if (nameInput) nameInput.value = ''
  markNewSelection()
  const l = $('psList'); if (l) l.hidden = true
  const c = $('psCreate'); if (c) c.hidden = false
  if (nameInput) nameInput.focus()
}
function hideCreateForm() {
  const c = $('psCreate'); if (c) c.hidden = true
  const l = $('psList'); if (l) l.hidden = false
}
// 새 친구 만들기 폼(아바타/색 그리드 + 확인/취소) — init 에서 1회만 빌드
function buildSelectorCreateForm() {
  const ag = $('psAvatarGrid')
  if (ag) {
    ag.innerHTML = AVATARS.map((a) => `<button class="avatar-opt" type="button" data-avatar="${a}" aria-label="아바타 ${a}">${a}</button>`).join('')
    Array.prototype.forEach.call(ag.children, (b) => b.addEventListener('click', () => { _newSel.avatar = b.dataset.avatar; markNewSelection(); sfx.pop() }))
  }
  const cg = $('psColorGrid')
  if (cg) {
    cg.innerHTML = THEME_COLORS.map((t) => `<button class="color-opt" type="button" data-color="${t.id}" aria-label="${t.label}" title="${t.label}" style="background:${t.color}"></button>`).join('')
    Array.prototype.forEach.call(cg.children, (b) => b.addEventListener('click', () => { _newSel.themeColor = b.dataset.color; markNewSelection(); sfx.pop() }))
  }
  const confirm = $('psCreateConfirm')
  if (confirm) confirm.addEventListener('click', () => {
    const nameInput = $('psName')
    const name = nameInput ? nameInput.value.trim() : ''
    createProfile({ name, avatar: _newSel.avatar, themeColor: _newSel.themeColor }) // 즉시 활성화
    sfx.pop()
    onProfileChosen()
  })
  const cancel = $('psCreateCancel')
  if (cancel) cancel.addEventListener('click', hideCreateForm)
}

// '누가 놀까요?' 화면 열기. firstRun(또는 활성 프로필 없음)이면 닫기/배경클릭으로 못 빠져나감.
// 첫 실행 가드 중에는 좌상단 프로필/설정 버튼(모달 위 z-index)을 잠가, 게이트 우회로 유령 프로필이
// 생성되는 걸 막는다(프로필 버튼 → 내 프로필 모달 → setProfile → 기본 프로필 자동 생성 경로 차단).
function _setGateLock(locked) {
  ;['profileBtn', 'settingsBtn'].forEach((id) => {
    const b = $(id)
    if (!b) return
    b.style.pointerEvents = locked ? 'none' : ''
    b.style.opacity = locked ? '0.35' : ''
    if (locked) b.setAttribute('aria-hidden', 'true'); else b.removeAttribute('aria-hidden')
  })
}
function openProfileSelector(opts) {
  const firstRun = !!(opts && opts.firstRun)
  renderProfileSelector()
  hideCreateForm()
  const mustChoose = firstRun || !getActiveProfileId()
  const closeBtn = $('profileSelectClose')
  if (closeBtn) closeBtn.style.display = mustChoose ? 'none' : ''
  _setGateLock(mustChoose) // 반드시 선택해야 하는 동안엔 사이드 버튼 잠금
  showModal('profileSelectModal', mustChoose ? null : 'profileSelectClose')
  if (!getProfiles().length) showCreateForm() // 프로필이 하나도 없으면 곧장 만들기 폼으로
}
// 닫기 허용은 '활성 프로필이 있을 때'만(첫 실행 가드)
function closeSelectorIfAllowed() {
  if (!getActiveProfileId()) return
  hideModal('profileSelectModal')
  hideCreateForm()
  _setGateLock(false)
}

// 클라우드 동기화 상태 배지(부모님 방 우측 상단) 갱신
const SYNC_BADGE = {
  online:  { dot: '🟢', label: '연결됨' },
  syncing: { dot: '🟡', label: '동기화 중' },
  offline: { dot: '🔴', label: '오프라인' },
}
function updateSyncBadge(status) {
  const st = SYNC_BADGE[status] ? status : 'offline'
  const badge = $('syncBadge'); const dot = $('syncDot'); const label = $('syncLabel')
  if (badge) badge.dataset.status = st
  if (dot) dot.textContent = SYNC_BADGE[st].dot
  if (label) label.textContent = SYNC_BADGE[st].label
}

// ───────────────────────── 📱 PWA 설치 유도(홈 화면에 추가) ─────────────────────────
let _deferredInstall = null
function _isStandalone() {
  try { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true } catch (e) { return false }
}
function setupInstallPrompt() {
  const btn = $('installBtn')
  if (!btn) return
  if (_isStandalone()) { btn.hidden = true; return } // 이미 설치되어 standalone 으로 실행 중 → 버튼 숨김
  // beforeinstallprompt 를 가로채(브라우저 기본 미니바 억제) 우리 버튼으로 설치를 유도.
  // 이벤트가 오지 않는 브라우저(iOS Safari 등)/이미 설치됨 → 버튼은 hidden 그대로(자연스럽게 숨김).
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    _deferredInstall = e
    btn.hidden = false
  })
  window.addEventListener('appinstalled', () => {
    _deferredInstall = null
    btn.hidden = true
    launcherToast('앱이 설치됐어요! 🎉 이제 홈 화면에서 바로 열 수 있어요.')
  })
  btn.addEventListener('click', async () => {
    if (!_deferredInstall) { btn.hidden = true; return }
    _deferredInstall.prompt()
    try { await _deferredInstall.userChoice } catch (e) {}
    _deferredInstall = null
    btn.hidden = true // 프롬프트는 1회용 → 숨김(설치 완료 시 appinstalled 로도 정리)
  })
}

// ───────────────────────── 초기화/이벤트 ─────────────────────────
function init() {
  applyProfile()       // 저장된 테마색/아바타 먼저 반영
  buildProfileModal()
  buildSelectorCreateForm() // '누가 놀까요?' 의 새 친구 만들기 폼(1회 빌드)
  renderCards()
  renderReport()
  renderStardust()
  sfx.armBGM('calm')   // 첫 제스처에 잔잔한 런처 BGM 시작(음소거면 X)

  // 클라우드 동기화(Offline First): 온라인이면 백그라운드로 원격과 화해.
  // 오프라인이면 아무 영향 없이 로컬만 사용한다.
  updateSyncBadge(getSyncStatus())
  initSync({
    onStatus: updateSyncBadge,
    onSync: () => { renderCards(); renderReport(); renderStardust() }, // 원격 데이터 채택 시 화면 갱신
  })

  const profileBtn = $('profileBtn')
  if (profileBtn) profileBtn.addEventListener('click', () => {
    if (!getActiveProfileId()) { openProfileSelector({ firstRun: true }); return } // 선택 전엔 편집 대신 '누가 놀까요?'
    markProfileSelection(); showModal('profileModal', 'profileClose')
  })
  const profileClose = $('profileClose')
  if (profileClose) profileClose.addEventListener('click', () => hideModal('profileModal'))

  // '🔄 다른 친구 / ➕ 새 친구' — 내 프로필 모달에서 선택 화면 열기
  const switchBtn = $('switchProfileBtn')
  if (switchBtn) switchBtn.addEventListener('click', () => { hideModal('profileModal'); openProfileSelector({ firstRun: false }) })
  const psClose = $('profileSelectClose')
  if (psClose) psClose.addEventListener('click', closeSelectorIfAllowed)

  const reportBadge = $('reportBadge')
  if (reportBadge) reportBadge.addEventListener('click', openAchModal)
  const parentsChip = $('parentsChip')
  if (parentsChip) parentsChip.addEventListener('click', openParents)

  setupInstallPrompt() // 📱 앱 설치하기 버튼(beforeinstallprompt 잡힐 때만 노출)

  // ⏰ 플레이 시간 제한 (부모님 방 — 보고 있는 아이 대상)
  const limitSelect = $('limitSelect')
  if (limitSelect) limitSelect.addEventListener('change', () => {
    if (!viewedProfileId) return
    setDailyLimit(viewedProfileId, parseInt(limitSelect.value, 10) || 0)
    renderParentControls(viewedProfileId)
  })

  // 📷 커스텀(가족 사진) 퍼즐 — 업로드 시 캔버스 압축 → IndexedDB 저장 → 스토어엔 id 만
  const cpFile = $('cpFile')
  if (cpFile) cpFile.addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0]
    e.target.value = '' // 같은 파일 재선택 가능하게
    if (!f || !viewedProfileId) return
    try {
      const dataURL = await compressImage(f, { maxSize: 800, type: 'image/webp', quality: 0.8, square: true })
      const oldId = getCustomPuzzleId(viewedProfileId)
      const id = await savePhoto(dataURL)
      setCustomPuzzleId(viewedProfileId, id)
      if (oldId && oldId !== id) deletePhoto(oldId) // 이전 사진 정리(IndexedDB 고아 방지)
      renderParentControls(viewedProfileId)
      launcherToast('가족 사진이 등록됐어요! 🧩 퍼즐에서 만나요.')
    } catch (err) {
      window.alert('사진을 불러오지 못했어요 😢 다른 사진으로 다시 시도해 주세요.')
    }
  })
  const cpClear = $('cpClear')
  if (cpClear) cpClear.addEventListener('click', () => {
    if (!viewedProfileId) return
    const oldId = getCustomPuzzleId(viewedProfileId)
    setCustomPuzzleId(viewedProfileId, null)
    if (oldId) deletePhoto(oldId)
    renderParentControls(viewedProfileId)
  })

  const screenLockClose = $('screenLockClose')
  if (screenLockClose) screenLockClose.addEventListener('click', () => hideModal('screenLockModal'))

  // 런처 체류 시간도 활성 프로필의 당일 누적에 반영(제한이 설정된 경우만, 화면이 보일 때만)
  window.setInterval(() => {
    if (document.hidden) return
    if (getActiveProfileId() && getDailyLimit()) addUsageToday(20)
  }, 20000)

  // ⚙️ 설정(소리/전체화면) — 우측 상단 버튼 → 모달
  const settingsBtn = $('settingsBtn')
  const soundToggle = $('soundToggle')
  const soundState = $('soundState')
  const fsToggle = $('fsToggle')
  const fsState = $('fsState')

  const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement)
  function syncSettings() {
    const soundOn = !sfx.isMuted()
    if (soundToggle) soundToggle.setAttribute('aria-checked', soundOn ? 'true' : 'false')
    if (soundState) soundState.textContent = soundOn ? '켜짐' : '꺼짐'
    const fsOn = isFullscreen()
    if (fsToggle) fsToggle.setAttribute('aria-checked', fsOn ? 'true' : 'false')
    if (fsState) fsState.textContent = fsOn ? '켜짐' : '꺼짐'
  }
  syncSettings()
  if (settingsBtn) settingsBtn.addEventListener('click', () => { syncSettings(); showModal('settingsModal', 'settingsClose') })
  const settingsClose = $('settingsClose')
  if (settingsClose) settingsClose.addEventListener('click', () => hideModal('settingsModal'))

  if (soundToggle) soundToggle.addEventListener('click', () => {
    const nowMuted = sfx.toggleMute() // 전 게임 공유(localStorage)
    if (!nowMuted) { sfx.resume(); sfx.pop() } // 켤 때 짧은 확인음
    syncSettings()
  })
  if (fsToggle) fsToggle.addEventListener('click', () => {
    // 거부/실패 시 Promise rejection 으로 전역 크래시 가드가 뜨지 않도록 반드시 catch
    try {
      if (isFullscreen()) {
        const ex = document.exitFullscreen || document.webkitExitFullscreen
        const p = ex && ex.call(document); if (p && p.catch) p.catch(() => {})
      } else {
        const el = document.documentElement
        const rq = el.requestFullscreen || el.webkitRequestFullscreen
        const p = rq && rq.call(el); if (p && p.catch) p.catch(() => {})
      }
    } catch (e) {}
  })
  document.addEventListener('fullscreenchange', syncSettings)
  document.addEventListener('webkitfullscreenchange', syncSettings)

  // 첫 제스처에 오디오 컨텍스트 깨우기(자동재생 정책 대응)
  window.addEventListener('pointerdown', () => sfx.resume(), { once: true })

  const achClose = $('achClose')
  if (achClose) achClose.addEventListener('click', () => hideModal('achModal'))
  const parentsClose = $('parentsClose')
  if (parentsClose) parentsClose.addEventListener('click', () => hideModal('parentsModal'))

  ;['achModal', 'parentsModal', 'settingsModal', 'profileModal', 'screenLockModal'].forEach((id) => {
    const m = $(id)
    if (!m) return
    m.addEventListener('click', (e) => { if (e.target === m) hideModal(id) }) // 배경(딤) 클릭 닫기
    m.addEventListener('keydown', (e) => trapTab(m, e))                       // Tab 포커스 트랩
  })
  // 프로필 선택 화면은 첫 실행 가드가 있어 따로 처리(활성 프로필 있을 때만 배경 클릭으로 닫힘)
  const psModal = $('profileSelectModal')
  if (psModal) {
    psModal.addEventListener('click', (e) => { if (e.target === psModal) closeSelectorIfAllowed() })
    psModal.addEventListener('keydown', (e) => trapTab(psModal, e))
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeAllModals(); closeSelectorIfAllowed() } })

  // 기록 지우기(부모님 방 안 — 이미 곱셈 게이트로 보호됨). '보고 있는 아이'의 기록만 초기화.
  const reset = $('achReset')
  if (reset) {
    reset.addEventListener('click', () => {
      if (!viewedProfileId) return // 안전 가드(보고 있는 아이가 없으면 no-op)
      const prof = getProfiles().find((p) => p.id === viewedProfileId)
      const nm = prof ? prof.name : '이 아이'
      if (!window.confirm(`${nm}의 모든 기록과 칭찬 도장을 지울까요? 되돌릴 수 없어요.`)) return
      const done = resetProfile(viewedProfileId)
      renderCards()
      renderReport()
      renderChildTabs()
      renderDashboard(viewedProfileId)
      // 칭찬 도장 모달이 열려 있던 경우에도 즉시 반영(방어적)
      if ($('achModal') && !$('achModal').hidden) renderAchStamps()
      if (done) window.alert(`${nm}의 기록을 지웠어요.`)
    })
  }

  // 기록 백업 / 불러오기 (부모님 방 안 — 이미 곱셈 게이트로 보호됨)
  const btnBackup = $('btnBackup')
  if (btnBackup) btnBackup.addEventListener('click', downloadBackup)
  const fileRestore = $('fileRestore')
  if (fileRestore) {
    fileRestore.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0]
      if (f) restoreFromFile(f)
      e.target.value = '' // 같은 파일 다시 선택 가능하게
    })
  }

  // 활성 프로필이 없으면(첫 실행 또는 마이그레이션 없이 새로 시작) '누가 놀까요?' 선택 화면을 띄운다.
  if (!getActiveProfileId()) openProfileSelector({ firstRun: true })
}

init()
