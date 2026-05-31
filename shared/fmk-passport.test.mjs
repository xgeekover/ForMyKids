/* 여권 스탬프(여행 보상) + 격리 단위 테스트 (node shared/fmk-passport.test.mjs)
   핵심: Co-op 에서 두 아이에게 '같은 스탬프 1개씩'(이중 지급 X) + 단일 모드로 누수 X. */
import assert from 'node:assert/strict'
import {
  resetAll, createProfile, setActiveProfile, setCoop,
  awardPassportStamp, getPassport, getPassportCount, getPassportKinds,
  getPassportLevel, getPassportTheme, prestigePassport, PASSPORT_SIZE,
  resetProfile,
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

// ── 환생(Prestige): 16칸 채우면 정확히 한 번 full → 초기화 + 레벨업 ──
{
  resetAll()
  const P = createProfile({ name: '여행가' })
  setActiveProfile(P.id)
  assert.equal(getPassportLevel(P.id), 0, '시작 레벨 0(초록)')
  assert.equal(getPassportTheme(P.id).id, 'green')
  let fullCount = 0
  for (let i = 0; i < PASSPORT_SIZE; i++) {
    const r = awardPassportStamp({ type: 'star' })
    if (r.full) fullCount++
    // 15개까지는 full=false, 16번째에만 full=true
    if (i < PASSPORT_SIZE - 1) assert.equal(r.full, false, `${i + 1}칸: 아직 미완성`)
    else { assert.equal(r.full, true, '16칸: 완성'); assert.deepEqual(r.fullProfileIds, [P.id]) }
  }
  assert.equal(fullCount, 1, '완성(full) 신호는 정확히 한 번')
  assert.equal(getPassportCount(P.id), PASSPORT_SIZE, '초기화 전엔 16칸')
  // 보상 확인 → 환생
  const res = prestigePassport([P.id])
  assert.equal(res.length, 1)
  assert.equal(getPassportCount(P.id), 0, '환생 후 0칸으로 초기화')
  assert.equal(getPassportLevel(P.id), 1, '레벨업(0→1)')
  assert.equal(getPassportTheme(P.id).id, 'blue', '초록 → 파랑 여권')
  // 다음 권도 16칸에서 다시 완성
  let r2
  for (let i = 0; i < PASSPORT_SIZE; i++) r2 = awardPassportStamp({ type: 'sun' })
  assert.equal(r2.full, true, '새 여권도 16칸에서 완성')
  prestigePassport([P.id])
  assert.equal(getPassportLevel(P.id), 2, '레벨 2(빨강)')
  assert.equal(getPassportTheme(P.id).id, 'red')
}
ok('환생(Prestige): 16칸 완성 1회 + 0칸 초기화 + 레벨/테마 상승')

// ── 테마 단계: 초록→파랑→빨강→금색(최대) ──
{
  resetAll()
  const Q = createProfile({ name: '단계' })
  setActiveProfile(Q.id)
  const ids = ['green', 'blue', 'red', 'gold', 'gold'] // 레벨 0~3 단계, 그 이상은 금색 유지
  for (let lv = 0; lv < ids.length; lv++) {
    assert.equal(getPassportTheme(Q.id).id, ids[lv], `레벨 ${lv} → ${ids[lv]}`)
    prestigePassport([Q.id])
  }
}
ok('환생 테마 단계(초록→파랑→빨강→금색, 이후 금색 유지)')

// ── Co-op 환생: 두 아이 모두 완성 + 둘 다 환생 ──
{
  resetAll()
  const X = createProfile({ name: '하나' })
  const Y = createProfile({ name: '두리' })
  setCoop([X.id, Y.id])
  let last
  for (let i = 0; i < PASSPORT_SIZE; i++) last = awardPassportStamp({ type: 'plane' })
  assert.equal(last.full, true, 'Co-op 16칸 완성')
  assert.deepEqual(last.fullProfileIds.slice().sort(), [X.id, Y.id].slice().sort(), '두 아이 모두 완성')
  prestigePassport(last.fullProfileIds)
  assert.equal(getPassportCount(X.id), 0); assert.equal(getPassportCount(Y.id), 0)
  assert.equal(getPassportLevel(X.id), 1); assert.equal(getPassportLevel(Y.id), 1)
}
ok('Co-op 환생: 두 아이 모두 16칸 완성 + 둘 다 초기화/레벨업')

// ── 회귀(리뷰): resetProfile 은 여권·환생 레벨도 함께 초기화('모든 기록' 약속 + 보상 오발 방지) ──
{
  resetAll()
  const Z = createProfile({ name: '리셋' })
  setActiveProfile(Z.id)
  for (let i = 0; i < PASSPORT_SIZE; i++) awardPassportStamp({ type: 'star' })
  prestigePassport([Z.id]) // 레벨 1, 여권 0칸
  awardPassportStamp({ type: 'fish' }) // 1칸
  assert.ok(getPassportCount(Z.id) > 0 && getPassportLevel(Z.id) === 1, '리셋 전: 스탬프/레벨 있음')
  resetProfile(Z.id)
  assert.equal(getPassportCount(Z.id), 0, 'resetProfile → 여권 0칸')
  assert.equal(getPassportLevel(Z.id), 0, 'resetProfile → 환생 레벨 0')
  // 리셋 후 다음 스탬프가 곧장 보상 오발하지 않음(1칸이라 full=false)
  const r = awardPassportStamp({ type: 'sun' })
  assert.equal(r.full, false, '리셋 후 1칸 → 보상 오발 없음')
}
ok('회귀: resetProfile 이 여권·환생 레벨까지 초기화(보상 오발 방지)')

console.log(`\n✅ fmk-passport(여권·격리·환생) 테스트 ${passed}개 통과`)
