/* 순수 게임 로직 단위 테스트 — Node 전용 (React/브라우저 불필요)
   실행: npm run test:logic  (또는 node test/logic.test.mjs)              */
import { reducer, initialState, calcStars, buildDeck, totalPairs, matchedPairsOf } from '../src/gameLogic.js'
import { LEVELS, LEVEL_ORDER, PREVIEW_SECONDS } from '../src/data/levels.js'
import { CHARACTERS } from '../src/data/characters.js'

const results = []
const check = (cond, msg) => results.push((cond ? 'PASS  ' : 'FAIL  ') + msg)
const play = (state, actions) => actions.reduce((s, a) => reducer(s, a), state)

// 요구된 카드 수
const EXPECT_CARDS = { practice: 10, easy: 12, normal: 16, challenge: 20, hard: 24, veryhard: 30 }

// 0) 데이터 무결성
check(CHARACTERS.length === 15, `캐릭터 15종 (실제 ${CHARACTERS.length})`)
check(new Set(CHARACTERS.map((c) => c.id)).size === 15, '캐릭터 id 중복 없음')
check(LEVEL_ORDER.length === 6, `난이도 6단계 (실제 ${LEVEL_ORDER.length})`)

// 1) 난이도별 카드 수 / 별점 기준 일관성
for (const key of LEVEL_ORDER) {
  const L = LEVELS[key]
  check(L.pairs * 2 === EXPECT_CARDS[key], `${key}: 카드 ${L.pairs * 2}장 (기대 ${EXPECT_CARDS[key]})`)
  check(L.star3Moves < L.star2Moves, `${key}: star3Moves < star2Moves`)
  check(L.star3Time < L.star2Time, `${key}: star3Time < star2Time`)
  check(L.pairs <= L.star3Moves, `${key}: 완벽 플레이로 별 3개 가능 (pairs ${L.pairs} ≤ star3Moves ${L.star3Moves})`)
}

// 1b) 미리 보기 시간이 난이도에 따라 비감소 + cols 지정
{
  let prev = 0
  for (const key of LEVEL_ORDER) {
    const L = LEVELS[key]
    check(typeof L.cols === 'number' && L.cols >= 3, `${key}: 그리드 cols=${L.cols}`)
    check(L.preview >= prev, `${key}: 미리 보기 ${L.preview}s (난이도 따라 비감소)`)
    prev = L.preview
  }
  check(LEVELS.veryhard.preview > LEVELS.practice.preview, '많이 어려움 미리 보기 > 연습하기')
}

// 2) buildDeck 정확성
for (const key of LEVEL_ORDER) {
  const deck = buildDeck(LEVELS[key].pairs)
  const counts = {}
  deck.forEach((c) => (counts[c.id] = (counts[c.id] || 0) + 1))
  const ok = deck.length === LEVELS[key].pairs * 2 && Object.keys(counts).length === LEVELS[key].pairs && Object.values(counts).every((n) => n === 2)
  check(ok, `${key}: 덱 ${deck.length}장 · ${Object.keys(counts).length}종 각 2장`)
}

// 3) START → 미리 보기 상태
{
  const s = reducer(initialState, { type: 'START', level: 'normal' })
  check(s.screen === 'game' && s.level === 'normal', 'START: 게임 화면 진입')
  check(s.inPreview && s.lockBoard && s.previewCount === LEVELS.normal.preview, `START: 미리 보기 잠금 + 카운트 ${LEVELS.normal.preview}`)
  check(s.cards.length === 16, 'START(normal): 16장')
  check(s.round === 1, 'START: round 증가')

  // 미리 보기 중 FLIP 차단
  const blocked = reducer(s, { type: 'FLIP', uid: s.cards[0].uid })
  check(blocked === s, '미리 보기 중 FLIP 무시(상태 동일)')

  const ended = reducer(s, { type: 'PREVIEW_END' })
  check(!ended.inPreview && !ended.lockBoard && ended.timerRunning, 'PREVIEW_END: 잠금 해제 + 타이머 시작')
}

// 4) 불일치 흐름
{
  let s = reducer(initialState, { type: 'START', level: 'practice' })
  s = reducer(s, { type: 'PREVIEW_END' })
  const byId = {}
  s.cards.forEach((c) => (byId[c.id] || (byId[c.id] = [])).push(c))
  const ids = Object.keys(byId)
  const a = byId[ids[0]][0]
  const b = byId[ids[1]][0] // 다른 캐릭터
  s = play(s, [{ type: 'FLIP', uid: a.uid }, { type: 'FLIP', uid: b.uid }])
  check(s.moves === 1 && s.lockBoard, '불일치: moves=1 + 보드 잠금')
  s = reducer(s, { type: 'MARK_WRONG', uids: [a.uid, b.uid] })
  check(s.cards.filter((c) => c.wrong).length === 2, '불일치: wrong 표시 2장')
  s = reducer(s, { type: 'RESOLVE_MISMATCH', uids: [a.uid, b.uid] })
  const both = s.cards.filter((c) => c.uid === a.uid || c.uid === b.uid)
  check(both.every((c) => !c.flipped && !c.wrong) && !s.lockBoard, '불일치 해제: 다시 뒷면 + 잠금 해제')
}

// 5) FLIP 가드들
{
  let s = reducer(initialState, { type: 'START', level: 'easy' })
  s = reducer(s, { type: 'PREVIEW_END' })
  const u = s.cards[0].uid
  const s1 = reducer(s, { type: 'FLIP', uid: u })
  check(s1.cards.find((c) => c.uid === u).flipped, 'FLIP: 카드 뒤집힘')
  const s2 = reducer(s1, { type: 'FLIP', uid: u }) // 같은 카드 재클릭
  check(s2 === s1, 'FLIP: 같은 카드 재클릭 무시')
  const locked = reducer({ ...s1, lockBoard: true }, { type: 'FLIP', uid: s1.cards[1].uid })
  check(locked.cards.find((c) => c.uid === s1.cards[1].uid).flipped === false, 'FLIP: 잠금 중 무시')
}

// 6) 난이도별 완벽 플레이 → 전체 매칭 + 별 3개
for (const key of LEVEL_ORDER) {
  let s = reducer(initialState, { type: 'START', level: key })
  s = reducer(s, { type: 'PREVIEW_END' })
  const byId = {}
  s.cards.forEach((c) => (byId[c.id] || (byId[c.id] = [])).push(c))
  for (const id of Object.keys(byId)) {
    const [c1, c2] = byId[id]
    s = play(s, [{ type: 'FLIP', uid: c1.uid }, { type: 'FLIP', uid: c2.uid }, { type: 'RESOLVE_MATCH', id }])
  }
  const total = totalPairs(key)
  check(matchedPairsOf(s.cards) === total, `${key}: 전체 ${total}쌍 매칭 완료`)
  check(s.moves === total, `${key}: 완벽 플레이 moves=${s.moves} (=pairs)`)
  s = reducer(s, { type: 'TICK', value: 5 })
  s = reducer(s, { type: 'WIN' })
  check(s.win && s.win.stars === 3, `${key}: 완벽 플레이 → 별 3개 (실제 ${s.win && s.win.stars})`)
  check(!s.timerRunning, `${key}: 승리 시 타이머 정지`)
}

// 7) calcStars 경계
{
  check(calcStars('easy', 6, 5) === 3, 'calcStars easy 완벽 → 3')
  check(calcStars('easy', 999, 999) === 1, 'calcStars easy 엉망 → 1 (0 안 됨)')
  check(calcStars('veryhard', 15, 5) === 3, 'calcStars veryhard 완벽 → 3')
  const allValid = LEVEL_ORDER.every((k) => calcStars(k, 9999, 9999) >= 1)
  check(allValid, '모든 난이도: 별점 최소 1 보장')
}

// 8) RESTART / MENU
{
  let s = reducer(initialState, { type: 'START', level: 'challenge' })
  s = reducer(s, { type: 'PREVIEW_END' })
  s = play(s, [{ type: 'FLIP', uid: s.cards[0].uid }])
  const r = reducer(s, { type: 'RESTART' })
  check(r.level === 'challenge' && r.moves === 0 && r.inPreview && r.round === s.round + 1, 'RESTART: 난이도 유지 + 초기화 + 미리 보기 + round++')
  const m = reducer(s, { type: 'MENU' })
  check(m.screen === 'start' && m.level === null, 'MENU: 시작 화면 복귀')
}

console.log('\n=== 로직 테스트 결과 ===')
results.forEach((r) => console.log(r))
const failed = results.filter((r) => r.startsWith('FAIL')).length
console.log(`\n요약: ${results.length - failed}/${results.length} 통과`)
process.exit(failed === 0 ? 0 : 1)
