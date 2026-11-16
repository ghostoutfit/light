// ── DOM helpers ───────────────────────────────────────────────
// h() builds an element in one call:
//   h('img', { src, draggable: false, style: { position: 'absolute', top: 4 } })
//   h('div', { class: 'panel-row', onPointerDown: fn }, child, [more, children], 'text')
// Props: `style` is an object (camelCase names; plain numbers get 'px', except the
// unitless ones below), `class` sets the class, `onXxx` adds an 'xxx' event listener,
// `value` is set last (after min/max, so a range slider isn't clamped), and anything
// else becomes an attribute. A null / false prop or child is left out, so
// `cond && h(...)` works. svg, circle, line, path, rect and text are made as SVG.

const SVG_NS   = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'circle', 'line', 'path', 'rect', 'text']);
const UNITLESS = new Set(['opacity', 'zIndex', 'fontWeight', 'lineHeight', 'flex', 'flexGrow', 'flexShrink', 'order', 'zoom']);
const PROPERTIES = new Set(['checked', 'disabled', 'draggable']);   // set as properties, even when false

const cssName = k => k.replace(/[A-Z]/g, m => '-' + m.toLowerCase());   // WebkitMaskImage → -webkit-mask-image

// Apply a style object to an element. A null / undefined / false / '' value removes that property.
export function setStyle(el, style) {
  for (const [k, v] of Object.entries(style)) {
    const name = cssName(k);
    if (v == null || v === false || v === '') el.style.removeProperty(name);
    else el.style.setProperty(name, typeof v === 'number' && v !== 0 && !UNITLESS.has(k) ? v + 'px' : String(v));
  }
}

export function h(tag, props, ...children) {
  const el = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(props ?? {})) {
    if (PROPERTIES.has(k)) el[k] = v;
    else if (v == null || v === false) continue;
    else if (k === 'style') setStyle(el, v);
    else if (k === 'value') value = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  appendAll(el, children);
  if (value !== undefined) el.value = value;
  return el;
}

// Append children (nested arrays allowed); null / false / true are skipped, strings become text.
export function appendAll(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    el.append(c instanceof Node ? c : String(c));
  }
}

// Set an element's text from parts, each its own text node: the browser spaces glyphs a
// hair differently across a node boundary, so readouts keep the splits they've always had
// (e.g. '±', '80', ' Hz').
export const setText = (el, ...parts) => el.replaceChildren(...parts.map(String));

// A place in the page for something that comes and goes. Put spot.mark (an empty comment)
// where it belongs when building; then spot.set(on, build) adds a freshly built element
// there and returns it (or returns the one already showing), or removes it and returns null.
// Built fresh each time, as the page always did: the browser can draw a re-shown element's
// text and images a hair differently from a new one.
export function spot() {
  const s = {
    mark: document.createComment(''),
    el: null,
    set(on, build) {
      if (on && !s.el) s.mark.after(s.el = build());
      else if (!on && s.el) { s.el.remove(); s.el = null; }
      return s.el;
    },
  };
  return s;
}
