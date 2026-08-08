# Offline Booth App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Synth-Snake installable on an iPad home screen and playable with no network connection.

**Architecture:** The game stays one self-contained HTML file with no changes to its logic. A web app manifest makes it installable, a cache-first service worker makes it work offline, and a handful of `<head>` tags wire the two together. All paths are relative so the same build works at `/` locally and at `/Synth-Snake/` on GitHub Pages. Playwright drives a real Chromium instance to verify registration, caching, and offline loading; GitHub Actions runs it on push.

**Tech Stack:** Plain HTML/JS (no framework, no build step), Playwright Test, Python's `http.server` as the test server, Pillow for icon generation, GitHub Actions.

**Related spec:** `docs/specs/2026-08-08-offline-booth-app-design.md`

---

## File Structure

| Path | Responsibility |
|---|---|
| `index.html` | The game. Renamed from `nokia-snake_Modified.html`. Only change is added `<head>` tags. |
| `manifest.json` | Declares name, icons, `display: standalone`, landscape orientation. |
| `sw.js` | Cache-first service worker. Owns the asset list and cache versioning. |
| `icons/icon-192.png`, `icons/icon-512.png`, `icons/apple-touch-icon.png` | Home screen artwork. |
| `tools/make_icons.py` | Regenerates the icons. Committed so the artwork is reproducible, not a mystery binary. |
| `playwright.config.js` | Test runner config, including the local static server. |
| `tests/offline.spec.js` | All verification: registration, cache contents, offline load, manifest validity. |
| `.github/workflows/test.yml` | Runs the test suite on push and pull request. |
| `package.json`, `.gitignore` | Node tooling for the test suite only. The game itself has no build step. |

### Why relative paths everywhere

Locally the game is served from `/`. On GitHub Pages it is served from `/Synth-Snake/`. Absolute
paths like `/sw.js` would work in one and 404 in the other. Every path in the manifest, the
service worker asset list, and the `<head>` tags is relative (`./sw.js`, `./icons/icon-192.png`)
so one build works in both places. A service worker registered from `./sw.js` also takes its
scope from its own directory, which is what we want.

---

## Task 1: Scaffolding and the provisional rename

**Files:**
- Create: `package.json`, `.gitignore`, `playwright.config.js`
- Rename: `nokia-snake_Modified.html` to `index.html`

This task has no tests because it produces no behavior. It sets up the ground the rest of the
plan stands on.

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
test-results/
playwright-report/
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "synth-snake",
  "version": "1.0.0",
  "private": true,
  "description": "Nokia Snake booth edition, installable and offline-capable",
  "scripts": {
    "test": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "^1.47.0"
  }
}
```

- [ ] **Step 3: Install Playwright and its browser**

Run:
```bash
npm install
npx playwright install --with-deps chromium
```
Expected: npm reports packages added, then Playwright downloads Chromium. Takes a few minutes on
a first run.

- [ ] **Step 4: Rename the game file**

Run:
```bash
git mv nokia-snake_Modified.html index.html
```

If Colin later says `_Final` is canonical, the flip is:
```bash
git mv index.html nokia-snake_Modified.html
git mv nokia-snake_Final.html index.html
```
Nothing else in this plan changes, because everything references `index.html`.

- [ ] **Step 5: Create `playwright.config.js`**

Service workers require a secure context. `127.0.0.1` counts as secure, so plain HTTP is fine
here and no certificates are needed.

```js
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8080',
    serviceWorkers: 'allow',
  },
  webServer: {
    command: 'python3 -m http.server 8080 --bind 127.0.0.1',
    url: 'http://127.0.0.1:8080/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
```

`workers: 1` is deliberate. The tests share one service worker registration and one cache, so
running them in parallel makes them fight each other.

- [ ] **Step 6: Commit**

```bash
git add .gitignore package.json package-lock.json playwright.config.js index.html
git commit -m "chore: add Playwright test harness and rename game to index.html"
```

---

## Task 2: The game still loads

A guard against the rename breaking anything, and proof the harness works before we depend on it.

**Files:**
- Create: `tests/offline.spec.js`

- [ ] **Step 1: Write the failing test**

Create `tests/offline.spec.js`:

```js
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
```

The second test covers spec requirement 6, the short URL. It is the rename doing the work: a
server asked for a directory serves `index.html` from it, which is why the file had to be named
that and not something else.

- [ ] **Step 2: Run them**

Run: `npx playwright test tests/offline.spec.js`
Expected: PASS. The game already works, so this passes immediately. It is a regression guard, not
a red-then-green cycle. If it fails, the rename or the server config is wrong and everything
after this is built on sand.

- [ ] **Step 3: Commit**

```bash
git add tests/offline.spec.js
git commit -m "test: verify the game loads after the rename"
```

---

## Task 3: Icons

**Files:**
- Create: `tools/make_icons.py`, `icons/icon-192.png`, `icons/icon-512.png`, `icons/apple-touch-icon.png`

The icon is a serpentine snake in white on Nokia blue, drawn from rounded squares so it echoes the
game's own snake segments. Generated by a committed script so it can be regenerated or adjusted
later rather than being an unexplained binary in the repo.

- [ ] **Step 1: Write the generator**

Create `tools/make_icons.py`:

```python
"""Generate home screen icons for Synth-Snake.

Run from the repo root:  python3 tools/make_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

NOKIA_BLUE = (0, 90, 255)
WHITE = (255, 255, 255)

# A serpentine snake laid out on a 10x10 grid of cells.
SEGMENTS = [
    (2, 2), (3, 2), (4, 2), (5, 2), (6, 2), (7, 2),
    (7, 3), (7, 4),
    (6, 4), (5, 4), (4, 4), (3, 4), (2, 4),
    (2, 5), (2, 6),
    (3, 6), (4, 6), (5, 6), (6, 6), (7, 6),
]

GRID = 10
# Segments occupy rows 2..6, whose centre is 4.0. The grid centre is 4.5,
# so nudge everything down half a cell to sit optically centred.
Y_OFFSET = 0.5


def draw_icon(size: int, path: Path) -> None:
    img = Image.new("RGB", (size, size), NOKIA_BLUE)
    draw = ImageDraw.Draw(img)
    cell = size / GRID
    inset = cell * 0.10
    radius = max(1, int(cell * 0.22))

    for col, row in SEGMENTS:
        x0 = col * cell + inset
        y0 = (row + Y_OFFSET) * cell + inset
        x1 = x0 + cell - (inset * 2)
        y1 = y0 + cell - (inset * 2)
        draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=WHITE)

    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")
    print(f"wrote {path} ({size}x{size})")


if __name__ == "__main__":
    icons = Path(__file__).resolve().parent.parent / "icons"
    draw_icon(192, icons / "icon-192.png")
    draw_icon(512, icons / "icon-512.png")
    # iOS uses this one for the home screen. It must be opaque; iOS does not
    # composite transparency and would render it on black.
    draw_icon(180, icons / "apple-touch-icon.png")
```

- [ ] **Step 2: Run it**

Run: `python3 tools/make_icons.py`
Expected output:
```
wrote .../icons/icon-192.png (192x192)
wrote .../icons/icon-512.png (512x512)
wrote .../icons/apple-touch-icon.png (180x180)
```

- [ ] **Step 3: Look at one**

Open `icons/icon-512.png` and confirm it reads as a snake and not as noise. This is a judgement
call a test cannot make. If it looks wrong, adjust `SEGMENTS` and re-run before moving on.

- [ ] **Step 4: Commit**

```bash
git add tools/make_icons.py icons/
git commit -m "feat: add home screen icons and their generator"
```

---

## Task 4: Web app manifest

**Files:**
- Create: `manifest.json`
- Modify: `tests/offline.spec.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/offline.spec.js`:

```js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test -g "manifest is valid"`
Expected: FAIL, with status 404 because `manifest.json` does not exist yet.

- [ ] **Step 3: Create `manifest.json`**

```json
{
  "name": "NOKIA Snake",
  "short_name": "Snake",
  "description": "Nokia Snake, booth edition",
  "start_url": "./index.html",
  "scope": "./",
  "display": "standalone",
  "orientation": "landscape",
  "background_color": "#F4F6FB",
  "theme_color": "#005AFF",
  "icons": [
    { "src": "./icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "./icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" }
  ]
}
```

`background_color` matches the game's own page background (`#F4F6FB`, from the `body` rule) so the
launch screen does not flash a different colour before the game paints.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx playwright test -g "manifest is valid"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add manifest.json tests/offline.spec.js
git commit -m "feat: add web app manifest for home screen install"
```

---

## Task 5: Head tags

**Files:**
- Modify: `index.html:4-6` (the `<head>`, immediately after the existing `<title>`)
- Modify: `tests/offline.spec.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/offline.spec.js`:

```js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test -g "head links the manifest"`
Expected: FAIL, because none of those elements exist.

- [ ] **Step 3: Edit the head of `index.html`**

Replace the existing viewport meta on line 5:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```

with:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
```

Then insert these lines immediately after the `<title>` element on line 6:

```html
<link rel="manifest" href="./manifest.json">
<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Snake">
<meta name="theme-color" content="#005AFF">
```

iOS reads both the manifest and its own `apple-` prefixed tags depending on version, so both are
present on purpose rather than by duplication. `viewport-fit=cover` lets the game paint under the
rounded corners and home indicator instead of leaving white bars.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx playwright test -g "head links the manifest"`
Expected: PASS

- [ ] **Step 5: Run the whole suite**

Run: `npx playwright test`
Expected: 4 passed. Confirms the head edit did not break the game.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/offline.spec.js
git commit -m "feat: add manifest link and iOS home screen meta tags"
```

---

## Task 6: Service worker

**Files:**
- Create: `sw.js`
- Modify: `index.html` (registration script, just before `</body>`)
- Modify: `tests/offline.spec.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/offline.spec.js`:

```js
test('the service worker activates and caches the game', async ({ page }) => {
  await page.goto('/index.html');

  const state = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.active ? reg.active.state : 'none';
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test -g "service worker activates"`
Expected: FAIL, and it will hang until the test times out because `navigator.serviceWorker.ready`
never resolves with no worker registered. A timeout here is the expected failure, not a broken
test.

- [ ] **Step 3: Create `sw.js`**

```js
/* Cache-first service worker for Synth-Snake.
 *
 * Cache-first, not network-first, on purpose. A saturated conference network is
 * slower than no network at all: network-first would sit waiting on a request
 * that eventually fails. Serving from cache first means a bad network behaves
 * exactly like airplane mode.
 *
 * Bump CACHE when any asset changes, or returning visitors keep the old build.
 */
const CACHE = 'synth-snake-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request)),
  );
});
```

- [ ] **Step 4: Register it from `index.html`**

Insert immediately before the closing `</body>` tag:

```html
<script>
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(err => {
      console.warn("Service worker registration failed:", err);
    });
  });
}
</script>
```

The `catch` matters. Registration fails on `file://` URLs and over plain HTTP on a non-localhost
host, and an unhandled rejection there would be noise in the console for anyone opening the file
directly. It fails quietly and the game still runs.

- [ ] **Step 5: Run it to verify it passes**

Run: `npx playwright test -g "service worker activates"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add sw.js index.html tests/offline.spec.js
git commit -m "feat: cache the game with a cache-first service worker"
```

---

## Task 7: It plays with the network off

The requirement the whole project exists for.

**Files:**
- Modify: `tests/offline.spec.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/offline.spec.js`:

```js
test('the game loads and runs with the network offline', async ({ page, context }) => {
  // Prime the cache.
  await page.goto('/index.html');
  await page.evaluate(() => navigator.serviceWorker.ready);

  // Cut the network at the browser, the way airplane mode would.
  await context.setOffline(true);

  await page.reload();

  const canvas = page.locator('canvas#game');
  await expect(canvas).toBeVisible();

  // The canvas being present is not proof the game booted. Check that its
  // script ran by confirming the HUD was populated from JS.
  await expect(page.locator('#scoreV')).not.toBeEmpty();
  await expect(page.locator('#seq span').first()).toBeVisible();

  await context.setOffline(false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Before running, temporarily comment out the `fetch` listener in `sw.js` to prove the test is
really measuring offline behavior and not passing on Chromium's own HTTP cache.

Run: `npx playwright test -g "network offline"`
Expected: FAIL, with a navigation error because nothing serves the reload.

Restore the `fetch` listener before the next step.

- [ ] **Step 3: Run it to verify it passes**

Run: `npx playwright test -g "network offline"`
Expected: PASS

- [ ] **Step 4: Run the whole suite**

Run: `npx playwright test`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add tests/offline.spec.js
git commit -m "test: verify the game loads and boots with the network offline"
```

---

## Task 8: Continuous integration

**Files:**
- Create: `.github/workflows/test.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: tests

on:
  push:
  pull_request:

jobs:
  playwright:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Install Chromium
        run: npx playwright install --with-deps chromium

      - name: Run tests
        run: npx playwright test

      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

`ubuntu-latest` ships Python 3, so `python3 -m http.server` in the Playwright config works without
an extra setup step.

- [ ] **Step 2: Commit and push the branch**

```bash
git add .github/workflows/test.yml
git commit -m "ci: run the Playwright suite on push and pull request"
git push -u origin spec/offline-booth-app
```

- [ ] **Step 3: Confirm it went green**

Run: `gh run watch`
Expected: the `playwright` job completes successfully. If it fails, download the report artifact
and fix before continuing.

---

## Task 9: README

The repo's README is currently one line. Anyone landing on this, Colin included, should be able
to tell what the files are and how to run the tests.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace `README.md`**

```markdown
# Synth-Snake

Nokia Snake, booth edition. A single self-contained HTML page: canvas rendering, a synthwave
soundtrack generated at runtime with the Web Audio API, twenty levels, and a local top-ten
leaderboard. No build step, no dependencies, no external assets.

Play it: https://lapper13.github.io/Synth-Snake/

## Controls

Arrow keys or WASD to steer. Enter or Space to start and confirm. P pauses, M mutes, Esc returns
to the title screen. A 3-button USB gamepad with a d-pad also works.

## Install it on a tablet

Open the link, then Share, then Add to Home Screen. It launches full screen and plays with the
network off, which is the point: conference wifi is not something to depend on.

## Layout

| Path | What it is |
|---|---|
| `index.html` | The game. |
| `manifest.json`, `sw.js`, `icons/` | What makes it installable and offline-capable. |
| `tools/make_icons.py` | Regenerates the icons. |
| `tests/` | Playwright suite. |
| `docs/specs/`, `docs/plans/` | Why the offline work was done the way it was. |
| `nokia-snakev*.html`, `nokia-snake_Final.html` | Earlier versions, kept for history. |

## Tests

```bash
npm install
npx playwright install --with-deps chromium
npx playwright test
```
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: describe the game, the offline install, and how to run the tests"
```

---

## Manual verification on the iPad

Automated tests cannot check iOS behavior. Do these by hand once the branch is deployed to
GitHub Pages, and record the results in the pull request.

- [ ] Open the Pages URL in Safari on the iPad. Share, Add to Home Screen. Confirm the icon shows
      the snake and the name reads "Snake".
- [ ] Launch from the icon. Confirm no address bar, no tab bar, no toolbar.
- [ ] Turn on airplane mode. Launch from the icon. Play a full game through to a leaderboard
      entry. Confirm sound works.
- [ ] Restart the iPad. Launch again offline. Confirm the leaderboard entry survived.

## The four-week test

Requirement 7 of the spec, and the one that can sink the goal. Schedule it rather than
remembering it.

- [ ] Early September: install the app on the iPad and leave it alone.
- [ ] Mid October: airplane mode, launch from the icon, confirm it still plays.

If it fails, iOS has evicted the cache despite the home screen exemption, and the fallbacks are a
laptop serving the file over a local network at the booth, or a native wrapper. Finding out in
October leaves time to choose one. Either way, open the app once on wifi the night before
AutoCon 6.

## Open dependency

Task 1 renames `nokia-snake_Modified.html` to `index.html` on the assumption that it is the
canonical file. Colin has been asked to confirm. If the answer is `_Final`, run the two `git mv`
commands in Task 1 Step 4. No other task is affected.
