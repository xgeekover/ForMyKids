/* ===================================================================
   ForMyKids · 칭찬 음성 (TTS, Web Speech API) — 파일/네트워크 없음
   -------------------------------------------------------------------
   · 게임 클리어/칭찬 도장 순간, 브라우저 내장 SpeechSynthesis 로 아이 이름을 부르며 칭찬.
   · 한국어(ko-KR) 음성을 최우선으로 고른다(없으면 브라우저 기본 ko → 그래도 없으면 lang 만 ko-KR).
   · 다음 경우 '에러 없이' 부드럽게 무시(no-op):
       - SpeechSynthesis 미지원 / Node·SSR(window 없음)
       - 전체 음소거(fmk-sound 와 공유하는 localStorage 'fmk-muted' = '1')
       - 디바이스 무음모드(소리만 안 날 뿐 예외는 안 남)
   · 모든 호출은 try/catch 로 감싸 전역 크래시 가드를 건드리지 않는다.
   API: speak(text, opts), praise(name, opts), isSupported(), cancel()
   =================================================================== */

const MUTE_KEY = 'fmk-muted';        // fmk-sound.js 와 동일 키 → 사운드/음성 음소거 일원화
const COOLDOWN_MS = 1500;            // 연속 호출이 겹쳐 떠들지 않도록(클리어+도장 동시 등)
let _lastAt = 0;
let _idx = 0;                        // 칭찬 멘트 순환(겹침 없이 다양하게)

export function isSupported() {
  try {
    return typeof window !== 'undefined'
      && 'speechSynthesis' in window
      && typeof window.SpeechSynthesisUtterance !== 'undefined';
  } catch (e) { return false; }
}

function _muted() {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1'; }
  catch (e) { return false; }
}

// 브라우저는 voice 목록을 비동기로 채우기도 한다 → 미리 한 번 깨워 둔다(있을 때만, 안전).
try {
  if (isSupported()) {
    window.speechSynthesis.getVoices();
    if (window.speechSynthesis.addEventListener) {
      window.speechSynthesis.addEventListener('voiceschanged', () => { try { window.speechSynthesis.getVoices(); } catch (e) {} });
    }
  }
} catch (e) {}

function _pickKoVoice() {
  try {
    const vs = window.speechSynthesis.getVoices() || [];
    return vs.find((v) => /ko[-_]?KR/i.test(v.lang))   // ko-KR 최우선
        || vs.find((v) => /^ko\b/i.test(v.lang))        // 그 외 한국어
        || null;
  } catch (e) { return null; }
}

/** 임의의 문장을 한국어로 읽어준다. 미지원/음소거/Node 면 false 반환(예외 없음). */
export function speak(text, opts = {}) {
  if (!isSupported() || !text) return false;
  if (_muted()) return false;
  try {
    const now = Date.now();
    if (!opts.force && (now - _lastAt) < COOLDOWN_MS) return false; // 쿨다운(겹침 방지)
    _lastAt = now;
    const u = new window.SpeechSynthesisUtterance(String(text));
    u.lang = 'ko-KR';
    const v = _pickKoVoice();
    if (v) u.voice = v;
    u.rate = (opts.rate != null) ? opts.rate : 1.0;
    u.pitch = (opts.pitch != null) ? opts.pitch : 1.15; // 살짝 높여 밝고 친근하게
    u.volume = (opts.volume != null) ? opts.volume : 1.0;
    try { window.speechSynthesis.cancel(); } catch (e) {} // 진행 중인 발화 취소(겹침 방지)
    window.speechSynthesis.speak(u);
    return true;
  } catch (e) { return false; } // 어떤 이유로든 실패하면 조용히 무시
}

// 이름이 있으면 부르며, 없으면 일반 칭찬. (이름은 24자 제한 — 저장소 규칙과 동일)
const PRAISE = [
  (n) => (n ? `우와, ${n} 최고!` : '우와, 최고야!'),
  (n) => (n ? `${n}, 정말 잘했어!` : '정말 잘했어!'),
  (n) => (n ? `${n} 대단한데?` : '대단한데?'),
  (n) => (n ? `멋지다, ${n}!` : '정말 멋지다!'),
  (n) => (n ? `${n} 짱이야!` : '짱이야!'),
];

/** 활성 아이를 이름으로 부르며 칭찬. 매 호출마다 다른 멘트로 순환. */
export function praise(name, opts = {}) {
  if (!isSupported()) return false;
  const n = (typeof name === 'string' && name.trim()) ? name.trim().slice(0, 24) : '';
  const msg = PRAISE[_idx % PRAISE.length](n);
  const spoke = speak(msg, opts);
  if (spoke) _idx = (_idx + 1) % PRAISE.length; // 실제로 말한 경우에만 다음 멘트로(음소거/쿨다운 시 멘트 낭비 방지)
  return spoke;
}

// 같이 하기(Co-op) 칭찬 — 두 아이 이름을 모두 부른다.
let _idxMany = 0;
const PRAISE_MANY = [
  (ns) => `우와, ${ns} 둘 다 정말 최고야!`,
  (ns) => `${ns}, 같이 해냈구나! 멋져!`,
  (ns) => `${ns} 둘 다 정말 잘했어!`,
  (ns) => `${ns}, 환상의 짝꿍이야!`,
];

/** 여러 아이 이름으로 함께 칭찬. 2명 미만이면 단일 praise 로 폴백. 미지원/음소거면 무시(false). */
export function praiseMany(names, opts = {}) {
  if (!isSupported()) return false;
  const list = (Array.isArray(names) ? names : [])
    .map((n) => (typeof n === 'string' ? n.trim().slice(0, 24) : ''))
    .filter(Boolean);
  if (list.length < 2) return praise(list[0] || '', opts); // 1명 이하 → 일반 칭찬
  const msg = PRAISE_MANY[_idxMany % PRAISE_MANY.length](list.join(', '));
  const spoke = speak(msg, opts);
  if (spoke) _idxMany = (_idxMany + 1) % PRAISE_MANY.length;
  return spoke;
}

/** 진행 중인 음성을 즉시 멈춘다(화면 전환/이탈 시). 미지원이면 no-op. */
export function cancel() {
  try { if (isSupported()) window.speechSynthesis.cancel(); } catch (e) {}
}
