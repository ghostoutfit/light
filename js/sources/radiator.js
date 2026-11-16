// Radiator — a household radiator. Its surface only reaches ~97 °C, so it glows in
// infrared and is invisible in every other band.
import { clamp } from '../physics.js';
import { irGlow, visibleGlow, cameraGlow, benchGlow } from '../glow.js';

const W = 480;
const POWER_MAX = 120;

export default {
  label: 'Radiator',
  group: 'hot',
  src:     'images/Radiator.png',
  maskSrc: 'images/HotRadiator.png',   // the hot panel, used for every glow
  w: W, natW: 1254, natH: 1254,

  // Spectrum (Hz): dev-slider ranges and a new radiator's starting values
  spectrum: { peakMin: 10, peakMax: 35, widthMin: 5, widthMax: 300,
              peakDefault: 10, widthDefault: 200, skewDefault: 7.0 },
  // Power slider 0–120; the peak frequency rises with power
  power: { max: POWER_MAX, peakAt: t => Math.round(10 + t * 25) },
  temp:  { max: 97 },                  // °C at full power — household radiator surface

  tuning: { visOpacity: 0 },           // no naked-eye glow on the bench
  layout: {
    panelTop: -36,
    panel:    { left: Math.round((W - Math.round(W * 0.6)) / 2), width: Math.round(W * 0.6) },  // slim power slider
    devPanel: { left: 0, width: W },
  },
  graphScale: 1.5,                     // taller curve on its emission graph (display only)
  // It's bigger than the detector screen, so it counts as "in view" once it fills a third of the screen
  inView: 'screen',

  detector: {
    // Infrared fades in between 15% and 25% power
    IR: ctx => irGlow(ctx, ctx.s.maskSrc, { fade: clamp((ctx.item.amplitude / POWER_MAX - 0.15) / 0.10, 0, 1) }),
    Visible: visibleGlow,
    UV:      cameraGlow,
    XRay:    cameraGlow,
  },
  bench: benchGlow,
};
