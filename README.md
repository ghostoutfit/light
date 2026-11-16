# Light Sources and Detectors

An interactive optics lab. The user drags light and heat sources (radiator,
filament bulb, LED, X-ray tube, the Sun…) onto a bench, then points a camera
**detector** at them and switches between Infrared, Visible, Ultraviolet, X-Ray,
and plain Camera views to see how each source looks in that slice of the spectrum.

No build step and no dependencies: HTML, CSS, and plain JavaScript modules.

## Contents

- [Run it](#run-it)
- [The one physics idea](#the-one-physics-idea)
- [What's in the folder](#whats-in-the-folder)
- [How the page works](#how-the-page-works)
- [Where do I change…?](#where-do-i-change)
- [How a source file works](#how-a-source-file-works)
- [Dev tools](#dev-tools)
- [Checking a change](#checking-a-change)

## Run it

The JavaScript is split into **modules** (files that `import` from each other).
Browsers only load modules from a web server, so double-clicking `index.html`
shows a blank page. From this folder, run:

```
python3 -m http.server 8601
```

then open <http://localhost:8601>. Edit a file and reload the page to see the change.

Pushing to `main` publishes the site to GitHub Pages automatically
(`.github/workflows/deploy.yml`).

## The one physics idea

Every source emits a **spectrum** — a curve of brightness vs. light frequency,
modeled here as a lopsided bell curve. Two functions carry the whole app:
`spectralEmission()` gives the curve's height at one frequency, and
`bandIntensity()` adds up how much of the curve falls inside a given camera band
(IR, Visible, etc.). That one intensity number decides how bright a source's
glow is drawn. The glow itself is just blurred copies of the source's image,
stacked and faded in proportion to the intensity.

## What's in the folder

```
index.html            the page (it loads style.css and js/main.js)
style.css             page reset and shared classes; most styling is inline in js/
images/               source pictures, their glow masks, the detector and the table
js/
  main.js             start-up: builds the page, runs render() after every change
  state.js            all state, and the actions that change items and selection
  dom.js              h() to build elements, setStyle(), setText(), spot()
  pointer.js          dragging and dropping sources, click-to-place, the drag ghost
  keys.js             arrow keys, Delete, Esc, and the typed words ("dev", the secret)
  physics.js          the spectrum model, frequency axis, spectrum → colour
  bands.js            the four camera bands: colours, labels, Hz ranges
  glow.js             glow palettes and the shared glow drawing helpers
  detectorGeometry.js where the screen and buttons sit on the detector art
  sources/
    index.js          the catalogue: list of sources, defaults, new-item factory
    radiator.js  range.js  bulb.js  gel.js
    led.js  remote.js  xray.js  sun.js       one file per source
  ui/
    parts.js          the source boxes at top left (drag or click to place)
    bench.js          each placed source: image, naked-eye glow, power slider
    devControls.js    the hidden tuning sliders under a bench item
    detector.js       the camera: screen, overlays, band buttons
    emissionShape.js  picks a source's glow for the selected band
    emissionGraph.js  the little spectrum graph
    closeButton.js    the round red ×
```

## How the page works

**One state object.** Everything the app remembers — the placed sources, the
selected band, what's being dragged, which toggles are on — is in `state` in
`state.js`. Any module may change it; after a change it calls `rerender()`.

**One render.** `render()` in `main.js` asks each part of the page to bring itself
up to date: `renderParts()`, `renderBench()`, `renderDetector()`, `renderGhost()`.
Each part builds its elements once and then only updates them (a style, a slider
value, some text), so a slider being dragged or holding the keyboard is never
disturbed. Glows are redrawn only when the source's settings or the band change.

**Parts that come and go** (the detector itself, its reticle, graph and TEMP
readout, a source's panel while it's dragged, the ✓ marks, Clear All…) sit in a
`spot()` (`dom.js`): built fresh each time they appear, removed when they don't.

**Building elements.** `h(tag, props, ...children)` makes an element in one call:
`h('img', { src, style: { position: 'absolute', top: 4 } })`. Style names are
camelCase, plain numbers get `px`, and `null` / `false` children are skipped, so
`cond && h(...)` works.

## Where do I change…?

| To change… | Open |
|---|---|
| How one source looks, its power range, temperature, images | `js/sources/<name>.js` — everything about a source is in its file |
| Add a source | Copy the closest `js/sources/*.js`, add images to `images/`, list it in `js/sources/index.js` |
| The physics (emission curve, band totals) | `js/physics.js` |
| A band's colours, labels, or Hz range | `js/bands.js` |
| A glow palette, or a glow several sources share | `js/glow.js` |
| The detector's screen, buttons, readouts | `js/ui/detector.js` (positions in `js/detectorGeometry.js`) |
| The parts panel | `js/ui/parts.js` |
| A source's power slider or bench panel | `js/ui/bench.js` |
| Dragging, placing, removing | `js/pointer.js` |
| What the keys do | `js/keys.js` |

## How a source file works

Each file in `js/sources/` exports one record. `sources/index.js` lists the fields
and fills in defaults for any a source leaves out. The two that draw:

- **`detector`** — one function per band (`IR`, `Visible`, `UV`, `XRay`) that
  returns the source's glow on the detector screen (made with `h()`). A missing
  band means the source is invisible in it (the TV remote only has `IR`).
- **`bench`** (and the Sun's `benchBehind`) — the naked-eye glow on the bench.

Sources whose glow follows the common pattern reuse a helper from `glow.js`
(`irGlow`, `visibleGlow`, `cameraGlow`, `benchGlow`); special ones (the bulb's
separate filament, the UV LED's dots, the Sun) draw their own in their file.
Either way, the brightness comes from `physics.js`: `itemIntensity()` says how
much of the source's light falls in the band, and the glow fades in palette
layers as that number rises.

## Dev tools

- Type **`dev`** anywhere to toggle hidden per-source tuning sliders (peak, width,
  skew, glow offsets, and per-layer controls).
- Type a secret word (e.g. **`the sun`**) to unlock the Sun source.

## Checking a change

There are no automated tests. After a change, run the server and check:

- the browser console (F12) shows no errors;
- each source on the bench at a few power levels, and through the detector in
  every band and in CAM;
- GRAPHS and TEMP on the detector;
- drag a source on, move it, drag it back to remove it; click-to-place;
- select a source or the detector and move it with the arrow keys; Delete, Esc, and
  both × buttons; the power slider's arrow keys;
- `dev` mode's sliders.
