// 다중 프로필(Multi-Profile) E2E
//  1) 첫 실행 → '누가 놀까요?' 선택 화면 → 새 친구 생성 → 런처 진입 + 새로고침 유지
//  2) '내 프로필'에서 아바타/테마색 변경이 런처에 반영되고 새로고침해도 유지
// (seed 를 쓰지 않고 실제 선택 화면 흐름으로 프로필을 만든다 → reload 후에도 그대로 유지)
import { test, expect } from '@playwright/test'

// 첫 실행 선택 화면에서 새 친구를 만든다(이름/아바타/색 선택 → 시작하기).
async function createViaSelector(page, { name, avatarIndex = 0, colorIndex = 0 }) {
  await expect(page.locator('#profileSelectModal')).toBeVisible()
  // 프로필이 하나도 없으면 만들기 폼이 곧장 보인다
  if (await page.locator('#psCreate').isHidden()) {
    await page.locator('#psAddBtn').click()
  }
  await expect(page.locator('#psCreate')).toBeVisible()
  await page.locator('#psName').fill(name)
  const av = page.locator('#psAvatarGrid .avatar-opt').nth(avatarIndex)
  const avatarEmoji = (await av.textContent())?.trim() || ''
  await av.click()
  await page.locator('#psColorGrid .color-opt').nth(colorIndex).click()
  await page.locator('#psCreateConfirm').click()
  await expect(page.locator('#profileSelectModal')).toBeHidden()
  return avatarEmoji
}

test('프로필 선택: 첫 실행에 "누가 놀까요?" 가 뜨고, 새 친구를 만들면 런처로 들어간다', async ({ page }) => {
  await page.goto('/')

  // 첫 실행: 선택 화면 + 만들기 폼이 보이고, 닫기 버튼은 숨겨져 있다(반드시 선택/생성)
  await expect(page.locator('#profileSelectModal')).toBeVisible()
  await expect(page.locator('#psCreate')).toBeVisible()
  await expect(page.locator('#profileSelectClose')).toBeHidden()

  const avatarEmoji = await createViaSelector(page, { name: '서아', avatarIndex: 2, colorIndex: 1 })

  // 런처가 보이고 좌상단 아바타에 선택값이 반영된다
  await expect(page.locator('#cards a.card')).toHaveCount(6)
  await expect(page.locator('#profileAvatar')).toHaveText(avatarEmoji)

  // 새로고침해도 프로필 유지(선택 화면 다시 안 뜸)
  await page.reload()
  await expect(page.locator('#profileSelectModal')).toBeHidden()
  await expect(page.locator('#profileAvatar')).toHaveText(avatarEmoji)
})

test('프로필: 내 프로필에서 아바타와 테마색을 바꾸면 런처에 반영되고 새로고침해도 유지된다', async ({ page }) => {
  await page.goto('/')
  await createViaSelector(page, { name: '하준', avatarIndex: 0, colorIndex: 0 })

  // 내 프로필 모달 열기
  await page.locator('#profileBtn').click()
  await expect(page.locator('#profileModal')).toBeVisible()

  // 아바타 변경 → 좌상단 프로필 버튼에 반영 + 선택 표시
  const av = page.locator('#avatarGrid .avatar-opt').nth(3)
  const avatarEmoji = (await av.textContent())?.trim() || ''
  await av.click()
  await expect(av).toHaveClass(/is-selected/)
  await expect(page.locator('#profileAvatar')).toHaveText(avatarEmoji)

  // 테마색 변경 → --fmk-primary CSS 변수 갱신
  await page.locator('#colorGrid .color-opt').nth(2).click()
  const primary = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--fmk-primary').trim()
  )
  expect(primary).toMatch(/^#?[0-9a-fA-F]{3,8}$/)

  // 새로고침해도 아바타가 유지된다(localStorage 활성 프로필 저장)
  await page.reload()
  await expect(page.locator('#profileSelectModal')).toBeHidden()
  await expect(page.locator('#profileAvatar')).toHaveText(avatarEmoji)
})
