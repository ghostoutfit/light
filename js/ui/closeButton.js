// Round red × — removes a source from the bench, or hides the detector.
import { h } from '../dom.js';

export function closeButton({ onClick, label, style }) {
  return h('button', {
    type: 'button', 'aria-label': label, title: label,
    onClick,
    onPointerDown: e => e.stopPropagation(),   // a press here shouldn't start a drag or select
    style: {
      width: 18, height: 18, flexShrink: 0, padding: 0, borderRadius: '50%',
      border: '1px solid rgba(255,140,120,0.7)', background: '#7a1f14',
      color: '#fff', fontSize: 14, lineHeight: '15px', textAlign: 'center', cursor: 'pointer',
      ...style,
    },
  }, '×');
}
