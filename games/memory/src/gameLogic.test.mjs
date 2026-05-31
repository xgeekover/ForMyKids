/* 메모리 게임 순수 리듀서 — 같이 하기(턴제) 로직 + 단일 격리 테스트
   (node games/memory/src/gameLogic.test.mjs)
   규칙: 맞추면 같은 차례 + 점수 +1 / 틀리면 차례 넘김. 단일이면 점수/차례 로직 미동작. */
import assert from 'node:assert/strict'
import { reducer, initialState } from './gameLogic.js'
import { LEVEL_ORDER } from './data/levels.js'

let passed = 0
const ok = (l) => { passed++; console.log('  ✓', l) }
const LV = LEVEL_ORDER[0]
const A = { id: 'a', name: '아롱', avatar: '🐶', themeColor: 'blue' }
const B = { id: 'b', name: '다롱', avatar: '🐰', themeColor: 'pink' }

// ── START: 같이 하기(2명) vs 단일 ──
{
  const co = reducer(initialState, { type: 'START', level: LV, players: [A, B] })
  assert.equal(co.coop, true); assert.equal(co.players.length, 2)
  assert.equal(co.current, 0); assert.deepEqual(co.scores, [0, 0])
  const solo = reducer(initialState, { type: 'START', level: LV })
  assert.equal(solo.coop, false); assert.deepEqual(solo.players, [])
}
ok('START: 2명이면 coop·턴/점수 초기화, 없으면 단일')

// ── 맞춤(RESOLVE_MATCH): 같은 차례 유지 + 점수 +1 (coop) ──
{
  const base = { ...initialState, coop: true, current: 0, scores: [0, 0],
    cards: [{ uid: 'x', id: 1, matched: false, flipped: true }, { uid: 'y', id: 1, matched: false, flipped: true }] }
  const next = reducer(base, { type: 'RESOLVE_MATCH', id: 1 })
  assert.deepEqual(next.scores, [1, 0], 'P1 점수 +1')
  assert.equal(next.current, 0, '맞추면 같은 차례 유지')
  assert.ok(next.cards.every((c) => c.matched), '카드 matched 처리')
}
ok('RESOLVE_MATCH(coop): 점수 +1 + 같은 차례 유지')

// ── 틀림(RESOLVE_MISMATCH): 차례 넘김 (coop) ──
{
  const base = { ...initialState, coop: true, current: 0, scores: [2, 1],
    cards: [{ uid: 'x', id: 1, flipped: true, wrong: true }, { uid: 'y', id: 2, flipped: true, wrong: true }] }
  const next = reducer(base, { type: 'RESOLVE_MISMATCH', uids: ['x', 'y'] })
  assert.equal(next.current, 1, '틀리면 상대(P2)로 차례 넘김')
  assert.deepEqual(next.scores, [2, 1], '점수는 그대로')
  const back = reducer(next, { type: 'RESOLVE_MISMATCH', uids: ['x', 'y'] })
  assert.equal(back.current, 0, 'P2 가 또 틀리면 P1 로')
}
ok('RESOLVE_MISMATCH(coop): 차례 넘김(0↔1)')

// ── 단일 격리: coop=false 면 점수/차례 로직 미동작 ──
{
  const base = { ...initialState, coop: false, current: 0, scores: [0, 0],
    cards: [{ uid: 'x', id: 1, flipped: true }, { uid: 'y', id: 1, flipped: true }] }
  const m = reducer(base, { type: 'RESOLVE_MATCH', id: 1 })
  assert.deepEqual(m.scores, [0, 0], '단일: 점수 변화 없음')
  assert.equal(m.current, 0, '단일: 차례 개념 없음')
  const mm = reducer({ ...base, current: 0 }, { type: 'RESOLVE_MISMATCH', uids: ['x', 'y'] })
  assert.equal(mm.current, 0, '단일: 차례 안 넘어감')
}
ok('단일(coop=false): 점수/차례 로직 미동작(격리)')

// ── WIN: coop 결과(점수·승자) vs 단일 ──
{
  const win = reducer({ ...initialState, level: LV, coop: true, scores: [3, 2], players: [A, B], moves: 10, elapsed: 30 }, { type: 'WIN' })
  assert.equal(win.win.coop, true)
  assert.deepEqual(win.win.scores, [3, 2])
  assert.equal(win.win.winner, 0, '3>2 → P1 승')
  const tie = reducer({ ...initialState, level: LV, coop: true, scores: [2, 2], players: [A, B] }, { type: 'WIN' })
  assert.equal(tie.win.winner, -1, '동점 → 무승부')
  const solo = reducer({ ...initialState, level: LV, coop: false, moves: 5, elapsed: 10 }, { type: 'WIN' })
  assert.equal(solo.win.coop, undefined, '단일 WIN 엔 coop 필드 없음')
  assert.ok(solo.win.stars >= 1, '단일 WIN 별점 정상')
}
ok('WIN: coop 점수/승자 + 단일 격리')

console.log(`\n✅ memory gameLogic(턴제·격리) 테스트 ${passed}개 통과`)
