# Touch Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the game playable start to finish by touch on a phone or Fire tablet, without changing keyboard or gamepad behavior.

**Architecture:** No refactor. The game already dispatches input by state through `pushDir(d)` (index.html:1238) and `primary()` (index.html:1250), which between them drive the menu, the difficulty selector, play, pause, level advance, and the initials screen. Touch handlers call those two functions and nothing else. The rest is CSS: a breakpoint so the leaderboard wraps instead of being clipped, a short-viewport mode so the board gets the height, a portrait rotate prompt, and viewport hardening so gestures don't scroll or zoom the page.

**Tech Stack:** Plain HTML/JS, no build step. Playwright Test with a second `mobile` project using the iPhone 13 device profile. Swipes are synthesized over CDP `Input.dispatchTouchEvent`, because Playwright's `touchscreen` API can tap but not drag.

**Related spec:** `docs/specs/2026-08-08-touch-controls-design.md`

---

## File Structure

| Path | Change |
|---|---|
| `index.html` | Touch handlers near the existing `keydown` listener; two HUD buttons; a rotate-prompt element; CSS media queries; viewport meta. No game logic touched. |
| `sw.js` | Bump `CACHE` to `synth-snake-v2`, add the game's new files if any. |
| `playwright.config.js` | Add a second project for a mobile viewport with touch. |
| `tests/touch.spec.js` | New file. Touch and layout tests. Keeps `offline.spec.js` focused. |

### Test project split

The existing 6 tests in `tests/offline.spec.js` must keep running at a desktop viewport, because
one of them guards the side-by-side layout and another guards keyboard behavior. Adding a mobile
project that ran every file would run those against a phone viewport and break them. So the
config gets two projects with non-overlapping `testMatch`.

---

## Task 1: Two-project test config

**Files:** Modify `playwright.config.js`. Create `tests/touch.spec.js`.

- [ ] **Step 1: Replace the `projects` array in `playwright.config.js`**

```js
  projects: [
    {
      name: 'desktop',
      testMatch: /offline\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      testMatch: /touch\.spec\.js/,
      use: { ...devices['iPhone 13 landscape'] },
    },
  ],
```

`iPhone 13 landscape` gives a 844x390 viewport with `hasTouch: true` and `isMobile: true`, which
is the shape this work targets.

- [ ] **Step 2: Create `tests/touch.spec.js` with the swipe helper and one smoke test**

```js
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
```

Note: `module.exports` in a spec file is unusual but harmless here, and keeps the helpers beside
their only consumer. If Playwright objects, move the helpers into `tests/helpers.js` and require
them.

- [ ] **Step 3: Run both projects**

Run: `npx playwright test`
Expected: 7 passed (6 desktop, 1 mobile). If any of the original 6 now fail, the `testMatch`
split is wrong. Fix the config, not the tests.

- [ ] **Step 4: Commit**

```bash
git add playwright.config.js tests/touch.spec.js
git commit -m "test: add a mobile Playwright project with touch helpers"
```

---

## Task 2: Swipe to steer, tap to confirm

**Files:** Modify `index.html`. Modify `tests/touch.spec.js`.

- [ ] **Step 1: Append the failing tests**

```js
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
```

These read `window.G`, the game's state object. It is declared with `const G = {...}` at top level
inside the script, which does NOT create a `window` property. Step 3 exposes it. That is a test
seam and it is the only concession the game makes to being tested.

- [ ] **Step 2: Run to verify they FAIL**

Run: `npx playwright test --project=mobile`
Expected: the two swipe/tap tests fail. `window.G` is undefined, so they will fail on the
`waitForFunction` or the `evaluate`. Confirm you see real failures before implementing.

- [ ] **Step 3: Expose the game state for tests**

Immediately after the `const G = { ... };` declaration (search for `state:"menu"`, the object
starts a few lines above at `const G = {`), add:

```js
window.G = G;   // test seam: lets Playwright assert on real game state
```

- [ ] **Step 4: Add the touch handlers**

Insert immediately BEFORE the existing `window.addEventListener("keydown"` line:

```js
/* ---------- touch: swipe to steer, tap to confirm ----------
   Feeds the same pushDir/primary the keyboard and gamepad use, so every
   screen (menu, difficulty, play, pause, initials) works by touch for free. */
const SWIPE_MIN_PX = 24;   // above incidental thumb drift, below a deliberate swipe
const TAP_MAX_MS   = 500;

let touchStart = null;
const stageEl = document.getElementById("stage");

stageEl.addEventListener("touchstart", e => {
  if(e.touches.length !== 1){ touchStart = null; return; }
  const t = e.touches[0];
  touchStart = { x:t.clientX, y:t.clientY, at:performance.now() };
}, { passive:true });

stageEl.addEventListener("touchend", e => {
  if(!touchStart) return;
  if(e.changedTouches.length !== 1){ touchStart = null; return; }
  const t  = e.changedTouches[0];
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  const dt = performance.now() - touchStart.at;
  touchStart = null;

  if(Math.abs(dx) < SWIPE_MIN_PX && Math.abs(dy) < SWIPE_MIN_PX){
    if(dt <= TAP_MAX_MS) primary();
    return;
  }
  if(Math.abs(dx) > Math.abs(dy)) pushDir({ x: dx>0 ? 1 : -1, y: 0 });
  else                            pushDir({ x: 0, y: dy>0 ? 1 : -1 });
}, { passive:true });

stageEl.addEventListener("touchcancel", () => { touchStart = null; }, { passive:true });
```

Nothing here duplicates turn logic. `pushDir` already rejects reversals and caps its queue.

- [ ] **Step 5: Add `touch-action: none` to the stage**

In the CSS, change the `#stage` rule (currently `#stage{position:relative;line-height:0;margin-top:14px}`) to:

```css
  #stage{position:relative;line-height:0;margin-top:14px;touch-action:none}
```

Without this, Chrome consumes the vertical swipe as a scroll or pull-to-refresh before
`touchend` fires with a useful delta.

- [ ] **Step 6: Run to verify they PASS**

Run: `npx playwright test --project=mobile`
Expected: 4 passed.

- [ ] **Step 7: Run everything**

Run: `npx playwright test`
Expected: 10 passed. The 6 desktop tests confirm keyboard play is unaffected.

- [ ] **Step 8: Commit**

```bash
git add index.html tests/touch.spec.js
git commit -m "feat: steer by swipe and confirm by tap"
```

---

## Task 3: Pause and mute buttons

**Files:** Modify `index.html`. Modify `tests/touch.spec.js`.

- [ ] **Step 1: Append the failing test**

```js
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
```

- [ ] **Step 2: Run to verify it FAILS**

Run: `npx playwright test --project=mobile -g "pause and mute"`
Expected: FAIL, `#btnPause` not found.

- [ ] **Step 3: Add the buttons to the HUD**

In the `#hud` div, immediately after the `<div class="box"><span class="lbl">Snakes</span>...</div>` entry, add:

```html
    <div id="hudBtns">
      <button id="btnPause" type="button" aria-label="Pause">II</button>
      <button id="btnMute" type="button" aria-label="Mute">&#9834;</button>
    </div>
```

- [ ] **Step 4: Style them**

Add to the CSS, after the `#lives` rule:

```css
  #hudBtns{display:flex;gap:8px}
  #hudBtns button{
    width:34px;height:34px;border-radius:50%;
    background:none;border:1px solid currentColor;color:var(--hud-fg);
    font-size:13px;font-weight:700;line-height:1;
    opacity:.45;cursor:pointer;transition:opacity .15s,color .15s;
  }
  #hudBtns button:hover{opacity:.85}
  #hudBtns button.on{opacity:1;color:var(--accent)}
  body.darkui #hudBtns button{color:#EAF0FF}
```

- [ ] **Step 5: Wire them up**

Immediately after the touch handler block from Task 2, add:

```js
document.getElementById("btnPause").addEventListener("click", () => togglePause());
document.getElementById("btnMute").addEventListener("click", () => {
  toggleMute();
  document.getElementById("btnMute").classList.toggle("on", G.muted);
});
```

Using `click` rather than `touchend` means these work by mouse on desktop and by finger on a
phone, with no extra code.

- [ ] **Step 6: Run to verify it PASSES**

Run: `npx playwright test --project=mobile -g "pause and mute"`
Expected: PASS

- [ ] **Step 7: Run everything**

Run: `npx playwright test`
Expected: 11 passed.

- [ ] **Step 8: Commit**

```bash
git add index.html tests/touch.spec.js
git commit -m "feat: add on-screen pause and mute buttons"
```

---

## Task 4: Layout, rotate prompt, viewport hardening

**Files:** Modify `index.html`. Modify `tests/touch.spec.js`.

- [ ] **Step 1: Append the failing tests**

```js
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

test('portrait shows a rotate prompt', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index.html');
  await expect(page.locator('#rotate')).toBeVisible();

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('#rotate')).toBeHidden();
});
```

- [ ] **Step 2: Run to verify they FAIL**

Run: `npx playwright test --project=mobile -g "nothing is clipped|rotate prompt"`
Expected: both fail. The first fails because the panel overflows; the second because `#rotate`
does not exist. Paste both failures.

- [ ] **Step 3: Add the rotate prompt element**

Immediately after the opening `<body>` tag's `<div id="roomGlow"></div>`, add:

```html
  <div id="rotate"><div>Rotate your device<br>to play</div></div>
```

- [ ] **Step 4: Add the CSS**

Append to the end of the `<style>` block:

```css
  /* ---------- touch / small-viewport layout ---------- */

  #rotate{display:none}
  @media (orientation: portrait) and (max-width: 900px){
    #rotate{
      display:flex;position:fixed;inset:0;z-index:50;
      align-items:center;justify-content:center;text-align:center;
      background:#0A041A;color:#7CF7FF;
      font-size:18px;letter-spacing:.22em;text-transform:uppercase;font-weight:700;
      line-height:2;
    }
  }

  /* Not enough width for the board and the leaderboard side by side:
     stack them instead of letting overflow:hidden slice the panel off. */
  @media (max-width: 700px){
    #playRow{flex-direction:column;align-items:center}
    #sideBoard{min-width:0;width:min(96vw,420px)}
    #hud{flex-wrap:wrap;justify-content:center;gap:8px 14px}
  }

  /* Short viewport (a phone held in landscape): give the board the height
     by compacting everything around it. */
  @media (max-height: 480px){
    #hud{padding:4px 10px;margin-bottom:4px}
    #hud .val{font-size:16px}
    #hud .lbl{font-size:9px}
    #stage{margin-top:6px}
    canvas#game{max-height:82vh}
    #controlsHint{display:none}
    #sideBoard{display:none}
  }

  /* Keep the HUD and hint clear of a notch or home indicator. */
  #hud{padding-left:max(18px, env(safe-area-inset-left));
       padding-right:max(18px, env(safe-area-inset-right))}
```

The short-viewport rule hides the leaderboard panel entirely. On a 390px-tall landscape phone
there is no honest way to show both a playable board and a ten-row score table, and the board is
what people came for. The scores are still recorded and still shown on the game-over overlay.

- [ ] **Step 5: Harden the viewport meta**

Change the viewport meta (line 5) from:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
```
to:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
```

This stops double-tap zoom fighting the tap-to-confirm gesture.

- [ ] **Step 6: Replace `height:100%` with dynamic viewport units**

Change `html,body{height:100%}` to:
```css
  html,body{height:100dvh}
```

A collapsing browser toolbar changes the viewport height, and `100%` resolves against the larger
value, which clips the bottom of the board.

- [ ] **Step 7: Run to verify they PASS**

Run: `npx playwright test --project=mobile`
Expected: 7 passed.

- [ ] **Step 8: Run everything**

Run: `npx playwright test`
Expected: 13 passed. The desktop tests confirm the side-by-side layout and keyboard play survive.

- [ ] **Step 9: Commit**

```bash
git add index.html tests/touch.spec.js
git commit -m "feat: stack the layout on narrow screens and prompt to rotate in portrait"
```

---

## Task 5: Controls hint, cache bump, docs

**Files:** Modify `index.html`, `sw.js`, `README.md`.

- [ ] **Step 1: Add touch to the controls hint**

Change the `#controlsHint` div's text to end with a touch clause:

```html
  <div id="controlsHint">D-PAD move · ① start / confirm · ② pause · ③ mute &nbsp;|&nbsp; keys: arrows / WASD · Enter · P pause · M mute · Esc title &nbsp;|&nbsp; touch: swipe to steer · tap to start</div>
```

- [ ] **Step 2: Bump the service worker cache**

In `sw.js`, change:
```js
const CACHE = 'synth-snake-v1';
```
to:
```js
const CACHE = 'synth-snake-v2';
```

This is not optional. `sw.js` is the only file the browser re-checks for updates. Without an edit
to it, every device that already installed the app keeps serving the old build forever, and touch
controls would never reach the iPad or any installed phone.

- [ ] **Step 3: Update the README controls section**

Replace the Controls section with:

```markdown
## Controls

Arrow keys or WASD to steer. Enter or Space to start and confirm. P pauses, M mutes, Esc returns
to the title screen. A 3-button USB gamepad with a d-pad also works.

On a touch screen, swipe on the board to steer and tap to start or confirm. Pause and mute are
the two buttons at the top right. Hold the device in landscape.
```

- [ ] **Step 4: Run the whole suite**

Run: `npx playwright test`
Expected: 13 passed.

- [ ] **Step 5: Commit**

```bash
git add index.html sw.js README.md
git commit -m "docs: document touch controls and bump the service worker cache"
```

---

## Manual verification

Automated tests cannot check real fingers on real hardware. Do these once the branch is
deployed, and record the results before merging.

- [ ] iPhone, Safari, landscape: play a full game to a leaderboard entry, with sound.
- [ ] iPhone, portrait: rotate prompt appears and covers the game.
- [ ] iPhone: install to home screen, airplane mode, play. Confirms the cache bump rolled out.
- [ ] Kindle Fire, Silk: play a full game. Check whether Add to Home Screen gives a standalone
      app, and whether the frame rate holds up with the audio running.
- [ ] **iPad with keyboard: play a full game with arrow keys.** This is the booth demo. If this
      regresses, nothing else matters.
- [ ] Judge the swipe threshold by feel. `SWIPE_MIN_PX` is a considered guess at 24. Tune it here.

## Known cost

Swipe is slower to express than a key press, and the game ticks as fast as 160ms at high levels,
so late-game play will feel less precise by thumb than by keyboard. That is a property of swipe,
not a defect. If it turns out to matter, an on-screen d-pad is a small addition on top of this
work rather than a rewrite.
