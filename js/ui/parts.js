// ── Parts panel ───────────────────────────────────────────────
// The boxes at the top left of the bench: the Show Detector switch, the sources
// grouped by kind (drag one onto the bench, or click to place it), and Clear All.
// makeParts() builds it once; renderParts() updates it in place, and adds or removes
// the parts that come and go (the Secret box, Clear All, each ✓).
import { h, setStyle, spot } from '../dom.js';
import { SOURCES } from '../sources/index.js';
import { state, rerender, clearAll } from '../state.js';
import { startPartsDrag } from '../pointer.js';

const GROUPS = [
  { label: 'Heat Sources',  color: 'rgba(251,146,60,0.9)', group: 'hot',         borderColor: '#8B2828' },
  { label: 'Other Sources', color: 'rgba(96,165,250,0.9)', group: 'specialized', borderColor: '#1E65CC' },
  { label: '✦ Secret',      color: 'rgba(255,220,50,0.9)', group: 'secret',      borderColor: 'rgba(255,220,50,0.5)' },
];

let el;   // every element renderParts() updates

export function makeParts() {
  el = { rows: [], secret: spot(), clear: spot() };
  // Show Detector: pulses red (style.css .detector-halo) until the detector is on.
  el.powerIcon = h('img', { src: 'images/PowerOn.png', draggable: false,
    style: { width: 32, height: Math.round(32 * 61/64), cursor: 'pointer', flexShrink: 0 } });
  el.switch = h('div', { class: 'detector-halo',
      style: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px',
        border: '3px solid rgba(80,80,80,0.8)', borderRadius: 10,
        background: 'rgba(12,12,12,0.88)', backdropFilter: 'blur(8px)' },
      onPointerDown: e => e.stopPropagation(),
      onClick: () => { state.showDetector = !state.showDetector; rerender(); } },
    el.powerIcon,
    h('span', { style: {
      fontSize: 18, fontWeight: 700, letterSpacing: '0.04em',
      color: 'white', cursor: 'pointer', userSelect: 'none', lineHeight: 1.1,
    } }, 'Show', h('br'), 'Detector'));

  return h('div', { id: 'parts', class: 'parts' },
    el.switch, groupBox(GROUPS[0]), groupBox(GROUPS[1]), el.secret.mark,
    h('p', { class: 'parts-hint' }, 'drag back to remove'),
    el.clear.mark);
}

const makeClear = () => h('button', {
  onPointerDown: e => e.stopPropagation(),
  onClick: clearAll,
  style: {
    marginTop: 4, width: '100%', padding: '6px 0',
    fontSize: 16, letterSpacing: '0.04em',
    color: 'rgb(255,190,180)', background: 'rgba(255,60,40,0.1)',
    border: '1px solid rgba(255,80,60,0.25)', borderRadius: 6,
    cursor: 'pointer',
  } }, 'Clear All');

// One box of sources.
function groupBox({ label, color, group, borderColor }) {
  const groupSources = Object.entries(SOURCES).filter(([, s]) => s.group === group);
  return h('div', { style: { border: `3px solid ${borderColor}`, borderRadius: 10, padding: '6px 8px 4px',
      background: 'rgba(12,12,12,0.88)', backdropFilter: 'blur(8px)' } },
    h('p', { style: { fontSize: 13, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color,
      textAlign: 'left', marginBottom: 4 } }, label),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
      groupSources.map(([type, s]) => {
        const row = { type, check: spot() };
        row.img = h('img', { src: s.src, alt: s.label, draggable: false, class: 'drop-shadow',
          style: { width: 40, height: 40, objectFit: 'contain', flexShrink: 0, pointerEvents: 'none' } });
        row.label = h('span', { style: { fontSize: 13, lineHeight: 1.3, flex: 1 } }, s.label);
        row.el = h('div', { class: 'part',
            style: { display: 'flex', alignItems: 'center', gap: 8, padding: '3px 4px', borderRadius: 6 },
            onPointerDown: e => { if (!row.placed) startPartsDrag(e, type); } },
          row.img, row.label, row.check.mark);
        el.rows.push(row);
        return row.el;
      })));
}

export function renderParts() {
  const on = state.showDetector;
  el.switch.classList.toggle('on', on);
  setStyle(el.powerIcon, { opacity: on ? 1 : 0.4, filter: on ? 'drop-shadow(0 0 6px #f24a38cc)' : 'none' });
  el.secret.set(state.godMode, () => groupBox(GROUPS[2]));
  el.clear.set(state.items.length > 0, makeClear);
  // A placed source is dimmed (it can't be added twice). The dimming is applied to the
  // image and background only, so the text keeps readable contrast.
  for (const row of el.rows) {
    row.placed = state.items.some(it => it.type === row.type);
    const dim = row.placed ? 0.38 : 1;
    const textColor = row.placed ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.85)';
    setStyle(row.el, { cursor: row.placed ? 'default' : 'grab',
      background: row.placed ? `rgba(255,255,255,${0.04 * dim})` : 'transparent' });
    setStyle(row.img, { opacity: dim });
    setStyle(row.label, { color: textColor });
    row.check.set(row.placed, () => h('span', { style: { fontSize: 13, flexShrink: 0, color: textColor } }, '✓'));
  }
}
