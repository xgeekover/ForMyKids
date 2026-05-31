/* 오프라인 동기화 큐(여행 모드) 단위 테스트 (node shared/fmk-syncqueue.test.mjs)
   - pickLatest: 전체-payload LWW 에서 '보낼 하나' 선택(중복 제거 핵심)
   - drainQueue: 비우기 1회 동작 + 동시 호출 시 '중복 전송' 방지(busy 가드) — 핵심 방어 로직
   - IndexedDB 함수는 Node(미지원)에서 안전 no-op 인지 검증 */
import assert from 'node:assert/strict'
import {
  pickLatest, drainQueue, _resetDrainGuard,
  enqueue, listQueue, clearQueue, queueSize,
} from './fmk-syncqueue.js'

let passed = 0
const ok = (l) => { passed++; console.log('  ✓', l) }
const tick = () => new Promise((r) => setTimeout(r, 0))

// ── pickLatest: 빈 배열 → null, 최신 updatedAt 선택, 동률은 큰 seq ──
assert.equal(pickLatest([]), null, '빈 큐 → null')
assert.equal(pickLatest(null), null, '비배열 → null')
assert.equal(pickLatest([{ seq: 1, updatedAt: 10 }, { seq: 2, updatedAt: 30 }, { seq: 3, updatedAt: 20 }]).seq, 2, '최신 updatedAt')
assert.equal(pickLatest([{ seq: 5, updatedAt: 50 }, { seq: 9, updatedAt: 50 }]).seq, 9, '동률 → 큰 seq')
ok('pickLatest: 최신 payload 선택(중복 제거 기준)')

// ── drainQueue: 빈 큐면 전송 안 함 ──
_resetDrainGuard()
{
  let sends = 0
  const res = await drainQueue({ list: async () => [], send: async () => { sends++; return true }, clearAll: async () => {} })
  assert.equal(res.sent, false); assert.equal(res.reason, 'empty'); assert.equal(sends, 0, '빈 큐 → 전송 0회')
}
ok('drainQueue: 빈 큐는 전송하지 않음')

// ── drainQueue: 여러 항목이 쌓여도 '한 번만' 전송(bulk) + 성공 시 전체 비움 ──
_resetDrainGuard()
{
  let sends = 0, cleared = 0
  const items = [{ seq: 1, updatedAt: 10 }, { seq: 2, updatedAt: 20 }, { seq: 3, updatedAt: 30 }]
  const res = await drainQueue({ list: async () => items, send: async () => { sends++; return true }, clearAll: async () => { cleared++ } })
  assert.equal(sends, 1, '3개 쌓여도 전송은 1회(중복 제거)')
  assert.equal(res.sent, true); assert.equal(res.count, 3)
  assert.equal(cleared, 1, '성공 시 큐 전체 비움')
}
ok('drainQueue: 다건 → 1회 전송(bulk) + 성공 시 큐 비움')

// ── drainQueue: 전송 실패면 큐 유지(비우지 않음) → 다음 기회 재시도 ──
_resetDrainGuard()
{
  let cleared = 0
  const res = await drainQueue({ list: async () => [{ seq: 1, updatedAt: 5 }], send: async () => false, clearAll: async () => { cleared++ } })
  assert.equal(res.sent, false); assert.equal(res.reason, 'send-failed')
  assert.equal(cleared, 0, '실패 시 큐 유지(데이터 보존)')
}
ok('drainQueue: 전송 실패 시 큐 보존(재시도 가능)')

// ── drainQueue: 동시 호출(online 이벤트 + 새로고침)에도 '중복 전송' 없음 ──
_resetDrainGuard()
{
  let sends = 0
  const io = {
    list: async () => { await tick(); return [{ seq: 1, updatedAt: 9 }] },
    send: async () => { sends++; await tick(); return true },
    clearAll: async () => {},
  }
  const [r1, r2] = await Promise.all([drainQueue(io), drainQueue(io)]) // 동시 2회
  const busy = [r1, r2].filter((r) => r.reason === 'busy').length
  assert.equal(sends, 1, '동시 호출이어도 전송은 1회')
  assert.equal(busy, 1, '두 번째 호출은 busy 로 차단')
}
ok('drainQueue: 동시 호출 중복 전송 방지(busy 가드)')

// ── 전송 성공 후 다시 드레인하면(빈 큐) 재전송 없음 ──
_resetDrainGuard()
{
  let sends = 0
  let q = [{ seq: 1, updatedAt: 7 }]
  const io = { list: async () => q, send: async () => { sends++; return true }, clearAll: async () => { q = [] } }
  await drainQueue(io)   // 1회 전송 + 비움
  await drainQueue(io)   // 빈 큐 → 전송 안 함
  assert.equal(sends, 1, '성공·비운 뒤 재드레인은 재전송 안 함')
}
ok('drainQueue: 성공 후 재드레인은 재전송 없음')

// ── IndexedDB 함수: Node(미지원)에서 throw 없이 안전 no-op ──
assert.equal(await enqueue({ id: 'x', updatedAt: 1, payload: {} }), false, 'Node enqueue → false')
assert.deepEqual(await listQueue(), [], 'Node listQueue → []')
assert.equal(await queueSize(), 0, 'Node queueSize → 0')
assert.equal(await clearQueue(), false, 'Node clearQueue → false')
ok('IndexedDB 함수: Node 환경 안전 no-op')

console.log(`\n✅ fmk-syncqueue 테스트 ${passed}개 통과`)
