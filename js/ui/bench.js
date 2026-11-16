// ── Bench items ───────────────────────────────────────────────
// Each placed source on the lab bench: its control panel (power slider, or the dev
// sliders), its image and naked-eye glow, and — in dev mode with GRAPHS on — its
// emission graph. The glow drawing comes from the source's file (bench / benchBehind).
//
// Each item's elements are made when it's placed and updated in place by renderBench(),
// so a slider being dragged or holding the keyboard isn't disturbed. Its control panel
// comes off while the item is dragged (and is rebuilt after); its glow and graph are
// redrawn only when the item's settings change.
import { h, setStyle, spot } from '../dom.js';
import { clamp, visCurve, itemIntensity } from '../physics.js';
import { GLOW } from '../glow.js';
import { SOURCES, imgHeight } from '../sources/index.js';
import { state, updateItem, removeItem, rerender, bandById } from '../state.js';
import { startBenchDrag } from '../pointer.js';
import { emissionGraph } from './emissionGraph.js';
import { devControls } from './devControls.js';
import { closeButton } from './closeButton.js';

const ARROW_STEP = 4;   // power change per arrow-key press (the slider's own step is 1)

const views = new Map();   // item id → its elements (see makeView)

const deleteButton = item => closeButton({ onClick: () => removeItem(item.id), label: 'Remove from bench' });

// Power: a slider and the ×. A press anywhere on the row (except the ×) focuses the
// slider, so the arrow keys then change the power.
function powerSlider(item, s, view) {
  const setPower = v => {
    const t = v / s.power.max;
    updateItem(item.id, s.power.peakAt ? { amplitude: v, peak: s.power.peakAt(t) } : { amplitude: v });
  };
  const input = h('input', { type: 'range', min: 0, max: s.power.max, value: item.amplitude,
    class: 'row-slider', style: { height: '3px', accentColor: '#fb923c' },
    onKeyDown: e => {
      const dir = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
      if (!dir) return;
      e.preventDefault();
      setPower(clamp(item.amplitude + dir * ARROW_STEP, 0, s.power.max));
    },
    onFocus: () => { view.powerFocus = true;  rerender(); },
    onBlur:  () => { view.powerFocus = false; rerender(); },
    onInput: e => setPower(+e.target.value) });
  // Focus after the press finishes, so nothing steals it back.
  const focusSlider = e => { if (!e.target.closest('button')) setTimeout(() => input.focus()); };
  return {
    nodes: [h('div', { class: 'panel-row', style: { cursor: 'pointer' }, onPointerDown: focusSlider },
      h('span', { class: 'row-label' }, 'Power'),
      input,
      deleteButton(item))],
    update: () => { if (+input.value !== item.amplitude) input.value = item.amplitude; },
  };
}

function makeView(item) {
  const s = SOURCES[item.type];
  const imgH = imgHeight(s);
  const view = { item, s, imgH, panel: spot(), mode: null, body: null, glowKey: null, glowNodes: [],
                 graph: spot(), graphKey: null, powerFocus: false };
  view.img = h('img', { src: s.src, alt: s.label, class: 'drop-shadow-lg', draggable: false,
    style: { width: s.w, height: imgH, display: 'block' } });
  // Drag hit area (a source may leave its bottom strip ungrabbable: layout.grabTrim)
  view.hit = h('div', { style: { position: 'absolute', top: 0, left: 0, width: s.w,
    height: imgH - s.layout.grabTrim, cursor: 'grab' },
    onPointerDown: e => startBenchDrag(e, item) });
  // Item image + naked-eye glow (benchBehind layers go before the image, bench layers after)
  view.figure = h('div', { style: { position: 'relative', width: s.w, height: imgH, outlineOffset: 4, borderRadius: 6 } },
    view.img, view.hit);
  view.root = h('div', { class: 'bench-item', style: { width: s.w } }, view.panel.mark, view.figure, view.graph.mark);
  return view;
}

// The control panel: an empty box; updateView() fills it for the current mode.
function makePanel(view) {
  view.mode = null;
  view.powerFocus = false;
  return h('div', { class: 'item-panel', onPointerDown: e => {
    e.stopPropagation();
    state.selected = null;   // the panel's slider takes the arrow keys instead
    rerender();
  } });
}

// Graph on bench — dev mode with Show Graphs, regardless of detector
function makeGraph(view) {
  const L = view.s.layout;
  view.graphKey = null;
  return h('div', { style: {
    position: 'absolute',
    left: Math.round((view.s.w - L.graphWidth) / 2),
    bottom: '100%',
    marginBottom: L.graphGap,
    width: L.graphWidth,
    pointerEvents: 'none',
    zIndex: 30,
  } });
}

function updateView(view) {
  const { item, s, imgH } = view;
  const L = s.layout;
  const dev = state.devMode;
  const fixedPower = s.power.fixed != null;
  setStyle(view.root, { left: item.x, top: item.y });

  // Control panel: not there while the item is dragged
  const panel = view.panel.set(!(state.drag?.from === 'bench' && state.drag.id === item.id), () => makePanel(view));
  if (panel) {
    const mode = dev ? 'dev' : fixedPower ? 'fixed' : 'power';
    if (mode !== view.mode) {
      view.mode = mode;
      view.body = mode === 'dev'   ? devControls(item, s)
                : mode === 'fixed' ? { nodes: [deleteButton(item)], update() {} }
                : powerSlider(item, s, view);
      panel.replaceChildren(...view.body.nodes.filter(Boolean));
      // A source with no power slider (the Sun) gets a small panel holding just the ×.
      const box = fixedPower && !dev ? { left: s.w / 2 - 17, width: 'auto' } : (dev && L.devPanel) || L.panel;
      setStyle(panel, { marginTop: L.panelTop, left: box.left, width: box.width });
    }
    view.body.update();
    // While the power slider has the arrow keys
    setStyle(panel, { outline: view.powerFocus && !dev ? '2px dotted #fff' : 'none', outlineOffset: 2 });
  }

  // Selected: the arrow keys move it
  setStyle(view.figure, { outline: state.selected?.kind === 'item' && state.selected.id === item.id
    ? '2px dashed rgba(255,255,255,0.8)' : 'none' });

  // Naked-eye glow — redrawn only when the item's settings change (not when it moves)
  const glowKey = JSON.stringify({ ...item, x: 0, y: 0 });
  if (glowKey !== view.glowKey) {
    view.glowKey = glowKey;
    view.glowNodes.forEach(n => n.remove());
    const ctx = { item, s, imgH, vis: visibleGlowAmounts(item, s), visBand: bandById('Visible') };
    const behind = [s.benchBehind?.(ctx)].flat(Infinity).filter(Boolean);
    const front  = [s.bench?.(ctx)].flat(Infinity).filter(Boolean);
    view.img.before(...behind);
    view.figure.append(...front);
    view.glowNodes = [...behind, ...front];
  }

  // Dev graph
  const graph = view.graph.set(dev && state.showGraphs, () => makeGraph(view));
  const graphKey = graph ? glowKey + state.selectedBand : null;
  if (graph && graphKey !== view.graphKey) {
    view.graphKey = graphKey;
    graph.replaceChildren(emissionGraph({ item, width: L.graphWidth, devMode: dev, selectedBand: state.selectedBand }));
  }
}

// Visible-band intensity → the naked-eye glow's bloom, sharpness, blur and opacity.
function visibleGlowAmounts(item, s) {
  const t = s.tuning;
  const intensity = itemIntensity(item, bandById('Visible'));
  const c = visCurve(intensity * 2);
  return {
    intensity, c,
    bloom: clamp(1 + c * 5, 1, 6),
    sharp: clamp(1 + c * 4, 1, 5),
    blurB: (10 + c * 40) * GLOW.blurScale * t.visBlur,
    blurD: (2  + c * 8)  * GLOW.blurScale * t.visBlur,
    op:    clamp(c * t.visOpacity, 0, 1),
  };
}

// Add, update and remove bench items to match state.items.
export function renderBench(benchEl) {
  for (const [id, view] of views) {
    if (!state.items.some(it => it.id === id)) { view.root.remove(); views.delete(id); }
  }
  for (const item of state.items) {
    let view = views.get(item.id);
    if (!view) { view = makeView(item); views.set(item.id, view); benchEl.append(view.root); }
    updateView(view);
  }
}
