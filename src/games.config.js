/* ===================================================================
   ForMyKids · 게임 레지스트리
   -------------------------------------------------------------------
   새 게임을 플랫폼에 추가하려면:
     1) games/<id>/index.html 페이지를 만든다 (빌드 입력에 자동 등록됨).
     2) 아래 배열에 항목을 한 줄 추가한다 → 런처 메인에 카드가 자동으로 나타난다.
        (id 는 fmk-store 기록 키로도 쓰이므로 games/<id> 폴더명과 맞추는 걸 권장)

   필드
     id       : 게임 식별자(폴더명/기록 키와 동일 권장)
     title    : 카드 제목
     sub      : 카드 한 줄 설명
     icon     : 큰 대표 이모지
     floaters : 카드 안에서 떠다니는 작은 이모지 3개
     c1, c2   : 카드 배경 그라데이션 파스텔 색(위/아래)
     ink      : 카드 글자색
     path     : 런처(index.html) 기준 게임 진입 경로
   =================================================================== */
export const GAMES = [
  {
    id: 'memory',
    title: '짝꿍 친구 찾기',
    sub: '같은 친구 카드를 찾아요',
    icon: '🐾',
    floaters: ['⚡', '🎀', '💧'],
    c1: '#ffe0f0', c2: '#ff9ec4', ink: '#5d3f59',
    path: 'games/memory/index.html',
  },
  {
    id: 'popnpop',
    title: '풍선 터트리기',
    sub: '글자를 따라 입력해 팡!',
    icon: '🎈',
    floaters: ['✨', '💥', '🎈'],
    c1: '#d7eeff', c2: '#8fc4ff', ink: '#2f5d86',
    path: 'games/popnpop/index.html',
  },
  {
    id: 'dodge',
    title: '우주선 똥 피하기',
    sub: '좌우로 피하고 진화해요',
    icon: '🚀',
    floaters: ['💩', '🍌', '☄️'],
    c1: '#e6dcff', c2: '#b69bff', ink: '#4a3a86',
    path: 'games/dodge/index.html',
  },
  {
    id: 'maze',
    title: '동화책 미로 탈출',
    sub: '고양이를 생선까지 데려가요',
    icon: '🐱',
    floaters: ['⭐', '🐟', '🌀'],
    c1: '#dff6e6', c2: '#9fe0b6', ink: '#2f6b4a',
    path: 'games/maze/index.html',
  },
  {
    id: 'spot',
    title: '틀린그림찾기',
    sub: '다른 곳을 콕! 찾아요',
    icon: '🔍',
    floaters: ['⭕', '✨', '🖼️'],
    c1: '#fff0d6', c2: '#ffce8a', ink: '#8a5a1f',
    path: 'games/spot/index.html',
  },
  {
    id: 'puzzle',
    title: '조각조각 퍼즐',
    sub: '조각을 끼워 그림 완성!',
    icon: '🧩',
    floaters: ['🧩', '🖼️', '✨'],
    c1: '#e7e0ff', c2: '#b9a6f0', ink: '#4a3a86',
    path: 'games/puzzle/index.html',
  },
]
