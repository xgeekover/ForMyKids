/* 효과음/BGM 엔진 로직 무결성 테스트 (node shared/fmk-sound.test.mjs)
   Node 에는 AudioContext/window 가 없으므로, 모든 함수가 안전 no-op 으로 동작하고
   음소거 상태 관리가 정확한지 검증한다(브라우저 오디오 출력 자체는 검증 범위 밖). */
import assert from 'node:assert/strict'
import * as sfx from './fmk-sound.js'

let passed = 0
const ok = (l) => { passed++; console.log('  ✓', l) }

// SFX + BGM API 가 모두 export 되어 있다
for (const fn of ['resume', 'isMuted', 'setMuted', 'toggleMute', 'correct', 'wrong', 'pop', 'star', 'win', 'fanfare', 'playBGM', 'stopBGM', 'armBGM']) {
  assert.equal(typeof sfx[fn], 'function', `${fn} export`)
}
ok('사운드 API export (SFX + BGM)')

// 음소거 상태 토글/저장 로직
sfx.setMuted(false); assert.equal(sfx.isMuted(), false)
sfx.setMuted(true); assert.equal(sfx.isMuted(), true)
assert.equal(sfx.toggleMute(), false, 'toggle → 음소거 해제')
assert.equal(sfx.isMuted(), false)
ok('음소거 상태 토글/조회')

// AudioContext/window 없는 환경(Node)에서 모든 호출이 throw 하지 않음(안전 no-op)
assert.doesNotThrow(() => { sfx.armBGM('calm'); sfx.armBGM('lively') }, 'armBGM 안전')
assert.doesNotThrow(() => { sfx.playBGM('calm'); sfx.playBGM('lively'); sfx.playBGM() }, 'playBGM 안전')
assert.doesNotThrow(() => { sfx.stopBGM(); sfx.stopBGM(true) }, 'stopBGM 안전')
assert.doesNotThrow(() => { sfx.correct(); sfx.wrong(); sfx.win(); sfx.fanfare(); sfx.pop(); sfx.star(); sfx.resume() }, 'SFX 안전')
ok('AudioContext 없는 환경에서 안전 no-op')

// 음소거 상태에서 BGM 시작/정지 가드(throw 없음)
sfx.setMuted(true)
assert.doesNotThrow(() => { sfx.playBGM('calm'); sfx.stopBGM() })
sfx.setMuted(false)
ok('음소거 가드 경로 안전')

console.log(`\n✅ fmk-sound 테스트 ${passed}개 통과`)
