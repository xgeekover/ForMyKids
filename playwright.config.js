// Playwright E2E 설정 — Vite 개발 서버를 자동으로 띄우고 브라우저로 유저 시나리오 검증.
// 실행: npm run test:e2e (헤드리스) / npm run test:e2e:ui (UI 모드)
import { defineConfig, devices } from '@playwright/test'

const PORT = 5173
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: 'on-first-retry',
    viewport: { width: 1024, height: 768 },
  },
  projects: [
    // 데스크톱: 전체 시나리오 실행
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // 모바일 에뮬레이션: @mobile 태그가 붙은 반응형/터치 시나리오만 실행(작은 뷰포트·터치)
    { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] }, grep: /@mobile/ },
    { name: 'Mobile Safari', use: { ...devices['iPhone 12'] }, grep: /@mobile/ },
  ],
  // Vite MPA 개발 서버를 자동 기동(고정 포트). 이미 떠 있으면 재사용(로컬).
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
