// 내 여권(스탬프북) E2E — 모은 스탬프가 16칸 그리드에 보이고, 빈 상태 안내가 뜬다.
import { test, expect } from '@playwright/test'
import { makeProfile } from './seed.js'

async function seedPassport(page, passport) {
  const p = makeProfile({ id: 'e2e-p', name: '여권이' })
  p.passport = passport || []
  await page.addInitScript((s) => { try { localStorage.setItem('fmk:v1', JSON.stringify(s)) } catch (e) {} },
    { version: 2, activeProfileId: 'e2e-p', coopProfiles: [], profiles: [p], updatedAt: 1 })
}

test('내 여권: 모은 스탬프가 16칸 그리드에 보인다', async ({ page }) => {
  await seedPassport(page, [{ t: 'plane', at: 1 }, { t: 'fish', at: 2 }, { t: 'palm', at: 3 }])
  await page.goto('/')
  await page.locator('#passportChip').click()
  await expect(page.locator('#passportModal')).toBeVisible()
  await expect(page.locator('#passportSub')).toContainText('3')
  await expect(page.locator('#passportGrid .passport-slot')).toHaveCount(16)        // 4×4 칸
  await expect(page.locator('#passportGrid .passport-slot.is-filled')).toHaveCount(3) // 채워진 스탬프 3개
})

test('내 여권: 스탬프가 없으면 안내 문구가 뜬다', async ({ page }) => {
  await seedPassport(page, [])
  await page.goto('/')
  await page.locator('#passportChip').click()
  await expect(page.locator('#passportModal')).toBeVisible()
  await expect(page.locator('#passportSub')).toContainText('아직 스탬프가 없어요')
  await expect(page.locator('#passportGrid .passport-slot.is-filled')).toHaveCount(0)
})
