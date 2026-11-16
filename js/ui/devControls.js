// ── Dev controls ──────────────────────────────────────────────
// The hidden tuning sliders under a bench item (type "dev" to show them):
// power, spectrum peak / width / skew, glow offset, and the UV LED's and LED
// bulb's individual glow layers.
//
// devControls() builds the rows once and returns { nodes, update }: update() copies
// the item's current values into the sliders and readouts. The rows stay in place
// while you drag a slider (rebuilding them would drop the drag).
import { h, setStyle, setText } from '../dom.js';
import { makePeakConv, fmtHz } from '../physics.js';
import { updateItem } from '../state.js';

export function devControls(item, s) {
  const updaters = [];
  const live = fn => { updaters.push(fn); };

  // One labelled slider row: [label] [min text] [—slider—] [value]. valueText() returns the
  // readout's text parts (see setText in dom.js).
  const row = ({ label, min, max, accent, toSlider, fromSlider, minText, valueText, valueClass }) => {
    const input = h('input', { type: 'range', min, max, class: 'row-slider', style: { height: '3px', accentColor: accent },
      onInput: e => updateItem(item.id, fromSlider(+e.target.value)) });
    const value = h('span', { class: valueClass });
    live(() => { input.value = toSlider(); setText(value, ...valueText()); });
    return h('div', { class: 'panel-row' },
      h('span', { class: 'row-label' }, label),
      minText != null && h('span', { class: 'row-min' }, ...minText),
      input, value);
  };

  const cfg  = s.spectrum;
  const conv = makePeakConv(cfg.peakMin, cfg.peakMax);
  const nodes = [
    // Amplitude
    s.power.fixed == null && row({ label: 'Amp', min: 0, max: 500, accent: '#fb923c',
      toSlider: () => item.amplitude, fromSlider: v => ({ amplitude: v }),
      valueText: () => [item.amplitude], valueClass: 'row-value amp' }),
    // Peak — log scale, per-type range
    row({ label: 'Peak', min: 0, max: 100, accent: '#38bdf8', minText: [fmtHz(cfg.peakMin)],
      toSlider: () => conv.toSlider(item.peak), fromSlider: v => ({ peak: conv.fromSlider(v) }),
      valueText: () => [fmtHz(item.peak), ' Hz'], valueClass: 'row-value w32' }),
    // Width — direct Hz, per-type range
    row({ label: 'Width', min: cfg.widthMin, max: cfg.widthMax, accent: '#34d399', minText: ['±', cfg.widthMin],
      toSlider: () => item.widthHz, fromSlider: v => ({ widthHz: v }),
      valueText: () => ['±', fmtHz(item.widthHz), ' Hz'], valueClass: 'row-value w40' }),
    // Skew 1.0–5.0
    row({ label: 'Skew', min: 10, max: 50, accent: '#e879f9', minText: ['∿'],
      toSlider: () => Math.round(item.skew * 10), fromSlider: v => ({ skew: v / 10 }),
      valueText: () => [item.skew.toFixed(1)], valueClass: 'row-value w28' }),
    // Glow X/Y offset sliders — hidden for LED (glow covers full image)
    s.devGlowOffsets && row({ label: 'Glow X', min: -80, max: 80, accent: '#22d3ee',
      toSlider: () => item.glowX ?? 0, fromSlider: v => ({ glowX: v }),
      valueText: () => [item.glowX ?? 0], valueClass: 'row-value w28' }),
    s.devGlowOffsets && row({ label: 'Glow Y', min: -80, max: 80, accent: '#22d3ee',
      toSlider: () => item.glowY ?? 0, fromSlider: v => ({ glowY: v }),
      valueText: () => [item.glowY ?? 0], valueClass: 'row-value w28' }),
    item.gelBenchLayers && layerList(item, live, 'gelBenchLayers', ['dome-T', 'field', 'dots-W', 'neon-1', 'neon-2'],
      { key: 'opMult', check: '#a78bfa', accent: '#f472b6', labelWidth: 42, nested: true }),
    item.ledLayers && layerList(item, live, 'ledLayers', ['bench bloom', 'bench sharp', 'cam bloom', 'cam sharp'],
      { key: 'opacity', check: '#fbbf24', accent: '#fbbf24', labelWidth: 52 }),
  ];

  const update = () => updaters.forEach(fn => fn());
  update();
  return { nodes, update };
}

// Per-layer controls (item[field] is a list of { on, <key>, … }): an on/off checkbox and
// a strength slider for each, plus hue and lightness sliders for the UV LED's neon-1.
function layerList(item, live, field, labels, { key, check, accent, labelWidth, nested }) {
  const upd = (i, patch) => {
    const next = item[field].map((l, j) => j === i ? { ...l, ...patch } : l);
    updateItem(item.id, { [field]: next });
  };
  const mono = (width, extra) => ({ fontSize: 7, fontFamily: 'monospace', width, flexShrink: 0, ...extra });
  const valueStyle = mono(28, { textAlign: 'right', color: '#71717a' });

  // A small slider + readout for one property of layer i.
  const slider = (i, { min, max, step, color, get, set, text }) => {
    const input = h('input', { type: 'range', min, max, step,
      style: { flex: 1, height: 3, cursor: 'pointer', accentColor: color },
      onInput: e => upd(i, set(+e.target.value)) });
    const value = h('span', { style: valueStyle });
    live(() => { const l = item[field][i]; input.disabled = !l.on; input.value = get(l); setText(value, ...text(l)); });
    return [input, value];
  };

  return h('div', { style: { marginTop: 3 } }, labels.map((lbl, i) => {
    const box = h('input', { type: 'checkbox',
      style: { width: 10, height: 10, accentColor: check, flexShrink: 0, cursor: 'pointer' },
      onChange: e => upd(i, { on: e.target.checked }) });
    const name = h('span', { style: mono(labelWidth) }, lbl);
    live(() => { const l = item[field][i]; box.checked = l.on; setStyle(name, { color: l.on ? '#a1a1aa' : '#52525b' }); });
    const main = h('div', { style: { display: 'flex', alignItems: 'center', gap: 4, ...(nested ? {} : { marginBottom: 2 }) } },
      box, name,
      slider(i, { min: 0, max: 200, step: 5, color: accent, get: l => Math.round(l[key] * 100),
                  set: v => ({ [key]: v / 100 }), text: l => [l[key].toFixed(2), '×'] }));
    if (!nested) return main;
    const sub = (label, prop, min, max, dflt, unit) =>
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, paddingLeft: 14 } },
        h('span', { style: { fontSize: 6, color: '#71717a', flexShrink: 0, width: 12 } }, label),
        slider(i, { min, max, step: 1, color: '#cc44ff', get: l => l[prop] ?? dflt,
                    set: v => ({ [prop]: v }), text: l => [l[prop] ?? dflt, unit] }));
    return h('div', { style: { marginBottom: 3 } }, main,
      lbl === 'neon-1' && [sub('hue', 'hue', 240, 340, 310, '°'), sub('lit', 'lightness', 20, 90, 50, '%')]);
  }));
}
