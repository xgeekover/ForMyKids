// 퍼즐 게임 진입 테스트 — 퍼즐 카드 클릭 → 페이지 이동 → 1단계(16조각) 시작.
// (v2 다중 프로필: 활성 프로필을 미리 심어 '누가 놀까요?' 선택 화면을 건너뛴다)
import { test, expect } from '@playwright/test'
import { seedActiveProfile } from './seed.js'

test.beforeEach(async ({ page }) => { await seedActiveProfile(page) })

test('퍼즐: 카드 클릭으로 이동 후 1단계(16조각)를 시작한다', async ({ page }) => {
  await page.goto('/')

  // 런처에서 퍼즐 카드 클릭 → 퍼즐 페이지로 이동
  await page.locator('#cards a.card[href="games/puzzle/index.html"]').click()
  await expect(page).toHaveURL(/games\/puzzle\/index\.html$/)

  // 시작 화면 + 1단계 버튼 노출
  await expect(page.locator('#startScreen')).toBeVisible()
  const lv1 = page.locator('.level-btn--puzzle[data-level="1"]')
  await expect(lv1).toBeVisible()
  await expect(lv1).toContainText('16조각')

  // 1단계 클릭 → 게임 시작(플레이필드 노출, 진행 0/16)
  await lv1.click()
  await expect(page.locator('#playfield')).toBeVisible()
  await expect(page.locator('#startScreen')).toBeHidden()
  await expect(page.locator('#progressLabel')).toHaveText('0/16')

  // 조각 16개가 렌더됨(이미지 로드/폴백까지 대기 — 폴백은 최대 6초)
  await expect(page.locator('#pieceLayer .piece')).toHaveCount(16, { timeout: 12000 })
})
