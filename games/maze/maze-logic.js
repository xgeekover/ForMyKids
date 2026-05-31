/* ===================================================================
   동화책 미로 탈출 · 순수 로직 (브라우저 + Node 공용)
   -------------------------------------------------------------------
   DOM/스토어/타이머에 비의존 → Node 에서 그대로 import 해 단위 테스트 가능.
   (난이도 정의 · DFS 완전미로 생성 · 별 배치 · 풀이 가능성 검증)
   =================================================================== */

// 벽 비트 (북/동/남/서)
export const N = 1, E = 2, S = 4, W = 8;
export const DX = { [N]: 0, [E]: 1, [S]: 0, [W]: -1 };
export const DY = { [N]: -1, [E]: 0, [S]: 1, [W]: 0 };
export const OPP = { [N]: S, [E]: W, [S]: N, [W]: E };

// 난이도: level 정수 → 격자 크기 / 아이콘 / 이름 / 보너스 별 개수(난이도 비례, 최대 5)
export const LEVELS = {
  1: { size: 3,  icon: '🐣', name: '연습',       stars: 2 },
  2: { size: 5,  icon: '🐥', name: '쉬움',       stars: 2 },
  3: { size: 7,  icon: '🦄', name: '보통',       stars: 3 },
  4: { size: 9,  icon: '👑', name: '도전',       stars: 3 },
  5: { size: 13, icon: '🌋', name: '불타는 미로', stars: 4 },
  6: { size: 17, icon: '🌌', name: '우주 미로',   stars: 5 },
};
export const LEVEL_ORDER = [1, 2, 3, 4, 5, 6];

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// DFS 재귀 백트래킹(명시적 스택) → 완전미로(spanning tree). grid[y*cols+x] = 남은 벽 비트마스크.
export function buildMaze(cols, rows) {
  const grid = new Array(cols * rows).fill(N | E | S | W);
  const visited = new Array(cols * rows).fill(false);
  const stack = [];
  let cx = 0, cy = 0;
  visited[0] = true;
  stack.push([0, 0]);
  while (stack.length) {
    [cx, cy] = stack[stack.length - 1];
    const dirs = shuffle([N, E, S, W]);
    let advanced = false;
    for (const d of dirs) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (visited[ny * cols + nx]) continue;
      grid[cy * cols + cx] &= ~d;
      grid[ny * cols + nx] &= ~OPP[d];
      visited[ny * cols + nx] = true;
      stack.push([nx, ny]);
      advanced = true;
      break;
    }
    if (!advanced) stack.pop();
  }
  return grid;
}

// 출발(0,0)/도착(우하단) 제외 셀에 보너스 별 count 개 무작위 배치 → [{x,y,got:false}]
export function placeStars(cols, rows, count) {
  const startIdx = 0;
  const goalIdx = (rows - 1) * cols + (cols - 1);
  const cand = [];
  for (let i = 0; i < cols * rows; i++) {
    if (i === startIdx || i === goalIdx) continue;
    cand.push(i);
  }
  shuffle(cand);
  const n = Math.min(cand.length, Math.max(0, count));
  const stars = [];
  for (let k = 0; k < n; k++) {
    const idx = cand[k];
    stars.push({ x: idx % cols, y: (idx / cols) | 0, got: false });
  }
  return stars;
}

// 테스트/검증용: 출발→도착 도달 가능 + 모든 칸이 연결(완전미로)인지 점검.
export function analyzeMaze(grid, cols, rows) {
  const seen = new Array(cols * rows).fill(false);
  const stack = [[0, 0]];
  seen[0] = true;
  let count = 1;
  while (stack.length) {
    const [x, y] = stack.pop();
    const w = grid[y * cols + x];
    for (const d of [N, E, S, W]) {
      if (w & d) continue; // 벽이 있으면 통과 불가
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (seen[ny * cols + nx]) continue;
      seen[ny * cols + nx] = true;
      count++;
      stack.push([nx, ny]);
    }
  }
  return {
    reachedGoal: seen[(rows - 1) * cols + (cols - 1)],
    visitedCount: count,
    allConnected: count === cols * rows,
  };
}
