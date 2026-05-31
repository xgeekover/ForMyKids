// E2E 공통 헬퍼 — 첫 실행의 '누가 놀까요?' 선택 화면을 건너뛰기 위해
// 활성 프로필이 있는 v2 상태를 페이지 로드 전(localStorage)에 미리 심는다.
const GAME_IDS = ['memory', 'popnpop', 'dodge', 'maze', 'spot', 'puzzle']

function blankGames() {
  return Object.fromEntries(GAME_IDS.map((id) => [id, { plays: 0, bestScore: null, bestTimeMs: null, lastPlayed: null, meta: {} }]))
}

// 테스트용 프로필 1개 생성
export function makeProfile(opts = {}) {
  return {
    id: opts.id || 'e2e-1',
    name: opts.name || '테스트',
    avatar: opts.avatar || '🐶',
    themeColor: opts.themeColor || 'pink',
    createdAt: 1700000000000,
    totalPlays: opts.totalPlays || 0,
    games: opts.games || blankGames(),
    achievements: opts.achievements || {},
    seen: opts.seen || {},
    customPuzzleId: opts.customPuzzleId || null,
    dailyLimitMin: opts.dailyLimitMin != null ? opts.dailyLimitMin : null,
    screen: opts.screen || { date: '', usedSec: 0 },
  }
}

// 오늘 날짜 문자열(YYYY-MM-DD, 로컬) — 스크린 타임 시드용
export function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// v2 상태(profiles 배열 + activeProfileId) 만들기
export function buildSeedState({ profiles, activeProfileId } = {}) {
  const list = profiles && profiles.length ? profiles : [makeProfile()]
  return {
    version: 2,
    activeProfileId: activeProfileId || list[0].id,
    profiles: list,
    updatedAt: 1700000000000,
  }
}

// 페이지 로드(및 이후 모든 네비게이션) 전에 localStorage 에 활성 프로필 상태를 심는다.
// → 런처 init() 이 activeProfileId 를 발견해 프로필 선택 화면을 띄우지 않는다.
export async function seedActiveProfile(page, opts = {}) {
  const state = buildSeedState(opts)
  await page.addInitScript((s) => {
    try { window.localStorage.setItem('fmk:v1', JSON.stringify(s)) } catch (e) {}
  }, state)
  return state
}
