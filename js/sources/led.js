// LED bulb — an ordinary white LED lamp. Bright in the visible view, faint in
// infrared, and its warm-white glow shows on the bench.
import { h } from '../dom.js';
import { clamp } from '../physics.js';
import { irGlow, cameraGlow, maskedColor } from '../glow.js';

const W = 180;

// Glow layer strengths; each new LED bulb gets a copy (item.ledLayers) the dev panel can edit.
const LAYERS = [
  { on: true, opacity: 0.85 },  // 0 bench bloom
  { on: true, opacity: 1.0  },  // 1 bench sharp
  { on: true, opacity: 0.85 },  // 2 cam bloom
  { on: true, opacity: 0.9  },  // 3 cam sharp
];

// Visible: a white bloom and a sharp core of the glow mask.
function visible({ item, intensity, s, imgH, mx, my }) {
  const ledI = clamp(intensity * 5, 0, 1);
  if (ledI <= 0.01) return null;
  const ll = item.ledLayers ?? LAYERS;
  // Use screen blend + saturate(0) to guarantee white regardless of image tint
  const camLayer = (blur, brightness, op) =>
    h('img', { src: s.maskSrc, draggable: false, style: {
      position: 'absolute', top: my, left: mx, width: s.w, height: imgH,
      filter: `saturate(0) brightness(${brightness}) blur(${blur}px)`,
      opacity: op, mixBlendMode: 'screen', pointerEvents: 'none',
    } });
  return h('div', { style: { position: 'absolute', pointerEvents: 'none',
                             left: item.x, top: item.y, width: s.w, height: imgH } },
    ll[2].on && camLayer(32, 3, ledI * ll[2].opacity),
    ll[3].on && camLayer(3,  6, ledI * ll[3].opacity));
}

// Naked eye: warm-white bloom and core, as solid colour through the glow mask.
function bench({ item, s, imgH, vis }) {
  if (!(vis.intensity > 0.005)) return null;
  const ll = item.ledLayers ?? LAYERS;
  const ledI = clamp(vis.c * s.tuning.visOpacity, 0, 1);
  const layer = (blur, color, op) =>
    maskedColor({ src: s.maskSrc, top: 0, left: 0, w: s.w, h: imgH, blur, color, opacity: op });
  return [
    ll[0].on && layer(32, '#ffe566', ledI * ll[0].opacity),
    ll[1].on && layer(3,  '#fff5aa', ledI * ll[1].opacity),
  ];
}

export default {
  label: 'LED Bulb',
  short: 'LED',
  group: 'specialized',
  src:     'images/LEDBulb.png',
  maskSrc: 'images/LEDBulbGlow.png',
  w: W, natW: 1053, natH: 1493,

  spectrum: { peakMin: 400, peakMax: 800, widthMin: 5, widthMax: 200,
              peakDefault: 566, widthDefault: 80, skewDefault: 1.0 },
  temp: { max: 29 },                    // °C at full power — LED bulb surface

  itemDefaults: () => ({ ledLayers: LAYERS.map(l => ({ ...l })) }),
  tuning: { visOpacity: 5.0 },
  devGlowOffsets: false,                // its glow covers the whole image, so no Glow X/Y sliders

  detector: {
    IR:      ctx => irGlow(ctx, ctx.s.maskSrc),
    Visible: visible,
    UV:      cameraGlow,
    XRay:    cameraGlow,
  },
  bench,
};
