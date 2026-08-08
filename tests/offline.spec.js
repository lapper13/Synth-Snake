const { test, expect } = require('@playwright/test');

test('the game loads and renders its canvas', async ({ page }) => {
  await page.goto('/index.html');
  const canvas = page.locator('canvas#game');
  await expect(canvas).toBeVisible();

  const size = await canvas.evaluate((c) => ({ w: c.width, h: c.height }));
  expect(size.w).toBeGreaterThan(0);
  expect(size.h).toBeGreaterThan(0);
});

test('the directory root serves the game without a filename', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas#game')).toBeVisible();
});
