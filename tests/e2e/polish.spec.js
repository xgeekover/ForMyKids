// v1.2.1 UI/UX 폴리싱 검증 — 폭죽(confetti) 호출 + PWA '앱 설치하기' 버튼 노출.
import { test, expect } from '@playwright/test'
import { seedActiveProfile, makeProfile } from './seed.js'

test('폭죽: 새 칭찬 도장이 있으면 도장 모달을 열 때 폭죽 함수가 호출된다', async ({ page }) => {
  // 해금됐지만 아직 안 본(seen 비어있음) 도장 → 모달 열면 새 도장 연출(celebrate) 발동
  await seedActiveProfile(page, {
    profiles: [makeProfile({ id: 'e2e-1', name: '서아', achievements: { 'first-step': { unlockedAt: 1 } }, seen: {} })],
  })
  await page.goto('/')

  // 새 도장이 있으면 reportBadge 가 무한 wobble 애니메이션을 가져 클릭 actionability 가 막힌다.
  // CSS 애니메이션만 꺼서 클릭을 안정화한다(폭죽 호출 카운터는 JS(rAF)라 영향 없음).
  await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' })

  // 아직 폭죽 호출 전
  expect(await page.evaluate(() => window.__fmkConfettiCount || 0)).toBe(0)

  await page.locator('#reportBadge').click()
  await expect(page.locator('#achModal')).toBeVisible()

  // 새 도장이 있으므로 celebrate() 가 호출되어 카운터가 증가('호출됨' 보장 — 시각효과 유무와 무관)
  await expect.poll(() => page.evaluate(() => window.__fmkConfettiCount || 0)).toBeGreaterThan(0)
})

test('PWA: beforeinstallprompt 가 오면 "앱 설치하기" 버튼이 나타난다', async ({ page }) => {
  await seedActiveProfile(page)
  await page.goto('/')

  // 기본은 숨김(이벤트 전 / 미지원 / 이미 설치 시 자연스럽게 숨김)
  await expect(page.locator('#installBtn')).toBeHidden()

  // 설치 가능 신호(beforeinstallprompt)를 모사 → 버튼 노출
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt')
    e.prompt = () => {}
    e.userChoice = Promise.resolve({ outcome: 'dismissed' })
    window.dispatchEvent(e)
  })
  await expect(page.locator('#installBtn')).toBeVisible()
  await expect(page.locator('#installBtn')).toContainText('앱 설치하기')
})
