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
