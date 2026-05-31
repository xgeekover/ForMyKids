/* ===================================================================
   ForMyKids · 추억 사진 로더 — 카메라/갤러리 사진을 Canvas 로 안전하게 리사이즈
   -------------------------------------------------------------------
   · <input type="file" accept="image/*" capture="environment"> 로 즉석 촬영 또는 갤러리 선택.
   · URL.createObjectURL → Image → Canvas(최대 maxSize, 기본 1024px) 리사이즈 → 다시 objectURL.
   · 원본 objectURL 은 캔버스에 그린 직후 즉시 revoke. 결과 objectURL 은 호출측이 게임 종료/언마운트 때
     revoke() 로 해제(메모리 누수 방지).
   · 외부 API 없음(오프라인 안전). Canvas 연산은 한 장만 동기 처리(블로킹 최소).
   API: openPhotoPicker({maxSize,onReady,onError}), resizeFileToObjectURL(file,maxSize)
   =================================================================== */

export function isSupported() {
  try {
    return typeof document !== 'undefined' && typeof URL !== 'undefined'
      && typeof URL.createObjectURL === 'function';
  } catch (e) { return false; }
}

/**
 * File → 리사이즈된 이미지 objectURL. resolve({url, width, height, revoke}).
 * url 은 ≤maxSize 로 줄인 JPEG blob 의 objectURL. revoke() 로 반드시 해제할 것.
 */
export function resizeFileToObjectURL(file, maxSize = 1024) {
  return new Promise((resolve, reject) => {
    if (!isSupported() || !file) { reject(new Error('unsupported')); return; }
    let inUrl = null;
    try { inUrl = URL.createObjectURL(file); } catch (e) { reject(e); return; }
    const freeIn = () => { if (inUrl) { try { URL.revokeObjectURL(inUrl); } catch (e) {} inUrl = null; } };
    const img = new Image();
    img.onload = () => {
      try {
        const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
        if (!iw || !ih) throw new Error('bad image');
        const scale = Math.min(1, maxSize / Math.max(iw, ih)); // 키우진 않고 줄이기만
        const w = Math.max(1, Math.round(iw * scale)), h = Math.max(1, Math.round(ih * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no 2d ctx');
        ctx.drawImage(img, 0, 0, w, h);
        freeIn(); // 원본 objectURL 즉시 해제(캔버스에 픽셀 복사 완료)
        const finishBlob = (blob) => {
          if (!blob) { reject(new Error('encode failed')); return; }
          const outUrl = URL.createObjectURL(blob);
          resolve({ url: outUrl, width: w, height: h, revoke: () => { try { URL.revokeObjectURL(outUrl); } catch (e) {} } });
        };
        if (canvas.toBlob) canvas.toBlob(finishBlob, 'image/jpeg', 0.85);
        else { // 구형 폴백: dataURL(누수 없음 — revoke 는 no-op)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          resolve({ url: dataUrl, width: w, height: h, revoke: () => {} });
        }
      } catch (e) { freeIn(); reject(e); }
    };
    img.onerror = () => { freeIn(); reject(new Error('image load failed')); };
    img.src = inUrl;
  });
}

/**
 * 사진 선택기를 띄운다(모바일: 후면 카메라 즉석 촬영 또는 갤러리). 선택·리사이즈 완료 시 onReady({url,width,height,revoke}).
 * 취소/실패 시 onError(err). 어떤 경우에도 throw 하지 않는다.
 */
export function openPhotoPicker(opts = {}) {
  if (typeof document === 'undefined') { if (opts.onError) opts.onError(new Error('no document')); return; }
  const maxSize = opts.maxSize || 1024;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.setAttribute('capture', 'environment'); // 모바일에서 즉석 촬영 유도(미지원이면 갤러리)
  input.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0';
  const cleanup = () => { if (input.parentNode) input.parentNode.removeChild(input); };
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    cleanup();
    if (!file) { if (opts.onError) opts.onError(new Error('no file')); return; }
    resizeFileToObjectURL(file, maxSize)
      .then((r) => { if (opts.onReady) opts.onReady(r); })
      .catch((e) => { if (opts.onError) opts.onError(e); });
  }, { once: true });
  // 취소 시엔 대부분 'change' 가 안 떠 input 이 DOM 에 고아로 남는다 → 'cancel' + window focus 폴백으로 정리.
  input.addEventListener('cancel', () => { cleanup(); if (opts.onError) opts.onError(new Error('canceled')); }, { once: true });
  const onFocus = () => {
    window.removeEventListener('focus', onFocus);
    // 다이얼로그가 닫히고 포커스 복귀 → 다음 틱에 파일 없으면(취소) 정리. (선택했으면 change 가 이미 정리)
    setTimeout(() => { if (!input.files || !input.files.length) cleanup(); }, 0);
  };
  window.addEventListener('focus', onFocus);
  document.body.appendChild(input);
  try { input.click(); } catch (e) { window.removeEventListener('focus', onFocus); cleanup(); if (opts.onError) opts.onError(e); }
}
