// 런처 스모크 테스트 — 앱 구동 후 6개 게임 카드가 모두 렌더링되는지 확인.
// (v2 다중 프로필: 활성 프로필을 미리 심어 '누가 놀까요?' 선택 화면을 건너뛴다)
import { test, expect } from '@playwright/test'
import { seedActiveProfile } from './seed.js'

test.beforeEach(async ({ page }) => { await seedActiveProfile(page) })

test('런처: 6개 게임 카드가 모두 보인다', async ({ page }) => {
  await page.goto('/')

  const cards = page.locator('#cards a.card')
  await expect(cards).toHaveCount(6)

  // 6개 게임 타이틀이 모두 노출되는지(games.config.js 레지스트리 기준)
  const titles = ['짝꿍 친구 찾기', '풍선 터트리기', '우주선 똥 피하기', '동화책 미로 탈출', '틀린그림찾기', '조각조각 퍼즐']
  for (const t of titles) {
    await expect(page.locator('#cards')).toContainText(t)
  }

  // 각 카드는 게임 페이지로 가는 링크를 가진다
  for (const id of ['memory', 'popnpop', 'dodge', 'maze', 'spot', 'puzzle']) {
    await expect(page.locator(`#cards a.card[href="games/${id}/index.html"]`)).toHaveCount(1)
  }

  // 활성 프로필이 있으면 선택 화면은 뜨지 않는다
  await expect(page.locator('#profileSelectModal')).toBeHidden()
})

test('런처: 종합 성적표 배지와 설정 버튼이 보인다', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#reportBadge')).toBeVisible()
  await expect(page.locator('#settingsBtn')).toBeVisible()
})
