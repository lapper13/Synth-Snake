const { test, expect } = require('@playwright/test');

// Playwright's touchscreen API can tap but not drag, so swipes go over CDP.
async function swipe(page, from, to) {
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from.x, y: from.y }],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: to.x, y: to.y }],
  });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await client.detach();
}

async function tap(page, at) {
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: at.x, y: at.y }],
  });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await client.detach();
}

async function stageCentre(page) {
  const box = await page.locator('#stage').boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

module.exports = { swipe, tap, stageCentre };

test('the game loads at a phone viewport', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('canvas#game')).toBeVisible();
});

test('a swipe up turns the snake up', async ({ page }) => {
  await page.goto('/index.html');
  const c = await stageCentre(page);
  await tap(page, c);                       // start a game from the menu
  await page.waitForFunction(() => window.G && window.G.state === 'play', null, { timeout: 5000 });

  await swipe(page, c, { x: c.x, y: c.y - 120 });

  const dir = await page.evaluate(() => {
    const q = window.G.dirQ;
    return q.length ? q[q.length - 1] : window.G.dir;
  });
  expect(dir).toEqual({ x: 0, y: -1 });
});

test('a tap starts a game from the title screen', async ({ page }) => {
  await page.goto('/index.html');
  expect(await page.evaluate(() => window.G.state)).toBe('menu');

  await tap(page, await stageCentre(page));

  await page.waitForFunction(() => window.G.state !== 'menu', null, { timeout: 5000 });
  expect(await page.evaluate(() => window.G.state)).not.toBe('menu');
});

test('touch never scrolls the page', async ({ page }) => {
  await page.goto('/index.html');
  const c = await stageCentre(page);
  await swipe(page, c, { x: c.x, y: c.y - 150 });
  await swipe(page, c, { x: c.x + 150, y: c.y });
  await tap(page, c);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('pause and mute are reachable without a keyboard', async ({ page }) => {
  await page.goto('/index.html');
  await tap(page, await stageCentre(page));
  await page.waitForFunction(() => window.G.state === 'play', null, { timeout: 5000 });

  await page.locator('#btnPause').tap();
  expect(await page.evaluate(() => window.G.state)).toBe('paused');

  await page.locator('#btnPause').tap();
  expect(await page.evaluate(() => window.G.state)).toBe('play');

  const before = await page.evaluate(() => window.G.muted);
  await page.locator('#btnMute').tap();
  expect(await page.evaluate(() => window.G.muted)).toBe(!before);
});

test('nothing is clipped off screen at a phone viewport', async ({ page }) => {
  await page.goto('/index.html');
  const vp = page.viewportSize();

  // Every visible top-level element must sit inside the viewport. The bug this
  // guards is #sideBoard being sliced in half by overflow:hidden. On a short
  // landscape phone the panel is hidden outright, which is also acceptable:
  // what is NOT acceptable is a visible element hanging off an edge.
  for (const sel of ['#hud', '#stage', '#sideBoard', 'canvas#game']) {
    const box = await page.locator(sel).boundingBox();
    if (box === null) continue;          // hidden is fine, clipped is not
    expect(box.x, `${sel} off the left`).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width, `${sel} off the right`).toBeLessThanOrEqual(vp.width + 1);
    expect(box.y + box.height, `${sel} off the bottom`).toBeLessThanOrEqual(vp.height + 1);
  }

  // And the board itself must never be the thing that got hidden.
  await expect(page.locator('canvas#game')).toBeVisible();
});

test('nothing is clipped in a narrow in-app browser window', async ({ page }) => {
  // Reproduces a real in-app-browser report: ~850x700 CSS px is too wide to
  // trigger the <=700px stacking rule and too tall to trigger the <=480px
  // compaction rule, so #sideBoard was sliced in half by overflow:hidden
  // with no way to scroll to the rest of it.
  await page.setViewportSize({ width: 850, height: 700 });
  await page.goto('/index.html');
  const vp = page.viewportSize();

  const box = await page.locator('#sideBoard').boundingBox();
  if (box !== null) {                   // hidden is fine, clipped is not
    expect(box.x, '#sideBoard off the left').toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width, '#sideBoard off the right').toBeLessThanOrEqual(vp.width + 1);
    expect(box.y, '#sideBoard off the top').toBeGreaterThanOrEqual(-1);
    expect(box.y + box.height, '#sideBoard off the bottom').toBeLessThanOrEqual(vp.height + 1);
  }

  await expect(page.locator('canvas#game')).toBeVisible();
});

test('portrait shows a rotate prompt', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index.html');
  await expect(page.locator('#rotate')).toBeVisible();

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('#rotate')).toBeHidden();
});
