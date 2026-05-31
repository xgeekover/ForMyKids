/* 난이도 설정 (6단계)
   cols                  : 그리드 열 수 (styles.css 의 .board[data-level] --cols 와 동일하게 유지)
   preview               : 게임 시작 전 미리 보기 시간(초) — 카드가 많을수록 길게
   star3Moves/star2Moves : 별 3개/2개 최대 뒤집기 횟수 (난이도가 올라갈수록 조금씩 관대)
   star3Time/star2Time   : 별 3개/2개 최대 소요 시간(초)  (미리 보기 시간 제외 측정)
   카드 수 = pairs * 2                                                         */
export const PREVIEW_SECONDS = 5 // 기본값(폴백)

export const LEVELS = {
  practice:  { pairs: 5,  cols: 5, preview: 5,  label: '연습하기',    emoji: '🐣', star3Moves: 8,  star2Moves: 12, star3Time: 80,  star2Time: 140 }, // 10장
  easy:      { pairs: 6,  cols: 4, preview: 5,  label: '쉬움',        emoji: '🐥', star3Moves: 10, star2Moves: 15, star3Time: 96,  star2Time: 168 }, // 12장
  normal:    { pairs: 8,  cols: 4, preview: 6,  label: '보통',        emoji: '🦄', star3Moves: 14, star2Moves: 21, star3Time: 128, star2Time: 224 }, // 16장
  challenge: { pairs: 10, cols: 5, preview: 7,  label: '도전하기',    emoji: '👑', star3Moves: 18, star2Moves: 27, star3Time: 160, star2Time: 280 }, // 20장
  hard:      { pairs: 12, cols: 6, preview: 9,  label: '어려움',      emoji: '🔥', star3Moves: 22, star2Moves: 33, star3Time: 192, star2Time: 336 }, // 24장
  veryhard:  { pairs: 15, cols: 6, preview: 12, label: '많이 어려움', emoji: '🚀', star3Moves: 28, star2Moves: 42, star3Time: 240, star2Time: 420 }, // 30장
}

// 시작 화면 버튼 표시 순서
export const LEVEL_ORDER = ['practice', 'easy', 'normal', 'challenge', 'hard', 'veryhard']
