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

test('the manifest is valid and declares standalone display', async ({ request }) => {
  const res = await request.get('/manifest.json');
  expect(res.status()).toBe(200);

  const manifest = await res.json();
  expect(manifest.name).toBeTruthy();
  expect(manifest.short_name).toBeTruthy();
  expect(manifest.display).toBe('standalone');
  expect(manifest.orientation).toBe('landscape');
  expect(manifest.start_url).toBe('./index.html');

  const sizes = manifest.icons.map((i) => i.sizes);
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');
});

test('the head links the manifest and the iOS icon', async ({ page }) => {
  await page.goto('/index.html');

  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', './manifest.json');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    'href',
    './icons/apple-touch-icon.png',
  );
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
    'content',
    'yes',
  );

  const viewport = await page
    .locator('meta[name="viewport"]')
    .getAttribute('content');
  expect(viewport).toContain('viewport-fit=cover');
});
