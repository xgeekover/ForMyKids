// 부모님 게이트 검증 — 부모님 방 버튼 → 곱셈 퀴즈 → 정답일 때만 대시보드 진입.
// + v2 다중 프로필: 아이별 탭 전환.
import { test, expect } from '@playwright/test'
import { seedActiveProfile, makeProfile } from './seed.js'

// 곱셈 게이트 자동 통과(프롬프트의 a×b 정답 입력)
function autoSolveGate(page) {
  page.on('dialog', async (dialog) => {
    if (dialog.type() === 'prompt') {
      const m = dialog.message().match(/(\d+)\s*[×x*]\s*(\d+)/)
      await dialog.accept(m ? String(parseInt(m[1], 10) * parseInt(m[2], 10)) : '0')
    } else {
      await dialog.accept()
    }
  })
}

test('부모님 방: 곱셈 정답을 입력하면 대시보드에 진입한다', async ({ page }) => {
  await seedActiveProfile(page)
  await page.goto('/')
  autoSolveGate(page)

  await page.locator('#parentsChip').click()

  // 정답 → 부모님 방 모달(대시보드) 열림
  await expect(page.locator('#parentsModal')).toBeVisible()
  await expect(page.locator('#parentsModal')).toContainText('부모님 방')
  // 대시보드 섹션이 렌더됨(항상 노출되는 섹션 제목)
  await expect(page.locator('#dashboard')).toContainText('어떤 놀이를 좋아할까')
})

test('부모님 방: 곱셈 오답이면 대시보드에 진입하지 못한다', async ({ page }) => {
  await seedActiveProfile(page)
  await page.goto('/')

  // a,b 는 6~9 라 곱이 36~81 → '1' 은 항상 오답
  page.on('dialog', async (dialog) => {
    if (dialog.type() === 'prompt') await dialog.accept('1')
    else await dialog.accept() // "답이 달라요" 알림
  })

  await page.locator('#parentsChip').click()
  await expect(page.locator('#parentsModal')).toBeHidden()
})

test('부모님 방: 클라우드 동기화 상태 배지가 보인다', async ({ page }) => {
  await seedActiveProfile(page)
  await page.goto('/')
  autoSolveGate(page)

  await page.locator('#parentsChip').click()
  await expect(page.locator('#parentsModal')).toBeVisible()

  // 동기화 배지가 우측 상단에 노출되고, 상태/라벨이 채워져 있다(백엔드 없으면 오프라인 표기).
  const badge = page.locator('#syncBadge')
  await expect(badge).toBeVisible()
  await expect(badge).toHaveAttribute('data-status', /online|offline|syncing/)
  await expect(page.locator('#syncLabel')).not.toBeEmpty()
})

test('부모님 방: 아이별 탭으로 프로필을 전환할 수 있다', async ({ page }) => {
  // 두 아이 시드(서아 + 하준)
  await seedActiveProfile(page, {
    profiles: [
      makeProfile({ id: 'e2e-seoa', name: '서아', avatar: '🐶', themeColor: 'pink' }),
      makeProfile({ id: 'e2e-hajun', name: '하준', avatar: '🐰', themeColor: 'blue' }),
    ],
  })
  await page.goto('/')
  autoSolveGate(page)

  await page.locator('#parentsChip').click()
  await expect(page.locator('#parentsModal')).toBeVisible()

  // 아이별 탭 2개 + 이름 노출
  const tabs = page.locator('#childTabs .child-tab')
  await expect(tabs).toHaveCount(2)
  await expect(page.locator('#childTabs')).toContainText('서아')
  await expect(page.locator('#childTabs')).toContainText('하준')

  // 기본 활성 탭(첫째 = 서아)
  await expect(tabs.nth(0)).toHaveClass(/is-active/)

  // 둘째 탭(하준) 클릭 → 활성 전환 + 대시보드는 계속 렌더된다
  await tabs.nth(1).click()
  await expect(tabs.nth(1)).toHaveClass(/is-active/)
  await expect(tabs.nth(0)).not.toHaveClass(/is-active/)
  await expect(page.locator('#dashboard')).toContainText('모은 칭찬 도장')
})
