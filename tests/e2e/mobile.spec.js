// v1.4.0 모바일/반응형 E2E (@mobile 태그 → Mobile Chrome/Safari 프로젝트에서도 실행).
// 가로 오버플로 없음 · 터치 타깃 ≥48px · 게임 페이지 안정 로드 · memory 보드 1:1 정사각형.
import { test, expect } from '@playwright/test'
import { seedActiveProfile } from './seed.js'

// 문서/바디의 가로 오버플로(px). overflow:hidden 으로 잘려도 scrollWidth 로 감지된다.
const hOverflow = (page) => page.evaluate(() => {
  const de = document.documentElement
  const b = document.body
  return Math.max(de.scrollWidth - de.clientWidth, b ? b.scrollWidth - b.clientWidth : 0)
})

test('@mobile 런처: 가로 오버플로 없음 + 코너 버튼 터치타깃 ≥48px', async ({ page }) => {
  await seedActiveProfile(page)
  await page.goto('/')
  await expect(page.locator('#cards a.card')).toHaveCount(6)
  expect(await hOverflow(page)).toBeLessThanOrEqual(2)
  for (const sel of ['#profileBtn', '#settingsBtn', '#parentsChip']) {
    const b = await page.locator(sel).boundingBox()
    expect(Math.min(b.width, b.height), sel + ' ≥48px').toBeGreaterThanOrEqual(47.5)
  }
})

test('@mobile 설치 버튼 터치타깃 ≥48px', async ({ page }) => {
  await seedActiveProfile(page)
  await page.goto('/')
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt')
    e.prompt = () => {}; e.userChoice = Promise.resolve({ outcome: 'dismissed' })
    window.dispatchEvent(e)
  })
  await expect(page.locator('#installBtn')).toBeVisible()
  const b = await page.locator('#installBtn').boundingBox()
  expect(b.height).toBeGreaterThanOrEqual(47.5)
})

test('@mobile 게임 6종: 가로 오버플로 없이 로드된다', async ({ page }) => {
  await seedActiveProfile(page) // addInitScript → 이후 모든 goto 에 활성 프로필 주입
  for (const path of [
    'games/puzzle/index.html', 'games/maze/index.html', 'games/dodge/index.html',
    'games/spot/index.html', 'games/memory/index.html', 'games/popnpop/index.html',
  ]) {
    await page.goto('/' + path)
    await page.waitForLoadState('load')
    await page.waitForTimeout(500) // React 마운트/레이아웃 안정화
    expect(await hOverflow(page), path + ' 가로 오버플로').toBeLessThanOrEqual(2)
  }
})

test('@mobile 짝꿍 찾기(memory): 카드 많은 난이도도 넘침 없이 가운데 정렬', async ({ page }) => {
  // 가장 카드가 많은(세로로 긴) 난이도에서, 정사각형 강제로 인한 위/아래 넘침이 없어야 한다.
  await seedActiveProfile(page)
  await page.goto('/games/memory/index.html')
  await page.locator('.level-btn').last().click() // 마지막 = veryhard(6×5, 30장)
  const wrap = page.locator('.board-wrap')
  await expect(wrap).toBeVisible()
  await expect(page.locator('.board .card').first()).toBeVisible()
  expect(await hOverflow(page), 'memory 가로 오버플로').toBeLessThanOrEqual(2)
  // 보드는 뷰포트 너비 안에서 가운데 정렬(좌/우 마진 대칭)
  const vw = page.viewportSize().width
  const b = await wrap.boundingBox()
  expect(b.width).toBeLessThanOrEqual(vw + 1)
  expect(Math.abs(b.x - (vw - b.width) / 2), '가운데 정렬').toBeLessThanOrEqual(2)
})
