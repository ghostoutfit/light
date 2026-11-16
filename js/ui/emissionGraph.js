// ── Emission graph ────────────────────────────────────────────
// A source's spectrum across the four bands (an SVG curve). Shown on the detector
// screen (GRAPHS) and, in dev mode, floating above each bench item.
import { h } from '../dom.js';
import { spectralEmission, hzToPos, FREQ_MIN, FREQ_MAX, itemIntensity } from '../physics.js';
import { BAND_RANGES } from '../bands.js';
import { SOURCES } from '../sources/index.js';

const GRAPH_SAMPLES = 120;

// Band label colour: the band's colour mixed toward white (dark graph) or black (light
// graph, in Camera mode) so the label stands out from its own tinted band.
function labelFill(hex, onLight) {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255];
  const mix = onLight ? c.map(v => v * 0.45) : c.map(v => v + (255 - v) * 0.9);
  return `rgb(${mix.map(Math.round).join(',')})`;
}

export function emissionGraph({ item, width, devMode, selectedBand, onLight = false }) {
  const H = 53; // 44 × 1.2
  const W = width;
  const Y_MAX = 80;
  const PAD = 4;

  // Per-band capture value
  const captures = BAND_RANGES.map(b => ({ ...b, val: itemIntensity(item, b) }));

  // Per-type visual scale for the graph curve only — does not affect detector output.
  const graphVisScale = SOURCES[item.type].graphScale;

  // CEIL sets full-scale: amplitude=400 peaks at (1/CEIL)^PWR of graph height,
  // giving the power curve room to work rather than always slamming the top.
  const CEIL = 1.25, PWR = 1 / 1.25;
  const pts = [];
  for (let i = 0; i <= GRAPH_SAMPLES; i++) {
    const t = i / GRAPH_SAMPLES;
    const f = FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, t);
    const v = spectralEmission(f, item.peak, item.widthHz, item.skew) * (item.amplitude / 400) * graphVisScale;
    const vScaled = Math.pow(Math.min(v / CEIL, 1), PWR);
    const y = H - PAD - vScaled * (H - PAD * 2);
    pts.push([t * W, Math.max(PAD, y)]);
  }
  const d = 'M' + pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L');
  const x1 = b => hzToPos(b.lo) * W, x2 = b => hzToPos(b.hi) * W;
  const sel = selectedBand && BAND_RANGES.find(b => b.id === selectedBand);

  return h('div', { style: { width: W, marginTop: -35 } },
    // Dev mode: each band's captured intensity above the graph
    devMode && h('div', { style: { display: 'flex', width: W, marginBottom: 1, position: 'relative', zIndex: 10 } },
      captures.map(b => h('div', { style: { width: b.pct + '%', textAlign: 'center' } },
        h('span', { style: { fontSize: 14, fontFamily: 'monospace',
                             color: b.val > 0.005 ? b.divColor : 'rgba(255,255,255,0.4)' } },
          b.val >= 0.005 ? (b.val * Y_MAX).toFixed(1) : '·')))),
    h('svg', { width: W, height: H, style: { display: 'block', overflow: 'visible' } },
      // Band regions
      BAND_RANGES.map(b => h('rect', { x: x1(b), y: 0, width: x2(b) - x1(b), height: H,
        fill: b.divColor, opacity: b === sel ? 0.65 : 0.22 })),
      // Selected band highlight border
      sel && h('rect', { x: x1(sel), y: 0, width: x2(sel) - x1(sel), height: H,
        fill: 'none', stroke: sel.divColor, 'stroke-width': 1.5, opacity: 0.9 }),
      // Band divider lines
      BAND_RANGES.slice(0, -1).map(b => h('line', { x1: x2(b), y1: 0, x2: x2(b), y2: H,
        stroke: 'rgba(255,255,255,0.30)', 'stroke-width': 1 })),
      // Emission curve
      h('path', { d, fill: 'none', stroke: 'rgba(255,255,255,1)', 'stroke-width': 1.5 }),
      // Band labels
      BAND_RANGES.map(b => h('text', { x: (x1(b) + x2(b)) / 2, y: H / 2,
        'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 12, 'font-family': 'monospace',
        fill: labelFill(b.divColor, onLight), opacity: 0.9, style: { userSelect: 'none' } }, b.short))));
}
