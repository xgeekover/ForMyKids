/* 틀린그림찾기 순수 로직 단위 테스트 (node games/spot/spot-logic.test.mjs)
   '한 장의 사진' 방식: 이미지 목록 · 난이도 · 변형 스펙 생성(개수·범위·비겹침·종류) · 탭 판정. */
import assert from 'node:assert/strict'
import {
  SPOT_IMAGES, DIFFS, DIFF_KINDS, STICKER_EMOJIS,
  buildDifferences, isHit, hitTest, pickSpotImage, spotImageById,
} from './spot-logic.js'

let passed = 0
const ok = (l) => { passed++; console.log('  ✓', l) }

// 이미지 목록: ≥1, 필수 필드 + 로컬 상대경로(오프라인 안전)
assert.ok(SPOT_IMAGES.length >= 1, '이미지 ≥1')
for (const im of SPOT_IMAGES) {
  assert.ok(im.id && im.title && im.src, `${im.id} 필수 필드`)
  assert.ok(typeof im.fallbackEmoji === 'string' && im.fallbackEmoji.length > 0, `${im.id} 폴백 이모지`)
  assert.ok(Array.isArray(im.bg) && im.bg.length === 2, `${im.id} 폴백 배경`)
  assert.ok(im.src.startsWith('../../assets/puzzle/'), `${im.id} 로컬 상대경로`)
}
assert.ok(spotImageById(SPOT_IMAGES[0].id), 'spotImageById 조회')
assert.equal(spotImageById('___nope___'), null, '없는 id → null')
assert.ok(SPOT_IMAGES.includes(pickSpotImage(() => 0)), 'pickSpotImage 는 목록 중 하나')
ok('이미지 목록(필수 필드·로컬 경로·조회)')

// 난이도: 3단계, diffs 3/4/5, time>0
assert.deepEqual(Object.keys(DIFFS), ['1', '2', '3'], '난이도 3단계')
assert.equal(DIFFS[1].diffs, 3); assert.equal(DIFFS[2].diffs, 4); assert.equal(DIFFS[3].diffs, 5)
for (const k of [1, 2, 3]) { assert.ok(DIFFS[k].time > 0 && DIFFS[k].label && DIFFS[k].emoji, `level ${k} 메타`) }
ok('난이도 3단계 + 차이 개수(3·4·5)')

// buildDifferences: 개수·범위·비겹침·종류·종류별 파라미터 (여러 번 반복 검증)
for (let trial = 0; trial < 40; trial++) {
  for (const k of [1, 2, 3]) {
    const d = DIFFS[k]
    const specs = buildDifferences(d)
    assert.equal(specs.length, d.diffs, `level ${k} 변형 ${d.diffs}개`)
    assert.equal(new Set(specs.map((s) => s.id)).size, specs.length, 'id 고유')
    for (const s of specs) {
      assert.ok(s.cx > 0 && s.cx < 1 && s.cy > 0 && s.cy < 1, '중심 범위 내(0~1)')
      assert.ok(s.r > 0 && s.r < 0.2, '반경 합리적')
      assert.ok(DIFF_KINDS.includes(s.kind), '유효한 변형 종류')
      if (s.kind === 'recolor') assert.ok(Number.isFinite(s.hue), 'recolor hue')
      if (s.kind === 'erase') assert.ok(Number.isFinite(s.sxOff) && Number.isFinite(s.syOff), 'erase 오프셋')
      if (s.kind === 'sticker') assert.ok(STICKER_EMOJIS.includes(s.emoji), 'sticker 이모지')
    }
    for (let i = 0; i < specs.length; i++) {
      for (let j = i + 1; j < specs.length; j++) {
        assert.ok(Math.hypot(specs[i].cx - specs[j].cx, specs[i].cy - specs[j].cy) >= 0.24 - 1e-9, '중심 간 최소 거리(비겹침)')
      }
    }
  }
}
ok('buildDifferences 개수/범위/비겹침/종류/파라미터(40회 반복)')

// 탭 판정: 중심 탭 hit, 먼 탭 miss
const d0 = { id: 0, cx: 0.5, cy: 0.5, r: 0.08, kind: 'recolor' }
assert.ok(isHit(d0, 0.5, 0.5), '중심 탭 hit')
assert.ok(isHit(d0, 0.56, 0.5), '근처(판정 반경 내) hit')
assert.ok(!isHit(d0, 0.9, 0.9), '먼 탭 miss')
ok('isHit 판정 영역(중심/근처 hit, 먼 곳 miss)')

// hitTest: 미발견 중 최근접 선택, 이미 찾은 건 제외, 영역 밖이면 null
const specs = [
  { id: 0, cx: 0.3, cy: 0.3, r: 0.08, kind: 'recolor' },
  { id: 1, cx: 0.7, cy: 0.7, r: 0.08, kind: 'flip' },
]
assert.equal(hitTest(specs, new Set(), 0.31, 0.31).id, 0, '가까운 0번 선택')
assert.equal(hitTest(specs, new Set([0]), 0.31, 0.31), null, '이미 찾은 0번 제외 → 근처 없음')
assert.equal(hitTest(specs, new Set(), 0.05, 0.05), null, '아무 영역도 아니면 null')
ok('hitTest 최근접 미발견 선택 + 발견 제외')

console.log(`\n✅ spot-logic 테스트 ${passed}개 통과`)
