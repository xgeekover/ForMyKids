/* ===================================================================
   틀린그림찾기 · 순수 로직 (브라우저 + Node 공용)
   -------------------------------------------------------------------
   '한 장의 사진/그림' 방식: 같은 이미지를 두 번 그리고, 한쪽(B)에만 Canvas 로
   국소 변형을 N군데 자동 생성한다. (저작권 없는 로컬 캐릭터 이미지 재사용)
   변형 종류:
     recolor — 한 부위의 색을 바꿈(hue-rotate)
     erase   — 주변 픽셀을 복제해 덮어 물체를 지움
     flip    — 한 부위를 좌우로 뒤집음
     sticker — B 에만 작은 스티커(이모지)가 나타남
   DOM/스토어 비의존 → Node 에서 import 해 단위 테스트 가능.
   =================================================================== */

// ---------- 장면 이미지 (퍼즐과 동일한 로컬 파일 재사용 — 오프라인 안전, 디테일 풍부) ----------
export const SPOT_IMAGES = [
  { id: 'pokemon',  title: '포켓몬',        src: '../../assets/puzzle/pokemon.jpg',  fallbackEmoji: '⚡',  bg: ['#ffe066', '#ff7043'] },
  { id: 'pokemon2', title: '포켓몬 친구들', src: '../../assets/puzzle/pokemon2.jpg', fallbackEmoji: '⚡',  bg: ['#ffd166', '#ff7043'] },
  { id: 'sanrio',   title: '산리오',        src: '../../assets/puzzle/sanrio.jpg',   fallbackEmoji: '🎀',  bg: ['#ffd6e7', '#ff8fb1'] },
  { id: 'onepiece', title: '원피스',        src: '../../assets/puzzle/onepiece.jpg', fallbackEmoji: '🏴‍☠️', bg: ['#ffe3b0', '#ff9d3a'] },
];

// ---------- 난이도 (diffs = 틀린 곳 개수 / time = 제한시간 초) ----------
export const DIFFS = {
  1: { level: 1, diffs: 3, time: 90, label: '쉬움',   emoji: '🐥' },
  2: { level: 2, diffs: 4, time: 80, label: '보통',   emoji: '🦄' },
  3: { level: 3, diffs: 5, time: 70, label: '어려움', emoji: '🔥' },
};

export const DIFF_KINDS = ['recolor', 'erase', 'flip', 'sticker'];
// B 에만 등장하는 스티커 후보(아이 친화적)
export const STICKER_EMOJIS = ['⭐', '❤️', '🌸', '🎈', '🍎', '🦋', '💎', '🌈', '🍀', '👑'];

// 배치/판정 파라미터(정규화 좌표 0~1 기준)
const MARGIN = 0.13;     // 가장자리 여백
const MIN_R = 0.06, MAX_R = 0.10; // 변형 영역 반경(짧은 변 기준)
const MIN_DIST = 0.24;   // 중심 간 최소 거리(겹침/모호한 탭 방지)
const HIT_SCALE = 1.5;   // 탭 판정 반경 = r * scale (아이용 넉넉)
const MIN_HIT_R = 0.085;

const pick = (arr, rng) => arr[(rng() * arr.length) | 0];

/**
 * 틀린 곳(변형 스펙) N개 생성. 순수 함수(rng 주입 가능).
 * @param {{diffs:number}} diff
 * @param {() => number} [rng]
 * @returns {Array<{id,cx,cy,r,kind, hue?, sxOff?, syOff?, emoji?}>}  (cx,cy,r 은 정규화 0~1)
 */
export function buildDifferences(diff, rng = Math.random) {
  const n = (diff && diff.diffs) || 3;
  const specs = [];
  let guard = 0;
  while (specs.length < n && guard++ < 2000) {
    const cx = MARGIN + rng() * (1 - 2 * MARGIN);
    const cy = MARGIN + rng() * (1 - 2 * MARGIN);
    if (specs.some((s) => Math.hypot(s.cx - cx, s.cy - cy) < MIN_DIST)) continue;
    const r = MIN_R + rng() * (MAX_R - MIN_R);
    const kind = pick(DIFF_KINDS, rng);
    const spec = { id: specs.length, cx, cy, r, kind };
    if (kind === 'recolor') {
      spec.hue = 60 + Math.floor(rng() * 240); // 60~300도(원색과 충분히 다르게)
    } else if (kind === 'erase') {
      const ang = rng() * Math.PI * 2;          // 영역 밖 주변에서 깨끗한 픽셀을 가져올 방향
      spec.sxOff = Math.cos(ang) * (r * 2.6);
      spec.syOff = Math.sin(ang) * (r * 2.6);
    } else if (kind === 'sticker') {
      spec.emoji = pick(STICKER_EMOJIS, rng);
    }
    specs.push(spec);
  }
  return specs;
}

/** 탭(정규화 tx,ty)이 변형 d 의 판정 영역 안인가(아이용 넉넉한 반경). */
export function isHit(d, tx, ty, hitScale = HIT_SCALE) {
  const rr = Math.max(d.r * hitScale, MIN_HIT_R);
  return Math.hypot(d.cx - tx, d.cy - ty) <= rr;
}

/** 미발견 변형 중 탭에 가장 가까운(판정 영역 내) 것 — 모호한 탭을 한 곳으로 확정. */
export function hitTest(diffs, foundSet, tx, ty) {
  let best = null, bestDist = Infinity;
  for (const d of diffs) {
    if (foundSet && foundSet.has(d.id)) continue;
    const dist = Math.hypot(d.cx - tx, d.cy - ty);
    if (dist <= Math.max(d.r * HIT_SCALE, MIN_HIT_R) && dist < bestDist) { best = d; bestDist = dist; }
  }
  return best;
}

export function pickSpotImage(rng = Math.random) { return pick(SPOT_IMAGES, rng); }
export function spotImageById(id) { return SPOT_IMAGES.find((i) => i.id === id) || null; }
