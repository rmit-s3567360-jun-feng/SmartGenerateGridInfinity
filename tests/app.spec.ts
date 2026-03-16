import { expect, test } from '@playwright/test'

test('home page and generator route render', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: '用参数直接生成可打印的 Gridfinity 收纳模型' }),
  ).toBeVisible()

  await page.getByRole('link', { name: '立即开始' }).click()
  await expect(page.getByRole('heading', { name: '通用收纳盒' })).toBeVisible()
  await expect(page.getByRole('button', { name: '导出 STL' })).toBeVisible()
})

test('home page exposes the STL retrofit template route', async ({ page }) => {
  await page.goto('/')
  await page
    .locator('article')
    .filter({ hasText: 'STL 改底适配' })
    .getByRole('link', { name: '打开生成器' })
    .click()
  await expect(page.getByRole('heading', { name: 'STL 改底适配' })).toBeVisible()
  await expect(page.getByText('上传 STL 模型')).toBeVisible()
})

test('home page exposes the STL cavity bin template route', async ({ page }) => {
  await page.goto('/')
  await page
    .locator('article')
    .filter({ hasText: 'STL 型腔收纳' })
    .getByRole('link', { name: '打开生成器' })
    .click()
  await expect(page.getByRole('heading', { name: 'STL 型腔收纳' })).toBeVisible()
  await expect(page.getByText('上传物品 STL')).toBeVisible()
})
