// Filament bulb — a tungsten filament at up to 3100 °C inside a glass bulb. The glass
// (outsideSrc) and the filament (filamentSrc) glow as separate layers; the filament
// runs hotter, so it lights up first and stays sharper.
import { clamp } from '../physics.js';
import { THERMAL, VIS_LAYERS, Frame, fadeIn, cameraSignal } from '../glow.jsx';

const W = 170;

// Hand-tuned glow amounts
const IR_OUTSIDE_BLUR  = 22,  IR_FILAMENT_BLUR = 1;    // px
const IR_OUTSIDE_MAG   = 1.5, IR_FILAMENT_MAG  = 2.5;  // extra brightness
const VIS_BLUR_SCALE   = 0.3;                           // multiplies VIS_LAYERS blur
const CAM_MAX          = 0.6;                           // UV / X-ray views saturate at this intensity
const CAM_BRIGHT       = 3.5;
const BENCH_COLOR      = 'rgb(255,160,0)';

// One glow image covering the bulb, offset by the bulb's tuning.
const layerImg = (key, src, s, imgH, filter, opacity) => (
  <img key={key} src={src} draggable={false}
    style={{
      position: 'absolute', top: s.tuning.maskY, left: 0, width: s.w, height: imgH,
      filter, opacity, mixBlendMode: 'screen',
    }} />
);

function infrared({ item, intensity, s, imgH }) {
  // Bulb-specific thermal scale: onset at ~2% power, full brightness at 100%
  // (the generic glowStrength kicks in too early for the filament bulb)
  const therm = 4.0 * Math.pow(Math.max(0, intensity), 1.3);
  // Filament runs 2.5× hotter than the outer glow scale — brighter at low power in IR
  const filamentTherm = therm * 2.5;
  return (
    <Frame item={item} s={s} imgH={imgH}>
      {THERMAL.map((layer, i) => {
        const outer    = fadeIn(therm, layer);
        const filament = fadeIn(filamentTherm, layer);
        if (outer <= 0.01 && filament <= 0.01) return null;
        return [
          outer > 0.01 && layerImg(`o${i}`, s.outsideSrc, s, imgH,
            `${layer.imgFilter} brightness(${IR_OUTSIDE_MAG}) blur(${IR_OUTSIDE_BLUR}px)`, outer * layer.opacity),
          filament > 0.01 && layerImg(`f${i}`, s.filamentSrc, s, imgH,
            `${layer.imgFilter} brightness(${IR_FILAMENT_MAG}) blur(${IR_FILAMENT_BLUR}px)`, filament * layer.opacity),
        ];
      })}
    </Frame>
  );
}

function visible({ item, intensity, s, imgH }) {
  // Bulb-specific vis scale: onset at ~10% power, full brightness at 100%
  const visScale = 6.66 * Math.max(0, intensity);
  // Filament reaches full brightness at 35% power (3.6× the outer glow scale)
  const filamentVisScale = visScale * 3.6;
  return (
    <Frame item={item} s={s} imgH={imgH}>
      {VIS_LAYERS.map((layer, i) => {
        const outer    = fadeIn(visScale, layer);
        // ^1.8 curve: dim at low power, full brightness at high power
        const filament = Math.pow(fadeIn(filamentVisScale, layer), 1.8);
        if (outer <= 0.01 && filament <= 0.01) return null;
        return [
          outer > 0.01 && layerImg(`o${i}`, s.outsideSrc, s, imgH,
            `brightness(${layer.bright}) blur(${layer.blur * VIS_BLUR_SCALE}px)`, outer * layer.opacity),
          filament > 0.01 && layerImg(`f${i}`, s.filamentSrc, s, imgH,
            `brightness(${layer.bright * 2}) blur(${layer.blur * VIS_BLUR_SCALE * 0.12}px)`, filament * layer.opacity),
        ];
      })}
    </Frame>
  );
}

// UV and X-ray: only a very hot filament shows, tinted with the band's false colour.
function camera({ item, band, intensity, s, imgH }) {
  const { sharp, bloom } = cameraSignal(intensity, band.id);
  // UV onset calibrated to 95%+ power; below threshold camR=0 → invisible
  let camR, filamentR;
  if (band.id === 'UV') {
    const uvFrac = clamp((intensity - 0.043) * 20.0 / CAM_MAX, 0, 1);
    camR      = Math.pow(uvFrac, 1.8);
    filamentR = Math.pow(uvFrac, 0.6);
  } else {
    camR      = Math.pow(Math.min(intensity / CAM_MAX, 1), 1.8);
    filamentR = Math.pow(Math.min(intensity / CAM_MAX, 1), 0.6);
  }
  return (
    <Frame item={item} s={s} imgH={imgH}>
      {VIS_LAYERS.map((layer, i) => [
        camR > 0.01 && layerImg(`o${i}`, s.outsideSrc, s, imgH,
          `${band.colorFilter} brightness(${bloom * CAM_BRIGHT * 10}) contrast(20) blur(${layer.blur * VIS_BLUR_SCALE}px)`,
          Math.min(camR * layer.opacity * 1.05, 1)),
        filamentR > 0.01 && layerImg(`f${i}`, s.filamentSrc, s, imgH,
          `${band.colorFilter} brightness(${sharp * CAM_BRIGHT * 10}) contrast(20) blur(${layer.blur * VIS_BLUR_SCALE * 0.12}px)`,
          Math.min(filamentR * layer.opacity * 1.05, 1)),
      ])}
    </Frame>
  );
}

// Naked eye: orange glass glow plus a sharper filament, each tinted by the tuning hue.
function bench({ s, imgH, vis }) {
  const { benchX: bX, benchY: bY, visHue, visSat } = s.tuning;
  const benchVisScale    = 6.66 * vis.intensity;
  const filamentVisScale = benchVisScale * 3.6;
  const colorFilter         = `hue-rotate(${visHue}deg) saturate(${visSat})`;
  const filamentColorFilter = `hue-rotate(${visHue - 20}deg) saturate(${visSat})`;
  const tinted = (key, src, filter, opacity, tint) => (
    <div key={key} style={{
      position: 'absolute', top: bY, left: bX, width: s.w, height: imgH,
      filter, opacity, mixBlendMode: 'screen',
      isolation: 'isolate', pointerEvents: 'none', backgroundColor: 'black',
    }}>
      <img src={src} draggable={false} style={{ position: 'absolute', inset: 0, width: s.w, height: imgH }} />
      <div style={{ position: 'absolute', inset: 0, backgroundColor: BENCH_COLOR, mixBlendMode: 'multiply', filter: tint }} />
    </div>
  );
  const layers = [];
  VIS_LAYERS.forEach((layer, i) => {
    const outer    = fadeIn(benchVisScale, layer);
    const filament = Math.pow(fadeIn(filamentVisScale, layer), 1.8);
    if (outer > 0.01) layers.push(tinted(`o${i}`, s.outsideSrc,
      `blur(${layer.blur * VIS_BLUR_SCALE}px) brightness(${layer.bright})`, outer * layer.opacity, colorFilter));
    if (filament > 0.01) layers.push(tinted(`f${i}`, s.filamentSrc,
      `blur(${layer.blur * VIS_BLUR_SCALE * 0.12}px) brightness(${layer.bright * 2})`, filament * layer.opacity, filamentColorFilter));
  });
  return layers.length > 0 ? layers : null;
}

export default {
  label: 'Filament Bulb',
  group: 'hot',
  src:         'images/Bulb.png',
  outsideSrc:  'images/BulbOutside.png',
  filamentSrc: 'images/BulbFilament.png',
  w: W, natW: 324, natH: 453,

  spectrum: { peakMin: 400, peakMax: 1200, widthMin: 5, widthMax: 300,
              peakDefault: 60, widthDefault: 173, skewDefault: 7.0 },
  power: {
    max: 500,
    // Two-phase peak ramp: slow (60→200) for first 30%, faster (200→580) after
    peakAt: t => t <= 0.3
      ? Math.round(60 + (200 - 60) * (t / 0.3))
      : Math.round(200 + (580 - 200) * ((t - 0.3) / 0.7)),
  },
  temp: { max: 3100, curve: 1.1 },      // °C at full power — tungsten filament

  tuning: { maskY: 2, visSat: 8.0 },
  layout: {
    panelTop: 4,
    panel:      { left: -5, width: W + 10 },
    graphWidth: Math.round(W * 1.4),
  },

  detector: { IR: infrared, Visible: visible, UV: camera, XRay: camera },
  bench,
};
