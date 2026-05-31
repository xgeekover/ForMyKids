/* ===================================================================
   ForMyKids · 통합 사운드/음성 매니저 (단일 진입점)
   -------------------------------------------------------------------
   효과음·배경음악(BGM) 엔진은 fmk-sound.js, 칭찬 음성(TTS)은 fmk-speech.js 에
   구현되어 있고, 이 모듈이 둘을 한곳에서 re-export 하여 '하나의 import' 로 쓰게 한다.
   (기존 게임은 fmk-sound 를 직접 import 해도 동작 — 점진적으로 이 모듈로 통일 가능)

     import * as audio from '.../shared/fmk-audio.js'
     audio.correct()            // 효과음(엔진=fmk-sound)
     audio.armBGM('calm')       // 배경음악
     audio.toggleMute()         // 사운드+음성 공통 음소거(localStorage 'fmk-muted')
     audio.cheerActive()        // 활성 아이 이름을 부르며 칭찬(엔진=fmk-speech, 음소거 시 무시)

   음소거(fmk-muted)는 효과음·BGM·칭찬 음성에 모두 적용된다. 모든 함수는 브라우저
   가드가 되어 있어 Node/SSR 에서 안전한 no-op 다.
   =================================================================== */

// ── 효과음 + BGM 엔진(전체 API 그대로 노출) ──
// resume, isMuted, setMuted, toggleMute, correct, wrong, pop, star, win, fanfare,
// playBGM, stopBGM, armBGM
export * from './fmk-sound.js';

// ── 칭찬 음성(TTS) ──
export { speak, praise, cancel as cancelVoice, isSupported as isVoiceSupported } from './fmk-speech.js';

import { praise as _praise } from './fmk-speech.js';
import { getActiveProfile } from './fmk-store.js';

/**
 * 활성 프로필(현재 노는 아이)의 이름을 불러 칭찬한다. 게임 클리어/도장 해금 한 줄 연동용.
 * 음소거·TTS 미지원·Node 환경이면 조용히 무시(false 반환). 이름을 못 읽어도 일반 칭찬으로 진행.
 * @returns {boolean} 실제로 발화를 시작했으면 true
 */
export function cheerActive(opts = {}) {
  let name = '';
  try {
    const p = getActiveProfile && getActiveProfile();
    if (p && typeof p.name === 'string') name = p.name;
  } catch (e) {}
  try { return _praise(name, opts); } catch (e) { return false; }
}
