// Round red × — removes a source from the bench, or hides the detector. The × is drawn
// (two lines) rather than typed, so it sits exactly in the middle of the circle.
import { h } from '../dom.js';

export function closeButton({ onClick, label, style }) {
  return h('button', {
    type: 'button', 'aria-label': label, title: label,
    onClick,
    onPointerDown: e => e.stopPropagation(),   // a press here shouldn't start a drag or select
    style: {
      width: 18, height: 18, flexShrink: 0, padding: 0, borderRadius: '50%',
      border: '1px solid rgba(255,140,120,0.7)', background: '#7a1f14',
      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
      ...style,
    },
  }, h('svg', { width: 8, height: 8, viewBox: '0 0 8 8', 'aria-hidden': 'true' },
    h('path', { d: 'M1 1L7 7M7 1L1 7', stroke: '#fff', 'stroke-width': 2.25, 'stroke-linecap': 'round' })));
}
