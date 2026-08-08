# Offline booth app for Synth-Snake

**Status:** draft for review
**Date:** 2026-08-08
**Author:** Andy Lapteff
**Target event:** AutoCon 6, November 2026

## Context

Synth-Snake is a single self-contained HTML file. It runs a Nokia-branded snake game on a
canvas, synthesizes its own soundtrack with the Web Audio API, and keeps a top-ten leaderboard
in `localStorage`. It was built for a conference booth, driven by a keyboard or a 3-button USB
gamepad.

The original question was how to make it run on mobile. Testing on the actual target device
answered that: it already does. On an iPad running Chrome at full screen, served over HTTPS
from GitHub Pages, the game starts, steers with the arrow keys, plays sound, and lays out
correctly with nothing clipped.

Two things did not work, and both turned out to be delivery problems rather than game problems.
Opening a copy downloaded from GitHub fails because iOS serves local files through Quick Look,
which does not run JavaScript, and Safari blocks `localStorage` on `file://` URLs. Opening the
hosted link inside another app's in-app browser slices the leaderboard panel off the right edge,
because the layout puts a fixed 172px panel beside the board in a flex row and `body` is set to
`overflow:hidden`. Neither affects the booth setup, which is a full-screen browser on one iPad.

What remains is a single risk. The game loads from GitHub's servers, and conference hall wifi
is unreliable. If the network is saturated during AutoCon 6, the demo does not load.

## Goal

The game launches and plays on Andy's iPad with no network connection, from a home screen icon,
with no browser chrome visible.

## Non-goals

These were considered and explicitly ruled out.

- **Touch input.** Visitors will play on Andy's iPad using its attached keyboard, so touch is not
  needed for AutoCon 6. Deferred to a follow-up spec, not ruled out. Decided 2026-08-08.
- **Phone support (iPhone and Android).** Without touch input a phone has no way to start or
  steer the game, so this follows the item above and lands in the same follow-up spec.
- **Responsive layout for narrow viewports.** The in-app browser clipping is real but does not
  affect a full-screen home screen app. Belongs with the phone work, since the same breakpoint
  solves both.
- **Audio work.** Verified working on the target device. No changes needed.
- **Gameplay, level design, difficulty, or visual changes.** Out of scope entirely.

## Requirements

Each requirement is written so it can be verified by observation, not by reading code.

1. Adding the page to the iPad home screen produces an icon with the game's name and artwork.
2. Launching from that icon opens the game full screen with no address bar, tab bar, or browser
   toolbar visible.
3. With the iPad in airplane mode, launching from the icon loads and plays a complete game:
   title screen, steering, sound, scoring, game over, initials entry, leaderboard.
4. The leaderboard persists across launches and survives the device being restarted.
5. The game continues to work in a normal browser tab at its URL, unchanged from today.
6. A short URL (`/Synth-Snake/`) serves the game, without a filename in the path.
7. Requirement 3 still holds after the app has sat unopened on the iPad for at least four weeks.

Requirement 7 is the one that matters and the one most likely to fail. It is stated separately
from requirement 3 on purpose.

## Design

Four new files and a small addition to the head of the game page. No changes to game logic.

**`index.html`** — the game, renamed from its current filename so the URL is clean and the
service worker scope is unambiguous. Which of the existing candidates becomes `index.html` is an
open question, below.

**`manifest.json`** — declares `name`, `short_name`, `start_url`, `display: "standalone"`,
`orientation: "landscape"`, `background_color`, `theme_color`, and icon entries. `display:
standalone` is what removes the browser chrome in requirement 2.

**`sw.js`** — a service worker that caches the full file list on install and serves cache-first
on fetch, falling back to the network. The cache list is four entries, because the game has zero
external references: no CDN scripts, no web fonts, no image files, no audio files. The
soundtrack is generated in code by the Web Audio API rather than loaded, which is unusually
favorable here. A versioned cache name lets a future deploy replace the old cache cleanly.

**Icons** — a 180x180 PNG for `apple-touch-icon` and 192x192 and 512x512 PNGs for the manifest.

**Head additions to `index.html`** — a `<link rel="manifest">`, a `<link rel="apple-touch-icon">`,
`<meta name="apple-mobile-web-app-capable" content="yes">`, a status bar style meta, and a small
inline script that registers the service worker. iOS reads both the manifest and its own legacy
meta tags depending on version, so both are present deliberately rather than redundantly.

HTTPS is a hard prerequisite for service workers and GitHub Pages already provides it.

### Why not a native app or a local server

An iOS app would need an Apple developer account, a build toolchain, and provisioning for a
game that is 1,600 lines of HTML. Running a laptop as a local web server at the booth adds a
second machine, a network to configure, and a new failure mode on the morning of the event. The
home screen app needs no additional hardware and no setup on the day.

## Verification

Automated where it is worth automating, manual where the thing being tested is iOS behavior that
cannot be simulated.

**Automated (Playwright, run by GitHub Actions on push):**

- The service worker registers successfully and reaches the `activated` state.
- After first load, every file in the cache list is present in the named cache.
- With the network blocked at the browser level, a reload still serves the game and the canvas
  renders.
- `manifest.json` parses as valid JSON and contains the required fields.
- The game still boots and reaches a playable state at `/`, guarding against the rename breaking
  anything.

**Manual, on the target iPad:**

- Add to home screen, confirm the icon and name.
- Launch from the icon, confirm no browser chrome.
- Airplane mode, launch, play a full game to a leaderboard entry.
- Restart the iPad, confirm the leaderboard survived.

**The four-week test (requirement 7):**

Install the app in early September, leave it untouched, then in October put the iPad in airplane
mode and launch it. iOS purges cached website data aggressively, and Apple has stated that apps
added to the home screen are exempt from the seven-day cap that applies in Safari. That exemption
is the assumption this whole design rests on, and it should be proven on the real device rather
than trusted, with time left to change course.

If it fails, the fallback options are a laptop serving the file over a local network at the
booth, or a native wrapper. Both are worse. Finding out in October leaves room to pick one.

Independent of the outcome, the standing instruction for the event is to open the app once on
hotel wifi the night before. It takes seconds and re-primes the cache.

## Risks

**iOS evicts the cache despite the home screen exemption.** Covered by the four-week test above.
This is the only risk that can sink the goal.

**The iPad is not in airplane mode but is on a saturated network.** A cache-first service worker
serves from cache without waiting on the network, so a slow network behaves the same as no
network. This is the reason for cache-first rather than network-first.

**A stale cache serves an old build after a future change.** Handled by versioning the cache name
and cleaning up old caches on activate. Low impact, since the game is unlikely to change before
November.

## Open questions

**Which file is canonical?** The repository contains twelve near-identical HTML files: `v1`
through `v10`, plus `_Final` and `_Modified`. `_Final` and `_Modified` differ by roughly twenty
lines of gamepad button and axis mapping, and neither is obviously newer. This spec assumes
`_Modified`, on the reasoning that it looks like later tuning for a specific USB pad, but Colin
should confirm before the rename. Whether the other eleven can be archived is worth asking at
the same time.

## Delivery

Work happens on a branch in a fork of `cdoyle-pdx/Synth-Snake` and reaches Colin as a pull
request. The changes are additive: four new files, a rename, and a handful of lines in the head.
Nothing in the game logic is touched, which should make the PR quick to read.
