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

test('a swipe turns the snake as soon as it crosses the threshold, not on release', async ({ page }) => {
  // Regression test for the latency defect: direction must resolve on
  // touchmove once the swipe passes SWIPE_MIN_PX, not on touchend.
  await page.goto('/index.html');
  const c = await stageCentre(page);
  await tap(page, c);
  await page.waitForFunction(() => window.G && window.G.state === 'play', null, { timeout: 5000 });

  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: c.x, y: c.y }],
  });
  // Move past SWIPE_MIN_PX (24px) but do NOT send touchEnd yet.
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: c.x, y: c.y - 60 }],
  });

  // The direction must already be resolved, before touchend fires.
  const dir = await page.evaluate(() => {
    const q = window.G.dirQ;
    return q.length ? q[q.length - 1] : window.G.dir;
  });
  expect(dir).toEqual({ x: 0, y: -1 });

  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await client.detach();
});

test('the d-pad turns the snake', async ({ page }) => {
  await page.goto('/index.html');
  const c = await stageCentre(page);
  await tap(page, c);
  await page.waitForFunction(() => window.G && window.G.state === 'play', null, { timeout: 5000 });

  await page.locator('#dpad .up').tap();

  const dir = await page.evaluate(() => {
    const q = window.G.dirQ;
    return q.length ? q[q.length - 1] : window.G.dir;
  });
  expect(dir).toEqual({ x: 0, y: -1 });
});

test('the action button starts a game', async ({ page }) => {
  await page.goto('/index.html');
  expect(await page.evaluate(() => window.G.state)).toBe('menu');

  await page.locator('#btnAction').tap();

  await page.waitForFunction(() => window.G.state !== 'menu', null, { timeout: 5000 });
  expect(await page.evaluate(() => window.G.state)).not.toBe('menu');
});

test('pressing the d-pad does not also fire the tap action', async ({ page }) => {
  // #touchpad sits inside #stage, which owns the swipe/tap touch listeners.
  // Without a guard, a touch on the d-pad also starts a swipe gesture on
  // #stage; on release (short, in-place) that reads as a tap and calls
  // primary(). primary() resumes from 'paused'; pushDir does not. So: from
  // paused, a d-pad press must NOT resume the game.
  await page.goto('/index.html');
  const c = await stageCentre(page);
  await tap(page, c);
  await page.waitForFunction(() => window.G && window.G.state === 'play', null, { timeout: 5000 });

  await page.locator('#btnPause').tap();
  expect(await page.evaluate(() => window.G.state)).toBe('paused');

  await page.locator('#dpad .up').tap();

  expect(await page.evaluate(() => window.G.state)).toBe('paused');
});

test('the on-screen controller is hidden on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/index.html');
  await expect(page.locator('#touchpad')).toBeHidden();
});

// Rectangle intersection helper for the new geometry tests below. Two
// bounding boxes count as touching-but-not-overlapping (edges flush) as
// not-intersecting, since that is a legitimate non-overlapping layout.
function rectsIntersect(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width &&
         a.y < b.y + b.height && b.y < a.y + a.height;
}

test('the controller does not overlap the game board', async ({ page }) => {
  await page.goto('/index.html');
  const vp = page.viewportSize();

  const canvasBox = await page.locator('canvas#game').boundingBox();
  const dpadBox = await page.locator('#dpad').boundingBox();
  const actionBox = await page.locator('#btnAction').boundingBox();

  expect(canvasBox).not.toBeNull();
  expect(dpadBox).not.toBeNull();
  expect(actionBox).not.toBeNull();

  expect(rectsIntersect(canvasBox, dpadBox), 'dpad overlaps canvas').toBe(false);
  expect(rectsIntersect(canvasBox, actionBox), 'btnAction overlaps canvas').toBe(false);

  for (const [name, box] of [['#dpad', dpadBox], ['#btnAction', actionBox]]) {
    expect(box.x, `${name} off the left`).toBeGreaterThanOrEqual(-1);
    expect(box.y, `${name} off the top`).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width, `${name} off the right`).toBeLessThanOrEqual(vp.width + 1);
    expect(box.y + box.height, `${name} off the bottom`).toBeLessThanOrEqual(vp.height + 1);
  }
});

