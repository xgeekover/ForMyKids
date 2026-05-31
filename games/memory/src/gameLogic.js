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
}

function freshRound(state, level) {
  return {
    ...initialState,
    screen: 'game',
    level,
    cards: buildDeck(LEVELS[level].pairs),
    inPreview: true,
    previewCount: LEVELS[level].preview ?? PREVIEW_SECONDS, // 난이도별 미리 보기 시간
    lockBoard: true,
    round: state.round + 1,
  }
}

export function reducer(state, action) {
  switch (action.type) {
    case 'START':
      return freshRound(state, action.level)

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

    case 'RESOLVE_MATCH':
      return {
        ...state,
        cards: state.cards.map((c) => (c.id === action.id ? { ...c, matched: true, flipped: false } : c)),
        lockBoard: false,
      }

    case 'RESOLVE_MISMATCH': {
      const set = new Set(action.uids)
      return {
        ...state,
        cards: state.cards.map((c) => (set.has(c.uid) ? { ...c, flipped: false, wrong: false } : c)),
        lockBoard: false,
      }
    }

    case 'TICK':
      return { ...state, elapsed: action.value }

    case 'WIN': {
      const stars = calcStars(state.level, state.moves, state.elapsed)
      return { ...state, win: { stars, moves: state.moves, elapsed: state.elapsed }, timerRunning: false }
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
