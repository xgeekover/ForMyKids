// 게임 전역에서 사용하는 상수 모음.
// - 레벨별 난이도(스폰 간격 / 이동 속도)
// - 언어별 / 레벨별 단어 풀
// - 풍선 색상 팔레트
// - 칭찬 문구

export const MAX_LEVEL = 50;
export const START_HEALTH = 5;

// 레벨 업까지 필요한 풍선 개수 (한 레벨당 6개)
export const POPS_PER_LEVEL = 6;

// 1~30레벨 동안 5단계로 점진적으로 빨라지는 속도 묶음을 반복 사용한다.
// (각 카테고리(자음/모음/한글자 등) 안에서는 이 5단계만큼만 빨라진다)
const BASE_TIERS = [
  { spawnMs: 5000, speed: 6  },
  { spawnMs: 4700, speed: 7  },
  { spawnMs: 4400, speed: 8  },
  { spawnMs: 4100, speed: 9  },
  { spawnMs: 3800, speed: 10 },
];

// 산수 모드는 계산 시간이 필요하므로 한글/영어보다 더 천천히 떠오른다.
const MATH_TIERS = [
  { spawnMs: 6500, speed: 4   },
  { spawnMs: 6000, speed: 4.5 },
  { spawnMs: 5500, speed: 5   },
  { spawnMs: 5000, speed: 5.5 },
  { spawnMs: 4500, speed: 6   },
];

// 레벨/모드에 따른 풍선 스폰 주기/이동 속도
// - 1~30레벨: 5단계 묶음을 반복 (카테고리가 바뀌어도 속도는 다시 천천히 시작)
// - 31레벨 이후: 점진적으로 더 빨라짐
export const getLevelConfig = (language, level) => {
  if (language === 'math') {
    if (level <= 30) return MATH_TIERS[(level - 1) % 5];
    const over = level - 30;
    const spawnMs = Math.max(2000, 4500 - over * 150);
    const speed = Math.min(20, 6 + over * 0.8);
    return { spawnMs, speed };
  }
  if (level <= 30) {
    return BASE_TIERS[(level - 1) % 5];
  }
  const over = level - 30;
  const spawnMs = Math.max(1200, 3600 - over * 200);
  const speed = Math.min(50, 11 + over * 2);
  return { spawnMs, speed };
};

// ─── 한글 단어 풀 ────────────────────────────────────────────────
// 1~5레벨: 자음만
const KO_CONSONANTS = [
  'ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ',
  'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

// 6~10레벨: 모음만
const KO_VOWELS = [
  'ㅏ', 'ㅑ', 'ㅓ', 'ㅕ', 'ㅗ',
  'ㅛ', 'ㅜ', 'ㅠ', 'ㅡ', 'ㅣ',
];

// 11~15레벨: 받침 없는 한 글자
const KO_OPEN_1 = [
  '가', '나', '다', '라', '마', '바', '사', '아', '자', '차',
  '카', '타', '파', '하', '고', '노', '도', '로', '모', '보',
  '소', '오', '조', '초', '코', '토', '포', '호', '구', '누',
  '두', '루', '무', '부', '수', '우', '주', '추', '쿠', '투',
  '기', '니', '디', '리', '미', '비', '시', '이', '지', '치',
];

// 16~20레벨: 받침 없는 두 글자
const KO_OPEN_2 = [
  '코끼', '나라', '가지', '토끼', '도시', '모자', '바다', '우유',
  '아기', '가게', '시계', '사자', '누나', '이모', '머리', '다리',
  '파도', '거미', '나무', '오리', '두부', '주스', '치마', '구두',
  '사과', '포도', '오이', '하마', '소라', '여우',
];

// 21~25레벨: 받침 있는 한 글자
const KO_CLOSED_1 = [
  '강', '산', '별', '달', '꽃', '물', '밤', '해', '곰', '귤',
  '공', '컵', '책', '빵', '콩', '닭', '잠', '손', '발', '눈',
  '집', '문', '땅', '풀', '국', '굴', '낮', '벽', '솜', '엿',
];

// 26~30레벨: 받침 있는 두 글자
const KO_CLOSED_2 = [
  '사랑', '친구', '학교', '선물', '동생', '가족', '햇살', '바람',
  '별빛', '봄날', '강물', '풍선', '인형', '우산', '책상', '가방',
  '연필', '손목', '발등', '동산', '구름', '강산', '꽃잎', '눈썹',
  '말씀', '엄마', '아빠', '햇볕', '단풍', '장난',
];

// 31레벨 이후 (점점 어려움)
const KO_HARD_3 = [
  '코끼리', '병아리', '다람쥐', '거북이', '도토리', '무지개',
  '해바라기', '강아지', '소방차', '비행기', '자동차', '햇살가득',
];

const KO_PHRASES_S = [
  '안녕 친구', '파란 하늘', '예쁜 꽃밭', '반짝 별빛', '맑은 강물',
  '따뜻한 봄', '시원한 바람', '동그란 달',
];

const KO_PHRASES_L = [
  '아름다운 별빛', '즐거운 하루', '무지개 다리', '따뜻한 마음',
  '푸른 들판 위', '하얀 구름 속', '반짝이는 호수',
];

// ─── 영어 단어 풀 ────────────────────────────────────────────────
const EN_LETTERS_1 = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm'];
const EN_LETTERS_2 = ['n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'];
const EN_2_LETTER  = ['hi', 'up', 'go', 'me', 'no', 'ok', 'it', 'on', 'in', 'to', 'we', 'be', 'do', 'my', 'so'];
const EN_3_LETTER  = ['cat', 'dog', 'fox', 'pig', 'sun', 'bee', 'owl', 'egg', 'bus', 'cup', 'hat', 'bat', 'fan'];
const EN_4_LETTER  = ['milk', 'star', 'tree', 'bear', 'lion', 'frog', 'duck', 'cake', 'book', 'fish', 'kite'];
const EN_5_LETTER  = ['apple', 'happy', 'smile', 'cloud', 'sheep', 'mango', 'bunny', 'tiger', 'house'];
const EN_6_LETTER  = ['rabbit', 'orange', 'banana', 'cookie', 'flower', 'summer', 'pencil'];
const EN_PHRASES_S = ['hello world', 'good night', 'happy day', 'blue sky', 'sweet cake'];
const EN_PHRASES_L = ['beautiful star', 'good morning sun', 'sweet little dream', 'shining sunshine'];

// 언어/레벨에 맞는 단어 풀을 반환한다.
const getWordPool = (language, level) => {
  if (language === 'ko') {
    if (level <= 5)  return KO_CONSONANTS;
    if (level <= 10) return KO_VOWELS;
    if (level <= 15) return KO_OPEN_1;
    if (level <= 20) return KO_OPEN_2;
    if (level <= 25) return KO_CLOSED_1;
    if (level <= 30) return KO_CLOSED_2;
    if (level <= 35) return KO_HARD_3;
    if (level <= 42) return KO_PHRASES_S;
    return KO_PHRASES_L;
  }
  // en
  if (level <= 5)  return EN_LETTERS_1;
  if (level <= 10) return EN_LETTERS_2;
  if (level <= 15) return EN_2_LETTER;
  if (level <= 20) return EN_3_LETTER;
  if (level <= 25) return EN_4_LETTER;
  if (level <= 30) return EN_5_LETTER;
  if (level <= 35) return EN_6_LETTER;
  if (level <= 42) return EN_PHRASES_S;
  return EN_PHRASES_L;
};

// ─── 산수 모드 문제 생성 ─────────────────────────────────────────
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// 풍선에 적힐 표시 문구 / 입력해야 할 정답을 한 쌍으로 생성한다.
//   1~3   : 한 자리 숫자 따라치기
//   4~6   : 두 자리 숫자
//   7~10  : 세 자리 숫자
//   11~15 : 한 자리 덧셈/뺄셈 (음수 결과 없음)
//   16~20 : 두 자리 덧셈/뺄셈 (음수 결과 없음)
//   21~30 : 구구단 (2~9단)
const generateMathContent = (level) => {
  if (level <= 3) {
    const n = randInt(0, 9);
    return { display: String(n), answer: String(n) };
  }
  if (level <= 6) {
    const n = randInt(10, 99);
    return { display: String(n), answer: String(n) };
  }
  if (level <= 10) {
    const n = randInt(100, 999);
    return { display: String(n), answer: String(n) };
  }
  if (level <= 15) {
    if (Math.random() < 0.5) {
      const a = randInt(1, 9);
      const b = randInt(0, 9);
      return { display: `${a}+${b}`, answer: String(a + b) };
    }
    const a = randInt(1, 9);
    const b = randInt(0, a);
    return { display: `${a}-${b}`, answer: String(a - b) };
  }
  if (level <= 20) {
    if (Math.random() < 0.5) {
      const a = randInt(10, 99);
      const b = randInt(10, 99);
      return { display: `${a}+${b}`, answer: String(a + b) };
    }
    const a = randInt(10, 99);
    const b = randInt(10, a);
    return { display: `${a}-${b}`, answer: String(a - b) };
  }
  // 21~30 (그리고 그 이후): 구구단
  const a = randInt(2, 9);
  const b = randInt(2, 9);
  return { display: `${a}×${b}`, answer: String(a * b) };
};

// 풍선에 표시할 텍스트와 입력 정답을 한 쌍으로 반환한다.
// 한글/영어는 표시 = 정답이고, 산수는 문제 = 표시 / 계산값 = 정답.
export const getBalloonContent = (language, level) => {
  if (language === 'math') return generateMathContent(level);
  const pool = getWordPool(language, level);
  const word = pool && pool.length ? pool[Math.floor(Math.random() * pool.length)] : '?';
  return { display: word, answer: word };
};

// 풍선 몸체 / 줄 색상 팔레트 (Tailwind 클래스로 선언)
export const BALLOON_COLORS = [
  { body: 'bg-pink-300',     string: 'bg-pink-400'    },
  { body: 'bg-rose-300',     string: 'bg-rose-400'    },
  { body: 'bg-amber-300',    string: 'bg-amber-400'   },
  { body: 'bg-yellow-300',   string: 'bg-yellow-400'  },
  { body: 'bg-lime-300',     string: 'bg-lime-400'    },
  { body: 'bg-emerald-300',  string: 'bg-emerald-400' },
  { body: 'bg-sky-300',      string: 'bg-sky-400'     },
  { body: 'bg-indigo-300',   string: 'bg-indigo-400'  },
  { body: 'bg-fuchsia-300',  string: 'bg-fuchsia-400' },
  { body: 'bg-purple-300',   string: 'bg-purple-400'  },
];

// 파티클 색상 (hex) - 터질 때 사용
export const PARTICLE_PALETTE = [
  '#fda4af', '#fcd34d', '#86efac', '#93c5fd',
  '#c4b5fd', '#f9a8d4', '#fdba74',
];

// 풍선을 맞췄을 때 나타나는 칭찬 문구
export const PRAISE = {
  ko: ['정말 잘했어요!', '최고예요!', '멋져요, 친구!', '우와, 대단해요!', '반짝 반짝!', '짱이에요!'],
  en: ['Great job!', 'Awesome!', 'You did it!', 'Super cool!', 'Amazing!', 'Wonderful!'],
  math: ['정답!', '딩동댕!', '천재네요!', '계산왕!', '와, 빠르다!', '척척박사!'],
};

// 게임 오버 화면 문구
export const GAMEOVER_TEXT = {
  ko: {
    title: '정말 잘했어요!',
    sub: '또 한 번 도전해볼까요?',
    score: '점수',
    level: '도달한 레벨',
    button: '다시 하기',
  },
  en: {
    title: 'Amazing Work!',
    sub: 'Want to try again?',
    score: 'Score',
    level: 'Level Reached',
    button: 'Play Again',
  },
  math: {
    title: '계산왕이에요!',
    sub: '한 번 더 풀어볼까요?',
    score: '점수',
    level: '도달한 레벨',
    button: '다시 하기',
  },
};
