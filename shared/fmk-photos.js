/* ===================================================================
   ForMyKids · 커스텀 사진 저장소 (IndexedDB) + 캔버스 압축
   -------------------------------------------------------------------
   · 가족 사진(큰 Base64)은 동기화 payload(fmk-store)에 넣지 않고 여기(IndexedDB)에 따로 저장.
     → 스토어에는 photoId(문자열)만 기록(payload 경량 유지). 비동기 로직은 이 파일에 격리.
   · 모든 함수 브라우저 가드(Node / IndexedDB 없으면 안전 실패: 저장 reject, 조회 null).
   사용:
     const id = await savePhoto(await compressImage(file))
     const dataURL = await loadPhoto(id)
   =================================================================== */
const DB_NAME = 'fmk-photos';
const STORE = 'photos';
const VERSION = 1;

function _idb() {
  try { return (typeof indexedDB !== 'undefined') ? indexedDB : null; } catch (e) { return null; }
}
function _open() {
  return new Promise((resolve, reject) => {
    const idb = _idb();
    if (!idb) { reject(new Error('no-indexeddb')); return; }
    let req;
    try { req = idb.open(DB_NAME, VERSION); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb-open-failed'));
  });
}
function _genId() {
  try { if (typeof crypto !== 'undefined' && crypto && crypto.randomUUID) return 'photo-' + crypto.randomUUID(); } catch (e) {}
  return 'photo-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36);
}

/** dataURL 을 저장하고 생성된(또는 지정한) id 를 반환. 실패 시 throw. */
export async function savePhoto(dataURL, id) {
  const pid = id || _genId();
  const db = await _open();
  try {
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ dataURL, savedAt: Date.now() }, pid);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  } finally { try { db.close(); } catch (e) {} }
  return pid;
}
/** id 의 dataURL 조회(없거나 IndexedDB 불가 시 null). */
export async function loadPhoto(id) {
  if (!id) return null;
  let db;
  try { db = await _open(); } catch (e) { return null; }
  try {
    return await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get(id);
      r.onsuccess = () => res(r.result ? r.result.dataURL : null);
      r.onerror = () => rej(r.error);
    });
  } catch (e) { return null; } finally { try { db.close(); } catch (e) {} }
}
/** id 의 사진 삭제(없으면 무시). */
export async function deletePhoto(id) {
  if (!id) return;
  let db;
  try { db = await _open(); } catch (e) { return; }
  try {
    await new Promise((res) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => res();
      tx.onerror = () => res();
      tx.onabort = () => res();
    });
  } finally { try { db.close(); } catch (e) {} }
}

/**
 * File/Blob → 캔버스로 리사이즈·압축한 dataURL.
 * @param {File|Blob} file
 * @param {{maxSize?:number, type?:string, quality?:number}} [opts] maxSize=한 변 최대(px), type=image/webp|image/jpeg
 */
export function compressImage(file, opts = {}) {
  const maxSize = opts.maxSize || 800;
  const type = opts.type || 'image/webp';
  const quality = (typeof opts.quality === 'number') ? opts.quality : 0.8;
  const square = !!opts.square; // true 면 정사각 중앙 크롭(정사각 퍼즐 보드 왜곡 방지)
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined' || typeof Image === 'undefined') { reject(new Error('no-dom')); return; }
    let url;
    try { url = URL.createObjectURL(file); } catch (e) { reject(e); return; }
    const img = new Image();
    img.onload = () => {
      // onload 내부 예외(getContext null, toDataURL throw 등)가 Promise 를 영원히 매달지 않도록 전체를 try/catch.
      try {
        try { URL.revokeObjectURL(url); } catch (e) {}
        const sw = img.naturalWidth || img.width;
        const sh = img.naturalHeight || img.height;
        if (!sw || !sh) { reject(new Error('bad-image')); return; }
        const c = document.createElement('canvas');
        const g = c.getContext('2d');
        if (!g) { reject(new Error('no-2d-context')); return; }
        if (square) {
          // 짧은 변 기준 중앙 크롭(cover) → 정사각으로 저장
          const s = Math.min(sw, sh);
          const sx = Math.floor((sw - s) / 2);
          const sy = Math.floor((sh - s) / 2);
          const d = Math.max(1, Math.min(maxSize, s));
          c.width = d; c.height = d;
          g.drawImage(img, sx, sy, s, s, 0, 0, d, d);
        } else {
          let w = sw, h = sh;
          if (w > maxSize || h > maxSize) {
            const scale = maxSize / Math.max(w, h);
            w = Math.max(1, Math.round(w * scale));
            h = Math.max(1, Math.round(h * scale));
          }
          c.width = w; c.height = h;
          g.drawImage(img, 0, 0, w, h);
        }
        let out = null;
        try { out = c.toDataURL(type, quality); } catch (e) { out = null; }
        // WebP 미지원 브라우저는 png 로 폴백될 수 있음 → jpeg 로 재시도(용량 보장)
        if (!out || (type === 'image/webp' && out.indexOf('data:image/webp') !== 0)) {
          out = c.toDataURL('image/jpeg', quality);
        }
        resolve(out);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => { try { URL.revokeObjectURL(url); } catch (e) {} reject(new Error('image-load-failed')); };
    img.src = url;
  });
}
