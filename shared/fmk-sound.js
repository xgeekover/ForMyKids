/* ===================================================================
   ForMyKids · 공통 효과음 엔진 (WebAudio, 파일 없음)
   -------------------------------------------------------------------
   · 부드러운 사인파(sine) 중심의 짧은 음으로 7~8세가 깜짝 놀라지 않게 폴리싱.
   · AudioContext 는 첫 사용자 제스처(클릭/키) 안에서 생성·resume 되어 자동재생
     정책에 막히지 않는다.
   · 음소거 상태는 localStorage('fmk-muted')에 저장 → 모든 페이지/게임에 공유.
   API: resume(), isMuted(), setMuted(), toggleMute(),
        correct(), wrong(), pop(), star(), win(), fanfare()
   =================================================================== */
const KEY = 'fmk-muted';
let ctx = null;
let muted = false;
try { muted = (typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1'); } catch (e) {}

let bgm = null;          // 현재 재생 중인 BGM 상태 { mode, master, pat, timer, bar, note }
let _armedMode = null;   // 이 페이지가 원하는 BGM 모드(소리 켜질 때 자동 시작용)

function ac() {
  if (!ctx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    } catch (e) { ctx = null; }
  }
  return ctx;
}

export function resume() {
  const c = ac();
  if (c && c.state === 'suspended') { try { c.resume(); } catch (e) {} }
}
export function isMuted() { return muted; }
export function setMuted(m) {
  muted = !!m;
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) {}
  // 소리 끄면 BGM 페이드아웃, 켜면 이 페이지가 원하던 BGM 자동 재개
  if (muted) stopBGM();
  else if (_armedMode) playBGM(_armedMode);
}
export function toggleMute() { setMuted(!muted); return muted; }

// 부드러운 엔벨로프(살짝 띄우는 attack + 지수 감쇠 release)로 한 음 재생.
function tone(freq, startAt, dur, gain, type) {
  const c = ac();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type || 'sine';
  osc.frequency.value = freq;
  const t = c.currentTime + startAt;
  const peak = Math.max(0.0002, gain);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.018);     // 부드러운 attack
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);     // 부드러운 release
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

// notes: [{ f, d, t? }] (t = 시작 오프셋초). opts: { gain, type }
function play(notes, opts) {
  if (muted) return;
  const c = ac();
  if (!c) return;
  resume();
  const o = opts || {};
  const gain = o.gain != null ? o.gain : 0.12;
  for (const n of notes) tone(n.f, n.t || 0, n.d, n.g != null ? n.g : gain, o.type);
}

// ---------- 음색 프리셋 (모두 낮은 게인으로 부드럽게) ----------
// 맞췄을 때 "딩-동-댕" 상행 3음
export function correct() {
  play([{ f: 523.25, d: 0.13 }, { f: 659.25, d: 0.13, t: 0.1 }, { f: 783.99, d: 0.2, t: 0.2 }], { gain: 0.11 });
}
// 틀렸을 때 부드러운 "뿅~" (놀라지 않게 낮고 짧게)
export function wrong() {
  play([{ f: 320, d: 0.12 }, { f: 232, d: 0.16, t: 0.07 }], { gain: 0.08, type: 'sine' });
}
// 작은 획득(별/콤보 등) 톡
export function pop() {
  play([{ f: 880, d: 0.09 }], { gain: 0.08 });
}
// 별 획득 — 반짝 상행 2음
export function star() {
  play([{ f: 1046.5, d: 0.1 }, { f: 1318.5, d: 0.14, t: 0.07 }], { gain: 0.09 });
}
// 일반 클리어 — 산뜻한 4음 징글
export function win() {
  play([
    { f: 523.25, d: 0.14 }, { f: 659.25, d: 0.14, t: 0.12 },
    { f: 783.99, d: 0.14, t: 0.24 }, { f: 1046.5, d: 0.34, t: 0.36 },
  ], { gain: 0.12 });
}
// 최고 난이도 클리어 — 웅장하고 신나는 팡파레(상행 아르페지오 + 머무는 화음)
export function fanfare() {
  play([
    { f: 392.0, d: 0.12 }, { f: 523.25, d: 0.12, t: 0.1 },
    { f: 659.25, d: 0.12, t: 0.2 }, { f: 783.99, d: 0.14, t: 0.3 },
    { f: 1046.5, d: 0.6, t: 0.44, g: 0.14 },   // 최고음
    { f: 783.99, d: 0.6, t: 0.44, g: 0.09 },   // 화음
    { f: 659.25, d: 0.6, t: 0.44, g: 0.08 },
    { f: 1318.5, d: 0.5, t: 0.66, g: 0.08 },   // 반짝 마무리
  ], { gain: 0.12, type: 'triangle' });
}

/* ===================================================================
   절차적 배경음악(BGM) — mp3 없이 Oscillator 로 짧은 음을 루프 재생.
   · calm(런처): 잔잔한 음악상자풍 아르페지오(sine, 느린 템포)
   · lively(게임): 조금 더 경쾌한 8비트풍 루프(triangle, 빠른 템포)
   · 마스터 GainNode 페이드 인/아웃, 음소거 시 정지. AudioContext 는 첫 제스처에 resume.
   =================================================================== */
const BGM_PATTERNS = {
  calm: {
    type: 'sine', noteMs: 430, gain: 0.05,
    seq: [
      [523.25, 659.25, 783.99, 659.25], // C  E  G  E
      [440.00, 523.25, 659.25, 523.25], // A  C  E  C
      [349.23, 440.00, 523.25, 440.00], // F  A  C  A
      [392.00, 493.88, 587.33, 493.88], // G  B  D  B
    ],
  },
  lively: {
    type: 'triangle', noteMs: 250, gain: 0.045,
    seq: [
      [523.25, 783.99, 659.25, 1046.50], // C  G  E  C↑
      [587.33, 880.00, 698.46, 1174.66], // D  A  F  D↑
      [659.25, 987.77, 783.99, 659.25],  // E  B  G  E
      [440.00, 659.25, 880.00, 659.25],  // A  E  A↑ E
    ],
  },
};

// BGM 전용 한 음(개별 envelope, 마스터 gain 노드로 라우팅).
function bgmTone(freq, dur, type, out) {
  const c = ac();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = c.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.8, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.04);
}

/** 배경음악 시작(또는 모드 전환). mode: 'calm' | 'lively'. 음소거면 시작하지 않음. */
export function playBGM(mode) {
  _armedMode = mode || 'calm';
  if (muted) return;
  const c = ac();
  if (!c) return;
  resume();
  if (bgm && bgm.mode === _armedMode) return; // 이미 같은 BGM 재생 중
  stopBGM(true); // 다른 모드면 즉시 정리 후 교체

  const pat = BGM_PATTERNS[_armedMode] || BGM_PATTERNS.calm;
  const master = c.createGain();
  master.gain.setValueAtTime(0.0001, c.currentTime);
  master.gain.exponentialRampToValueAtTime(pat.gain, c.currentTime + 1.2); // 페이드 인
  master.connect(c.destination);

  bgm = { mode: _armedMode, master, pat, bar: 0, note: 0, timer: 0 };
  const tick = () => {
    if (!bgm) return;
    const row = pat.seq[bgm.bar % pat.seq.length];
    bgmTone(row[bgm.note % row.length], (pat.noteMs / 1000) * 0.9, pat.type, master);
    bgm.note += 1;
    if (bgm.note >= row.length) { bgm.note = 0; bgm.bar += 1; }
  };
  tick();
  bgm.timer = setInterval(tick, pat.noteMs);
}

/** 배경음악 정지. 기본은 부드러운 페이드아웃, immediate=true 면 즉시. */
export function stopBGM(immediate) {
  if (!bgm) return;
  const b = bgm;
  bgm = null;
  if (b.timer) clearInterval(b.timer);
  const c = ac();
  if (!c || !b.master) return;
  if (immediate) {
    try { b.master.disconnect(); } catch (e) {}
    return;
  }
  try {
    const t = c.currentTime;
    b.master.gain.cancelScheduledValues(t);
    b.master.gain.setValueAtTime(Math.max(0.0001, b.master.gain.value || 0.0001), t);
    b.master.gain.exponentialRampToValueAtTime(0.0001, t + 0.7); // 페이드 아웃
    setTimeout(() => { try { b.master.disconnect(); } catch (e) {} }, 800);
  } catch (e) {
    try { b.master.disconnect(); } catch (_) {}
  }
}

/**
 * 이 페이지의 BGM 을 '무장'한다. 자동재생 정책 때문에 첫 사용자 제스처에서 시작.
 * 페이지를 떠날 때(pagehide) 즉시 정지(다음 페이지가 페이드 인).
 */
export function armBGM(mode) {
  _armedMode = mode || 'calm';
  if (typeof window === 'undefined') return; // Node 안전
  const start = () => { resume(); if (!muted) playBGM(_armedMode); };
  window.addEventListener('pointerdown', start, { once: true });
  window.addEventListener('keydown', start, { once: true });
  window.addEventListener('pagehide', () => stopBGM(true));
}
