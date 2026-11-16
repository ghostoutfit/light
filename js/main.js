// ═══════════════════════════════════════════════════════════════════════════
//  LIGHT SOURCES AND DETECTORS  —  start-up: builds the page and draws it
// ═══════════════════════════════════════════════════════════════════════════
//  The user drags light/heat sources onto a lab bench, then points a camera
//  "detector" at them to see how each looks in Infrared, Visible, Ultraviolet,
//  X-Ray, or plain Camera mode. See README.md for the map of the other files.
//
//  All state is in state.js. Whatever changes it calls rerender(), which runs
//  render() below: each part of the page brings itself up to date.
//  Type "dev" to toggle hidden tuning sliders; type a secret word to unlock the Sun.
// ═══════════════════════════════════════════════════════════════════════════

import { h } from './dom.js';
import { BENCH_TOP } from './detectorGeometry.js';
import { state, setRenderer } from './state.js';
import { onMove, onUp, ghost, renderGhost } from './pointer.js';
import { makeParts, renderParts } from './ui/parts.js';
import { renderBench } from './ui/bench.js';
import { detector, renderDetector } from './ui/detector.js';
import './keys.js';

// ── Page: the lab bench (top), the detector, and the drag ghost ──
const bench = h('div', { id: 'bench', class: 'bench', style: { marginTop: BENCH_TOP } },
  h('img', { src: 'images/Table.PNG', class: 'table', draggable: false }),
  makeParts());
const app = h('div', { id: 'app',
    onPointerMove: onMove,
    onPointerUp: onUp,
    onPointerDown: () => { state.selected = null; render(); } },   // a press on anything that doesn't select deselects
  bench, detector.mark, ghost.mark);
document.body.append(app);

// A render can trigger another (removing a focused slider fires its blur handler);
// that one waits until this one finishes.
let rendering = false, again = false;
function render() {
  if (rendering) { again = true; return; }
  rendering = true;
  do {
    again = false;
    app.style.cursor = state.viewerDrag ? 'grabbing' : '';
    renderParts();
    renderBench(bench);
    renderDetector();
    renderGhost();
  } while (again);
  rendering = false;
}

setRenderer(render);
render();
