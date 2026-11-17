// UV LED — a panel of ultraviolet LEDs. Its light peaks just past violet, so it shows
// in the visible and UV views; on the bench it's a purple glow.
import { h } from '../dom.js';
import { clamp } from '../physics.js';
import { VIS_LAYERS, GLOW, frame, fadeIn, irGlow, maskedColor } from '../glow.js';

const W = 336;

// Bench glow layers; each new UV LED gets a copy (item.gelBenchLayers) the dev panel can edit.
const BENCH_LAYERS = [
  { on: true, opMult: 0.5  },  // 0 dome-T
  { on: true, opMult: 1.5  },  // 1 field
  { on: true, opMult: 1.35 },  // 2 dots-W
  { on: true, opMult: 1.35, hue: 310, lightness: 75 },  // 3 neon-1
  { on: true, opMult: 0.9  },  // 4 neon-2
];

// Visible, UV and X-ray: the LED dots, plus a softer white dome glow at higher intensity.
function dots({ item, intensity, s, imgH, mx, my }) {
  const gelG  = 5.0 * Math.pow(clamp(intensity * 10, 0, 1), 0.9); // scales with band intensity; UV/Vis ratio ≈ 1.20 at peak=809
  const gelBg = 5.0 * Math.pow(clamp(intensity * 10, 0, 1), 1.9); // background: slower ramp at low power
  return frame({ item, s, imgH },
    VIS_LAYERS.map(layer => {
      const f  = fadeIn(gelG, layer);
      const bg = fadeIn(gelBg, layer);
      if (f <= 0.01 && bg <= 0.01) return null;
      return [
        bg > 0.01 && h('img', { src: s.outsideSrc, draggable: false, style: {
          position: 'absolute', top: my, left: mx, width: s.w, height: imgH,
          filter: `brightness(${layer.bright}) blur(${layer.blur * GLOW.blurScale * 0.25}px)`,
          opacity: bg * layer.opacity * 0.45,
          mixBlendMode: 'screen',
        } }),
        f > 0.01 && h('img', { src: s.filamentSrc, draggable: false, style: {
          position: 'absolute', top: my, left: mx, width: s.w, height: imgH,
          filter: `brightness(${layer.bright * 2}) blur(${layer.blur * GLOW.blurScale * 0.432}px)`,
          opacity: f * layer.opacity,
          mixBlendMode: 'screen',
        } }),
      ];
    }));
}

// Naked eye: purple layers that keep building all the way to 100% power (amplitude^0.5 ramp).
function bench({ item, s, imgH }) {
  if (!(item.amplitude > 0)) return null;
  const g      = Math.pow(clamp(item.amplitude / 500, 0, 1), 0.5);
  const gWhite = Math.pow(clamp((item.amplitude - 150) / 350, 0, 1), 0.5);
  const top  = s.tuning.benchY + (item.glowY ?? 0);
  const left = s.tuning.benchX + (item.glowX ?? 0);
  // All glow layers: luminance-mask a solid color, blur the container, normal blend.
  // Covers underlying pixels (no screen-blend washout over white device image).
  const glow = (src, blur, color, op) =>
    maskedColor({ src, top, left, w: s.w, h: imgH, blur, color, opacity: Math.min(op, 1), zIndex: 1 });
  const gl  = item.gelBenchLayers ?? BENCH_LAYERS;
  const on  = i => gl[i].on;
  const op  = (base, i) => Math.min(base * gl[i].opMult, 1);
  return [
    on(0) && glow(s.outsideSrc,   8 + gWhite * 12, '#6600ff', op(gWhite * 1.40, 0)),
    on(1) && s.fieldSrc && glow(s.fieldSrc, 12 + g * 20, '#bb44ff', op(g * 1.26, 1)),
    on(2) && glow(s.filamentSrc,  1 + g * 2,       '#6600ff', op(g * 1.40, 2)),
    on(4) && glow(s.filamentSrc,  0.4,             '#8800ff', op(g, 4)),
    on(3) && glow(s.filamentSrc,  3 + g * 3,       `hsl(${gl[3].hue ?? 310}, 100%, ${gl[3].lightness ?? 75}%)`, op(g, 3)),
  ];
}

export default {
  label: 'UV LED',
  short: 'UV LED',
  group: 'specialized',
  src:         'images/GelFlatBaseGray.png',
  outsideSrc:  'images/GelGlowWhite.png',   // diffuse dome glow
  filamentSrc: 'images/GelGlowDots.png',    // LED dots
  fieldSrc:    'images/GelGlowGray.png',    // mid-field pinkish glow around dots (bench)
  maskSrc:     'images/GelGlowDots.png',    // infrared glow
  w: W, natW: 1254, natH: 1254,

  spectrum: { peakMin: 700, peakMax: 1500, widthMin: 5, widthMax: 200,
              peakDefault: 825, widthDefault: 80, skewDefault: 1.0 },
  temp: { max: 29 },                         // °C at full power — UV LED panel surface

  // A new UV LED starts with its glow 12 px up, and its own copy of the bench layers
  itemDefaults: () => ({ glowY: -12, gelBenchLayers: BENCH_LAYERS.map(l => ({ ...l })) }),
  layout: { panelTop: -86 },

  detector: {
    IR:      ctx => irGlow(ctx, ctx.s.maskSrc),
    Visible: dots,
    UV:      dots,
    XRay:    dots,
  },
  bench,
};
