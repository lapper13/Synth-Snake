# Synth-Snake

Nokia Snake, booth edition. A single self-contained HTML page: canvas rendering, a synthwave
soundtrack generated at runtime with the Web Audio API, twenty levels, and a local top-ten
leaderboard. No build step, no dependencies, no external assets.

Play it: https://lapper13.github.io/Synth-Snake/

## Controls

Arrow keys or WASD to steer. Enter or Space to start and confirm. P pauses, M mutes, Esc returns
to the title screen. A 3-button USB gamepad with a d-pad also works.

On a touch screen, swipe on the board to steer and tap to start or confirm. Pause and mute are
the two buttons at the top right. Hold the device in landscape.

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
| `nokia-snake_Modified.html` | Work in progress on controller support. |
| `nokia-snakev1.html` ... `nokia-snakev10.html` | Earlier versions, kept for history. |

## Tests

    npm install
    npx playwright install --with-deps chromium
    npx playwright test
