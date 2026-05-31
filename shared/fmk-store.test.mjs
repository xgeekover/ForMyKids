/* 공통 저장소 로직 단위 테스트 (Node 에서 실행: npm run test:store)
   Node 에는 localStorage 가 없으므로 fmk-store 의 in-memory 폴백으로 동작한다.
   v2(다중 프로필): 기록/업적은 '활성 프로필' 하위에 저장된다 → getActiveProfile() 로 검증. */
import assert from 'node:assert/strict'
import {
  recordPlay, getState, getGameStats, getAchievements,
  getUnlockedCount, getTotalAchievements, resetAll,
  markAchievementsViewed, getDashboard,
  exportState, importState, selfHeal,
  getProfile, setProfile, AVATARS, THEME_COLORS, themeColorHex,
  // v2 다중 프로필 API
  getActiveProfile, getActiveProfileId, getProfiles,
  setActiveProfile, createProfile, updateProfile, deleteProfile, resetProfile,
  // v1.3.0: 커스텀 퍼즐 + 스크린 타임
  setCustomPuzzleId, getCustomPuzzleId,
  setDailyLimit, getDailyLimit, getUsageToday, addUsageToday, isOverLimit, getScreenInfo,
} from './fmk-store.js'

let passed = 0
const ok = (label) => { passed++; console.log('  ✓', label) }

resetAll()
assert.equal(getActiveProfile().totalPlays, 0)
assert.equal(getUnlockedCount(), 0)
ok('초기 상태는 빈 기록(활성 프로필 자동 보장)')

// dodge: 점수형(최고=max)
let r = recordPlay('dodge', { score: 50, stage: 0 })
assert.equal(getGameStats('dodge').bestScore, 50)
assert.equal(getActiveProfile().totalPlays, 1)
assert.ok(r.newlyUnlocked.find((a) => a.id === 'first-step'))
assert.ok(r.newlyUnlocked.find((a) => a.id === 'dodge-play'))
ok('dodge 첫 기록 + first-step/dodge-play 업적')

recordPlay('dodge', { score: 30, stage: 1 })
assert.equal(getGameStats('dodge').bestScore, 50, '낮은 점수는 최고 기록을 낮추지 않음')
assert.equal(getGameStats('dodge').meta.bestStage, 1)
ok('최고 점수는 max, 최고 단계 갱신')

r = recordPlay('dodge', { score: 250, stage: 2 })
assert.ok(getAchievements().find((a) => a.id === 'dodge-evolve').unlocked)
assert.ok(r.newlyUnlocked.find((a) => a.id === 'dodge-evolve'))
ok('dodge 200점 돌파 → dodge-evolve 업적')

// memory: 시간형(최고=min) + 별/레벨
recordPlay('memory', { timeMs: 12000, stars: 2, level: 5 })
recordPlay('memory', { timeMs: 8000, stars: 3, level: 3 })
assert.equal(getGameStats('memory').bestTimeMs, 8000, '최단 시간은 min')
assert.equal(getGameStats('memory').meta.bestStars, 3)
assert.equal(getGameStats('memory').meta.bestLevel, 5, '최고 레벨은 max')
assert.ok(getAchievements().find((a) => a.id === 'memory-3star').unlocked)
ok('memory 최단 시간(min)/최고 별/최고 레벨 + memory-3star 업적')

// popnpop + explorer(세 게임 모두)
r = recordPlay('popnpop', { score: 100, level: 6, mode: 'ko' })
assert.ok(getAchievements().find((a) => a.id === 'explorer').unlocked)
assert.ok(getAchievements().find((a) => a.id === 'popnpop-lv5').unlocked)
assert.equal(getGameStats('popnpop').meta.lastMode, 'ko')
ok('popnpop 기록 + explorer/popnpop-lv5 업적')

// 누적 플레이 = 6 (활성 프로필 기준)
assert.equal(getActiveProfile().totalPlays, 6)
ok('totalPlays 누적 정확(활성 프로필)')

// 비문자 id 는 거부, 새 문자열 게임 id 는 자동 등록(확장성)
assert.equal(recordPlay(null, { score: 1 }).ok, false)
assert.equal(recordPlay('', { score: 1 }).ok, false)
assert.equal(getActiveProfile().totalPlays, 6, '잘못된 id 는 누적에 영향 없음')
const nr = recordPlay('spacewar', { score: 42 })
assert.equal(nr.ok, true)
assert.equal(getGameStats('spacewar').bestScore, 42)
assert.equal(getActiveProfile().totalPlays, 7)
assert.ok(getActiveProfile().games.spacewar, '새 게임 버킷이 재구성에서 살아남음')
ok('비문자 id 거부 + 새 게임 자동 등록')

// 지속성: 다시 읽어도 동일 (앞서 250점을 기록했으므로 최고 점수는 250)
assert.equal(getGameStats('dodge').bestScore, 250)
assert.ok(getUnlockedCount() >= 6)
ok(`지속성 + 업적 ${getUnlockedCount()}/${getTotalAchievements()}개`)

// ─── 손상/마이그레이션/방어 케이스 (localStorage 셰임으로 저장 경로까지 커버) ───
function makeShim() {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)) },
    removeItem: (k) => m.delete(k),
    _set: (k, v) => m.set(k, v),
  }
}

// (a) 손상 JSON / 배열 루트 → freshState(빈 v2, 프로필 없음) 로 복구
globalThis.localStorage = makeShim()
globalThis.localStorage._set('fmk:v1', '{ not json ::')
assert.equal(getProfiles().length, 0, '손상 JSON → 빈 상태(프로필 없음)')
assert.equal(getActiveProfileId(), null)
globalThis.localStorage._set('fmk:v1', '[1,2,3]')
assert.equal(getProfiles().length, 0, '배열 루트 → 빈 상태')
ok('손상 JSON/배열 루트 방어')

// (b) 잘못된 타입 마이그레이션: 문자열 숫자 복구, 비숫자 제거, 배열 achievements 정화
//     (v1 모양 → 자동으로 기본 프로필 1개로 변환되며 정화)
globalThis.localStorage._set('fmk:v1', JSON.stringify({
  totalPlays: '5',
  games: { dodge: { bestScore: '999', plays: '3', meta: { bestStage: '2', bestLevel: 'abc' } } },
  achievements: [1, 2, 3],
}))
const mig = getActiveProfile()
assert.ok(mig, 'v1 모양 → 활성 프로필로 변환')
assert.equal(mig.totalPlays, 5, '문자열 totalPlays 복구')
assert.equal(mig.games.dodge.bestScore, 999, '문자열 bestScore 복구')
assert.equal(mig.games.dodge.plays, 3)
assert.equal(mig.games.dodge.meta.bestStage, 2, '문자열 메타 숫자 복구')
assert.equal(mig.games.dodge.meta.bestLevel, undefined, '비숫자 메타 제거(NaN 차단)')
assert.deepEqual(mig.achievements, {}, '배열 achievements → 정화')
ok('잘못된 타입 마이그레이션/정화')

// (c) recordPlay 가 NaN/Infinity/음수 입력에 오염되지 않음
globalThis.localStorage = makeShim()
resetAll()
recordPlay('dodge', { score: 100 })
recordPlay('dodge', { score: Number.NaN })
recordPlay('dodge', { score: Infinity })
recordPlay('dodge', { score: -50 })
assert.equal(getGameStats('dodge').bestScore, 100, 'NaN/Infinity/음수 점수 무시')
recordPlay('memory', { timeMs: -5 })
assert.equal(getGameStats('memory').bestTimeMs, null, '음수 시간 무시')
recordPlay('memory', { timeMs: 9000 })
recordPlay('memory', { timeMs: Number.NaN })
assert.equal(getGameStats('memory').bestTimeMs, 9000, 'NaN 시간이 최단기록을 덮지 않음')
ok('recordPlay NaN/Infinity/음수 방어')

// (d) localStorage 가 throw 해도 메모리 폴백으로 일관 동작
globalThis.localStorage = {
  getItem() { throw new Error('blocked') },
  setItem() { throw new Error('blocked') },
}
resetAll()
recordPlay('dodge', { score: 77 })
assert.equal(getGameStats('dodge').bestScore, 77, 'throw 하는 저장소 → 메모리 폴백 일관')
ok('localStorage throw 시 메모리 폴백')

delete globalThis.localStorage

// ─── 신규: 난이도별 최단 시간 / 새 도장(isNew) / 대시보드 / 초기화 완전성 ───

// (e) memory 난이도별 최단 시간(bestTimeByLevel) = 레벨별 min
resetAll()
recordPlay('memory', { timeMs: 8000, level: 3, stars: 3 })
recordPlay('memory', { timeMs: 12000, level: 3, stars: 2 }) // 같은 레벨 느린 기록 → 무시
recordPlay('memory', { timeMs: 5000, level: 1, stars: 1 })
let mm = getGameStats('memory').meta.bestTimeByLevel
assert.equal(mm['3'], 8000, '레벨3 최단 8000')
assert.equal(mm['1'], 5000, '레벨1 최단 5000')
ok('memory 난이도별 최단 시간(min) 기록')

// (f) viewedAt/isNew: 보기 전엔 새 도장, markAchievementsViewed 후엔 아님,
//     이후 새로 해금된 도장만 다시 isNew
resetAll()
recordPlay('dodge', { score: 50 }) // first-step, dodge-play 해금
assert.ok(getAchievements().filter((a) => a.isNew).length >= 2, '해금 직후 새 도장 존재')
markAchievementsViewed()
assert.equal(getAchievements().filter((a) => a.isNew).length, 0, '본 뒤엔 새 도장 없음')
recordPlay('popnpop', { score: 10 }) // popnpop-play 새로 해금
const news = getAchievements().filter((a) => a.isNew)
assert.ok(news.find((a) => a.id === 'popnpop-play'), '새로 해금된 도장만 isNew')
assert.ok(!news.find((a) => a.id === 'dodge-play'), '이미 본 도장은 isNew 아님')
ok('viewedAt 기반 새 도장(isNew) 판정')

// (g) getDashboard: 비율/즐겨찾기
resetAll()
recordPlay('dodge', { score: 10 })
recordPlay('dodge', { score: 20 })
recordPlay('memory', { timeMs: 9000, level: 2, stars: 2 })
const dash = getDashboard()
assert.equal(dash.totalPlays, 3)
assert.equal(dash.favoriteId, 'dodge', '가장 많이 한 게임이 즐겨찾기')
const sumPct = dash.perGame.reduce((a, p) => a + p.pct, 0)
assert.equal(sumPct, 100, '비율 합 = 정확히 100 (largest-remainder)')
assert.equal(dash.achievements.total, getTotalAchievements())
ok('getDashboard 비율/즐겨찾기 집계 + 합 100%')

// (g2) 빈 상태: totalPlays=0 → favoriteId null, 모든 pct 0
resetAll()
const empty = getDashboard()
assert.equal(empty.favoriteId, null, '기록 없으면 즐겨찾기 없음')
assert.ok(empty.perGame.every((p) => p.pct === 0 && p.plays === 0), '빈 대시보드 0%')
ok('getDashboard 빈 상태(0판) 안전')

// (g3) 동점: 같은 plays 두 게임이어도 합 100, favoriteId 는 둘 중 하나
resetAll()
recordPlay('memory', { timeMs: 5000, level: 1 })
recordPlay('popnpop', { score: 5 })
const tie = getDashboard()
assert.equal(tie.perGame.reduce((a, p) => a + p.pct, 0), 100, '동점도 합 100')
assert.ok(['memory', 'popnpop'].includes(tie.favoriteId), '동점 시 둘 중 하나가 즐겨찾기')
ok('getDashboard 동점 처리')

// (i) 업적 카탈로그에 색(color)이 매칭돼 있음(런처 도장 색용)
const withColor = getAchievements().every((a) => typeof a.color === 'string' && a.color[0] === '#')
assert.ok(withColor, '모든 업적에 hex color')
ok('업적 color 매칭')

// (h) resetAll 이 seen·bestTimeByLevel·업적 까지 완전 초기화(활성 프로필)
recordPlay('memory', { timeMs: 7000, level: 4 })
markAchievementsViewed()
resetAll()
assert.deepEqual(getActiveProfile().seen, {}, 'seen(본 도장) 초기화')
assert.equal(getActiveProfile().totalPlays, 0)
assert.deepEqual(getGameStats('memory').meta, {}, 'memory meta(난이도별 시간 포함) 초기화')
assert.equal(getUnlockedCount(), 0, '업적 초기화')
ok('resetAll 완전 초기화(seen·meta·업적)')

// ─── 하드닝: 백업/복구(export·import) + 자가치유(selfHeal) ───

// (j) export → import 라운드트립 (export 는 v2 전체 상태 = profiles 배열)
resetAll()
recordPlay('dodge', { score: 123, stage: 2 })
recordPlay('memory', { timeMs: 9000, level: 3, stars: 3 })
const backup = exportState()
const parsedBackup = JSON.parse(backup)
assert.ok(Array.isArray(parsedBackup.profiles), 'export 는 profiles 배열 포함(v2)')
assert.equal(parsedBackup.profiles[0].games.dodge.bestScore, 123, 'export 에 기록 포함')
resetAll()
assert.equal(getGameStats('dodge').bestScore, null, '초기화 확인')
const imp = importState(backup)
assert.equal(imp.ok, true, '유효 백업 복구 성공')
assert.equal(getGameStats('dodge').bestScore, 123, '복구 후 점수 일치')
assert.equal(getGameStats('memory').meta.bestStars, 3, '복구 후 메타 일치')
ok('export/import 백업·복구 라운드트립')

// (k) 손상/형식오류 백업은 차단(기존 데이터 보존)
recordPlay('dodge', { score: 5 })
const before = exportState()
assert.equal(importState('{ not json').ok, false, '비 JSON 차단')
assert.equal(importState(JSON.stringify({ hello: 'world' })).ok, false, 'games/profiles 없는 파일 차단')
assert.equal(importState(JSON.stringify([1, 2, 3])).ok, false, '배열 차단')
assert.equal(exportState(), before, '차단 시 기존 데이터 변화 없음')
ok('손상/형식오류 백업 차단(데이터 보존)')

// (l) selfHeal: 파싱 가능 손상 → 정규화/마이그레이션 보존 / 파싱 불가 → 원본 백업 후 안전 복구
globalThis.localStorage = makeShim()
globalThis.localStorage._set('fmk:v1', JSON.stringify({ totalPlays: '4', games: { dodge: { bestScore: '88', meta: {} } } }))
let heal = selfHeal()
assert.equal(heal.mode, 'normalized', '파싱 가능 → 정규화')
assert.equal(getGameStats('dodge').bestScore, 88, 'selfHeal 정규화로 데이터 보존')
assert.equal(getActiveProfile().totalPlays, 4)
globalThis.localStorage._set('fmk:v1', '{ broken json ::')
heal = selfHeal()
assert.equal(heal.mode, 'reset', '파싱 불가 → 안전 복구')
assert.ok(heal.backedUp, '원본 백업 플래그')
assert.equal(globalThis.localStorage.getItem('fmk:v1:corrupt-backup'), '{ broken json ::', '손상 원본을 백업키에 보존(파괴 X)')
assert.equal(getActiveProfile(), null, '복구 후 빈 상태(프로필 없음)')
assert.equal(getProfiles().length, 0)
ok('selfHeal 정규화/백업·복구 자가치유')
delete globalThis.localStorage

// ─── 신규 게임(maze/spot/puzzle) 기록·업적 연동 ───

// (m) maze: 난이도별 최단시간/별/난이도 + '꼬마 탐험가' (도전=level4) 업적
resetAll()
recordPlay('maze', { timeMs: 30000, level: 2, stars: 1 })
assert.ok(!getAchievements().find((a) => a.id === 'maze-explorer').unlocked, '쉬움 탈출론 미해금')
recordPlay('maze', { timeMs: 45000, level: 4, stars: 3 })
assert.equal(getGameStats('maze').meta.bestLevel, 4, '최고 난이도 4')
assert.equal(getGameStats('maze').meta.bestStars, 3, '최고 별 3')
assert.equal(getGameStats('maze').bestTimeMs, 30000, '최단시간 min')
assert.ok(getAchievements().find((a) => a.id === 'maze-explorer').unlocked, '도전 탈출 → 꼬마 탐험가')
assert.ok(getDashboard().perGame.find((p) => p.id === 'maze'), 'maze 가 대시보드 비율에 포함')
ok('maze 기록 + 꼬마 탐험가 업적 + 대시보드 노출')

// (n) spot: 최고 점수 + '돋보기 탐정'(힌트 없이 보통 이상 = noHintLevel>=2)
resetAll()
recordPlay('spot', { score: 120, level: 2 }) // 힌트 사용(noHintLevel 미전달)
assert.ok(!getAchievements().find((a) => a.id === 'spot-detective').unlocked, '힌트 사용 시 미해금')
assert.equal(getGameStats('spot').bestScore, 120)
recordPlay('spot', { score: 90, level: 2, noHintLevel: 2 }) // 힌트 없이 보통 클리어
assert.equal(getGameStats('spot').bestScore, 120, '최고 점수 max 유지')
assert.ok(getAchievements().find((a) => a.id === 'spot-detective').unlocked, '힌트 없이 보통 → 돋보기 탐정')
ok('spot 점수 + 돋보기 탐정 업적(noHintLevel)')

// (o) 업적 총 12종 + 대시보드 6게임 반영
assert.equal(getTotalAchievements(), 12, '업적 12종')
assert.equal(getDashboard().perGame.length, 6, '대시보드 6게임')
ok('업적 12종 / 6게임 대시보드')

// (p) 퍼즐: 난이도별 최단시간 + '퍼즐 마스터'(5단계 이상) 업적
resetAll()
recordPlay('puzzle', { timeMs: 40000, level: 4 })
assert.ok(!getAchievements().find((a) => a.id === 'puzzle-master').unlocked, '4단계론 미해금')
recordPlay('puzzle', { timeMs: 90000, level: 5 })
recordPlay('puzzle', { timeMs: 70000, level: 5 })
assert.equal(getGameStats('puzzle').meta.bestLevel, 5, '최고 난이도 5')
assert.equal(getGameStats('puzzle').bestTimeMs, 40000, '최단시간 min')
assert.equal(getGameStats('puzzle').meta.bestTimeByLevel['5'], 70000, '5단계 최단 70초')
assert.ok(getAchievements().find((a) => a.id === 'puzzle-master').unlocked, '36조각(5단계) → 퍼즐 마스터')
assert.ok(getDashboard().perGame.find((p) => p.id === 'puzzle'), 'puzzle 대시보드 포함')
ok('puzzle 기록 + 퍼즐 마스터 업적 + 대시보드 노출')

// ─── 내 프로필(활성 프로필의 아바타/이름/테마색) ───
resetAll()
// 기본(지연 생성) 프로필은 기본 아바타/색을 가진다(v1 의 null 과 다름 — 의도된 변경)
assert.equal(getProfile().avatar, AVATARS[0], '기본 프로필 아바타 = 기본값')
assert.equal(getProfile().themeColor, THEME_COLORS[0].id, '기본 프로필 색 = 기본값')
// 유효한 아바타/색 저장
setProfile({ avatar: AVATARS[2], themeColor: THEME_COLORS[1].id })
assert.equal(getProfile().avatar, AVATARS[2], '아바타 저장')
assert.equal(getProfile().themeColor, THEME_COLORS[1].id, '테마색 저장')
assert.equal(themeColorHex(THEME_COLORS[1].id), THEME_COLORS[1].color, 'themeColorHex 매핑')
assert.equal(themeColorHex('___nope___'), null, '없는 색 id → null')
// 잘못된 값은 무시(기존 값 유지)
setProfile({ avatar: '🍕', themeColor: 'rainbow' })
assert.equal(getProfile().avatar, AVATARS[2], '허용 외 아바타 무시')
assert.equal(getProfile().themeColor, THEME_COLORS[1].id, '허용 외 색 무시')
ok('프로필 저장/검증(허용값만)')

// resetAll 은 기록은 지우되 활성 프로필 정체성(아바타·색)은 보존
recordPlay('dodge', { score: 30 })
resetAll()
assert.equal(getActiveProfile().totalPlays, 0, 'resetAll 기록 초기화')
assert.equal(getProfile().avatar, AVATARS[2], 'resetAll 후에도 아바타 보존')
assert.equal(getProfile().themeColor, THEME_COLORS[1].id, 'resetAll 후에도 테마색 보존')
ok('resetAll: 기록 초기화 + 프로필 정체성 보존')

// 손상된 프로필(아바타/색)은 정화 → 기본값 (v1 모양 → 마이그레이션 경유)
globalThis.localStorage = makeShim()
globalThis.localStorage._set('fmk:v1', JSON.stringify({ games: {}, profile: { avatar: '🍕', themeColor: 42 } }))
assert.equal(getProfile().avatar, AVATARS[0], '손상 아바타 → 기본값')
assert.equal(getProfile().themeColor, THEME_COLORS[0].id, '손상 색 → 기본값')
delete globalThis.localStorage
ok('손상 프로필 정화')

// ─── 다중 프로필(Multi-Profile) ───

// (q) 빈 상태: 활성 프로필 없음 → 런처가 '누가 놀까요?' 선택 화면을 띄움
globalThis.localStorage = makeShim()
assert.equal(getActiveProfileId(), null, '빈 상태엔 활성 프로필 없음')
assert.equal(getProfiles().length, 0)
assert.equal(getActiveProfile(), null)
ok('빈 상태: 활성 프로필 없음(프로필 선택 유도)')

// (r) createProfile: 생성 즉시 활성화
const pa = createProfile({ name: '서아', avatar: AVATARS[0], themeColor: 'pink' })
assert.ok(pa.id, '프로필 id 부여')
assert.equal(pa.name, '서아')
assert.equal(getActiveProfileId(), pa.id, '생성 즉시 활성화')
assert.equal(getProfiles().length, 1)
ok('createProfile 생성 + 즉시 활성화')

// (s) 두 번째 프로필 + 활성 전환 + 기록 격리(아이별 데이터 분리)
recordPlay('dodge', { score: 70 }) // 서아 기록
const pb = createProfile({ name: '하준', avatar: AVATARS[1], themeColor: 'blue' })
assert.equal(getActiveProfileId(), pb.id)
assert.equal(getGameStats('dodge').bestScore, null, '하준은 dodge 기록 없음(격리)')
recordPlay('spot', { score: 200 }) // 하준 기록
assert.equal(getActiveProfile().totalPlays, 1, '하준 totalPlays=1')
setActiveProfile(pa.id) // 서아로 다시 전환
assert.equal(getActiveProfileId(), pa.id)
assert.equal(getGameStats('dodge').bestScore, 70, '서아 dodge 기록 보존')
assert.equal(getGameStats('spot').bestScore, null, '서아는 spot 기록 없음(격리)')
assert.equal(getActiveProfile().totalPlays, 1, '서아 totalPlays=1')
ok('프로필별 기록 격리 + 활성 전환')

// (t) 프로필별 대시보드/업적 조회(profileId 인자 — 부모님 방 탭 전환용)
assert.equal(getDashboard(pb.id).games.spot.bestScore, 200, 'profileId 로 하준 대시보드 조회')
assert.equal(getDashboard(pa.id).games.dodge.bestScore, 70)
assert.equal(getDashboard(pb.id).profile.name, '하준', '대시보드에 프로필 정보 포함')
assert.ok(getAchievements(pb.id).find((x) => x.id === 'first-step').unlocked, '하준 first-step 해금')
assert.ok(!getAchievements(pb.id).find((x) => x.id === 'dodge-play').unlocked, '하준 dodge-play 미해금')
assert.ok(getAchievements(pa.id).find((x) => x.id === 'dodge-play').unlocked, '서아 dodge-play 해금')
assert.equal(getUnlockedCount(pb.id), 1, '하준 도장 1개')
ok('프로필별 대시보드/업적 조회(profileId 인자)')

// (u) updateProfile: 이름/아바타/색 수정(허용값만)
updateProfile(pa.id, { name: '서아2', avatar: AVATARS[3], themeColor: 'green' })
let pinfo = getProfiles().find((p) => p.id === pa.id)
assert.equal(pinfo.name, '서아2')
assert.equal(pinfo.avatar, AVATARS[3])
assert.equal(pinfo.themeColor, 'green')
updateProfile(pa.id, { avatar: '🍕', themeColor: 'rainbow' }) // 무효값
pinfo = getProfiles().find((p) => p.id === pa.id)
assert.equal(pinfo.avatar, AVATARS[3], '허용 외 아바타 무시')
assert.equal(pinfo.themeColor, 'green', '허용 외 색 무시')
ok('updateProfile 수정(허용값만)')

// (v) resetProfile: 특정 프로필 기록만 초기화(정체성 보존, 타 프로필 무영향)
resetProfile(pa.id)
assert.equal(getGameStats('dodge', pa.id).bestScore, null, '서아 기록 초기화')
const paAfter = getProfiles().find((p) => p.id === pa.id)
assert.equal(paAfter.name, '서아2', '이름 보존')
assert.equal(paAfter.avatar, AVATARS[3], '아바타 보존')
assert.equal(getGameStats('spot', pb.id).bestScore, 200, '하준 기록은 그대로')
ok('resetProfile 특정 프로필만 초기화(타 프로필 무영향)')

// (w) deleteProfile: 활성 프로필 삭제 → 남은 프로필로 활성 전환 / 마지막 삭제 → null
setActiveProfile(pa.id)
const del = deleteProfile(pa.id)
assert.equal(del.ok, true)
assert.equal(getProfiles().length, 1)
assert.equal(getActiveProfileId(), pb.id, '활성 삭제 시 남은 프로필로 전환')
deleteProfile(pb.id)
assert.equal(getProfiles().length, 0)
assert.equal(getActiveProfileId(), null, '마지막 프로필 삭제 → 활성 null(선택 화면 유도)')
delete globalThis.localStorage
ok('deleteProfile 삭제 + 활성 재지정/해제')

// (x) 마이그레이션: v1 단일 프로필 데이터 → 첫 번째 기본 프로필로 자동 변환 + 활성화(데이터 보존)
globalThis.localStorage = makeShim()
globalThis.localStorage._set('fmk:v1', JSON.stringify({
  version: 1, totalPlays: 3,
  games: { dodge: { plays: 3, bestScore: 150, bestTimeMs: null, lastPlayed: 1, meta: { bestStage: 2 } } },
  achievements: { 'first-step': { unlockedAt: 1 }, 'dodge-play': { unlockedAt: 2 } },
  seen: { 'first-step': true },
  profile: { avatar: AVATARS[2], themeColor: 'purple' },
  updatedAt: 12345,
}))
assert.equal(getProfiles().length, 1, 'v1 → 프로필 1개로 변환')
const m = getActiveProfile()
assert.ok(m, '변환된 프로필이 활성화됨')
assert.equal(getActiveProfileId(), m.id)
assert.equal(m.totalPlays, 3, 'v1 totalPlays 보존')
assert.equal(m.games.dodge.bestScore, 150, 'v1 게임 기록 보존')
assert.equal(m.games.dodge.meta.bestStage, 2)
assert.equal(m.avatar, AVATARS[2], 'v1 아바타 보존')
assert.equal(m.themeColor, 'purple', 'v1 테마색 보존')
assert.equal(m.name, '우리 아이', '기본 프로필 이름')
assert.ok(getAchievements().find((x) => x.id === 'dodge-play').unlocked, 'v1 업적 보존')
assert.equal(getAchievements().find((x) => x.id === 'first-step').isNew, false, 'v1 본 도장(seen) 보존 → isNew 아님')
delete globalThis.localStorage
ok('v1→v2 마이그레이션(데이터 보존 + 기본 프로필 활성화)')

// (y) v1 백업 파일도 import 허용(자동 마이그레이션)
globalThis.localStorage = makeShim()
const v1backup = JSON.stringify({ version: 1, totalPlays: 1, games: { memory: { plays: 1, bestTimeMs: 5000, meta: { bestStars: 3 } } }, achievements: {}, profile: { avatar: AVATARS[1], themeColor: 'blue' } })
const impV1 = importState(v1backup)
assert.equal(impV1.ok, true, 'v1 백업 import 허용')
assert.equal(getProfiles().length, 1)
assert.equal(getGameStats('memory').meta.bestStars, 3, 'v1 백업 기록 복구')
assert.equal(getProfile().avatar, AVATARS[1], 'v1 백업 아바타 복구')
delete globalThis.localStorage
ok('v1 백업 import → 자동 마이그레이션')

// ─── 리뷰 반영: 데이터 무결성 하드닝 ───

// (z1) recordPlay: 활성 프로필이 없는데 프로필은 존재(선택 전)하면 기록 보류 — 엉뚱한 프로필 오적재 방지
globalThis.localStorage = makeShim()
const pz1 = createProfile({ name: '알리스', avatar: AVATARS[0], themeColor: 'pink' })
createProfile({ name: '보브', avatar: AVATARS[1], themeColor: 'blue' })
;(() => { // 활성만 무효화(프로필은 보존) → '누가 놀까요?' 선택 전 상태 재현
  const raw = JSON.parse(globalThis.localStorage.getItem('fmk:v1'))
  raw.activeProfileId = null
  globalThis.localStorage._set('fmk:v1', JSON.stringify(raw))
})()
assert.equal(getActiveProfileId(), null, '활성 무효화 확인')
assert.equal(recordPlay('dodge', { score: 999 }).ok, false, '활성 없고 프로필 존재 → 기록 보류')
assert.equal(getActiveProfileId(), null, '보류이므로 활성 자동 생성도 안 됨')
assert.equal(getProfiles().length, 2, '유령 프로필 생성 안 됨')
assert.equal(getGameStats('dodge', pz1.id).bestScore, null, '어떤 프로필에도 적재되지 않음')
delete globalThis.localStorage
ok('recordPlay: 활성 미선택 시 기록 보류(오적재 방지)')

// (z2) normalizeState: profiles 배열의 깨진 엔트리(null/문자열/숫자)는 유령 프로필이 되지 않고 정화
globalThis.localStorage = makeShim()
globalThis.localStorage._set('fmk:v1', JSON.stringify({
  version: 2, activeProfileId: 'real-1',
  profiles: [null, { id: 'real-1', name: '진짜', avatar: AVATARS[0], themeColor: 'pink' }, 'junk', 42, { id: 'real-2', name: '진짜2' }],
  updatedAt: 5,
}))
assert.equal(getProfiles().length, 2, '깨진 엔트리 제거 → 진짜 2개만')
assert.ok(getProfiles().find((p) => p.id === 'real-1'), '진짜 프로필 보존')
assert.equal(getActiveProfileId(), 'real-1', '활성 유지')
delete globalThis.localStorage
ok('normalizeState: 유령 프로필(깨진 엔트리) 정화')

// (z3) normalizeState: 배열이 객체로 뭉개진 손상({"0":..,"1":..})도 Object.values 로 복구(데이터 유실 방지)
globalThis.localStorage = makeShim()
globalThis.localStorage._set('fmk:v1', JSON.stringify({
  version: 2, activeProfileId: 'p-a',
  profiles: { '0': { id: 'p-a', name: '아', totalPlays: 7, games: {} }, '1': { id: 'p-b', name: '비' } },
  updatedAt: 9,
}))
assert.equal(getProfiles().length, 2, '객체화된 배열 → Object.values 복구')
assert.equal(getActiveProfile().name, '아', '활성 프로필 복구')
assert.equal(getActiveProfile().totalPlays, 7, '기록 보존(데이터 유실 방지)')
delete globalThis.localStorage
ok('normalizeState: 객체화된 profiles 손상 복구(Object.values)')

// ─── v1.3.0: 커스텀 퍼즐 사진 id (실제 사진은 IndexedDB, 스토어엔 id 만) ───
globalThis.localStorage = makeShim()
const cpa = createProfile({ name: '사진아이', avatar: AVATARS[0], themeColor: 'pink' })
assert.equal(getCustomPuzzleId(), null, '기본은 사진 없음')
setCustomPuzzleId(cpa.id, 'photo-abc')
assert.equal(getCustomPuzzleId(), 'photo-abc', '사진 id 저장')
assert.equal(getCustomPuzzleId(cpa.id), 'photo-abc', 'profileId 로 조회')
const cpb = createProfile({ name: '둘째', avatar: AVATARS[1], themeColor: 'blue' })
assert.equal(getCustomPuzzleId(), null, '새 프로필은 사진 없음(격리)')
setCustomPuzzleId(cpb.id, 123) // 비문자 → null
assert.equal(getCustomPuzzleId(cpb.id), null, '비문자 사진 id → null')
setCustomPuzzleId(cpa.id, null) // 해제
assert.equal(getCustomPuzzleId(cpa.id), null, '사진 id 해제')
delete globalThis.localStorage
ok('커스텀 퍼즐 사진 id 저장/격리/검증')

// ─── v1.3.0: 스크린 타임(일일 제한 + 누적 + 잠금) ───
globalThis.localStorage = makeShim()
const sta = createProfile({ name: '시간아이', avatar: AVATARS[0], themeColor: 'pink' })
assert.equal(getDailyLimit(), null, '기본은 제한 없음')
assert.equal(isOverLimit(), false, '제한 없으면 잠기지 않음')
setDailyLimit(sta.id, 30)
assert.equal(getDailyLimit(), 30, '30분 제한 저장')
assert.equal(getScreenInfo().limitSec, 1800, '제한 1800초')
addUsageToday(600) // 10분
assert.equal(getUsageToday(), 600, '누적 600초')
assert.equal(isOverLimit(), false, '10/30분 → 아직 안 잠김')
addUsageToday(1300) // 누적 1900초 > 1800
assert.ok(isOverLimit(), '30분 초과 → 잠김')
const si = getScreenInfo()
assert.equal(si.locked, true, 'locked=true')
assert.equal(si.remainingSec, 0, '남은 시간 0')
setDailyLimit(sta.id, 0) // 0/falsy = 제한 해제
assert.equal(getDailyLimit(), null, '0 = 제한 없음')
assert.equal(isOverLimit(), false, '제한 해제 → 안 잠김')
delete globalThis.localStorage
ok('스크린 타임 제한/누적/잠금')

// 날짜가 바뀌면 당일 누적이 리셋된다(과거 날짜 시드)
globalThis.localStorage = makeShim()
const stb = createProfile({ name: '날짜아이' })
setDailyLimit(stb.id, 10)
;(() => {
  const raw = JSON.parse(globalThis.localStorage.getItem('fmk:v1'))
  const p = raw.profiles.find((x) => x.id === stb.id)
  p.screen = { date: '2000-01-01', usedSec: 99999 } // 과거 날짜 + 큰 누적
  globalThis.localStorage._set('fmk:v1', JSON.stringify(raw))
})()
assert.equal(getUsageToday(stb.id), 0, '과거 날짜 누적은 오늘 0으로 간주')
assert.equal(isOverLimit(stb.id), false, '리셋되어 잠기지 않음')
addUsageToday(120, stb.id)
assert.equal(getUsageToday(stb.id), 120, '오늘 누적은 새로 시작')
delete globalThis.localStorage
ok('스크린 타임 날짜 변경 시 당일 누적 리셋')

console.log(`\n✅ store 테스트 ${passed}개 통과`)
