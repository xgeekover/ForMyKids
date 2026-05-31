/* 미로 순수 로직 단위 테스트 (node games/maze/maze-logic.test.mjs)
   신규 난이도(13×13·17×17) 포함 완전미로/풀이 가능성/별 배치 무결성 검증. */
import assert from 'node:assert/strict'
import { LEVELS, buildMaze, placeStars, analyzeMaze, E, S } from './maze-logic.js'

let passed = 0
const ok = (l) => { passed++; console.log('  ✓', l) }

// 난이도 테이블: 6단계 + 신규 13/17
assert.deepEqual(Object.keys(LEVELS).map(Number).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6])
assert.equal(LEVELS[5].size, 13)
assert.equal(LEVELS[6].size, 17)
assert.ok(Object.values(LEVELS).every((l) => l.stars >= 2 && l.stars <= 5), '별 개수 2~5')
ok('난이도 6단계(연습~우주 미로) + 별 2~5 매핑')

// 모든 난이도에서 출발→도착 풀이 가능 + 완전미로(모든 칸 연결) — 여러 번 반복
for (const lv of [1, 2, 3, 4, 5, 6]) {
  const size = LEVELS[lv].size
  for (let t = 0; t < 20; t++) {
    const grid = buildMaze(size, size)
    const a = analyzeMaze(grid, size, size)
    assert.ok(a.reachedGoal, `level ${lv}(${size}×${size}) 출발→도착 도달 가능`)
    assert.ok(a.allConnected, `level ${lv}(${size}×${size}) 모든 칸 연결`)
    assert.equal(a.visitedCount, size * size)
  }
}
ok('6난이도 모두 완전미로 + 풀이 가능 (반복 검증)')

// 13×13·17×17 집중: 통로(제거된 공유벽) 수 = 칸수-1 (spanning tree = 완전미로)
for (const size of [13, 17]) {
  for (let t = 0; t < 10; t++) {
    const grid = buildMaze(size, size)
    let passages = 0
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const w = grid[y * size + x]
        if (!(w & E) && x < size - 1) passages++ // 동쪽 열림
        if (!(w & S) && y < size - 1) passages++ // 남쪽 열림
      }
    }
    assert.equal(passages, size * size - 1, `${size}×${size} 통로 수 = 칸수-1`)
  }
}
ok('13×13·17×17 무결성(통로=칸수-1, 사이클 없는 트리)')

// 별 배치: 난이도 비례 개수, 출발/도착 제외, 중복 없음
for (const lv of [1, 2, 3, 4, 5, 6]) {
  const size = LEVELS[lv].size
  const count = LEVELS[lv].stars
  const stars = placeStars(size, size, count)
  assert.equal(stars.length, Math.min(count, size * size - 2), `level ${lv} 별 개수`)
  const idxs = new Set(stars.map((s) => s.y * size + s.x))
  assert.equal(idxs.size, stars.length, '별 중복 없음')
  assert.ok(!idxs.has(0) && !idxs.has(size * size - 1), '출발/도착 칸 제외')
}
ok('별 배치: 난이도 비례(≤5)·중복 없음·출발/도착 제외')

console.log(`\n✅ maze-logic 테스트 ${passed}개 통과`)
