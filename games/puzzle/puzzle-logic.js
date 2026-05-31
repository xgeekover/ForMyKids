/* ===================================================================
   조각조각 퍼즐 · 순수 로직 + 에셋 설정 (브라우저 + Node 공용)
   -------------------------------------------------------------------
   DOM/스토어 비의존 → Node 에서 import 해 단위 테스트 가능.
   (난이도 10단계 · 퍼즐 이미지 목록 · 조각 분할 로직)
   =================================================================== */

// ---------- 난이도 10단계 (cols×rows = 조각 수) ----------
export const LEVELS = {
  1:  { cols: 4,  rows: 4, icon: '🐣', name: '가장 쉬움' }, // 16
  2:  { cols: 5,  rows: 4, icon: '🐥', name: '쉬움' },       // 20
  3:  { cols: 5,  rows: 5, icon: '🐰', name: '조금 쉬움' },  // 25
  4:  { cols: 6,  rows: 5, icon: '🦊', name: '보통' },       // 30
  5:  { cols: 6,  rows: 6, icon: '🦄', name: '도전' },       // 36
  6:  { cols: 7,  rows: 6, icon: '🐯', name: '어려움' },     // 42
  7:  { cols: 8,  rows: 6, icon: '🦁', name: '많이 어려움' },// 48
  8:  { cols: 8,  rows: 7, icon: '🐲', name: '고수' },       // 56
  9:  { cols: 8,  rows: 8, icon: '👑', name: '전문가' },     // 64
  10: { cols: 10, rows: 8, icon: '🏆', name: '마스터' },     // 80
};
export const LEVEL_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function pieceCount(level) {
  const l = LEVELS[level];
  return l ? l.cols * l.rows : 0;
}

// ---------- 퍼즐 이미지 카테고리 ----------
export const CATEGORIES = [
  { id: 'masterpiece', label: '명화', icon: '🖼️' },
  { id: 'character', label: '캐릭터', icon: '🐾' },
];

/* ===================================================================
   퍼즐 이미지 목록 (확장 가능 — 여기에 항목을 추가하면 게임에 자동 노출)
   -------------------------------------------------------------------
   각 항목 필드:
     id        : 고유 식별자
     category  : 'masterpiece'(명화) | 'character'(캐릭터)
     title     : 화면에 보일 이름
     src        : 이미지 경로
                  · 명화 = 저작권 없는(퍼블릭 도메인) 원격 URL(위키미디어)
                  · 캐릭터 = public/assets/puzzle/ 안의 로컬 파일(상대경로)
     fallbackEmoji / bg : 이미지가 없거나(파일 미존재) 오프라인이라 로드 실패할 때,
                  코드로 그려 쓰는 폴백 그림(파스텔 배경 bg + 큰 이모지). → 파일 없어도 플레이 가능.

   👉 캐릭터 이미지 추가 방법(예: 포켓몬):
      1) 정사각형에 가까운 이미지를 public/assets/puzzle/pokemon.jpg 로 저장.
      2) 아래 character 항목의 src('../../assets/puzzle/pokemon.jpg')가 그 파일을 가리킨다
         (게임 페이지 games/puzzle/ 에서 루트의 public/assets/puzzle/ 로 올라가는 상대경로).
      3) 다른 캐릭터는 항목을 복사해 id/title/src/fallbackEmoji 만 바꿔 추가.
      (파일을 안 넣으면 로드 실패 → fallbackEmoji 그림으로 자동 대체되어 게임은 정상 동작.)
   =================================================================== */
export const IMAGES = [
  // ── 명화 (Public Domain · Wikimedia Commons) ──
  {
    id: 'monalisa', category: 'masterpiece', title: '모나리자', artist: '레오나르도 다 빈치',
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg/480px-Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg',
    fallbackEmoji: '🖼️', bg: ['#d9c7a0', '#7a5a2a'],
  },
  {
    id: 'starrynight', category: 'masterpiece', title: '별이 빛나는 밤', artist: '빈센트 반 고흐',
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg/512px-Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg',
    fallbackEmoji: '🌌', bg: ['#2a3a7a', '#0a1640'],
  },
  {
    id: 'sunflowers', category: 'masterpiece', title: '해바라기', artist: '빈센트 반 고흐',
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Vincent_Willem_van_Gogh_127.jpg/420px-Vincent_Willem_van_Gogh_127.jpg',
    fallbackEmoji: '🌻', bg: ['#ffe066', '#e0a020'],
  },
  {
    id: 'pearl', category: 'masterpiece', title: '진주 귀걸이를 한 소녀', artist: '요하네스 베르메르',
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Meisje_met_de_parel.jpg/420px-Meisje_met_de_parel.jpg',
    fallbackEmoji: '💎', bg: ['#3a4a6a', '#101830'],
  },

  // ── 캐릭터 (public/assets/puzzle/ 의 로컬 파일. 게임 페이지 games/puzzle/ 에서 루트로 올라가는 상대경로 '../../') ──
  {
    id: 'pokemon', category: 'character', title: '포켓몬',
    src: '../../assets/puzzle/pokemon.jpg', fallbackEmoji: '⚡', bg: ['#ffe066', '#ff7043'],
  },
  {
    id: 'pokemon2', category: 'character', title: '포켓몬 친구들',
    src: '../../assets/puzzle/pokemon2.jpg', fallbackEmoji: '⚡', bg: ['#ffd166', '#ff7043'],
  },
  {
    id: 'sanrio', category: 'character', title: '산리오',
    src: '../../assets/puzzle/sanrio.jpg', fallbackEmoji: '🎀', bg: ['#ffd6e7', '#ff8fb1'],
  },
  {
    id: 'onepiece', category: 'character', title: '원피스',
    src: '../../assets/puzzle/onepiece.jpg', fallbackEmoji: '🏴‍☠️', bg: ['#ffe3b0', '#ff9d3a'],
  },
];

export function imagesByCategory(cat) {
  return IMAGES.filter((i) => i.category === cat);
}
export function imageById(id) {
  return IMAGES.find((i) => i.id === id) || null;
}

// ---------- 조각 생성 ----------
// 각 조각의 정답 슬롯 = (col, row). 게임은 이 목록을 셔플해 트레이에 흩뿌린다.
export function buildPieces(cols, rows) {
  const pieces = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      pieces.push({ id: r * cols + c, col: c, row: r });
    }
  }
  return pieces;
}

// 스냅 허용 반경(조각 변의 비율). 어릴수록 너그럽게 — 조각 크기의 약 45%.
export function snapRadius(pieceW, pieceH) {
  return Math.min(pieceW, pieceH) * 0.45;
}

// 스냅 판정: 현재 위치(px,py)가 정답 슬롯(gx,gy)에서 radius 이내인가?
// true → '착!' 자석 스냅, false → 트레이로 스냅백. (드래그 종료 로직·테스트 공용 순수 함수)
export function withinSnap(px, py, gx, gy, radius) {
  if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(gx) || !Number.isFinite(gy)) return false;
  const r = Number.isFinite(radius) ? Math.max(0, radius) : 0;
  return Math.hypot(px - gx, py - gy) <= r;
}
