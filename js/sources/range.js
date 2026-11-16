// Electric cooker — a hob element that heats to ~900 °C: strong infrared, and a red
// glow you can see at high power.
import { h } from '../dom.js';
import { clamp } from '../physics.js';
import { irGlow, visibleGlow, cameraGlow, benchGlow } from '../glow.js';

const W = 330;

// In infrared the whole cooker body also brightens once the element is hot.
const bodyGlow = ({ s, imgH }) => therm => {
  const glowOp = clamp((therm - 1.4) / 4.0, 0, 1.0);
  return glowOp > 0 &&
    h('img', { src: s.src, draggable: false, style: {
      position: 'absolute',
      top: -2, left: 4,
      width: s.w, height: imgH,
      filter: 'brightness(2.0) blur(8px)',
      opacity: glowOp,
      mixBlendMode: 'screen',
    } });
};

export default {
  label: 'Electric Cooker',
  group: 'hot',
  src:     'images/Heater.png',
  maskSrc: 'images/HeaterElement.png',  // the element, used for every glow
  w: W, natW: 732, natH: 560,

  spectrum: { peakMin: 20, peakMax: 400, widthMin: 5, widthMax: 300,
              peakDefault: 250, widthDefault: 200, skewDefault: 3.0 },
  power: { max: 500, peakAt: t => Math.round(50 + t * 190) },
  temp:  { max: 900 },                  // °C at full power — electric cooker hob

  benchColor: 'rgb(255,40,0)',          // naked-eye glow colour (instead of the spectrum's)
  // Glow image offsets (px) and naked-eye glow look
  tuning: { maskX: -11, maskY: -25, benchX: -12, benchY: -26,
            visOpacity: 5.0, visHue: -8, visBlur: 3.0, visSat: 5.0, visBright: 1.0 },
  layout: {
    panelTop: -16,
    panel:    { left: 20, width: W - 60 },
    graphGap: 18,
    grabTrim: 50,                       // the bottom 50 px (the stand) can't be grabbed
  },

  detector: {
    IR:      ctx => irGlow(ctx, ctx.s.maskSrc, { under: bodyGlow(ctx) }),
    Visible: visibleGlow,
    UV:      cameraGlow,
    XRay:    cameraGlow,
  },
  bench: benchGlow,
};
