# Touch controls for phones

**Status:** draft for review
**Date:** 2026-08-08
**Author:** Andy Lapteff
**Follows:** `2026-08-08-offline-booth-app-design.md`, which deferred this work

## Context

The offline work is done. `manifest.json` and `sw.js` are device-agnostic, so a phone can already
install the game to its home screen and cache it. An iPhone can add it from Safari; Android
Chrome offers to install it directly. Neither can play it, because the only input paths are
`keydown` and a USB gamepad poll.

So this is not a port. It is one missing capability plus one layout bug.

The layout bug was found early and deferred. `#playRow` is a flex row holding the canvas and a
fixed 172px leaderboard panel, and `body` carries `overflow:hidden`. When the viewport is
narrower than board plus gap plus panel, the panel is sliced off rather than wrapped, with no way
to scroll to it. This is a narrow-viewport bug, not a phone bug. It reproduces in a small desktop
window and in any in-app browser.

### The finding that shapes this design

The game already has a device-independent input abstraction, and it was there before any of this
work started.

```js
function pushDir(d){
  if(G.state==="entry"){ entryNav(d); return; }   // index.html:1239
  if(G.state==="menu"){ menuNav(d); return; }
  // ... otherwise queue a turn
}
```

`pushDir` dispatches a direction by game state: cycle difficulty on the menu, move through
letters on the initials screen, turn the snake in play. `primary()` (index.html:1250) does the
same for confirm: start a game, advance a level, resume from pause, commit an initial.

Every screen in the game is therefore reachable with two intents. Touch has to supply those two
and nothing else. An earlier draft of this work proposed extracting an input abstraction layer;
that was wrong, because one already exists.

Two consequences worth stating, since they remove work a reader might expect to see here:

- **The initials screen needs no touch-specific design.** Swiping up and down changes the letter,
  left and right change the slot, and a tap confirms. That falls out of `pushDir` and `primary`.
- **Audio needs no work.** `primary()` opens with `Music.ensure(); Music.start();`, so the first
  tap is a user gesture that unlocks the AudioContext, which is exactly what iOS requires.

## Goal

The game can be played start to finish on an iPhone or an Android phone using only touch, online
or offline.

## Non-goals

- **On-screen D-pad.** Swipe only. Decided 2026-08-08.
- **Portrait play.** The board is a wide shape, up to 34x24 cells. Portrait shows a rotate prompt.
  Consistent with the same decision made for the iPad.
- **Gameplay, level design, difficulty, or visual changes.**
- **Offline support.** Already shipped and device-agnostic. This spec inherits it.
- **Refactoring the input handling.** `pushDir` and `primary` are the abstraction. Use them.

## Requirements

1. A swipe on the play area turns the snake in the swiped direction.
2. A tap on the play area starts a game, confirms, and advances, matching what Enter does today.
3. Pause and mute are reachable without a keyboard.
4. A full game can be completed on a phone using only touch: choose difficulty, play, die, enter
   three initials, see the leaderboard entry.
5. Swiping and tapping never scroll the page, zoom it, trigger pull-to-refresh, or select text.
6. In portrait, a rotate prompt covers the screen and the game does not run behind it.
7. At any viewport width, no part of the leaderboard, HUD, or board is cut off and unreachable.
8. Keyboard and gamepad play are unchanged on desktop and on the iPad.

Requirement 8 is the one to guard. The booth demo runs on a keyboard iPad and must not regress.

## Design

### Touch input

One block of code near the existing `keydown` handler. It listens on the `#stage` element, which
wraps the canvas and its overlays, so touches on a paused or game-over overlay work too.

On `touchstart` record the position and time. On `touchend` compare against it:

- Movement past a threshold resolves to the dominant axis and calls `pushDir` with the
  corresponding unit vector.
- Movement under the threshold, within a short time, is a tap and calls `primary()`.

The threshold is 24 CSS pixels, chosen to sit above incidental thumb movement during a tap and
well below a deliberate swipe. It is a named constant, not a literal, because it is the one
number likely to need tuning on real hardware.

`pushDir` already rejects reversals and caps its queue at two, so swipe inherits the same input
handling the keyboard gets, including the reversal guard. Nothing about turn logic is duplicated.

Multi-touch is ignored: only the first touch point is tracked, and a gesture involving more than
one finger is discarded rather than guessed at.

### Pause and mute

Two buttons in the existing `#hud` row, always visible, calling `togglePause()` and
`toggleMute()`. They are needed on any device without a keyboard, since P and M are the only ways
to reach those functions today. The mute button reflects state so a muted game is visibly muted.

### Layout

A single breakpoint. Below it, `#playRow` switches from `row` to `column`, so the leaderboard
sits under the board instead of beside it, and the HUD is allowed to wrap. The breakpoint is
expressed in terms of the space the board and panel actually need rather than a device width,
because the failure is about available width, not about being a phone.

`body` keeps `overflow:hidden` for the game, so the page never scrolls under a swipe.

### Rotate prompt

A full-screen overlay shown by a `(orientation: portrait)` media query. It covers the game rather
than pausing it, so no game state logic changes. Rotating the device dismisses it, because the
media query stops matching.

### Viewport hardening

- `touch-action: none` on `#stage`, so swipes do not scroll, pan, or pull-to-refresh.
- `user-scalable=no, maximum-scale=1` on the viewport meta, so double-tap does not zoom and fight
  the tap-to-confirm gesture.
- `100dvh` in place of `height:100%`, so a collapsing browser toolbar does not clip the board.
- Safe-area insets on the HUD and the controls hint, so a notch or home indicator does not cover
  them.

`viewport-fit=cover` is already present from the offline work.

### Controls hint

The hint line under the board currently names only keys and gamepad buttons. It gains a touch
line, shown only when the layout is in its narrow mode.

## Verification

**Automated (Playwright, iPhone device profile, added to the existing suite):**

- A synthesized swipe up on the play area turns the snake up, verified by reading game state
  rather than by looking at pixels.
- A swipe in the direction the snake is already travelling, and a swipe into a reversal, both
  leave direction unchanged.
- A tap on the title screen starts a game.
- A tap and a swipe both leave `window.scrollY` at 0.
- At a phone viewport, the leaderboard's bounding box lies fully inside the viewport. This is the
  regression test for the bug that started this.
- At a desktop viewport, the layout is still side by side and the existing tests still pass.
- Keyboard play still works at a desktop viewport, guarding requirement 8.

**Manual, on real hardware:**

- iPhone, Safari, landscape: install to home screen, play a full game to a leaderboard entry with
  sound.
- iPhone, portrait: rotate prompt appears and the game is not playable behind it.
- Android, Chrome: install, play a full game.
- Kindle Fire, Silk browser: play a full game. Fire OS is a fork of Android and Silk is
  Chromium-based, so no separate code path is expected. What is worth actually checking is
  whether Add to Home Screen produces a real standalone app there, since Fire OS handles that
  less consistently than Chrome does, and whether an older Fire has the horsepower for the
  canvas rendering and the Web Audio synthesis at the same time. If either falls short, the
  browser still plays it, which is enough.
- iPad with keyboard: play a full game with arrow keys, confirming no regression.
- Airplane mode on one phone, confirming offline still holds with the new files cached.

The iPad check is not a formality. It is the booth demo, and it is the thing this work could
plausibly break.

## Risks

**The swipe threshold is wrong on real hardware.** 24px is a considered guess, not a measurement.
Named constant, tuned after the first real-device test.

**Turn latency at speed.** The game ticks as fast as 160ms at high levels. A swipe is inherently
slower to express than a key press, so late-game play may feel worse by touch than by keyboard.
This is a property of swipe input, not a defect, and it is the known cost of ruling out a D-pad.
If it turns out to matter, the D-pad is the fix and it is a small addition on top of this work.

**A regression on the keyboard iPad.** Covered by requirement 8, by an automated test, and by a
manual check before merge.

**Cache invalidation.** Changing the game means bumping `CACHE` in `sw.js`, or devices that
already installed the offline app keep serving the old build. This is the first change since the
service worker shipped, so it is the first time this matters.

## Delivery

A branch in the same fork, and a second pull request to Colin, kept separate from the offline PR
so each can be judged on its own. `nokia-snake_Modified.html` stays untouched.
