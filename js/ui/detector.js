// ── Detector ──────────────────────────────────────────────────
// The draggable camera: its screen (band heading, targeting reticle, each source's
// glow via emissionShape, the GRAPHS and TEMP overlays), the GRAPHS / TEMP / ON
// buttons on its face, and the band-selector buttons down its right side.
// Positions on the artwork are in detectorGeometry.js.
//
// It's built fresh each time it's shown (makeDetector) and updated in place while it
// shows (renderDetector); its parts that come and go (reticle, graph, TEMP readout,
// selection outline…) sit in spots (dom.js). Each source's glow on the screen is
// redrawn only when that source or the band changes.
import { h, setStyle, setText, spot } from '../dom.js';
import { itemIntensity } from '../physics.js';
import { BANDS } from '../bands.js';
import { itemTemp } from '../sources/index.js';
import { VIEWER_W, VIEWER_H, SCREEN_L, SCREEN_T, SCREEN_W, SCREEN_H, BENCH_TOP,
         BTN_CX, BTN_R, BTN_CYS, overlapsScreen, viewOverlap } from '../detectorGeometry.js';
import { state, rerender, select, bandById } from '../state.js';
import { emissionShape } from './emissionShape.js';
import { emissionGraph } from './emissionGraph.js';
import { closeButton } from './closeButton.js';

const MONO = '"Courier New", Courier, monospace';
const SCANLINES = alpha => `repeating-linear-gradient(transparent, transparent 2px, rgba(0,0,0,${alpha}) 2px, rgba(0,0,0,${alpha}) 3px)`;
// CRT text glow, and the glow around a lit button on the detector's face
const textGlow   = c => [`0 0 2px ${c}`, `0 0 8px ${c}dd`, `0 0 18px ${c}88`, `0 0 35px ${c}44`].join(', ');
const buttonGlow = c => [`0 0 12px 6px ${c}D9`, `0 0 30px 12px ${c}94`, `0 0 60px 20px ${c}62`].join(', ');
const LIT_TEXT = 'brightness(1.3) contrast(1.1)';

const toggle = key => () => { state[key] = !state[key]; rerender(); };

export const detector = spot();   // main.js puts detector.mark in the page
let el;   // the showing detector's elements, for renderDetector()

function makeDetector() {
  el = { titleLines: spot(), reticle: spot(), spectrum: spot(), graph: spot(), temp: spot(),
         outline: spot(), close: spot() };
  const crtLabel = (text, extra) => h('span', { style: {
    fontFamily: MONO, fontSize: 22, fontWeight: 'bold', letterSpacing: '0.08em', userSelect: 'none', ...extra } }, text);

  // ── Screen — behind the viewer image, visible through its transparent center ──
  el.graphsText = crtLabel('GRAPHS', { lineHeight: 1.0, textAlign: 'left', display: 'block' });
  el.tempText   = crtLabel('TEMP',   { lineHeight: 1.0, textAlign: 'left', display: 'block',
    color: '#4e44ff' });  // off = same colour without the glow (any dimmer fails contrast on black)
  el.title = h('span', { style: { fontFamily: MONO, fontSize: 26, fontWeight: 'bold', letterSpacing: '0.18em',
    userSelect: 'none', display: 'block', filter: LIT_TEXT } });
  el.screen = h('div', { style: { position: 'absolute', left: SCREEN_L, top: SCREEN_T,
      width: SCREEN_W, height: SCREEN_H, overflow: 'hidden', zIndex: 1 } },
    h('div', { style: { position: 'absolute', left: 30, top: '50%', transform: 'translateY(calc(-50% - 101px))',
      zIndex: 20, pointerEvents: 'auto', cursor: 'pointer' }, onClick: toggle('showGraphs') }, el.graphsText),
    // TEMP label — 77px below GRAPHS
    h('div', { style: { position: 'absolute', left: 29, top: '50%', transform: 'translateY(calc(-50% - 24px))',
      zIndex: 20, pointerEvents: 'auto', cursor: 'pointer' }, onClick: toggle('showTemp') }, el.tempText),
    // CRT scanlines
    h('div', { style: { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5,
      backgroundImage: SCANLINES(0.18), backgroundSize: '100% 3px' } }),
    // Mode title — always shown, including CAMERA MODE
    h('div', { style: { position: 'absolute', top: 35, left: 0, right: 0, display: 'flex', justifyContent: 'center',
        pointerEvents: 'none', zIndex: 10 } },
      h('div', { style: { position: 'relative', display: 'inline-block' } }, el.title, el.titleLines.mark)),
    el.reticle.mark, el.spectrum.mark, el.graph.mark, el.temp.mark);

  // ── Face buttons: GRAPHS, TEMP, and power (lit while on; click to hide the detector) ──
  const faceButton = (left, top, width, onClick) => h('div', { style: { position: 'absolute', left, top, width,
    height: 32, borderRadius: 6, zIndex: 3, pointerEvents: 'auto', cursor: 'pointer',
    transition: 'background 0.15s, box-shadow 0.15s' }, onClick });
  el.graphsBtn = faceButton(46, 190, 35, toggle('showGraphs'));
  el.tempBtn   = faceButton(45, 267, 36, toggle('showTemp'));     // 77px below GRAPHS
  el.powerBtn  = faceButton(47, 343, 36, toggle('showDetector'));
  el.onText = crtLabel('ON');
  const onLabel = h('div', { style: { position: 'absolute', left: SCREEN_L + 29, top: 346, zIndex: 3,
    pointerEvents: 'auto', cursor: 'pointer', display: 'flex', alignItems: 'center', height: 32 },
    onClick: toggle('showDetector') }, el.onText);

  // ── Band selector buttons + labels, and CAM (Camera mode) below X-RAY ──
  const labelRight = VIEWER_W - (BTN_CX - BTN_R - 6);
  const bandButton = (i, onClick) => {
    const text = crtLabel(null, { transition: 'color 0.12s, text-shadow 0.12s', display: 'block' });
    const hit = h('div', { style: {     // 2px smaller radius than the artwork's button, glows when active
      position: 'absolute', left: BTN_CX - BTN_R + 2, top: BTN_CYS[i] - BTN_R + 2,
      width: BTN_R * 2 - 4, height: BTN_R * 2 - 4, borderRadius: '50%',
      cursor: 'pointer', zIndex: 10, transition: 'background 0.15s, box-shadow 0.15s' },
      onPointerDown: e => e.stopPropagation(), onClick });
    const node = h('div', null,
      // Label — right-justified, CRT screen look
      h('div', { style: { position: 'absolute', right: labelRight + 15, width: 90, textAlign: 'right',
        top: BTN_CYS[i] - 13, zIndex: 10, pointerEvents: 'none', userSelect: 'none' } }, text),
      hit);
    return { node, text, hit };
  };
  el.bands = BANDS.map((b, i) => {
    const btn = bandButton(i, () => { state.photoMode = false; state.selectedBand = b.id; rerender(); });
    btn.text.textContent = b.short;
    return { band: b, ...btn };
  });
  el.cam = bandButton(4, toggle('photoMode'));
  el.cam.text.textContent = 'CAM';

  el.root = h('div', { style: { position: 'fixed', width: VIEWER_W, height: VIEWER_H, zIndex: 60, touchAction: 'none' },
      onPointerDown: e => {
        e.stopPropagation();   // a press here selects the detector, even over a source behind it
        state.viewerDrag = { ox: e.clientX - state.viewerPos.x, oy: e.clientY - state.viewerPos.y };
        select({ kind: 'detector' });
      } },
    el.outline.mark, el.close.mark, el.screen,
    el.graphsBtn, el.tempBtn, el.powerBtn, onLabel,
    // Device image — on top, transparent center reveals the screen behind
    h('img', { src: 'images/viewer.png', draggable: false, style: { position: 'absolute', inset: 0,
      width: VIEWER_W, height: VIEWER_H, userSelect: 'none', pointerEvents: 'none', zIndex: 2 } }),
    el.bands.map(b => b.node), el.cam.node);
  return el.root;
}

// ── The parts that come and go, each built fresh when it appears ──

// Scanlines over the title — not in Camera mode (transparent screen)
const makeTitleLines = () => h('div', { style: { position: 'absolute', inset: 0, pointerEvents: 'none',
  backgroundImage: SCANLINES(0.22), backgroundSize: '100% 3px' } });

// Targeting reticle — shown when no source is in view
const makeReticle = () => h('div', { style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 8 } },
  reticleSvg(),
  h('span', { style: { marginTop: 10, fontSize: 13, fontWeight: 600, letterSpacing: '0.18em',
    color: '#9df85c', textShadow: '0 0 8px #9df85c88', textTransform: 'uppercase', userSelect: 'none' } },
    state.items.length === 0 ? 'No Source' : 'Out of View'));

// Each source's glow, in bench coordinates (shifted so the screen shows the right patch)
const makeSpectrum = () => { el.glows = new Map();   /* item id → { key, node } */ return h('div', { style: { position: 'absolute' } }); };

// Graph overlay — below the mode title
const makeGraph = () => { el.graphKey = null; return h('div', { style: { position: 'absolute', top: 72,
  paddingTop: 35,   // offsets emissionGraph's internal marginTop: -35 so the background fills correctly
  pointerEvents: 'none', zIndex: 15 } }); };

// TEMP readout — the hottest source properly in view
const makeTemp = () => h('div', { style: { position: 'absolute', left: 30, bottom: 40, pointerEvents: 'none', zIndex: 15 } },
  h('span', { style: { fontFamily: MONO, fontSize: 20, fontWeight: 'bold', letterSpacing: '0.08em', color: '#4e44ff',
    textShadow: textGlow('#4e44ff'), filter: LIT_TEXT, userSelect: 'none' } }));

// Selected (the arrow keys move it): dashed outline fitted to the artwork, with a × that hides it
const makeOutline = () => h('div', { style: { position: 'absolute', left: 1, right: 1, top: 26, bottom: 46,
  border: '2px dashed rgba(255,255,255,0.8)', borderRadius: 24, pointerEvents: 'none', zIndex: 4 } });
const makeClose = () => closeButton({ label: 'Hide detector',
  onClick: () => { state.showDetector = false; state.selected = null; rerender(); },
  style: { position: 'absolute', top: 26 - 8, right: 1 - 8, zIndex: 11 } });

function reticleSvg() {
  const G = { stroke: '#9df85c', 'stroke-width': 1.5 };
  const corner = d => h('path', { d, ...G, fill: 'none' });
  return h('svg', { width: 110, height: 110, style: { opacity: 0.65 } },
    h('circle', { cx: 55, cy: 55, r: 46, fill: 'none', ...G, 'stroke-dasharray': '4 5' }),
    h('circle', { cx: 55, cy: 55, r: 7, fill: 'none', ...G }),
    h('line', { x1: 55, y1: 9,  x2: 55,  y2: 46,  ...G }),
    h('line', { x1: 55, y1: 64, x2: 55,  y2: 101, ...G }),
    h('line', { x1: 9,  y1: 55, x2: 46,  y2: 55,  ...G }),
    h('line', { x1: 64, y1: 55, x2: 101, y2: 55,  ...G }),
    corner('M 18,18 L 18,28 M 18,18 L 28,18'),
    corner('M 92,18 L 92,28 M 92,18 L 82,18'),
    corner('M 18,92 L 18,82 M 18,92 L 28,92'),
    corner('M 92,92 L 92,82 M 92,92 L 82,92'));
}

// Which source's graph the detector shows: keep the current one while it's still
// properly in view, else the one filling the most of the screen.
function pickGraphItem() {
  const { items, viewerPos } = state;
  if ((!state.showGraphs && !state.showTemp) || !state.showDetector || items.length === 0) return null;
  const qualifying = items.map(it => ({ id: it.id, overlap: viewOverlap(it, viewerPos) })).filter(q => q.overlap);
  if (qualifying.length === 0) return null;
  if (qualifying.some(q => q.id === state.graphItemId)) return state.graphItemId;
  return qualifying.reduce((a, b) => a.overlap > b.overlap ? a : b).id;
}

// The hottest source properly in view (°C), or null.
function tempInView() {
  let temp = null;
  for (const it of state.items) {
    if (!viewOverlap(it, state.viewerPos)) continue;
    const t = itemTemp(it);
    if (t != null && (temp === null || t > temp)) temp = t;
  }
  return temp;
}

export function renderDetector() {
  const { items, viewerPos: vp, photoMode, showGraphs, showTemp, selectedBand } = state;
  state.graphItemId = pickGraphItem();
  if (!detector.set(state.showDetector, makeDetector)) return;
  const band = bandById(selectedBand);
  const anyItemInView = items.some(item => overlapsScreen(item, vp));

  setStyle(el.root, { left: vp.x, top: vp.y, cursor: state.viewerDrag ? 'grabbing' : 'grab' });
  const selected = state.selected?.kind === 'detector';
  el.outline.set(selected, makeOutline);
  el.close.set(selected, makeClose);
  setStyle(el.screen, { background: photoMode ? 'transparent' : '#000' });

  // GRAPHS / TEMP / ON labels and buttons
  setStyle(el.graphsText, { color: showGraphs ? '#fe2b71' : 'rgba(254,43,113,0.8)',
    textShadow: showGraphs ? textGlow('#fe2b71') : 'none', filter: showGraphs ? LIT_TEXT : 'none' });
  setStyle(el.tempText, { textShadow: showTemp ? textGlow('#4e44ff') : 'none', filter: showTemp ? LIT_TEXT : 'none' });
  setStyle(el.onText, { color: '#f24a38', textShadow: textGlow('#f24a38'), filter: LIT_TEXT });   // always on while shown
  const lit = (btn, on, c, border) => setStyle(btn, { background: on ? `${c}80` : 'rgba(0,0,0,0)',
    border: on ? `${border}px solid ${c}` : 'none', boxShadow: on ? buttonGlow(c) : 'none' });
  lit(el.graphsBtn, showGraphs, '#fe2b71', 2);
  lit(el.tempBtn,   showTemp,   '#4e44ff', 2);
  lit(el.powerBtn,  true,       '#f24a38', 1);

  // Mode title
  const title = photoMode ? 'CAMERA MODE' : BANDS.find(b => b.id === selectedBand).title;
  const tc    = photoMode ? '#00ff44'     : BANDS.find(b => b.id === selectedBand).titleColor;
  el.title.textContent = title;
  setStyle(el.title, { color: tc, textShadow: [`0 0 2px ${tc}`, `0 0 8px ${tc}dd`, `0 0 18px ${tc}99`, `0 0 40px ${tc}55`].join(', ') });
  el.titleLines.set(!photoMode, makeTitleLines);

  // Camera mode: the screen is see-through and the bench shows through it, so no glows
  const reticle = el.reticle.set(!photoMode && !anyItemInView, makeReticle);
  if (reticle) reticle.lastChild.textContent = items.length === 0 ? 'No Source' : 'Out of View';
  const spectrum = el.spectrum.set(!photoMode && items.length > 0, makeSpectrum);
  if (spectrum) {
    setStyle(spectrum, { left: -(vp.x + SCREEN_L), top: -(vp.y + SCREEN_T) + BENCH_TOP });
    renderGlows(spectrum, band);
  }

  // Graph overlay
  const graphItem = showGraphs && items.find(it => it.id === state.graphItemId);
  const graph = el.graph.set(!!graphItem, makeGraph);
  if (graph) {
    const gW = Math.round((SCREEN_W - 70) * 0.7);
    setStyle(graph, { left: Math.round((SCREEN_W - gW) / 2), width: gW,
      background: photoMode ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.65)',
      borderBottom: photoMode ? '1px solid rgba(0,0,0,0.15)' : '1px solid rgba(255,255,255,0.12)' });
    const key = JSON.stringify([graphItem, state.devMode, photoMode, selectedBand]);
    if (key !== el.graphKey) {
      el.graphKey = key;
      graph.replaceChildren(emissionGraph({ item: graphItem, width: gW, devMode: state.devMode,
        selectedBand: photoMode ? null : selectedBand, onLight: photoMode }));
    }
  }

  // TEMP readout
  const temp = showTemp ? tempInView() : null;
  const readout = el.temp.set(temp != null, makeTemp);
  if (readout) setText(readout.firstChild, 'TEMP = ', temp, '°C');

  // Band buttons
  const bandLook = ({ text, hit }, active, textColor, shadowColor, glowColor) => {
    setStyle(text, { color: active ? textColor : 'rgba(255,255,255,0.42)',
      textShadow: active ? textGlow(shadowColor) : 'none', filter: active ? LIT_TEXT : 'none' });
    setStyle(hit, { background: active ? `${glowColor}80` : 'rgba(0,0,0,0)',
      transform: active ? 'scale(1)' : 'scale(1.05)', boxShadow: active ? buttonGlow(glowColor) : 'none' });
  };
  for (const b of el.bands) {
    bandLook(b, !photoMode && selectedBand === b.band.id, b.band.labelColor ?? b.band.divColor, b.band.divColor, b.band.glowColor);
  }
  bandLook(el.cam, photoMode, '#9df85c', '#9df85c', '#9df85c');
}

// Each source's glow on the screen — redrawn only when that source or the band changes.
function renderGlows(spectrum, band) {
  const nodes = [];
  const seen = new Set();
  for (const item of state.items) {
    seen.add(item.id);
    const key = JSON.stringify(item) + band.id;
    let g = el.glows.get(item.id);
    if (!g || g.key !== key) {
      g = { key, node: emissionShape(item, band, itemIntensity(item, band)) };
      el.glows.set(item.id, g);
    }
    if (g.node) nodes.push(g.node);
  }
  for (const id of el.glows.keys()) if (!seen.has(id)) el.glows.delete(id);
  const cur = [...spectrum.children];
  if (cur.length !== nodes.length || cur.some((n, i) => n !== nodes[i])) spectrum.replaceChildren(...nodes);
}
