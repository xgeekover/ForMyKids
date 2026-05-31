/* 칭찬 음성(TTS) + 통합 오디오 매니저 무결성 테스트 (node shared/fmk-speech.test.mjs)
   Node 에는 window/speechSynthesis 가 없으므로, 모든 함수가 '에러 없이' 안전 no-op 으로
   동작하고(브라우저 가드), 통합 매니저(fmk-audio)가 사운드+음성 API 를 모두 노출하는지 검증한다.
   (실제 음성 출력 자체는 검증 범위 밖 — 브라우저 전용) */
import assert from 'node:assert/strict'
import * as speech from './fmk-speech.js'
import * as audio from './fmk-audio.js'

let passed = 0
const ok = (l) => { passed++; console.log('  ✓', l) }

// ── fmk-speech: API export ──
for (const fn of ['speak', 'praise', 'praiseMany', 'isSupported', 'cancel']) {
  assert.equal(typeof speech[fn], 'function', `speech.${fn} export`)
}
ok('fmk-speech API export (speak·praise·praiseMany·isSupported·cancel)')

// praiseMany(같이 하기 두 이름) Node 안전 no-op
assert.doesNotThrow(() => {
  assert.equal(speech.praiseMany(['아롱', '다롱']), false, '미지원이면 false')
  assert.equal(speech.praiseMany([]), false, '빈 배열 안전')
  assert.equal(speech.praiseMany(null), false, 'null 안전')
}, 'praiseMany 미지원 환경 안전')
ok('praiseMany: 두 이름 칭찬 Node 안전 no-op')

// ── Node(미지원) 환경: isSupported=false, 호출은 throw 없이 false/no-op ──
assert.equal(speech.isSupported(), false, 'Node 에는 SpeechSynthesis 가 없다')
assert.doesNotThrow(() => {
  assert.equal(speech.speak('테스트'), false, 'speak → 미지원이면 false')
  assert.equal(speech.speak(''), false, '빈 문자열도 안전')
  assert.equal(speech.praise('지안'), false, 'praise(name) → 미지원이면 false')
  assert.equal(speech.praise(), false, 'praise() 이름 없이도 안전')
  assert.equal(speech.praise(null), false, 'praise(null) 안전')
  assert.equal(speech.praise(12345), false, 'praise(비문자열) 안전')
  speech.cancel() // 미지원이어도 throw 없음
}, '미지원 환경에서 음성 호출이 throw 하지 않는다')
ok('Node(미지원)에서 speak/praise/cancel 안전 no-op')

// ── fmk-audio: 사운드 엔진 API 가 그대로 re-export 되었는가 ──
for (const fn of ['resume', 'isMuted', 'setMuted', 'toggleMute', 'correct', 'wrong',
                  'pop', 'star', 'win', 'fanfare', 'playBGM', 'stopBGM', 'armBGM']) {
  assert.equal(typeof audio[fn], 'function', `audio.${fn} (fmk-sound re-export)`)
}
ok('fmk-audio: 효과음/BGM 엔진 API 통합 노출')

// ── fmk-audio: 음성 API + cheerActive 통합 노출 ──
for (const fn of ['speak', 'praise', 'cancelVoice', 'isVoiceSupported', 'cheerActive']) {
  assert.equal(typeof audio[fn], 'function', `audio.${fn}`)
}
ok('fmk-audio: 음성 API + cheerActive 노출')

// ── cheerActive: 활성 프로필을 못 읽거나 미지원이어도 throw 없이 false ──
assert.doesNotThrow(() => {
  assert.equal(audio.cheerActive(), false, 'cheerActive → Node 에선 false')
  assert.equal(audio.isVoiceSupported(), false)
}, 'cheerActive 안전 no-op')
ok('cheerActive: 프로필/음성 미지원 환경에서 안전')

// ── 통합 매니저로도 사운드가 Node 에서 안전 no-op ──
assert.doesNotThrow(() => {
  audio.correct(); audio.wrong(); audio.win(); audio.fanfare(); audio.pop()
  audio.armBGM('calm'); audio.playBGM('lively'); audio.stopBGM(); audio.resume()
}, 'audio 사운드 호출 안전')
ok('fmk-audio 경유 사운드 호출 안전 no-op')

console.log(`\n✅ fmk-speech/fmk-audio 테스트 ${passed}개 통과`)
