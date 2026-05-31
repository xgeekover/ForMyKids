/* 같이 하기(Co-op) 상태 + 단일 모드 격리(Isolation) 단위 테스트
   (node shared/fmk-coop.test.mjs)
   핵심: Co-op 로직이 추가돼도 '단일 플레이'는 100% 그대로여야 하고,
        Co-op 일 때만 두 프로필에 동일하게 기록/스크린타임이 누적돼야 한다. */
import assert from 'node:assert/strict'
import {
  resetAll, createProfile, setActiveProfile, getActiveProfileId,
  setCoop, isCoop, getCoopProfileIds, getCoopProfiles, clearCoop,
  recordPlay, getDashboard, getGameStats, addUsageToday, getUsageToday,
} from './fmk-store.js'

let passed = 0
const ok = (l) => { passed++; console.log('  ✓', l) }

resetAll()
const A = createProfile({ name: '아롱' })
const B = createProfile({ name: '다롱' })

// 기본: Co-op 아님
assert.equal(isCoop(), false, '초기엔 단일 모드')
assert.deepEqual(getCoopProfileIds(), [], 'coopProfiles 기본 []')
ok('기본 상태는 단일 모드(coopProfiles 빈 배열)')

// ── 단일 격리: 활성(A)만 기록되고 B는 무오염 ──
setActiveProfile(A.id)
recordPlay('memory', { level: 1 })
assert.equal(getDashboard(A.id).totalPlays, 1, 'A 만 +1')
assert.equal(getDashboard(B.id).totalPlays, 0, 'B 는 오염되지 않음')
ok('단일 모드 recordPlay: 활성 프로필만 기록(B 격리)')

// ── setCoop: 서로 다른 2명만 허용 ──
assert.equal(setCoop([A.id]), null, '1명 → 거부')
assert.equal(setCoop([A.id, A.id]), null, '중복 → 거부')
assert.equal(setCoop([A.id, 'nope']), null, '존재하지 않는 id → 거부')
assert.equal(isCoop(), false, '거부된 뒤에도 단일 모드 유지')
const coop = setCoop([A.id, B.id])
assert.ok(coop && coop.length === 2, 'A+B → Co-op 시작')
assert.equal(isCoop(), true)
assert.deepEqual(getCoopProfileIds(), [A.id, B.id])
assert.equal(getActiveProfileId(), A.id, 'P1 이 활성 프로필로도 설정됨')
ok('setCoop: 서로 다른 2명만 허용 + P1 활성화')

// ── Co-op recordPlay: 두 프로필 모두 누적 ──
recordPlay('memory', { level: 1 })
assert.equal(getDashboard(A.id).totalPlays, 2, 'A = 단일1 + Co-op1')
assert.equal(getDashboard(B.id).totalPlays, 1, 'B = Co-op1 (둘 다 누적)')
ok('Co-op recordPlay: 참여한 두 프로필 모두 누적')

// ── Co-op 스크린타임: 둘 다 누적 ──
addUsageToday(60)
assert.equal(getUsageToday(A.id), 60, 'A 스크린타임 60s')
assert.equal(getUsageToday(B.id), 60, 'B 스크린타임 60s')
ok('Co-op 스크린타임: 두 아이 모두 누적')

// ── 명시 profileIds: 그 프로필에만 ──
recordPlay('maze', {}, { profileIds: [B.id] })
assert.equal(getGameStats('maze', B.id).plays, 1, 'maze 는 B 에만')
assert.equal(getGameStats('maze', A.id).plays, 0, 'A 의 maze 는 그대로 0')
ok('명시 profileIds: 지정 프로필에만 기록')

// ── 단일 선택 시 Co-op 자동 해제(격리 복귀) ──
setActiveProfile(B.id)
assert.equal(isCoop(), false, 'setActiveProfile → Co-op 해제')
assert.deepEqual(getCoopProfileIds(), [])
// 해제 후 단일 기록은 활성(B)만
const beforeA = getDashboard(A.id).totalPlays
recordPlay('spot', {})
assert.equal(getDashboard(A.id).totalPlays, beforeA, '해제 뒤 A 무오염')
assert.equal(getGameStats('spot', B.id).plays, 1, 'spot 는 활성 B 에만')
ok('setActiveProfile 이 Co-op 해제 → 단일 격리 복귀')

// ── clearCoop ──
setCoop([A.id, B.id]); assert.equal(isCoop(), true)
clearCoop(); assert.equal(isCoop(), false)
ok('clearCoop: Co-op 해제')

// ── 회귀(리뷰 #1): Co-op 중 새 친구를 만들면 Co-op 해제 → 새 아이에게만 기록(직전 쌍 오염 금지) ──
setCoop([A.id, B.id]); assert.equal(isCoop(), true)
const C = createProfile({ name: '새콤' }) // 활성화 → coop 해제되어야
assert.equal(isCoop(), false, '새 친구 생성(활성화) → Co-op 해제')
const aBefore = getDashboard(A.id).totalPlays
const bBefore = getDashboard(B.id).totalPlays
recordPlay('memory', {})
assert.equal(getDashboard(C.id).totalPlays, 1, '새 아이 C 에만 기록')
assert.equal(getDashboard(A.id).totalPlays, aBefore, 'A 무오염')
assert.equal(getDashboard(B.id).totalPlays, bBefore, 'B 무오염')
ok('회귀: createProfile 이 Co-op 해제 → 새 아이만 기록(직전 쌍 격리)')

console.log(`\n✅ fmk-coop(같이 하기·격리) 테스트 ${passed}개 통과`)
