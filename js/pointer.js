// ── Pointer: place & drag sources, drag the detector ──────────
// A press on a parts-panel source starts a drag (startPartsDrag); a short press is a
// click and places the source into a free bench slot, or into the detector's view.
// A press on a bench source selects it and drags it (startBenchDrag); dropping it on
// the parts panel removes it. The detector's own press starts state.viewerDrag
// (ui/detector.js). onMove / onUp are attached to the whole page in main.js.
import { h, setStyle, spot } from './dom.js';
import { SOURCES, imgHeight, newItem } from './sources/index.js';
import { SCREEN_L, SCREEN_T, SCREEN_W, SCREEN_H, BENCH_TOP, overlapsScreen } from './detectorGeometry.js';
import { state, clickSlots, rerender, removeItem, select } from './state.js';

const CLICK_SLOP = 40;   // px: a press that moves less than this is a click, not a drag

const benchRect = () => document.getElementById('bench').getBoundingClientRect();
const partsRect = () => document.getElementById('parts').getBoundingClientRect();
const inside = (e, r) => e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
const moved = (e, d) => Math.abs(e.clientX - d.sx) > CLICK_SLOP || Math.abs(e.clientY - d.sy) > CLICK_SLOP;

// Drop a new source by clicking: into the detector's view if it's showing nothing,
// else into bench slot a (right of the parts panel), then b (near the right edge);
// with both full, the new one replaces the older of the two.
function clickPlaceSource(type) {
  const s = SOURCES[type];
  const br = benchRect(), pr = partsRect();
  const imgH = imgHeight(s);
  const vp = state.viewerPos;

  if (state.showDetector && !state.items.some(item => overlapsScreen(item, vp))) {
    const cx = Math.round(vp.x + SCREEN_L + SCREEN_W / 2 - s.w / 2);
    const cy = Math.round(vp.y + SCREEN_T + SCREEN_H / 2 - imgH / 2 - BENCH_TOP);
    state.items = [...state.items, newItem(type, cx, cy)];
    return;
  }

  const yPos = Math.round((br.height - imgH) * 0.35);
  const slotAx = Math.round(pr.right - br.left + 20);
  const slotBx = Math.round(window.innerWidth - br.left - 200 - s.w);
  const item = newItem(type, 0, yPos);
  if (!clickSlots.a) {
    state.items = [...state.items, { ...item, x: slotAx }];
    Object.assign(clickSlots, { a: item.id, last: 'a' });
  } else if (!clickSlots.b) {
    state.items = [...state.items, { ...item, x: slotBx }];
    Object.assign(clickSlots, { b: item.id, last: 'b' });
  } else {
    const evict = clickSlots.last === 'a' ? 'b' : 'a';
    const evictId = clickSlots[evict];
    state.items = [...state.items.filter(it => it.id !== evictId), { ...item, x: evict === 'a' ? slotAx : slotBx }];
    Object.assign(clickSlots, { [evict]: item.id, last: evict });
  }
}

export function startPartsDrag(e, type) {
  e.preventDefault();
  const s = SOURCES[type];
  state.drag = {
    from: 'parts', type, id: null,
    cx: e.clientX, cy: e.clientY,
    sx: e.clientX, sy: e.clientY,
    ox: s.w / 2,
    oy: imgHeight(s) * 0.38,
  };
  rerender();
}

export function startBenchDrag(e, item) {
  e.preventDefault();
  e.stopPropagation();
  const r = e.currentTarget.getBoundingClientRect();
  state.drag = {
    from: 'bench', type: item.type, id: item.id,
    cx: e.clientX, cy: e.clientY,
    sx: e.clientX, sy: e.clientY,
    ox: e.clientX - r.left,
    oy: e.clientY - r.top,
  };
  select({ kind: 'item', id: item.id });
}

// Live drag: the detector, or a source (a bench source moves with the pointer).
export function onMove(e) {
  const d = state.drag;
  if (state.viewerDrag) {
    state.viewerPos = { x: e.clientX - state.viewerDrag.ox, y: e.clientY - state.viewerDrag.oy };
  } else if (d) {
    d.cx = e.clientX; d.cy = e.clientY;
    if (d.from === 'bench') {
      const br = benchRect();
      const it = state.items.find(it => it.id === d.id);
      if (it) Object.assign(it, { x: e.clientX - br.left - d.ox, y: e.clientY - br.top - d.oy });
    }
  } else return;
  rerender();
}

// Drop: a bench source let go over the parts panel is removed; a press from the
// parts panel that barely moved is a click and places the source into a slot.
export function onUp(e) {
  const d = state.drag;
  if (state.viewerDrag) { state.viewerDrag = null; rerender(); return; }
  if (!d) return;
  state.drag = null;
  if (d.from === 'bench' && inside(e, partsRect())) { removeItem(d.id); return; }
  if (d.from === 'parts') {
    if (!moved(e, d)) clickPlaceSource(d.type);
    // A real drag: only accept the drop if the pointer lands on the bench
    else if (inside(e, benchRect()) && !state.items.some(it => it.type === d.type)) {
      const br = benchRect();
      state.items = [...state.items, newItem(d.type, e.clientX - br.left - d.ox, e.clientY - br.top - d.oy)];
    }
  }
  // (a bench source's position was already updated live in onMove)
  rerender();
}

// ── Drag ghost: the source following the pointer, for drags from the parts panel ──
export const ghost = spot();   // main.js puts ghost.mark in the page

export function renderGhost() {
  const d = state.drag;
  const el = ghost.set(d?.from === 'parts', () => h('div', { class: 'ghost' },
    h('img', { src: SOURCES[d.type].src, class: 'ghost-img', draggable: false, style: { width: SOURCES[d.type].w } })));
  if (el) setStyle(el, { left: d.cx - d.ox, top: d.cy - d.oy, width: SOURCES[d.type].w });
}
