// PWA E2E — 매니페스트 링크/유효성 + 모바일 앱 메타 태그가 런처에 주입돼 있는지.
import { test, expect } from '@playwright/test'
import { seedActiveProfile } from './seed.js'

test('@mobile PWA: manifest 링크 + 유효한 매니페스트(standalone/landscape) + 앱 메타', async ({ page }) => {
  await seedActiveProfile(page)
  await page.goto('/')

  // 매니페스트 링크가 manifest.json 을 가리킨다
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toMatch(/manifest\.json$/)

  // 모바일 앱 메타 태그(홈 화면 단독 실행)
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes')
  await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute('content', 'yes')

  // 매니페스트를 실제로 받아 유효성 검증
  const res = await page.request.get(new URL(href, page.url()).toString())
  expect(res.ok()).toBeTruthy()
  const m = await res.json()
  expect(m.name).toBe('우리 아이 추억 놀이터')
  expect(m.short_name).toBe('추억놀이터')
  expect(m.display).toBe('standalone')
  expect(m.orientation).toBe('landscape')
  expect(Array.isArray(m.icons) && m.icons.length).toBeGreaterThan(0)
})

test('PWA: sw.js 가 서빙되고 캐시 버전/정리 로직을 포함한다', async ({ page }) => {
  const res = await page.request.get('/sw.js')
  expect(res.ok()).toBeTruthy()
  const sw = await res.text()
  expect(sw).toContain('CACHE_VERSION')
  expect(sw).toContain('caches.delete') // activate 시 옛 캐시 폐기
})
