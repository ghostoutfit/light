// ── State ─────────────────────────────────────────────────────
// Everything the app remembers, in one object. Any module may change it; after a
// change, call rerender() so the page catches up (main.js supplies the renderer).
// Items are changed in place (updateItem), so code holding an item always sees its
// current values.
import { BAND_RANGES } from './bands.js';

export const state = {
  // Every source placed on the bench: type, x/y (px, bench coords), amplitude (= power),
  // spectrum params peak / widthHz / skew, glow offsets, plus any per-source extras.
  items: [],
  drag: null,              // a source being dragged: { from: 'parts' | 'bench', type, id, cx, cy, sx, sy, ox, oy }
  selectedBand: 'Visible', // the detector's band (bands.js id)
  photoMode: false,        // CAM: the detector screen is see-through
  showDetector: false,
  viewerPos: { x: 40, y: 80 },  // detector's top-left (px, page coords)
  viewerDrag: null,        // detector being dragged: { ox, oy } = grab offset
  showGraphs: false,
  showTemp: false,
  graphItemId: null,       // which item's graph the detector shows (see pickGraphItem in ui/detector.js)
  selected: null,          // what the arrow keys move: { kind: 'item', id } or { kind: 'detector' }
  devMode: false,          // type "dev": tuning sliders under each source
  godMode: false,          // type a secret word: the Sun appears in the parts panel
};

// Click-placed sources fill two bench slots, a then b; a third replaces the older one.
export const clickSlots = { a: null, b: null, last: null };

let renderer = () => {};
export const setRenderer = fn => { renderer = fn; };
export const rerender = () => renderer();

export const bandById = id => BAND_RANGES.find(b => b.id === id);

// Patch one source's fields.
export function updateItem(id, patch) {
  const it = state.items.find(it => it.id === id);
  if (it) Object.assign(it, patch);
  rerender();
}

// Take a source off the bench (× button, Delete key, or dragging it back to the parts panel).
export function removeItem(id) {
  state.items = state.items.filter(it => it.id !== id);
  if (clickSlots.a === id) Object.assign(clickSlots, { a: null, last: clickSlots.b ? 'b' : null });
  else if (clickSlots.b === id) Object.assign(clickSlots, { b: null, last: clickSlots.a ? 'a' : null });
  if (state.selected?.kind === 'item' && state.selected.id === id) state.selected = null;
  rerender();
}

export function clearAll() {
  state.items = [];
  state.selected = null;
  Object.assign(clickSlots, { a: null, b: null, last: null });
  rerender();
}

// Select a source or the detector so the arrow keys move it. Blur any focused slider
// first, or the arrows would keep changing that slider instead.
export function select(sel) {
  document.activeElement?.blur?.();
  state.selected = sel;
  rerender();
}
