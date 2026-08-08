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

test('the service worker activates and caches the game', async ({ page }) => {
  await page.goto('/index.html');

  const state = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    const sw = reg.active;
    if (!sw) return 'none';
    // `ready` resolves as soon as a worker becomes the active worker, which
    // happens when it enters "activating" -- before its activate handler's
    // waitUntil has settled. Wait for the real "activated" transition instead
    // of racing it.
    if (sw.state !== 'activated') {
      await new Promise((resolve) => {
        sw.addEventListener('statechange', function onChange() {
          if (sw.state === 'activated') {
            sw.removeEventListener('statechange', onChange);
            resolve();
          }
        });
      });
    }
    return sw.state;
  });
  expect(state).toBe('activated');

  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names[0]);
    const keys = await cache.keys();
    return keys.map((r) => new URL(r.url).pathname);
  });

  expect(cached).toContain('/index.html');
  expect(cached).toContain('/manifest.json');
  expect(cached).toContain('/icons/icon-192.png');
  expect(cached).toContain('/icons/icon-512.png');
  expect(cached).toContain('/icons/apple-touch-icon.png');
});
