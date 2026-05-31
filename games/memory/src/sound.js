/* WebAudio 효과음 — 파일 불필요, 사용자 클릭 후 컨텍스트 생성 */
export const sound = (() => {
  let ctx = null
  function ensure() {
    if (ctx) return ctx
    try {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
      if (AC) ctx = new AC()
    } catch (e) {
      ctx = null
    }
    return ctx
  }
  function tone(freq, start, dur, type = 'sine', gain = 0.12) {
    const ac = ensure()
    if (!ac) return
    try {
      const t0 = ac.currentTime + start
      const osc = ac.createOscillator()
      const g = ac.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(freq, t0)
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
      osc.connect(g).connect(ac.destination)
      osc.start(t0)
      osc.stop(t0 + dur + 0.02)
    } catch (e) {
      /* 무음 처리 */
    }
  }
  return {
    resume() { const ac = ensure(); if (ac && ac.state === 'suspended') ac.resume() },
    flip()  { tone(620, 0, 0.10, 'triangle', 0.06) },
    match() { tone(660, 0, 0.12, 'sine', 0.12); tone(880, 0.10, 0.16, 'sine', 0.12) },
    wrong() { tone(300, 0, 0.16, 'sine', 0.07) },
    tick(step) { tone(520 + (Number(step) || 0) * 70, 0, 0.07, 'triangle', 0.06) }, // 카운트다운 똑딱
    start() { // 미리 보기 끝 → 게임 시작 "뾰롱링~"
      [660, 880, 1175, 1568].forEach((f, i) => tone(f, i * 0.07, 0.13, 'triangle', 0.12))
      tone(2093, 0.30, 0.20, 'sine', 0.07)
    },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.14, 0.28, 'triangle', 0.13)) },
  }
})()
