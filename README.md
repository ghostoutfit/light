# Light Sources and Detectors

An interactive optics lab built with React + Vite + Tailwind. The user drags
light and heat sources (radiator, filament bulb, LED, X-ray tube, the Sun…) onto
a bench, then points a camera **detector** at them and switches between Infrared,
Visible, Ultraviolet, X-Ray, and plain Camera views to see how each source looks
in that slice of the spectrum.

- **Run it:** `npm run dev` (Vite dev server). **Build:** `npm run build`.
- **Code:** `src/` — start with the file map below. (Entry point `src/main.jsx`
  just mounts `App`.)

## The one physics idea

Every source emits a **spectrum** — a curve of brightness vs. light frequency,
modeled here as a lopsided bell curve. Two functions carry the whole app:
`spectralEmission()` gives the curve's height at one frequency, and
`bandIntensity()` adds up how much of the curve falls inside a given camera band
(IR, Visible, etc.). That one intensity number decides how bright a source's
glow is drawn. The glow itself is just blurred copies of the source's image,
stacked and faded in proportion to the intensity.

## File map — `src/`

```
src/
  main.jsx              mounts App
  App.jsx               all state, drag-and-drop handling, page layout
  physics.js            the spectrum model, frequency axis, spectrum → colour
  bands.js              the four camera bands: ranges, colours, labels
  glow.jsx              glow palettes and the shared glow drawing helpers
  detectorGeometry.js   where the screen and buttons sit on the detector art
  sources/
    index.js            the catalogue: list of sources, defaults, new-item factory
    radiator.jsx  range.jsx  bulb.jsx  gel.jsx
    led.jsx  remote.jsx  xray.jsx  sun.jsx      one file per source
  components/
    PartsPanel.jsx      the source boxes at top left (drag or click to place)
    BenchItem.jsx       one placed source: image, naked-eye glow, power slider
    DevControls.jsx     the hidden tuning sliders under a bench item
    Detector.jsx        the camera: screen, overlays, band buttons
    EmissionShape.jsx   picks a source's glow for the selected band
    EmissionGraph.jsx   the little spectrum graph
```

### Where do I change…?

| To change… | Open |
|---|---|
| How one source looks, its power range, temperature, images | `sources/<name>.jsx` — everything about a source is in its file |
| Add a source | Copy the closest `sources/*.jsx`, add images to `public/images/`, list it in `sources/index.js` |
| The physics (emission curve, band totals) | `physics.js` |
| A band's colours or labels | `bands.js` |
| A glow palette, or a glow several sources share | `glow.jsx` |
| The detector's screen, buttons, readouts | `components/Detector.jsx` (positions in `detectorGeometry.js`) |
| Dragging, placing, removing | `App.jsx` |

### How a source file works

Each file in `sources/` exports one record. `sources/index.js` lists the fields
and fills in defaults for any a source leaves out. The two that draw:

- **`detector`** — one function per band (`IR`, `Visible`, `UV`, `XRay`) that
  draws the source on the detector screen. A missing band means the source is
  invisible in it (the TV remote only has `IR`).
- **`bench`** (and the Sun's `benchBehind`) — the naked-eye glow on the bench.

Sources whose glow follows the common pattern reuse a helper from `glow.jsx`
(`irGlow`, `visibleGlow`, `cameraGlow`, `benchGlow`); special ones (the bulb's
separate filament, the UV LED's dots, the Sun) draw their own in their file.
Either way, the brightness comes from `physics.js`: `itemIntensity()` says how
much of the source's light falls in the band, and the glow fades in palette
layers as that number rises.

## Dev tools

- Type **`dev`** anywhere to toggle hidden per-source tuning sliders (peak, width,
  skew, glow offsets, and per-layer controls).
- Type a secret word (e.g. **`the sun`**) to unlock the Sun source.
