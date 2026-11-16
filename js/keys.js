// ── Keyboard ──────────────────────────────────────────────────
// Typed words: "dev" toggles the hidden tuning sliders; a secret word unlocks the Sun.
// Arrows move the selected source or detector, 10 px per press (50 px with Shift).
// Delete / Backspace removes a selected source; Esc deselects. Keys pressed while
// typing in a field or using a slider are left alone.
import { state, rerender, removeItem } from './state.js';

const SECRETS = ['god mode', 'godmode', 'the sun', 'thesun', 'sunlight'];
const MAX_LEN = Math.max(...SECRETS.map(s => s.length));
let typed = '';

function onTyped(e) {
  typed = (typed + e.key).slice(-MAX_LEN);
  if (SECRETS.some(s => typed.endsWith(s)) && !state.godMode) { state.godMode = true; rerender(); }
  if (typed.endsWith('dev')) { state.devMode = !state.devMode; typed = ''; rerender(); }
}

function onArrows(e) {
  const sel = state.selected;
  if (!sel || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
  if (sel.kind === 'detector' && !state.showDetector) return;
  if (e.key === 'Escape') { state.selected = null; rerender(); return; }
  if (sel.kind === 'item' && (e.key === 'Delete' || e.key === 'Backspace')) {
    e.preventDefault(); removeItem(sel.id); return;
  }
  const step = e.shiftKey ? 50 : 10;
  const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (!d) return;
  e.preventDefault();
  if (sel.kind === 'detector') {
    state.viewerPos = { x: state.viewerPos.x + d[0], y: state.viewerPos.y + d[1] };
  } else {
    const it = state.items.find(it => it.id === sel.id);
    if (it) { it.x += d[0]; it.y += d[1]; }
  }
  rerender();
}

window.addEventListener('keydown', onTyped);
window.addEventListener('keydown', onArrows);
