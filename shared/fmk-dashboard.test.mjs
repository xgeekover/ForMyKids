/* 부모님 방 대시보드 데이터 단위 테스트 (node shared/fmk-dashboard.test.mjs)
   - dayKey: 로컬 YYYY-MM-DD
   - buildActivityCalendar: 잔디 격자(주×7) · 색 단계 · 미래 칸 방어
   - playEfficiency: 스크린타임 대비 효율(0 방어 포함)
   - recordPlay → days 누적 → getDashboard 의 오늘/랭킹/효율 노출 */
import assert from 'node:assert/strict'
import {
  dayKey, buildActivityCalendar, playEfficiency,
  recordPlay, getDashboard,
} from './fmk-store.js'

let passed = 0
const ok = (l) => { passed++; console.log('  ✓', l) }

// ── dayKey: 형식 + 같은 날 동일 + 과거가 더 작음 ──
assert.match(dayKey(), /^\d{4}-\d{2}-\d{2}$/, '오늘 형식 YYYY-MM-DD')
const nowMs = 1_700_000_000_000 // 고정 시점(로컬 변환은 일관)
assert.equal(dayKey(nowMs), dayKey(nowMs), '같은 ms → 같은 키')
assert.ok(dayKey(nowMs - 2 * 86400000) < dayKey(nowMs), '이틀 전 < 오늘')
ok('dayKey: 로컬 날짜 키')

// ── buildActivityCalendar: 12주×7 격자, today 셀/미래 칸/색 단계 ──
{
  const cal = buildActivityCalendar({ '2026-05-31': 5, '2026-05-25': 2 }, '2026-05-31', 12)
  assert.equal(cal.weeks.length, 12, '12주(열)')
  assert.ok(cal.weeks.every((w) => w.length === 7), '각 주 7일')
  assert.equal(cal.totalDays, 84)
  const flat = cal.weeks.flat()
  const todayCell = flat.find((c) => c.date === '2026-05-31')
  assert.ok(todayCell && todayCell.count === 5, 'today 셀 카운트=5')
  assert.ok(todayCell.level >= 1, 'today 셀 색 단계 ≥1')
  const future = flat.filter((c) => c.date > '2026-05-31')
  assert.ok(future.length > 0 && future.every((c) => c.future && c.level === 0), '미래 칸은 future·level0')
  assert.equal(cal.maxCount, 5, '최대 5판')
  assert.equal(cal.activeDays, 2, '논 날 2일')
}
// 빈 days → 활동 0, 모든 칸 level0
{
  const cal = buildActivityCalendar({}, '2026-05-31', 12)
  assert.equal(cal.activeDays, 0)
  assert.ok(cal.weeks.flat().every((c) => c.level === 0))
}
ok('buildActivityCalendar: 격자/색단계/미래칸/빈값 방어')

// ── playEfficiency: 0 방어 + 점수/한판당 분 ──
{
  const z = playEfficiency(0, 0)
  assert.equal(z.score, 0); assert.equal(z.perPlayMin, null); assert.equal(z.playsPerMin, 0)
  const e1 = playEfficiency(10, 600) // 10판 / 10분 → 분당 1판 → score 100(상한), 한 판 1분
  assert.equal(e1.score, 100); assert.equal(e1.perPlayMin, 1); assert.equal(e1.playsPerMin, 1)
  const e2 = playEfficiency(2, 600)  // 2판 / 10분 → 분당 0.2판 → score 40, 한 판 5분
  assert.equal(e2.score, 40); assert.equal(e2.perPlayMin, 5)
  const e3 = playEfficiency(3, 0)    // 화면시간 0 → 효율 보류
  assert.equal(e3.plays, 3); assert.equal(e3.perPlayMin, null); assert.equal(e3.score, 0)
}
ok('playEfficiency: 효율 점수/한판당 분 + 0 방어')

// ── recordPlay → days 누적 → getDashboard 오늘/랭킹/효율 ──
{
  recordPlay('memory', { level: 1 })
  recordPlay('memory', { level: 1 })
  recordPlay('puzzle', {})
  const d = getDashboard()
  const today = dayKey()
  assert.equal(d.todayPlays, 3, '오늘 3판 누적')
  assert.equal(d.days[today], 3, 'days[today]=3')
  assert.equal(d.ranking[0].id, 'memory', '최다 플레이=memory')
  assert.ok(d.ranking.find((r) => r.id === 'puzzle'), '랭킹에 puzzle 포함')
  assert.ok(d.efficiency && d.efficiency.plays === 3, 'efficiency.plays=3')
  assert.equal(d.favoriteId, 'memory')
}
ok('recordPlay→days→getDashboard(오늘·랭킹·효율) 연동')

console.log(`\n✅ fmk-dashboard 테스트 ${passed}개 통과`)
