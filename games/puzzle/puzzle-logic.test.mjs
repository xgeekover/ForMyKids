/* 조각 퍼즐 순수 로직 단위 테스트 (node games/puzzle/puzzle-logic.test.mjs)
   난이도 10단계 조각 수 · 조각 분할 무결성 · 이미지 설정/폴백 검증. */
import assert from 'node:assert/strict'
import {
  LEVELS, LEVEL_ORDER, pieceCount, buildPieces,
  IMAGES, CATEGORIES, imagesByCategory, imageById, snapRadius,
} from './puzzle-logic.js'

let passed = 0
const ok = (l) => { passed++; console.log('  ✓', l) }

// 난이도 10단계 + 정확한 조각 수 (16부터 80까지)
const EXPECTED = { 1: 16, 2: 20, 3: 25, 4: 30, 5: 36, 6: 42, 7: 48, 8: 56, 9: 64, 10: 80 }
assert.deepEqual(LEVEL_ORDER, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], '10단계')
for (const lv of LEVEL_ORDER) {
  const l = LEVELS[lv]
  assert.equal(l.cols * l.rows, EXPECTED[lv], `level ${lv} 조각 수 ${EXPECTED[lv]}`)
  assert.equal(pieceCount(lv), EXPECTED[lv], `pieceCount(${lv})`)
  assert.ok(l.icon && l.name, `level ${lv} 메타`)
}
ok('난이도 10단계 + 조각 수(16·20·25·30·36·42·48·56·64·80)')

// 조각 분할 무결성: 개수 = cols*rows, 슬롯(col,row) 고유, 격자 전체 커버, id 0..n-1
for (const lv of LEVEL_ORDER) {
  const { cols, rows } = LEVELS[lv]
  const pieces = buildPieces(cols, rows)
  assert.equal(pieces.length, cols * rows, `level ${lv} 조각 개수`)
  const slots = new Set(pieces.map((p) => p.row + '_' + p.col))
  assert.equal(slots.size, pieces.length, '슬롯 중복 없음')
  const ids = new Set(pieces.map((p) => p.id))
  assert.equal(ids.size, pieces.length, 'id 고유')
  for (const p of pieces) {
    assert.ok(p.col >= 0 && p.col < cols && p.row >= 0 && p.row < rows, '슬롯 격자 범위 내')
  }
}
ok('조각 분할 무결성(개수·고유 슬롯·격자 커버)')

// 이미지 설정: 카테고리 2종, 명화 ≥2 / 캐릭터 ≥1, 필수 필드 + 폴백 이모지
assert.equal(CATEGORIES.length, 2)
assert.deepEqual(CATEGORIES.map((c) => c.id), ['masterpiece', 'character'])
assert.ok(IMAGES.length >= 4, '이미지 ≥4')
for (const img of IMAGES) {
  assert.ok(img.id && img.title && img.src, `${img.id} 필수 필드`)
  assert.ok(img.category === 'masterpiece' || img.category === 'character', `${img.id} 카테고리`)
  assert.ok(typeof img.fallbackEmoji === 'string' && img.fallbackEmoji.length > 0, `${img.id} 폴백 이모지`)
  assert.ok(Array.isArray(img.bg) && img.bg.length === 2, `${img.id} 폴백 배경`)
}
assert.ok(imagesByCategory('masterpiece').length >= 2, '명화 ≥2')
assert.ok(imagesByCategory('character').length >= 1, '캐릭터 ≥1')
assert.ok(imageById('monalisa') && imageById('monalisa').category === 'masterpiece')
assert.equal(imageById('___nope___'), null, '없는 id → null')
ok('이미지 설정(카테고리/명화·캐릭터/필수필드/폴백)')

// 캐릭터 src 는 로컬 상대경로(게임 페이지 → 루트 public/assets/puzzle/), 명화 src 는 원격 URL
assert.ok(imagesByCategory('character').every((i) => i.src.startsWith('../../assets/puzzle/')), '캐릭터=로컬 상대경로')
assert.ok(imagesByCategory('masterpiece').every((i) => /^https?:\/\//.test(i.src)), '명화=원격 URL')
ok('명화 원격 URL / 캐릭터 로컬 경로 매핑')

// 스냅 반경: 양수이고 조각보다 작음
const r = snapRadius(120, 90)
assert.ok(r > 0 && r < 90, '스냅 반경 합리적')
ok('스냅 반경 계산')

console.log(`\n✅ puzzle-logic 테스트 ${passed}개 통과`)
