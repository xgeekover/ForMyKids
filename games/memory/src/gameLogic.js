/* ===================================================================
   순수 게임 로직 (React 비의존) — 리듀서 · 별점 · 덱 생성
   타이머/사운드 같은 부수효과는 useMemoryGame 훅이 담당한다.
   이 파일은 Node 에서 그대로 import 해 단위 테스트할 수 있다.
   =================================================================== */
import { CHARACTERS } from './data/characters.js'
import { LEVELS, PREVIEW_SECONDS } from './data/levels.js'

let uidCounter = 0

function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function makeCard(c) {
  return { uid: `c${uidCounter++}`, id: c.id, emoji: c.emoji, name: c.name, color: c.color, flipped: false, matched: false, wrong: false }
}

export function buildDeck(pairs) {
  const chosen = CHARACTERS.slice(0, pairs)
  return shuffle(chosen.flatMap((c) => [makeCard(c), makeCard(c)]))
}

export function calcStars(level, moves, seconds) {
  const L = LEVELS[level]
  if (!L) return 1
  let stars = 3
  if (moves > L.star3Moves) stars = 2
  if (moves > L.star2Moves) stars = 1
  if (seconds > L.star3Time && stars === 3) stars = 2
  if (seconds > L.star2Time && stars > 1) stars = 1
  return Math.max(1, stars)
}

export const initialState = {
  screen: 'start',   // 'start' | 'game'
  level: null,
  cards: [],
  moves: 0,
  lockBoard: false,
  inPreview: false,
  previewCount: 0,
  elapsed: 0,        // 초
  timerRunning: false,
  win: null,         // null | { stars, moves, elapsed }
  round: 0,          // 매 판마다 증가 → 타이머/미리보기 effect 재시작용
  // ── 같이 하기(Co-op) 턴제 ── (싱글은 coop:false 라 아래 분기들이 전부 no-op)
  coop: false,       // 2명 참여 여부
  players: [],       // [{id,name,avatar,themeColor}]×2
  current: 0,        // 현재 차례(0=P1, 1=P2)
  scores: [0, 0],    // 각자 맞춘 짝 수
}

function freshRound(state, level, players) {
  const ps = Array.isArray(players) ? players : (state.players || []) // RESTART 는 기존 players 유지
  return {
    ...initialState,
    screen: 'game',
    level,
    cards: buildDeck(LEVELS[level].pairs),
    inPreview: true,
    previewCount: LEVELS[level].preview ?? PREVIEW_SECONDS, // 난이도별 미리 보기 시간
    lockBoard: true,
    round: state.round + 1,
    coop: ps.length === 2,
    players: ps,
    current: 0,
    scores: [0, 0],
  }
}

export function reducer(state, action) {
  switch (action.type) {
    case 'START':
      return freshRound(state, action.level, action.players)

    case 'RESTART':
      return freshRound(state, state.level)

    case 'MENU':
      return { ...initialState, round: state.round + 1 }

    case 'PREVIEW_TICK':
      return { ...state, previewCount: action.value }

    case 'PREVIEW_END':
      return { ...state, inPreview: false, lockBoard: false, previewCount: 0, timerRunning: true }

    case 'FLIP': {
      if (state.lockBoard || state.inPreview || state.win) return state
      const card = state.cards.find((c) => c.uid === action.uid)
      if (!card || card.flipped || card.matched) return state
      const cards = state.cards.map((c) => (c.uid === action.uid ? { ...c, flipped: true } : c))
      const open = cards.filter((c) => c.flipped && !c.matched)
      if (open.length === 2) return { ...state, cards, moves: state.moves + 1, lockBoard: true }
      return { ...state, cards }
    }

    case 'MARK_WRONG': {
      const set = new Set(action.uids)
      return { ...state, cards: state.cards.map((c) => (set.has(c.uid) ? { ...c, wrong: true } : c)) }
    }

    case 'RESOLVE_MATCH': {
      const cards = state.cards.map((c) => (c.id === action.id ? { ...c, matched: true, flipped: false } : c))
      if (state.coop) {
        // 맞추면 점수 +1, 같은 차례 계속(전통 메모리 룰)
        const scores = state.scores.slice()
        scores[state.current] = (scores[state.current] || 0) + 1
        return { ...state, cards, lockBoard: false, scores }
      }
      return { ...state, cards, lockBoard: false }
    }

    case 'RESOLVE_MISMATCH': {
      const set = new Set(action.uids)
      const cards = state.cards.map((c) => (set.has(c.uid) ? { ...c, flipped: false, wrong: false } : c))
      if (state.coop) {
        // 실패하면 상대에게 차례를 넘김
        return { ...state, cards, lockBoard: false, current: state.current === 0 ? 1 : 0 }
      }
      return { ...state, cards, lockBoard: false }
    }

    case 'TICK':
      return { ...state, elapsed: action.value }

    case 'WIN': {
      const stars = calcStars(state.level, state.moves, state.elapsed)
      const win = { stars, moves: state.moves, elapsed: state.elapsed }
      if (state.coop) {
        win.coop = true
        win.scores = state.scores.slice()
        win.players = state.players
        // -1=무승부, 0=P1 승, 1=P2 승
        win.winner = state.scores[0] === state.scores[1] ? -1 : (state.scores[0] > state.scores[1] ? 0 : 1)
      }
      return { ...state, win, timerRunning: false }
    }

    default:
      return state
  }
}

export function totalPairs(level) {
  return level ? LEVELS[level].pairs : 0
}

export function matchedPairsOf(cards) {
  return cards.filter((c) => c.matched).length / 2
}
