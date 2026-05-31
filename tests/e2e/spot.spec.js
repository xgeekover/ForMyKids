// 틀린그림찾기(사진 기반) E2E — 캔버스 렌더 + 다른 곳 찾기(힌트로 위치 확인 후 탭).
import { test, expect } from '@playwright/test'
import { seedActiveProfile } from './seed.js'

test.beforeEach(async ({ page }) => { await seedActiveProfile(page) })

test('틀린그림찾기: 사진이 캔버스에 렌더되고, 다른 곳을 찾으면 카운트가 오른다', async ({ page }) => {
  await page.goto('/games/spot/index.html')
  await expect(page.locator('#startScreen')).toBeVisible()

  await page.locator('#btnEasy').click() // 쉬움 = 차이 3개
  await expect(page.locator('#board')).toBeVisible()
  await expect(page.locator('#foundValue')).toHaveText('0/3')

  // 캔버스가 실제로 그려졌는지(투명/빈 픽셀이 아님). 로컬 동일출처 이미지/폴백 모두 비투명 픽셀 존재.
  await expect.poll(async () => page.evaluate(() => {
    const c = document.getElementById('canvasA')
    if (!c || !c.width) return 0
    try {
      const { data } = c.getContext('2d').getImageData(0, 0, c.width, c.height)
      let nonblank = 0
      for (let i = 3; i < data.length; i += 4 * 997) { if (data[i] > 0) nonblank++ }
      return nonblank
    } catch (e) { return -1 } // tainted(예상외)
  }), { timeout: 8000 }).toBeGreaterThan(0)

  // 힌트로 다른 곳 한 군데를 드러내고 그 위치를 탭 → 0/3 → 1/3
  await page.locator('#btnHint').click()
  const hint = page.locator('#marksA .spot-mark.is-hint').first()
  await expect(hint).toBeVisible()
  const box = await hint.boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

  await expect(page.locator('#foundValue')).toHaveText('1/3')
  await expect(page.locator('#marksA .spot-mark.is-found')).toHaveCount(1)
  await expect(page.locator('#marksB .spot-mark.is-found')).toHaveCount(1)
})
