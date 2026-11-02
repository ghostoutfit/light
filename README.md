# Light Sources and Detectors

An interactive optics lab built with React + Vite + Tailwind. The user drags
light and heat sources (radiator, filament bulb, LED, X-ray tube, the Sun…) onto
a bench, then points a camera **detector** at them and switches between Infrared,
Visible, Ultraviolet, X-Ray, and plain Camera views to see how each source looks
in that slice of the spectrum.

- **Run it:** `npm run dev` (Vite dev server). **Build:** `npm run build`.
- **Live source file:** `src/light-sources.jsx` — this is the whole app.
  (Entry point `src/main.jsx` just mounts it.)

> ⚠️ There are stale copies at `light-sources.jsx` (repo root) and
> `v1/light-sources.jsx` that are **not** imported anywhere. Ignore them — only
> `src/light-sources.jsx` is live.

## The one physics idea

Every source emits a **spectrum** — a curve of brightness vs. light frequency,
modeled here as a lopsided bell curve. Two functions carry the whole app:
`spectralEmission()` gives the curve's height at one frequency, and
`bandIntensity()` adds up how much of the curve falls inside a given camera band
(IR, Visible, etc.). That one intensity number decides how bright a source's
glow is drawn. The glow itself is just blurred copies of the source's image,
stacked and faded in proportion to the intensity.

## Code map — `src/light-sources.jsx`

Line numbers are approximate (they drift as the file is edited); the banner
comments (`// ── … ──`) in the file are the real landmarks.

**1–33 · Overview comment.** A header block explaining the app and the file
layout — the written tour.

**35–105 · Physics & math helpers.** The core math: `spectralEmission` (47) draws
one source's emission curve, and `bandIntensity` (74) measures how much of that
curve lands inside a camera band — the number that drives every glow. (`erf` and
`clamp` are small math utilities they depend on.)

**107–156 · Per-source slider config.** `SLIDER_CFG` (107) holds each source
type's spectrum settings — where its curve peaks, how wide it is, and its "skew"
(how lopsided). "Peak" and "width" are given in Hz (frequency).

**158–193 · Spectrum → colour.** Turns a spectrum into an on-screen color for the
naked-eye view: `cieCmf` (158) is the standard human-eye color-sensitivity data,
and `spectrumToRgb` (173) blends the source's emission through it to get an RGB
glow color.

**195–220 · Glow scaling & palettes.** `thermalScale` (195) converts an intensity
into a glow strength. `THERMAL` (200) and `VIS_LAYERS` (212) are the stacks of
blur-and-brightness "layers" that build up a realistic multi-step glow.

**222–345 · Data catalogs.** The fixed reference tables: `SOURCES` (222) lists
every device (its images, real-world size, and group) and `BANDS` (287) lists the
camera's four frequency bands (IR / Visible / UV / X-Ray) with their colors.
Below them are the frequency-axis bounds and Hz↔position helpers (319) used by
the spectrum graph and scale bar.

**332–356 · Temperature display.** `itemTemp` (348) estimates a source's surface
temperature from its power setting, for the detector's TEMP readout.

**358–782 · `EmissionShape` (component).** A "component" is a reusable piece of UI.
This is the biggest one: given a source, a camera band, and an intensity, it
paints that source's glow **as seen through the detector**. Most of its length is
per-source, per-band special-casing (the bulb's filament, the gel lamp's dots,
the X-ray reflector, the Sun's corona…).

**786–897 · `NaturalView` (component).** The naked-eye glow — how a source looks in
real life (used in the detector's plain Camera mode and on the bench).

**900–987 · `EmissionGraph` (component).** The little spectrum graph (an SVG curve)
that floats near a source, showing its emission across the four bands.

**990–1005 · `DevSlider` (component).** One reusable labeled slider for the hidden
dev-tuning panel.

**1008–2380 · `App` (component).** The whole interactive app. It holds all the
state and passes it down to the components above. Broken into:

- **1009 · State.** The React "state" — the data that changes as you interact
  (the placed sources, the current drag, the selected band, the mode toggles).
  A keyboard listener here unlocks dev mode (type "dev") and the secret Sun.
- **~1040–1140 · Layout constants & derived values.** Fixed geometry for the
  detector image and buttons, the `dev` tuning bundle (1075), and `bandRanges` —
  the four bands recomputed whenever the user drags a divider.
- **1156 · Handlers: place & drag sources.** Functions that add a source to the
  bench and begin dragging one (a "handler" is a function that runs in response
  to a user action like a click or drag).
- **1280 · Pointer move / up.** Finishes drags: moving the detector, sliding a
  band divider, repositioning a source, or dropping one back to remove it.
- **1394 · Render — Lab Bench (top half).** The JSX that draws the table, the
  parts panel of draggable sources, and each placed source with its power/tuning
  sliders and glow overlays.
- **1907 · Render — Detector (camera viewer).** The draggable camera: its screen,
  the GRAPHS / TEMP / ON labels, the targeting reticle, the live spectrum view
  (via `EmissionShape`), and the band-selector buttons.

## Dev tools

- Type **`dev`** anywhere to toggle hidden per-source tuning sliders (peak, width,
  skew, glow offsets, and per-layer controls).
- Type a secret word (e.g. **`the sun`**) to unlock the Sun source.
