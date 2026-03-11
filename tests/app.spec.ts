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
