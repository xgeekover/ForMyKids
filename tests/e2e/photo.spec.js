// 추억 사진 로더 E2E — 퍼즐·틀린그림찾기 시작 화면의 📸 버튼 존재 + 클릭 시 사진 선택기 열림.
import { test, expect } from '@playwright/test'
import { seedActiveProfile } from './seed.js'

test.beforeEach(async ({ page }) => { await seedActiveProfile(page) })

test('📸 추억 사진 버튼이 퍼즐·틀린그림찾기 시작 화면에 있다', async ({ page }) => {
  await page.goto('/games/puzzle/index.html')
  await expect(page.locator('#photoPuzzleBtn')).toBeVisible()
  await expect(page.locator('#photoPuzzleBtn')).toContainText('내가 찍은 사진')

  await page.goto('/games/spot/index.html')
  await expect(page.locator('#btnPhotoSpot')).toBeVisible()
  await expect(page.locator('#btnPhotoSpot')).toContainText('내 사진')
})

test('📸 버튼 클릭 시 사진 선택기(file input)가 열린다 (퍼즐)', async ({ page }) => {
  await page.goto('/games/puzzle/index.html')
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('#photoPuzzleBtn').click(),
  ])
  expect(chooser).toBeTruthy()
})

test('📸 버튼 클릭 시 사진 선택기(file input)가 열린다 (틀린그림찾기)', async ({ page }) => {
  await page.goto('/games/spot/index.html')
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('#btnPhotoSpot').click(),
  ])
  expect(chooser).toBeTruthy()
})
