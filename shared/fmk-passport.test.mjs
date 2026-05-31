/* 여권 스탬프(여행 보상) + 격리 단위 테스트 (node shared/fmk-passport.test.mjs)
   핵심: Co-op 에서 두 아이에게 '같은 스탬프 1개씩'(이중 지급 X) + 단일 모드로 누수 X. */
import assert from 'node:assert/strict'
import {
  resetAll, createProfile, setActiveProfile, setCoop,
  awardPassportStamp, getPassport, getPassportCount, getPassportKinds,
} from './fmk-store.js'

let passed = 0
const ok = (l) => { passed++; console.log('  ✓', l) }

resetAll()
const A = createProfile({ name: '아롱' })
const B = createProfile({ name: '다롱' })

// 카탈로그
const kinds = getPassportKinds()
assert.ok(Array.isArray(kinds) && kinds.length >= 12, '스탬프 종류 ≥12')
assert.ok(kinds.every((k) => k.id && k.emoji && k.name), '각 종류 필수 필드(id/emoji/name)')
ok('여권 스탬프 카탈로그')

// 새 프로필은 빈 여권
assert.equal(getPassportCount(A.id), 0)
assert.deepEqual(getPassport(A.id), [])
ok('기본: 빈 여권')

// ── 단일 격리: 활성(A)에만 1개, B 무오염 ──
setActiveProfile(A.id)
const r1 = awardPassportStamp({ type: 'plane' })
assert.ok(r1 && r1.kind.id === 'plane', '지정 종류(plane) 지급')
assert.equal(r1.coop, false)
assert.deepEqual(r1.profileIds, [A.id])
assert.equal(getPassportCount(A.id), 1, 'A 1개')
assert.equal(getPassportCount(B.id), 0, 'B 0개(격리)')
assert.equal(getPassport(A.id)[0].emoji, '✈️', '이모지 해석')
ok('단일: 활성에만 1개 지급(B 격리)')

// ── Co-op: 두 아이에게 '같은 스탬프 1개씩'(이중 지급 없음) ──
setCoop([A.id, B.id])
const r2 = awardPassportStamp({ type: 'fish' })
assert.equal(r2.coop, true)
assert.deepEqual(r2.profileIds.slice().sort(), [A.id, B.id].slice().sort())
assert.equal(getPassportCount(A.id), 2, 'A = plane + fish (정확히 +1)')
assert.equal(getPassportCount(B.id), 1, 'B = fish (정확히 +1, 이중 아님)')
assert.equal(getPassport(A.id).slice(-1)[0].type, 'fish')
assert.equal(getPassport(B.id).slice(-1)[0].type, 'fish')
ok('Co-op: 두 아이에게 같은 스탬프 1개씩(이중 지급 없음)')

// ── 단일 복귀 격리: setActiveProfile → Co-op 해제 → 활성에만 ──
setActiveProfile(B.id)
const aBefore = getPassportCount(A.id)
awardPassportStamp({ type: 'star' })
assert.equal(getPassportCount(A.id), aBefore, 'A 무오염')
assert.equal(getPassport(B.id).slice(-1)[0].type, 'star', 'B(활성)에만')
ok('단일 복귀: Co-op 해제 후 활성에만(누수 없음)')

// ── 명시 profileIds: 지정 프로필에만 ──
const aBefore2 = getPassportCount(A.id), bBefore2 = getPassportCount(B.id)
awardPassportStamp({ type: 'map', profileIds: [A.id] })
assert.equal(getPassportCount(A.id), aBefore2 + 1, 'A 에만 +1')
assert.equal(getPassportCount(B.id), bBefore2, 'B 그대로')
ok('명시 profileIds: 지정 프로필에만')

// ── 회귀(리뷰): 중복 profileIds 여도 한 프로필에 1개만(이중 지급 방지) ──
{
  const before = getPassportCount(A.id)
  awardPassportStamp({ type: 'bag', profileIds: [A.id, A.id, A.id] })
  assert.equal(getPassportCount(A.id), before + 1, '중복 id 여도 정확히 +1')
}
ok('회귀: 중복 profileIds 이중 지급 방지')

// ── 무작위 지급 종류는 카탈로그 안 ──
setActiveProfile(A.id)
const r3 = awardPassportStamp()
assert.ok(kinds.some((k) => k.id === r3.kind.id), '무작위 종류는 카탈로그 내')
ok('무작위 지급 종류 유효')

console.log(`\n✅ fmk-passport(여권·격리) 테스트 ${passed}개 통과`)
