import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readdirSync, existsSync } from 'node:fs'

const root = dirname(fileURLToPath(import.meta.url))

/* ───────────────────────────────────────────────────────────────────
   멀티페이지(MPA) 입력 자동 수집
   - 루트의 index.html(런처)
   - games/<id>/index.html 이 있으면 자동으로 한 페이지로 등록
   → 새 게임 추가 = games/<id>/index.html 페이지를 만들기만 하면 끝.
     (런처 카드 표시는 src/games.config.js 에 한 줄 등록)
   ─────────────────────────────────────────────────────────────────── */
function collectPages() {
  const input = { launcher: resolve(root, 'index.html') }
  const gamesDir = resolve(root, 'games')
  if (existsSync(gamesDir)) {
    for (const name of readdirSync(gamesDir)) {
      if (name === 'launcher') continue // 루트 런처 키와 충돌 방지(예약어)
      const html = resolve(gamesDir, name, 'index.html')
      if (existsSync(html)) input[name] = html
    }
  }
  return input
}

export default defineConfig({
  // 정적 서버/서브 경로/파일 열기 어디서든 자산 경로가 깨지지 않도록 상대 경로 빌드
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: collectPages(),
    },
  },
})
