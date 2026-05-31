/* ===================================================================
   ForMyKids · 통합 사운드 매니저 (단일 진입점)
   -------------------------------------------------------------------
   효과음·배경음악(BGM) 엔진(fmk-sound.js)을 한곳에서 re-export 한다.
   (음성 칭찬(TTS)은 v1.9.0 에서 제거됨 — 너무 어색해서 효과음/연출만 사용한다.)

     import * as audio from '.../shared/fmk-audio.js'
     audio.correct()            // 효과음
     audio.armBGM('calm')       // 배경음악
     audio.toggleMute()         // 사운드 공통 음소거(localStorage 'fmk-muted')

   모든 함수는 브라우저 가드가 되어 있어 Node/SSR 에서 안전한 no-op 다.
   =================================================================== */

// 효과음 + BGM 엔진(전체 API 그대로 노출)
// resume, isMuted, setMuted, toggleMute, correct, wrong, pop, star, win, fanfare,
// playBGM, stopBGM, armBGM
export * from './fmk-sound.js';
