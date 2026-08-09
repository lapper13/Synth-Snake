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

test('the pad toggle hides and shows the controller', async ({ page }) => {
  await page.goto('/index.html');

  await expect(page.locator('#dpad')).toBeVisible();

  await page.locator('#btnPad').tap();
  await expect(page.locator('#touchpad')).toBeHidden();

  await page.locator('#btnPad').tap();
  await expect(page.locator('#touchpad')).toBeVisible();
});

test('the hidden choice survives a reload', async ({ page }) => {
  await page.goto('/index.html');

  await page.locator('#btnPad').tap();
  await expect(page.locator('#touchpad')).toBeHidden();

  await page.reload();
  await expect(page.locator('#touchpad')).toBeHidden();

  await page.locator('#btnPad').tap();
  await expect(page.locator('#touchpad')).toBeVisible();

  await page.reload();
  await expect(page.locator('#touchpad')).toBeVisible();
});

test('the pad toggle is hidden on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/index.html');
  await expect(page.locator('#btnPad')).toBeHidden();
});

test('the game is playable in portrait', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index.html');

  await expect(page.locator('canvas#game')).toBeVisible();
  expect(await page.locator('#rotate').count()).toBe(0);

  await page.locator('#btnAction').tap();
  await page.waitForFunction(() => window.G.state !== 'menu', null, { timeout: 5000 });
  expect(await page.evaluate(() => window.G.state)).not.toBe('menu');
});

test('the portrait controller does not overlap the board', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
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

  for (const [name, box] of [['canvas#game', canvasBox], ['#dpad', dpadBox], ['#btnAction', actionBox]]) {
    expect(box.x, `${name} off the left`).toBeGreaterThanOrEqual(-1);
    expect(box.y, `${name} off the top`).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width, `${name} off the right`).toBeLessThanOrEqual(vp.width + 1);
    expect(box.y + box.height, `${name} off the bottom`).toBeLessThanOrEqual(vp.height + 1);
  }
});

test('nothing is clipped in portrait', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index.html');
  const vp = page.viewportSize();

  for (const sel of ['#hud', '#stage', 'canvas#game', '#sideBoard']) {
    const box = await page.locator(sel).boundingBox();
    if (box === null) continue;          // hidden is fine, clipped is not
    expect(box.x, `${sel} off the left`).toBeGreaterThanOrEqual(-1);
    expect(box.y, `${sel} off the top`).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width, `${sel} off the right`).toBeLessThanOrEqual(vp.width + 1);
    expect(box.y + box.height, `${sel} off the bottom`).toBeLessThanOrEqual(vp.height + 1);
  }
});


test('portrait gives the spare height to the controls, not the leaderboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index.html');

  // The score panel is redundant in portrait: the top ten already shows on the
  // title and game-over screens, and it was eating as much height as the board.
  await expect(page.locator('#sideBoard')).toBeHidden();
  await expect(page.locator('#controlsHint')).toBeHidden();

  // The board must still be full width and fully on screen.
  const canvas = await page.locator('canvas#game').boundingBox();
  const vp = page.viewportSize();
  expect(canvas.width).toBeGreaterThanOrEqual(vp.width - 2);
  expect(canvas.y + canvas.height).toBeLessThanOrEqual(vp.height + 1);

  // And the d-pad must still clear it.
  const dpad = await page.locator('#dpad').boundingBox();
  expect(dpad.y).toBeGreaterThan(canvas.y + canvas.height);
});

/* ---------- one-handed reachability: swipe/tap must work anywhere ----------
   #stage sits near the top of a portrait phone screen even after Change 2
   lowers it -- the board is still only ~286px tall out of an 844px-tall
   screen. Binding the swipe/tap listeners to #stage means a one-handed thumb
   has to stretch to the board itself. The fix moves those listeners to
   document, guarded so on-screen controls (#touchpad, #hudBtns) don't also
   fire a tap/swipe underneath a button press. These tests use the empty
   strip below the board and above the d-pad -- around x 195, y 565 at
   390x844 -- which is neither the board nor any control. */
test('a swipe below the board still steers', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index.html');
  const c = await stageCentre(page);
  await tap(page, c);                       // start a game from the menu
  await page.waitForFunction(() => window.G && window.G.state === 'play', null, { timeout: 5000 });

  const p = { x: 195, y: 565 };             // below the board, above the d-pad
  await swipe(page, p, { x: p.x, y: p.y - 120 });

  const dir = await page.evaluate(() => {
    const q = window.G.dirQ;
    return q.length ? q[q.length - 1] : window.G.dir;
  });
  expect(dir).toEqual({ x: 0, y: -1 });
});

test('a tap below the board still confirms', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index.html');
  expect(await page.evaluate(() => window.G.state)).toBe('menu');

  await tap(page, { x: 195, y: 565 });      // below the board, above the d-pad

  await page.waitForFunction(() => window.G.state !== 'menu', null, { timeout: 5000 });
  expect(await page.evaluate(() => window.G.state)).not.toBe('menu');
});

test('the board sits low enough to reach in portrait', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index.html');
  const vp = page.viewportSize();

  const canvas = await page.locator('canvas#game').boundingBox();
  const dpad = await page.locator('#dpad').boundingBox();
  const btnAction = await page.locator('#btnAction').boundingBox();
  const hud = await page.locator('#hud').boundingBox();

  // The board's bottom edge must sit below 60% of the viewport height, or a
  // one-handed thumb anchored near the bottom of the screen cannot reach it
  // even via the anywhere-swipe fix -- the whole point is to bring the board
  // down toward the thumb, not just widen where a swipe is accepted.
  expect(canvas.y + canvas.height).toBeGreaterThan(vp.height * 0.6);

  expect(rectsIntersect(canvas, dpad), 'canvas overlaps dpad').toBe(false);
  expect(rectsIntersect(canvas, btnAction), 'canvas overlaps btnAction').toBe(false);
  expect(rectsIntersect(canvas, hud), 'canvas overlaps hud').toBe(false);
});

test('pressing a hud button does not also fire the tap action', async ({ page }) => {
  // #hudBtns holds #btnPause/#btnMute/#btnPad. With swipe/tap listeners
  // moved to document, a press on any hud button would also read as a tap on
  // document unless #hudBtns is excluded the same way #touchpad is. From
  // paused, pressing mute must not leak a primary() call that resumes play.
  await page.goto('/index.html');
  const c = await stageCentre(page);
  await tap(page, c);
  await page.waitForFunction(() => window.G && window.G.state === 'play', null, { timeout: 5000 });

  await page.locator('#btnPause').tap();
  expect(await page.evaluate(() => window.G.state)).toBe('paused');

  await page.locator('#btnMute').tap();
  expect(await page.evaluate(() => window.G.state)).toBe('paused');
});
