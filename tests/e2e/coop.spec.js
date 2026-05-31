// 같이 하기(Co-op) E2E — 런처 다중 선택 → setCoop, 그리고 메모리 턴제 HUD 렌더.
import { test, expect } from '@playwright/test'
import { makeProfile } from './seed.js'

const A = makeProfile({ id: 'e2e-a', name: '아롱', avatar: '🐶', themeColor: 'blue' })
const B = makeProfile({ id: 'e2e-b', name: '다롱', avatar: '🐰', themeColor: 'pink' })

// localStorage 에 직접 상태를 심는다(coopProfiles 포함 가능).
async function seed(page, { active, coop } = {}) {
  const state = {
    version: 2,
    activeProfileId: active === undefined ? A.id : active,
    coopProfiles: coop || [],
    profiles: [A, B],
    updatedAt: 1700000000000,
  }
  await page.addInitScript((s) => { try { localStorage.setItem('fmk:v1', JSON.stringify(s)) } catch (e) {} }, state)
}

test('같이 하기: 런처에서 두 명 선택하면 Co-op 상태가 저장된다', async ({ page }) => {
  // 활성 프로필을 일부러 무효(ghost)로 두면 런처가 '누가 놀까요?' 를 자동으로 띄운다
  await seed(page, { active: 'ghost' })
  await page.goto('/')
  await expect(page.locator('#profileSelectModal')).toBeVisible()

  // '같이 하기' 모드 → 두 명 선택 → 둘이 시작!
  await page.locator('#psModeCoop').click()
  await page.locator('#psCoopStart').waitFor({ state: 'visible' })
  await expect(page.locator('#psCoopStart')).toBeDisabled() // 0명
  await page.locator('.ps-profile[data-profile="e2e-a"]').click()
  await page.locator('.ps-profile[data-profile="e2e-b"]').click()
  await expect(page.locator('#psCoopStart')).toBeEnabled()  // 2명
  await page.locator('#psCoopStart').click()

  // 선택 화면이 닫히고 coopProfiles 2명이 저장된다
  await expect(page.locator('#profileSelectModal')).toBeHidden()
  const coop = await page.evaluate(() => JSON.parse(localStorage.getItem('fmk:v1')).coopProfiles)
  expect(coop).toEqual(['e2e-a', 'e2e-b'])
})

test('같이 하기: 메모리 게임이 턴제 HUD(두 아이 차례·점수)를 보여준다', async ({ page }) => {
  await seed(page, { active: A.id, coop: ['e2e-a', 'e2e-b'] })
  await page.goto('/games/memory/index.html')
  await page.locator('.level-btn').first().click() // 난이도 선택 → 게임 진입

  const turns = page.locator('.coop-turns')
  await expect(turns).toBeVisible()
  await expect(page.locator('.coop-turns .coop-player')).toHaveCount(2)
  await expect(page.locator('.coop-turns')).toContainText('아롱')
  await expect(page.locator('.coop-turns')).toContainText('다롱')
  // 정확히 한 명만 현재 차례(파란 테두리)
  await expect(page.locator('.coop-player.is-turn')).toHaveCount(1)
})

test('혼자 모드: 메모리 HUD 는 기존(횟수/시간/짝) 그대로 — Co-op 미표시', async ({ page }) => {
  await seed(page, { active: A.id }) // coop 없음(단일 격리)
  await page.goto('/games/memory/index.html')
  await page.locator('.level-btn').first().click()
  await expect(page.locator('.hud-stats')).toBeVisible() // 기존 HUD
  await expect(page.locator('.coop-turns')).toHaveCount(0) // Co-op HUD 없음
})
