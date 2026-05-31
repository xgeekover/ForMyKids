/* ===================================================================
   ForMyKids · 오프라인 동기화 큐 (여행 모드) — IndexedDB 영속 큐
   -------------------------------------------------------------------
   여행/비행기 모드처럼 홈 네트워크 밖이라 /api/sync 가 실패하면, 보낼 payload 를
   브라우저 IndexedDB 에 '큐'로 안전 저장한다. 새로고침/앱 종료에도 살아남아(durable),
   다시 온라인이 되면 일괄 전송(bulk) 후 비운다.

   동기화 전략은 '전체 payload Last-Writer-Wins'(전 프로필 한 덩어리)이므로,
   큐에 여러 스냅샷이 쌓여도 '가장 최신(updatedAt) 하나'만 보내면 그 안에 누적 기록이
   모두 담겨 있다 → 그게 곧 중복 제거(dedup)다. drainQueue() 는 동시 호출(online 이벤트 +
   새로고침 initSync)에도 한 번만 전송하도록 가드한다.

   모든 IndexedDB 함수는 브라우저 전용 가드(typeof indexedDB) → Node/SSR 에서 안전 no-op.
   순수 함수(pickLatest)와 코디네이터(drainQueue)는 주입식 I/O 라 Node 에서 테스트 가능.
   =================================================================== */

const DB_NAME = 'fmk-sync';
const STORE = 'queue';
const DB_VERSION = 1;

function _hasIDB() {
  try { return typeof indexedDB !== 'undefined' && !!indexedDB; } catch (e) { return false; }
}

function _openDB() {
  return new Promise((resolve, reject) => {
    if (!_hasIDB()) { reject(new Error('no-indexeddb')); return; }
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        // seq: 자동증가 키(전송 순서). 레코드: { seq, id(deviceId), updatedAt, payload, queuedAt }
        db.createObjectStore(STORE, { keyPath: 'seq', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb-open-failed'));
  });
}

function _tx(db, mode) {
  const tx = db.transaction(STORE, mode);
  return { tx, store: tx.objectStore(STORE) };
}

/** payload 를 큐에 추가. 성공 시 seq(number), 실패/미지원 시 false. (절대 throw 하지 않음) */
export async function enqueue(record) {
  if (!_hasIDB() || !record || typeof record !== 'object') return false;
  let db;
  try {
    db = await _openDB();
    return await new Promise((resolve) => {
      const { tx, store } = _tx(db, 'readwrite');
      // seq 는 자동증가 → 넣지 않는다. queuedAt 은 호출측이 넘긴 값(테스트 결정성 위해 Date.now 직접 안 씀).
      const rec = { id: record.id, updatedAt: Number(record.updatedAt) || 0, payload: record.payload, queuedAt: Number(record.queuedAt) || 0 };
      const r = store.add(rec);
      r.onsuccess = () => resolve(r.result);
      tx.oncomplete = () => { try { db.close(); } catch (e) {} };
      tx.onerror = () => { try { db.close(); } catch (e) {} resolve(false); };
      tx.onabort = () => { try { db.close(); } catch (e) {} resolve(false); };
    });
  } catch (e) { try { if (db) db.close(); } catch (_) {} return false; }
}

/** 큐의 모든 항목을 seq 오름차순으로. 실패/미지원 시 []. */
export async function listQueue() {
  if (!_hasIDB()) return [];
  let db;
  try {
    db = await _openDB();
    return await new Promise((resolve) => {
      const { tx, store } = _tx(db, 'readonly');
      const r = store.getAll();
      r.onsuccess = () => resolve(Array.isArray(r.result) ? r.result.slice().sort((a, b) => a.seq - b.seq) : []);
      r.onerror = () => resolve([]);
      tx.oncomplete = () => { try { db.close(); } catch (e) {} };
      // tx 중단/오류에도 반드시 resolve + db.close — 안 그러면 Promise 가 영영 미해결되어 드레인이 멈춘다(_draining 고착).
      tx.onerror = () => { try { db.close(); } catch (e) {} resolve([]); };
      tx.onabort = () => { try { db.close(); } catch (e) {} resolve([]); };
    });
  } catch (e) { try { if (db) db.close(); } catch (_) {} return []; }
}

/** 큐 전체 비우기. (전송 성공 후 호출) */
export async function clearQueue() {
  if (!_hasIDB()) return false;
  let db;
  try {
    db = await _openDB();
    return await new Promise((resolve) => {
      const { tx, store } = _tx(db, 'readwrite');
      store.clear();
      tx.oncomplete = () => { try { db.close(); } catch (e) {} resolve(true); };
      tx.onerror = () => { try { db.close(); } catch (e) {} resolve(false); };
      tx.onabort = () => { try { db.close(); } catch (e) {} resolve(false); };
    });
  } catch (e) { try { if (db) db.close(); } catch (_) {} return false; }
}

/** 큐 길이(미지원/실패 시 0). */
export async function queueSize() {
  const items = await listQueue();
  return items.length;
}

/**
 * 순수 함수: 큐 항목들 중 '보낼 하나'를 고른다(전체-payload LWW → 가장 최신 updatedAt,
 * 동률이면 가장 큰 seq). 빈 배열이면 null. — 중복 제거의 핵심(N개 → 1회 전송)이라 단위 테스트 대상.
 */
export function pickLatest(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  let best = null;
  for (const it of items) {
    if (!it) continue;
    if (best === null) { best = it; continue; }
    const a = Number(it.updatedAt) || 0, b = Number(best.updatedAt) || 0;
    if (a > b || (a === b && (Number(it.seq) || 0) > (Number(best.seq) || 0))) best = it;
  }
  return best;
}

// 동시 드레인(online 이벤트 + 새로고침 initSync) 중복 전송 방지용 모듈 가드.
let _draining = false;

/**
 * 큐 1회 드레인: 비어 있지 않으면 '가장 최신 하나'만 전송하고, 성공 시 큐 전체를 비운다.
 * io = { list:()=>Promise<items>, send:(latestItem)=>Promise<boolean>, clearAll:()=>Promise }
 * - 동시 호출은 두 번째부터 즉시 {sent:false, reason:'busy'} 로 막아 '중복 전송'을 방지한다.
 * - send 가 false(실패)면 큐를 유지(다음 기회에 재시도). 어떤 경우에도 throw 하지 않는다.
 */
export async function drainQueue(io) {
  if (_draining) return { sent: false, reason: 'busy' };
  if (!io || typeof io.list !== 'function' || typeof io.send !== 'function') {
    return { sent: false, reason: 'no-io' };
  }
  _draining = true;
  try {
    const items = (await io.list()) || [];
    if (!items.length) return { sent: false, reason: 'empty' };
    const latest = pickLatest(items);
    let ok = false;
    try { ok = await io.send(latest); } catch (e) { ok = false; }
    if (ok) {
      if (typeof io.clearAll === 'function') { try { await io.clearAll(); } catch (e) {} }
      return { sent: true, count: items.length, latestSeq: latest ? latest.seq : null };
    }
    return { sent: false, reason: 'send-failed', count: items.length };
  } finally {
    _draining = false;
  }
}

// 테스트/안전용: 드레인 가드 강제 해제(정상 흐름에선 finally 가 처리).
export function _resetDrainGuard() { _draining = false; }
