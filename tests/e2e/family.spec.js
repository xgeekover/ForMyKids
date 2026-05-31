// v1.3.0 — 커스텀(가족 사진) 퍼즐 업로드 + 건강한 플레이 타임(스크린 타임) 잠금.
import { test, expect } from '@playwright/test'
import { seedActiveProfile, makeProfile, todayStr } from './seed.js'

// 부모님 곱셈 게이트 자동 통과
function autoSolveGate(page) {
  page.on('dialog', async (d) => {
    if (d.type() === 'prompt') {
      const m = d.message().match(/(\d+)\s*[×x*]\s*(\d+)/)
      await d.accept(m ? String(parseInt(m[1], 10) * parseInt(m[2], 10)) : '0')
    } else await d.accept()
  })
}

test('커스텀 퍼즐: 부모님 방에서 사진을 올리면 압축·저장되고 프로필에 사진 id 가 기록된다', async ({ page }) => {
  await seedActiveProfile(page)
  await page.goto('/')
  autoSolveGate(page)

  await page.locator('#parentsChip').click()
  await expect(page.locator('#parentsModal')).toBeVisible()
  await expect(page.locator('#cpClear')).toBeHidden() // 등록 전엔 '사진 지우기' 숨김

  // 브라우저에서 실제 PNG 를 만들어 파일 인풋에 주입(setInputFiles 대신 — 유효 이미지 보장)
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 40; c.height = 40
    const g = c.getContext('2d'); g.fillStyle = '#ff8fb1'; g.fillRect(0, 0, 40, 40)
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'))
    const file = new File([blob], 'family.png', { type: 'image/png' })
    const dt = new DataTransfer(); dt.items.add(file)
    const input = document.getElementById('cpFile')
    input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })

  // 압축→IndexedDB 저장→스토어에 id 기록 완료 → '사진 지우기' 노출 + customPuzzleId 기록
  await expect(page.locator('#cpClear')).toBeVisible()
  await expect(page.locator('#cpInfo')).toContainText('등록됨')
  await expect.poll(() => page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('fmk:v1')).profiles[0].customPuzzleId } catch (e) { return null }
  })).toBeTruthy()
})

test('스크린 타임: 제한을 초과하면 게임 진입이 막히고 친근한 잠금 안내가 뜬다', async ({ page }) => {
  // 활성 프로필을 '오늘 이미 초과'(제한 1분, 사용 9999초)로 시드
  await seedActiveProfile(page, {
    profiles: [makeProfile({ id: 'e2e-1', name: '시간아이', dailyLimitMin: 1, screen: { date: todayStr(), usedSec: 9999 } })],
  })
  await page.goto('/')
  await expect(page.locator('#screenLockModal')).toBeHidden()

  // 퍼즐 카드 클릭 → 진입 차단(런처 유지) + 잠금 모달
  await page.locator('#cards a.card[href="games/puzzle/index.html"]').click()
  await expect(page.locator('#screenLockModal')).toBeVisible()
  await expect(page.locator('#screenLockModal')).toContainText('오늘은 여기까지')
  await expect(page.locator('#cards')).toBeVisible() // 게임 페이지로 이동하지 않았다
})
