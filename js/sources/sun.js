// The Sun — a secret source (type "the sun" to unlock it). Always at full power and
// blazing in every band, drawn as soft white discs instead of an image.
import { h } from '../dom.js';
import { frame } from '../glow.js';

const W = 220;

// Detector: glow discs per band — [how far past the disc they spread (px), colour, blur (px)]
const BAND_DISCS = {
  IR: [
    [W * 2,  'rgba(255,255,255,0.55)', 60],
    [W,      'rgba(255,255,255,0.75)', 25],
    [W * 0.3,'rgba(255,255,255,0.92)',  8],
  ],
  Visible: [
    [W * 1.5,'rgba(255,255,255,0.5)',  50],
    [W * 0.5,'rgba(255,255,255,0.85)', 15],
    [W * 0.1,'rgba(255,255,255,1.0)',   3],
  ],
  UV: [
    [W * 1.2,'rgba(255,255,255,0.45)', 45],
    [W * 0.4,'rgba(255,255,255,0.75)', 12],
    [W * 0.1,'rgba(255,255,255,0.92)',  3],
  ],
  XRay: [
    [W * 0.35,'rgba(255,255,255,0.22)', 0],
    [W * 0.12,'rgba(255,255,255,0.35)', 0],
  ],
};

function detector({ item, band, s }) {
  const disc = (expand, color, blur) =>
    h('div', { style: {
      position: 'absolute',
      left: -expand, top: -expand,
      width: s.w + expand * 2, height: s.w + expand * 2,
      borderRadius: '50%',
      background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
      filter: `blur(${blur}px)`,
      mixBlendMode: 'screen', pointerEvents: 'none',
    } });
  return frame({ item, s, imgH: s.w },
    BAND_DISCS[band.id].map(([expand, color, blur]) => disc(expand, color, blur)));
}

// Bench: always-on bloom layers, drawn behind the disc image.
function benchBehind({ s }) {
  return [
    h('div', { style: { position: 'absolute', left: -s.w, top: -s.w, width: s.w*3, height: s.w*3, borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(255,240,150,0.55) 0%, rgba(255,180,30,0.25) 35%, rgba(255,100,0,0.08) 65%, transparent 100%)',
      filter: 'blur(30px)', mixBlendMode: 'screen', pointerEvents: 'none' } }),
    h('div', { style: { position: 'absolute', left: -s.w*0.3, top: -s.w*0.3, width: s.w*1.6, height: s.w*1.6, borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(255,255,220,0.9) 0%, rgba(255,220,80,0.6) 40%, transparent 75%)',
      filter: 'blur(8px)', mixBlendMode: 'screen', pointerEvents: 'none' } }),
    h('div', { style: { position: 'absolute', left: s.w*0.05, top: s.w*0.05, width: s.w*0.9, height: s.w*0.9, borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(255,255,255,1) 30%, rgba(255,240,180,0.9) 70%, transparent 100%)',
      mixBlendMode: 'screen', pointerEvents: 'none' } }),
  ];
}

export default {
  label: 'The Sun',
  group: 'secret',
  src: `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="white"/></svg>`,
  w: W, natW: 100, natH: 100,

  spectrum: { peakMin: 100, peakMax: 20000, widthMin: 100, widthMax: 20000,
              peakDefault: 566, widthDefault: 4500, skewDefault: 6.0 },
  power: { fixed: 500 },                // always full power — no power slider
  temp:  { max: 5505 },                 // °C — solar photosphere

  detector: { IR: detector, Visible: detector, UV: detector, XRay: detector },
  benchBehind,
};
