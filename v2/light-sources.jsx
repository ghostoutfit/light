import React, { useState, useRef, useEffect } from 'react';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// Perceptual sensitivity curve: zero slope at onset (never jarring), rapid rise, saturates near 1.
// p > 1 ensures f'(0) = 0; k controls how quickly it climbs.
const visCurve = v => 1 - Math.exp(-5 * Math.pow(Math.max(0, v), 1.4));

// ── Spectral emission model ───────────────────────────────────
// Log-normal PDF. peak and bandFreq share the same Hz scale.
// widthHz: 1-sigma bandwidth in Hz (stored directly — no unit conversion needed)
// skew   : sigma = skew × ln(1 + widthHz/peak); higher = wider + longer tail
// Returns shape value [0,1] at a single frequency. Peak brightness is always 1.0.
// Asymmetric log-normal: skew stretches the LOW-frequency tail (like a blackbody).
//   skew=1 → symmetric in log-space
//   skew=5 → very asymmetric, heavy low-freq tail, fast high-freq cutoff
function spectralEmission(bandFreq, peak, widthHz, skew) {
  const w = Math.max(widthHz, 0.1);
  const p = Math.max(peak, 1);
  // Saturating sigma: w/(p+w) stays in [0,1) regardless of how small peak gets.
  // Prevents the above-peak tail from blowing into UV when peak << widthHz.
  const sigmaBase = w / (p + w);
  if (sigmaBase < 0.001) {
    return Math.exp(-0.5 * ((bandFreq - p) / w) ** 2);
  }
  const lnX  = Math.log(Math.max(bandFreq, 1e-9) / p);
  // Below peak: widen tail by skew factor; above peak: use base sigma (fast Wien-like cutoff)
  const sigma = lnX < 0 ? sigmaBase * Math.abs(skew) : sigmaBase;
  return Math.exp(-0.5 * (lnX / sigma) ** 2);
}

// Abramowitz & Stegun erf approximation, max error 1.5e-7
function erf(x) {
  const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429, p=0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + p * Math.abs(x));
  const y = 1 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t*Math.exp(-x*x);
  return sign * y;
}

// Analytical integral of the asymmetric log-normal over [lo, hi] in log-frequency space.
// Returns fraction of total emission captured in [lo, hi] — always in [0, 1].
// No sampling artifacts: works correctly even when the curve is narrower than any sample grid.
function bandIntensity(lo, hi, peak, widthHz, skew) {
  const w = Math.max(widthHz, 0.1);
  const p = Math.max(peak, 1);
  const sigmaBase = w / (p + w);
  const sigma_lo  = sigmaBase * Math.abs(skew); // below-peak sigma (wide, skewed tail)
  const sigma_hi  = sigmaBase;                  // above-peak sigma (fast Wien-like cutoff)
  const sq2 = Math.SQRT2;

  // Log-space coordinates relative to peak (peak → u=0)
  const a = Math.log(Math.max(lo, 1e-9) / p);
  const b = Math.log(Math.max(hi, 1e-9) / p);

  // Below-peak contribution: integrate from a to min(b, 0) with sigma_lo
  let below = 0;
  if (a < 0 && b > a) {
    const b0 = Math.min(b, 0);
    below = sigma_lo * (erf(b0 / (sigma_lo * sq2)) - erf(a / (sigma_lo * sq2)));
  }

  // Above-peak contribution: integrate from max(a, 0) to b with sigma_hi
  let above = 0;
  if (b > 0 && b > a) {
    const a0 = Math.max(a, 0);
    above = sigma_hi * (erf(b / (sigma_hi * sq2)) - erf(a0 / (sigma_hi * sq2)));
  }

  // Return absolute captured emission — wider/more-skewed distributions emit more total light,
  // just like higher amplitude does. Values proportional to sigma (width-scaled).
  return below + above;
}

// ── Per-type slider config ────────────────────────────────────
// peak: log-scale range in Hz; widthHz: linear range in Hz
const SLIDER_CFG = {
  range: {
    peakMin: 20,  peakMax: 400,
    widthMin: 5,  widthMax: 300,
    peakDefault: 250, widthDefault: 200,
  },
  radiator: {
    peakMin: 10,  peakMax: 35,
    widthMin: 5,  widthMax: 300,
    peakDefault: 10, widthDefault: 200, skewDefault: 7.0,
  },
  gel: {
    peakMin: 700,  peakMax: 1500,
    widthMin: 5,   widthMax: 200,
    peakDefault: 825, widthDefault: 80, skewDefault: 1.0,
  },
  remote: {
    peakMin: 20,  peakMax: 400,
    widthMin: 1,  widthMax: 50,
    peakDefault: 40, widthDefault: 1.5, skewDefault: 1.0,
  },
  led: {
    peakMin: 400, peakMax: 800,
    widthMin: 5,  widthMax: 200,
    peakDefault: 566, widthDefault: 80, skewDefault: 1.0,
  },
  xray: {
    peakMin: 5000, peakMax: 20000,
    widthMin: 200, widthMax: 8000,
    peakDefault: 9700, widthDefault: 700, skewDefault: 1.0,
  },
  sun: {
    peakMin: 100, peakMax: 20000,
    widthMin: 100, widthMax: 20000,
    peakDefault: 566, widthDefault: 4500, skewDefault: 6.0,
  },
  bulb: {
    peakMin: 400,  peakMax: 1200,
    widthMin: 5,   widthMax: 300,
    peakDefault: 200, widthDefault: 173, skewDefault: 7.0,
  },
};
// Log-scale peak slider helpers (per type)
const makePeakConv = (min, max) => ({
  toSlider:   p => Math.round(Math.log(p / min) / Math.log(max / min) * 100),
  fromSlider: v => Math.round(min * Math.pow(max / min, v / 100)),
});
const fmtHz = p => p >= 1000 ? (p / 1000).toFixed(p >= 10000 ? 0 : 1) + 'k' : String(Math.round(p));

// ── Spectral → perceived colour ──────────────────────────────
// CIE 1931 2° CMFs via Wyman et al. Gaussian fit. nm = wavelength in nm.
function cieCmf(nm) {
  function g(mu, s1, s2) {
    const s = nm < mu ? s1 : s2;
    return Math.exp(-0.5 * ((nm - mu) / s) ** 2);
  }
  return [
    Math.max(0, 1.056*g(599.8,37.9,31.0) + 0.362*g(442.0,16.0,26.7) - 0.065*g(501.1,20.4,26.2)),
    Math.max(0, 0.821*g(568.8,46.9,40.5) + 0.286*g(530.9,16.3,31.1)),
    Math.max(0, 1.217*g(437.0,11.8,36.0) + 0.681*g(459.0,26.0,13.8)),
  ];
}

// Integrate emission × CMF across the visible band.
// Maps the band log-linearly onto 380–700 nm (lo→red, hi→violet).
// Returns [r, g, b] in linear sRGB, normalised so the brightest channel = 1.
function spectrumToRgb(item, visBand) {
  const SAMPLES = 40;
  const logLo = Math.log(visBand.lo), logSpan = Math.log(visBand.hi / visBand.lo);
  let X = 0, Y = 0, Z = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const t  = (i + 0.5) / SAMPLES;
    const f  = Math.exp(logLo + t * logSpan);     // log-linear through band
    const nm = 600 - t * 200;                      // 600 nm (orange-red) at lo, 400 nm (violet) at hi — lo end hits CIE X peak
    const e  = spectralEmission(f, item.peak, item.widthHz, item.skew);
    const [cx, cy, cz] = cieCmf(nm);
    X += e * cx;  Y += e * cy;  Z += e * cz;
  }
  // XYZ → linear sRGB (IEC 61966-2-1 matrix)
  const r = Math.max(0,  3.2406*X - 1.5372*Y - 0.4986*Z);
  const g = Math.max(0, -0.9689*X + 1.8758*Y + 0.0415*Z);
  const b = Math.max(0,  0.0557*X - 0.2040*Y + 1.0570*Z);
  const scale = Math.max(Y, 1e-9);
  return [Math.min(r/scale, 1), Math.min(g/scale, 1), Math.min(b/scale, 1)];
}


// ── Blackbody / thermal scaling ───────────────────────────────
function thermalScale(intensity, power, scale) {
  return Math.pow(Math.max(0, intensity), power) * scale;
}

// ── Thermal palette — white on black ─────────────────────────
const THERMAL = [
  { t: 0.05, blur: 80, opacity: 0.38, imgFilter: 'brightness(0.3)'  },
  { t: 0.45, blur: 60, opacity: 0.55, imgFilter: 'brightness(0.6)'  },
  { t: 0.95, blur: 22, opacity: 0.80, imgFilter: 'brightness(1.2)'  },
  { t: 2.10, blur: 38, opacity: 0.92, imgFilter: 'brightness(2.5)'  },
  { t: 4.20, blur: 62, opacity: 0.98, imgFilter: 'brightness(6.0)'  },
  { t: 5.40, blur: 80, opacity: 1.00, imgFilter: 'brightness(14)'   },
];

// ── Visible palette — multi-layer screen-blend like THERMAL ──
// visScale = thermalScale(intensity) same formula, thresholds tuned to
// visible band intensities (bulb peaks ~4.2, heater ~2.1 at full power)
const VIS_LAYERS = [
  { t: 0.20, blur: 80, opacity: 0.40, bright: 0.5  },  // faint wide halo
  { t: 0.60, blur: 55, opacity: 0.55, bright: 1.2  },  // soft glow
  { t: 1.20, blur: 28, opacity: 0.75, bright: 2.8  },  // mid glow
  { t: 2.00, blur: 40, opacity: 0.88, bright: 6.0  },  // bright bloom
  { t: 3.00, blur: 62, opacity: 0.95, bright: 12.0 },  // wide white bloom
  { t: 4.00, blur: 80, opacity: 1.00, bright: 30.0 },  // white core
];

// ── Source catalogue ─────────────────────────────────────────
const SOURCES = {
  radiator: {
    label: 'Radiator',
    src:    'images/Radiator.png',
    maskSrc:'images/HotRadiator.png',
    w: 480, natW: 1254, natH: 1254,
    group: 'hot',
  },
  range: {
    label: 'Electric Cooker',
    src:   'images/Heater.png',
    maskSrc: 'images/HeaterElement.png',
    w: 330, natW: 732, natH: 560,
    group: 'hot',
  },
  bulb: {
    label: 'Filament Bulb',
    src:         'images/Bulb.png',
    outsideSrc:  'images/BulbOutside.png',
    filamentSrc: 'images/BulbFilament.png',
    w: 170, natW: 324, natH: 453,
    group: 'hot',
  },
  gel: {
    label: 'UV LED',
    src:         'images/GelFlatBaseGray.png',
    outsideSrc:  'images/GelGlowWhite.png',   // diffuse dome glow (bench)
    filamentSrc: 'images/GelGlowDots.png',    // LED dots (bench)
    fieldSrc:    'images/GelGlowGray.png',    // mid-field pinkish glow around dots (bench)
    maskSrc:     'images/GelGlowDots.png',    // used by detector (EmissionShape)
    w: 336, natW: 1254, natH: 1254,
    group: 'specialized',
  },
  led: {
    label: 'LED Bulb',
    src:     'images/LEDBulb.png',
    maskSrc: 'images/LEDBulbGlow.png',
    w: 180, natW: 1053, natH: 1493,
    group: 'specialized',
  },
  remote: {
    label: 'TV Remote',
    src:       'images/Remote.png',
    sourceSrc: 'images/RemoteGlow.png',
    w: 200, natW: 1389, natH: 1132,
    group: 'specialized',
  },
  xray: {
    label: 'X Ray Source',
    src:          'images/XRayEmitter.png',
    sourceSrc:    'images/XRaySource.png',
    reflectorSrc: 'images/XRayReflector.png',
    w: 200, natW: 878, natH: 1022,
    group: 'specialized',
  },
  sun: {
    label: 'The Sun',
    src: `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="white"/></svg>`,
    w: 220, natW: 100, natH: 100,
    group: 'secret',
  },
};

// ── Camera bands ──────────────────────────────────────────────
// divColor: the colour used for the frequency scale segment.
const BANDS = [
  {
    id: 'IR',      label: 'Infrared',    freq: 200,
    divColor: '#c04020',
    btnActive: '#b83010',
    glowColor: '#ff5321',
    colorFilter: 'sepia(1) saturate(8) hue-rotate(-15deg)',
  },
  {
    id: 'Visible', label: 'Visible',     freq: 800,
    divColor: '#a09050',
    btnActive: '#706840',
    glowColor: '#e7c32f',
    colorFilter: 'sepia(0.15) saturate(1.4) brightness(1.2)',
  },
  {
    id: 'UV',      label: 'Ultraviolet', freq: 3200,
    divColor: '#8030cc',
    btnActive: '#6b1faa',
    glowColor: '#d822f0',
    colorFilter: 'sepia(1) saturate(8) hue-rotate(262deg)',
  },
  {
    id: 'XRay',    label: 'X-Ray',       freq: 12000,
    divColor: '#2060a0',
    btnActive: '#1e4a7a',
    glowColor: '#75e0ff',
    colorFilter: 'sepia(1) saturate(5) hue-rotate(195deg) brightness(1.4)',
  },
];

// Frequency axis bounds (shared by peak slider, dividers, and scale bar)
const FREQ_MIN = 20, FREQ_MAX = 20000;
// Convert Hz → fractional position on the log scale bar [0,1]
const hzToPos  = f => Math.log(f / FREQ_MIN) / Math.log(FREQ_MAX / FREQ_MIN);
// Convert fractional bar position → Hz
const posToHz  = p => Math.round(FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, p));

let uid = Date.now(); // unique enough across HMR reloads

// Per-type default glow offsets (pixels, relative to device position)
const GLOW_DEFAULTS = {
  gel: { glowX: 0, glowY: -12, glowHue: -88 },
};


// ── Temperature display config ────────────────────────────────
// Max surface/element temps at full power (amplitude=500), room temp = 22°C baseline
const TEMP_CFG = {
  radiator: 95,    // household radiator surface
  bulb:     2480,  // tungsten filament
  range:    450,   // electric cooker hob
  gel:      35,    // UV LED panel surface
  led:      35,    // LED bulb surface
  xray:     38,    // X-ray tube housing (body-safe enclosure)
  remote:   22,    // TV remote — barely warms at all
  sun:      5505,  // solar photosphere
};
function itemTemp(item) {
  const max = TEMP_CFG[item.type];
  if (max == null) return null;
  if (item.type === 'sun') return max;
  return Math.round(22 + (max - 22) * Math.sqrt(item.amplitude / 500));
}

// ── Emission shape ────────────────────────────────────────────
function EmissionShape({ item, band, intensity, dev }) {
  if (intensity < 0.005) return null;

  const s    = SOURCES[item.type];
  const imgH = s.w * (s.natH / s.natW);

  // ── Sun — always blazing, per-band viz ────────────────────────
  if (item.type === 'sun') {
    const r = s.w / 2;
    const glowLayer = (expand, color, blur) => (
      <div style={{
        position: 'absolute',
        left: -expand, top: -expand,
        width: s.w + expand * 2, height: s.w + expand * 2,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
        filter: `blur(${blur}px)`,
        mixBlendMode: 'screen', pointerEvents: 'none',
      }} />
    );
    const configs = {
      IR: [
        [s.w * 2,  'rgba(255,255,255,0.55)', 60],
        [s.w,      'rgba(255,255,255,0.75)', 25],
        [s.w * 0.3,'rgba(255,255,255,0.92)',  8],
      ],
      Visible: [
        [s.w * 1.5,'rgba(255,255,255,0.5)',  50],
        [s.w * 0.5,'rgba(255,255,255,0.85)', 15],
        [s.w * 0.1,'rgba(255,255,255,1.0)',   3],
      ],
      UV: [
        [s.w * 1.2,'rgba(255,255,255,0.45)', 45],
        [s.w * 0.4,'rgba(255,255,255,0.75)', 12],
        [s.w * 0.1,'rgba(255,255,255,0.92)',  3],
      ],
      XRay: [
        [s.w * 0.35,'rgba(255,255,255,0.22)', 0],
        [s.w * 0.12,'rgba(255,255,255,0.35)', 0],
      ],
    };
    const layers = configs[band.id];
    if (!layers) return null;
    return (
      <div className="absolute pointer-events-none"
        style={{ left: item.x, top: item.y, width: s.w, height: s.w }}>
        {layers.map(([expand, color, blur], i) => <React.Fragment key={i}>{glowLayer(expand, color, blur)}</React.Fragment>)}
      </div>
    );
  }

  if (band.id === 'IR') {
    // Bulb-specific thermal scale: onset at ~2% power, full brightness at 100%
    // (generic thermalScale kicks in too early for the filament bulb)
    const therm = item.type === 'bulb'
      ? 4.0 * Math.pow(Math.max(0, intensity), 1.3)
      : thermalScale(intensity, dev.glowPower, dev.glowScale);

    if (item.type === 'bulb') {
      // Filament runs 2.5× hotter than the outer glow scale — brighter at low power in IR
      const filamentTherm = therm * 2.5;
      return (
        <div className="absolute pointer-events-none"
          style={{ left: item.x, top: item.y, width: s.w, height: imgH }}>
          {THERMAL.map((layer, i) => {
            const outerFadeIn    = clamp((therm         - layer.t) / 0.8, 0, 1);
            const filamentFadeIn = clamp((filamentTherm - layer.t) / 0.8, 0, 1);
            if (outerFadeIn <= 0.01 && filamentFadeIn <= 0.01) return null;
            return [
              outerFadeIn > 0.01 && <img key={`o${i}`} src={s.outsideSrc} draggable={false}
                style={{
                  position: 'absolute', top: dev.maskY[item.type], left: 0, width: s.w, height: imgH,
                  filter: `${layer.imgFilter} brightness(${dev.bulbOutsideMag}) blur(${dev.bulbOutsideBlur}px)`,
                  opacity: outerFadeIn * layer.opacity,
                  mixBlendMode: 'screen',
                }} />,
              filamentFadeIn > 0.01 && <img key={`f${i}`} src={s.filamentSrc} draggable={false}
                style={{
                  position: 'absolute', top: dev.maskY[item.type], left: 0, width: s.w, height: imgH,
                  filter: `${layer.imgFilter} brightness(${dev.bulbFilamentMag}) blur(${dev.bulbFilamentBlur}px)`,
                  opacity: filamentFadeIn * layer.opacity,
                  mixBlendMode: 'screen',
                }} />,
            ];
          })}
        </div>
      );
    }

    if (s.maskSrc) {
      const glowOp = clamp((therm - 1.4) / 4.0, 0, 1.0);
      return (
        <div className="absolute pointer-events-none"
          style={{ left: item.x, top: item.y, width: s.w, height: imgH }}>
          {/* Whole-body glow — heater only */}
          {item.type === 'range' && glowOp > 0 && (
            <img src={s.src}
              style={{
                position: 'absolute',
                top: dev.glowY, left: dev.glowX,
                width: s.w, height: imgH,
                filter: 'brightness(2.0) blur(8px)',
                opacity: glowOp,
                mixBlendMode: 'screen',
              }}
              draggable={false} />
          )}
          {THERMAL.map((layer, i) => {
            const fadeIn = clamp((therm - layer.t) / 0.8, 0, 1);
            if (fadeIn <= 0.01) return null;
            return (
              <img key={i} src={s.maskSrc}
                style={{
                  position: 'absolute',
                  top: dev.maskY[item.type] + (item.glowY ?? 0),
                  left: dev.maskX[item.type] + (item.glowX ?? 0),
                  width: s.w, height: imgH,
                  filter: `${layer.imgFilter} blur(${layer.blur * dev.blurScale}px)`,
                  opacity: fadeIn * layer.opacity,
                  mixBlendMode: 'screen',
                }}
                draggable={false} />
            );
          })}
        </div>
      );
    }

    if (item.type === 'remote' && s.sourceSrc) {
      return (
        <div className="absolute pointer-events-none"
          style={{ left: item.x, top: item.y, width: s.w, height: imgH }}>
          {THERMAL.map((layer, i) => {
            const fadeIn = clamp((therm - layer.t) / 0.8, 0, 1);
            if (fadeIn <= 0.01) return null;
            return (
              <img key={i} src={s.sourceSrc}
                style={{
                  position: 'absolute',
                  top: dev.maskY[item.type] + (item.glowY ?? 0),
                  left: dev.maskX[item.type] + (item.glowX ?? 0),
                  width: s.w, height: imgH,
                  filter: `${layer.imgFilter} blur(${layer.blur * dev.blurScale}px)`,
                  opacity: fadeIn * layer.opacity,
                  mixBlendMode: 'screen',
                }}
                draggable={false} />
            );
          })}
        </div>
      );
    }
  }

  // ── Visible band — same multi-layer screen-blend as IR ────────
  if (band.id === 'Visible') {
    // Bulb-specific vis scale: onset at ~10% power, full brightness at 100%
    const visScale = item.type === 'bulb'
      ? 6.66 * Math.max(0, intensity)
      : thermalScale(intensity, dev.glowPower, dev.glowScale);

    if (item.type === 'bulb') {
      const visBlurScale = 0.3;
      // Filament reaches full brightness at 35% power (3.6× the outer glow scale)
      const filamentVisScale = visScale * 3.6;
      return (
        <div className="absolute pointer-events-none"
          style={{ left: item.x, top: item.y, width: s.w, height: imgH }}>
          {VIS_LAYERS.map((layer, i) => {
            const outerFadeIn    = clamp((visScale         - layer.t) / 0.8, 0, 1);
            // ^1.8 curve: dim at low power, full brightness at high power
            const filamentFadeIn = Math.pow(clamp((filamentVisScale - layer.t) / 0.8, 0, 1), 1.8);
            if (outerFadeIn <= 0.01 && filamentFadeIn <= 0.01) return null;
            return [
              outerFadeIn > 0.01 && <img key={`o${i}`} src={s.outsideSrc} draggable={false}
                style={{
                  position: 'absolute', top: dev.maskY[item.type], left: 0, width: s.w, height: imgH,
                  filter: `brightness(${layer.bright}) blur(${layer.blur * visBlurScale}px)`,
                  opacity: outerFadeIn * layer.opacity,
                  mixBlendMode: 'screen',
                }} />,
              filamentFadeIn > 0.01 && <img key={`f${i}`} src={s.filamentSrc} draggable={false}
                style={{
                  position: 'absolute', top: dev.maskY[item.type], left: 0, width: s.w, height: imgH,
                  filter: `brightness(${layer.bright * 2}) blur(${layer.blur * visBlurScale * 0.12}px)`,
                  opacity: filamentFadeIn * layer.opacity,
                  mixBlendMode: 'screen',
                }} />,
            ];
          })}
        </div>
      );
    }

    if (item.type === 'gel') {
      const gelG  = 5.0 * Math.pow(clamp(intensity * 10, 0, 1), 0.9); // scales with band intensity; UV/Vis ratio ≈ 1.20 at peak=809
      const gelBg = 5.0 * Math.pow(clamp(intensity * 10, 0, 1), 1.9); // background: slower ramp at low power
      const mX = dev.maskX[item.type] + (item.glowX ?? 0);
      const mY = dev.maskY[item.type] + (item.glowY ?? 0);
      return (
        <div className="absolute pointer-events-none"
          style={{ left: item.x, top: item.y, width: s.w, height: imgH }}>
          {VIS_LAYERS.map((layer, i) => {
            const fadeIn   = clamp((gelG  - layer.t) / 0.8, 0, 1);
            const bgFadeIn = clamp((gelBg - layer.t) / 0.8, 0, 1);
            if (fadeIn <= 0.01 && bgFadeIn <= 0.01) return null;
            return [
              bgFadeIn > 0.01 && <img key={`w${i}`} src={s.outsideSrc} draggable={false}
                style={{
                  position: 'absolute', top: mY, left: mX, width: s.w, height: imgH,
                  filter: `brightness(${layer.bright}) blur(${layer.blur * dev.blurScale * 0.25}px)`,
                  opacity: bgFadeIn * layer.opacity * 0.45,
                  mixBlendMode: 'screen',
                }} />,
              <img key={`d${i}`} src={s.filamentSrc} draggable={false}
                style={{
                  position: 'absolute', top: mY, left: mX, width: s.w, height: imgH,
                  filter: `brightness(${layer.bright * 2}) blur(${layer.blur * dev.blurScale * 0.432}px)`,
                  opacity: fadeIn * layer.opacity,
                  mixBlendMode: 'screen',
                }} />,
            ];
          })}
        </div>
      );
    }

    if (item.type === 'led' && s.maskSrc) {
      const ledI = clamp(intensity * 5, 0, 1);
      if (ledI <= 0.01) return null;
      const mX = dev.maskX[item.type] + (item.glowX ?? 0);
      const mY = dev.maskY[item.type] + (item.glowY ?? 0);
      const ledLayer = (blur, color, op) => (
        <div style={{
          position: 'absolute', top: mY, left: mX, width: s.w, height: imgH,
          filter: `blur(${blur}px)`, opacity: op, mixBlendMode: 'normal', pointerEvents: 'none',
        }}>
          <div style={{
            position: 'absolute', inset: 0, backgroundColor: color,
            maskImage: `url(${s.maskSrc})`, WebkitMaskImage: `url(${s.maskSrc})`,
            maskMode: 'luminance', maskSize: '100% 100%', WebkitMaskSize: '100% 100%',
          }} />
        </div>
      );
      const ll = item.ledLayers ?? [
        { on: true, opacity: 0.85 }, { on: true, opacity: 1.0 },
        { on: true, opacity: 0.85 }, { on: true, opacity: 0.9 },
      ];
      // Use screen blend + saturate(0) to guarantee white regardless of image tint
      const camLayer = (blur, brightness, op) => (
        <img src={s.maskSrc} draggable={false}
          style={{
            position: 'absolute', top: mY, left: mX, width: s.w, height: imgH,
            filter: `saturate(0) brightness(${brightness}) blur(${blur}px)`,
            opacity: op, mixBlendMode: 'screen', pointerEvents: 'none',
          }} />
      );
      return (
        <div className="absolute pointer-events-none"
          style={{ left: item.x, top: item.y, width: s.w, height: imgH }}>
          {ll[2].on && camLayer(32, 3, ledI * ll[2].opacity)}
          {ll[3].on && camLayer(3,  6, ledI * ll[3].opacity)}
        </div>
      );
    }

    if (s.maskSrc) {
      return (
        <div className="absolute pointer-events-none"
          style={{ left: item.x, top: item.y, width: s.w, height: imgH }}>
          {VIS_LAYERS.map((layer, i) => {
            const fadeIn = clamp((visScale - layer.t) / 0.8, 0, 1);
            if (fadeIn <= 0.01) return null;
            return (
              <img key={i} src={s.maskSrc}
                style={{
                  position: 'absolute',
                  top: dev.maskY[item.type] + (item.glowY ?? 0),
                  left: dev.maskX[item.type] + (item.glowX ?? 0),
                  width: s.w, height: imgH,
                  filter: `brightness(${layer.bright}) blur(${layer.blur * dev.blurScale}px)`,
                  opacity: fadeIn * layer.opacity,
                  mixBlendMode: 'screen',
                }}
                draggable={false} />
            );
          })}
        </div>
      );
    }

    return null;
  }

  const ic    = visCurve(band.id === 'UV' ? intensity * 2 : band.id === 'XRay' ? intensity * 4 : intensity);
  const sharp = clamp(1 + ic * 4, 1, 5);
  const bloom = clamp(1 + ic * 5, 1, 6);
  const blurD = (2  + ic * 8)  * dev.blurScale;
  const blurB = (10 + ic * 40) * dev.blurScale;
  const op    = clamp(ic, 0, 1);

  if (item.type === 'bulb') {
    // UV onset calibrated to 95%+ power; below threshold camR=0 → invisible
    let camR, filamentR;
    if (band.id === 'UV') {
      const uvFrac = clamp((intensity - 0.043) * 20.0 / dev.bulbCamMax, 0, 1);
      camR      = Math.pow(uvFrac, 1.8);
      filamentR = Math.pow(uvFrac, 0.6);
    } else {
      camR      = Math.pow(Math.min(intensity / dev.bulbCamMax, 1), 1.8);
      filamentR = Math.pow(Math.min(intensity / dev.bulbCamMax, 1), 0.6);
    }
    const visBlurScale = 0.3;
    const camBright = 3.5;
    const mY = dev.maskY[item.type];
    return (
      <div className="absolute pointer-events-none"
        style={{ left: item.x, top: item.y, width: s.w, height: imgH }}>
        {VIS_LAYERS.map((layer, i) => [
          camR > 0.01 && <img key={`o${i}`} src={s.outsideSrc} draggable={false}
            style={{
              position: 'absolute', top: mY, left: 0, width: s.w, height: imgH,
              filter: `${band.colorFilter} brightness(${bloom * camBright * 10}) contrast(20) blur(${layer.blur * visBlurScale}px)`,
              opacity: Math.min(camR * layer.opacity * 1.05, 1), mixBlendMode: 'screen',
            }} />,
          filamentR > 0.01 && <img key={`f${i}`} src={s.filamentSrc} draggable={false}
            style={{
              position: 'absolute', top: mY, left: 0, width: s.w, height: imgH,
              filter: `${band.colorFilter} brightness(${sharp * camBright * 10}) contrast(20) blur(${layer.blur * visBlurScale * 0.12}px)`,
              opacity: Math.min(filamentR * layer.opacity * 1.05, 1), mixBlendMode: 'screen',
            }} />,
        ])}
      </div>
    );
  }

  if (item.type === 'xray') {
    if (band.id !== 'XRay') return null;
    return (
      <div className="absolute pointer-events-none"
        style={{ left: item.x, top: item.y, width: s.w, height: imgH }}>
        {/* XRaySource — full intensity (bloom + sharp) */}
        <img src={s.sourceSrc} draggable={false}
          style={{ position: 'absolute', top: 0, left: 0, width: s.w, height: imgH,
            filter: `${band.colorFilter} brightness(${bloom}) blur(${blurB}px)`,
            opacity: op * 0.7, mixBlendMode: 'screen' }} />
        <img src={s.sourceSrc} draggable={false}
          style={{ position: 'absolute', top: 0, left: 0, width: s.w, height: imgH,
            filter: `${band.colorFilter} brightness(${sharp}) blur(${blurD}px)`,
            opacity: op, mixBlendMode: 'screen' }} />
        {/* XRayReflector — 20% of source contribution */}
        <img src={s.reflectorSrc} draggable={false}
          style={{ position: 'absolute', top: 0, left: 0, width: s.w, height: imgH,
            filter: `${band.colorFilter} brightness(${bloom}) blur(${blurB}px)`,
            opacity: op * 0.7 * 0.20, mixBlendMode: 'screen' }} />
        <img src={s.reflectorSrc} draggable={false}
          style={{ position: 'absolute', top: 0, left: 0, width: s.w, height: imgH,
            filter: `${band.colorFilter} brightness(${sharp}) blur(${blurD}px)`,
            opacity: op * 0.20, mixBlendMode: 'screen' }} />
      </div>
    );
  }

  if (item.type === 'gel') {
    const gelG  = 5.0 * Math.pow(clamp(intensity * 10, 0, 1), 0.9); // scales with band intensity; UV/Vis ratio ≈ 1.20 at peak=809
    const gelBg = 5.0 * Math.pow(clamp(intensity * 10, 0, 1), 1.9); // background: slower ramp at low power
    const mX = dev.maskX[item.type] + (item.glowX ?? 0);
    const mY = dev.maskY[item.type] + (item.glowY ?? 0);
    return (
      <div className="absolute pointer-events-none"
        style={{ left: item.x, top: item.y, width: s.w, height: imgH }}>
        {VIS_LAYERS.map((layer, i) => {
          const fadeIn   = clamp((gelG  - layer.t) / 0.8, 0, 1);
          const bgFadeIn = clamp((gelBg - layer.t) / 0.8, 0, 1);
          if (fadeIn <= 0.01 && bgFadeIn <= 0.01) return null;
          return [
            bgFadeIn > 0.01 && <img key={`w${i}`} src={s.outsideSrc} draggable={false}
              style={{
                position: 'absolute', top: mY, left: mX, width: s.w, height: imgH,
                filter: `brightness(${layer.bright}) blur(${layer.blur * dev.blurScale * 0.25}px)`,
                opacity: bgFadeIn * layer.opacity * 0.45,
                mixBlendMode: 'screen',
              }} />,
            fadeIn > 0.01 && <img key={`d${i}`} src={s.filamentSrc} draggable={false}
              style={{
                position: 'absolute', top: mY, left: mX, width: s.w, height: imgH,
                filter: `brightness(${layer.bright * 2}) blur(${layer.blur * dev.blurScale * 0.432}px)`,
                opacity: fadeIn * layer.opacity,
                mixBlendMode: 'screen',
              }} />,
          ];
        })}
      </div>
    );
  }

  if (s.maskSrc) {
    const mX = dev.maskX[item.type] + (item.glowX ?? 0);
    const mY = dev.maskY[item.type] + (item.glowY ?? 0);
    return (
      <div className="absolute pointer-events-none"
        style={{ left: item.x, top: item.y, width: s.w, height: imgH }}>
        {VIS_LAYERS.map((layer, i) => {
          const fadeIn = clamp((op - layer.t) / 0.8, 0, 1);
          if (fadeIn <= 0.01) return null;
          return (
            <img key={i} src={s.maskSrc} draggable={false}
              style={{
                position: 'absolute', top: mY, left: mX, width: s.w, height: imgH,
                filter: `${band.colorFilter} brightness(${layer.bright}) blur(${layer.blur * dev.blurScale}px)`,
                opacity: fadeIn * layer.opacity,
                mixBlendMode: 'screen',
              }} />
          );
        })}
      </div>
    );
  }
  return null;
}


// ── Natural (naked-eye) view — used by NONE mode in detector ──
function NaturalView({ item, dev, bandRanges }) {
  const s    = SOURCES[item.type];
  const imgH = s.w * (s.natH / s.natW);

  const visBand      = bandRanges.find(b => b.id === 'Visible');
  const visIntensity = bandIntensity(visBand.lo, visBand.hi, item.peak, item.widthHz, item.skew)
                       * (item.amplitude / 400);
  const visC     = visCurve(visIntensity * 2);
  const visBloom = clamp(1 + visC * 5, 1, 6);
  const visSharp = clamp(1 + visC * 4, 1, 5);
  const visBlurB = (10 + visC * 40) * dev.blurScale * dev.visBlur[item.type];
  const visBlurD = (2  + visC * 8)  * dev.blurScale * dev.visBlur[item.type];
  const visOp    = clamp(visC * dev.visOpacity[item.type], 0, 1);

  const gamma = x => x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1/2.4) - 0.055;
  const [gr, gg, gb] = spectrumToRgb(item, visBand);
  const glowColor = item.type === 'range'
    ? 'rgb(255,40,0)'
    : item.type === 'bulb'
    ? 'rgb(255,160,0)'
    : `rgb(${Math.round(gamma(gr)*255)},${Math.round(gamma(gg)*255)},${Math.round(gamma(gb)*255)})`;

  return (
    <div className="absolute pointer-events-none"
      style={{ left: item.x, top: item.y, width: s.w, height: imgH }}>
      {/* Device image */}
      <img src={s.src} draggable={false}
        style={{ position: 'absolute', top: 0, left: 0, width: s.w, height: imgH }} />

      {/* Bulb glow — colorize via CSS filter directly, no black isolation box */}
      {item.type === 'bulb' && visIntensity > 0.005 && (() => {
        const bulbR   = Math.pow(visC, 1.8);
        const colorF  = `sepia(1) saturate(8) hue-rotate(${dev.visHue[item.type] + 10}deg) brightness`;
        return (<>
          <img src={s.outsideSrc} draggable={false} style={{
            position: 'absolute', top: dev.benchY[item.type], left: dev.benchX[item.type],
            width: s.w, height: imgH,
            filter: `${colorF}(${visBloom * dev.bulbVisBright}) blur(${visBlurB}px)`,
            opacity: bulbR * 0.95, mixBlendMode: 'screen',
          }} />
          <img src={s.filamentSrc} draggable={false} style={{
            position: 'absolute', top: dev.benchY[item.type], left: dev.benchX[item.type],
            width: s.w, height: imgH,
            filter: `${colorF}(${visSharp * dev.bulbVisBright * 0.5}) blur(${visBlurD}px)`,
            opacity: clamp(visOp * dev.bulbVisBright / 2, 0, 1), mixBlendMode: 'screen',
          }} />
        </>);
      })()}

      {/* maskSrc glow (range, tanbulb) — colorize via CSS filter */}
      {s.maskSrc && item.type !== 'gel' && visIntensity > 0.005 && (() => {
        const hue = dev.visHue[item.type];
        const sat = dev.visSat[item.type];
        const colorF = `sepia(1) saturate(${sat}) hue-rotate(${hue}deg) brightness`;
        return (<>
          <img src={s.maskSrc} draggable={false} style={{
            position: 'absolute', top: dev.benchY[item.type], left: dev.benchX[item.type],
            width: s.w, height: imgH,
            filter: `${colorF}(${visBloom}) blur(${visBlurB}px)`,
            opacity: visOp * 0.7, mixBlendMode: 'screen',
          }} />
          <img src={s.maskSrc} draggable={false} style={{
            position: 'absolute', top: dev.benchY[item.type], left: dev.benchX[item.type],
            width: s.w, height: imgH,
            filter: `${colorF}(${visSharp}) blur(${visBlurD}px)`,
            opacity: visOp, mixBlendMode: 'screen',
          }} />
        </>);
      })()}

      {/* Gel lamp glow — exact same layers as bench view */}
      {item.type === 'gel' && item.amplitude > 0 && (() => {
        const g      = Math.pow(clamp(item.amplitude / 500, 0, 1), 0.5);
        const gWhite = Math.pow(clamp((item.amplitude - 150) / 350, 0, 1), 0.5);
        const gTop   = dev.benchY[item.type] + (item.glowY ?? 0);
        const gLeft  = dev.benchX[item.type] + (item.glowX ?? 0);
        const glowLayer = (src, blur, color, opacity) => (
          <div style={{
            position: 'absolute', top: gTop, left: gLeft, width: s.w, height: imgH,
            filter: `blur(${blur}px)`, opacity: Math.min(opacity, 1),
            mixBlendMode: 'normal', pointerEvents: 'none', zIndex: 1,
          }}>
            <div style={{
              position: 'absolute', inset: 0,
              backgroundColor: color,
              maskImage: `url(${src})`,
              WebkitMaskImage: `url(${src})`,
              maskMode: 'luminance',
              maskSize: '100% 100%',
              WebkitMaskSize: '100% 100%',
            }} />
          </div>
        );
        const gl = item.gelBenchLayers ?? [
          { on: true, opMult: 0.5  }, { on: true, opMult: 1.5  },
          { on: true, opMult: 1.35 }, { on: true, opMult: 1.35, hue: 310, lightness: 75 },
          { on: true, opMult: 0.9  },
        ];
        const vis = i => gl[i].on;
        const op  = (base, i) => Math.min(base * gl[i].opMult, 1);
        return (<>
          {vis(0) && glowLayer(s.outsideSrc,   8 + gWhite * 12, '#6600ff',                                          op(gWhite * 1.40, 0))}
          {vis(1) && s.fieldSrc && glowLayer(s.fieldSrc, 12 + g * 20, '#bb44ff',                                    op(g * 1.26, 1))}
          {vis(2) && glowLayer(s.filamentSrc,  1 + g * 2,       '#6600ff',                                          op(g * 1.40, 2))}
          {vis(4) && glowLayer(s.filamentSrc,  0.4,             '#8800ff',                                          op(g, 4))}
          {vis(3) && glowLayer(s.filamentSrc,  3 + g * 3,       `hsl(${gl[3].hue ?? 310}, 100%, ${gl[3].lightness ?? 75}%)`, op(g, 3))}
        </>);
      })()}
    </div>
  );
}

// ── Emission graph (floats below bench item) ──────────────────
const GRAPH_SAMPLES = 120;
function EmissionGraph({ item, bandRanges, width, devMode, selectedBand }) {
  const H = 53; // 44 × 1.2
  const W = width;
  const Y_MAX = 80;
  const PAD = 4;

  // Per-band capture value
  const captures = bandRanges.map(b => ({
    ...b,
    val: bandIntensity(b.lo, b.hi, item.peak, item.widthHz, item.skew) * (item.amplitude / 400),
  }));

  // CEIL sets full-scale: amplitude=400 peaks at (1/CEIL)^PWR of graph height,
  // giving the power curve room to work rather than always slamming the top.
  const CEIL = 1.25, PWR = 1 / 1.25;
  const pts = [];
  for (let i = 0; i <= GRAPH_SAMPLES; i++) {
    const t = i / GRAPH_SAMPLES;
    const f = FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, t);
    const v = spectralEmission(f, item.peak, item.widthHz, item.skew) * (item.amplitude / 400);
    const vScaled = Math.pow(Math.min(v / CEIL, 1), PWR);
    const y = H - PAD - vScaled * (H - PAD * 2);
    pts.push([t * W, Math.max(PAD, y)]);
  }
  const d = 'M' + pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L');

  return (
    <div style={{ width: W, marginTop: -35 }}>
      {devMode && (
        <div style={{ display: 'flex', width: W, marginBottom: 1, position: 'relative', zIndex: 10 }}>
          {captures.map(b => (
            <div key={b.id} style={{ width: b.pct + '%', textAlign: 'center' }}>
              <span style={{
                fontSize: 14, fontFamily: 'monospace',
                color: b.val > 0.005 ? b.divColor : 'rgba(255,255,255,0.4)',
              }}>
                {b.val >= 0.005 ? (b.val * Y_MAX).toFixed(1) : '·'}
              </span>
            </div>
          ))}
        </div>
      )}
      <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
        {/* Band regions */}
        {bandRanges.map(b => {
          const x1 = hzToPos(b.lo) * W;
          const x2 = hzToPos(b.hi) * W;
          const isSelected = selectedBand && b.id === selectedBand;
          return <rect key={b.id} x={x1} y={0} width={x2 - x1} height={H}
            fill={b.divColor} opacity={isSelected ? 0.65 : 0.22} />;
        })}
        {/* Selected band highlight border */}
        {selectedBand && bandRanges.filter(b => b.id === selectedBand).map(b => {
          const x1 = hzToPos(b.lo) * W;
          const x2 = hzToPos(b.hi) * W;
          return <rect key="sel" x={x1} y={0} width={x2 - x1} height={H}
            fill="none" stroke={b.divColor} strokeWidth={1.5} opacity={0.9} />;
        })}
        {/* Band divider lines */}
        {bandRanges.slice(0, -1).map(b => {
          const x = hzToPos(b.hi) * W;
          return <line key={b.id} x1={x} y1={0} x2={x} y2={H}
            stroke="rgba(255,255,255,0.30)" strokeWidth={1} />;
        })}
        {/* Emission curve */}
        <path d={d} fill="none" stroke="rgba(255,255,255,1)" strokeWidth={1.5} />
        {/* Band labels */}
        {bandRanges.map(b => {
          const labelMap = { IR: 'IR', Visible: 'VIS', UV: 'UV', XRay: 'XRAY' };
          const x1 = hzToPos(b.lo) * W;
          const x2 = hzToPos(b.hi) * W;
          const cx = (x1 + x2) / 2;
          return (
            <text key={b.id} x={cx} y={H / 2}
              textAnchor="middle" dominantBaseline="middle" fontSize={12} fontFamily="monospace"
              fill={b.divColor} opacity={0.9} style={{ userSelect: 'none' }}>
              {labelMap[b.id]}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ── Dev slider ────────────────────────────────────────────────
function DevSlider({ label, min, max, step, value, onChange, fmt }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[8px] text-zinc-500 uppercase tracking-wider shrink-0 w-[72px] text-right">
        {label}
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
        className="w-24 cursor-pointer accent-violet-500"
        style={{ height: '3px' }}
        onChange={e => onChange(+e.target.value)} />
      <span className="text-[10px] text-zinc-200 tabular-nums font-mono w-12 text-left">
        {fmt ? fmt(value) : value}
      </span>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────
export default function App() {
  const [items,        setItems]        = useState([]);
  const [drag,         setDrag]         = useState(null);
  const [selectedBand, setSelectedBand] = useState('Visible');
  const [photoMode,    setPhotoMode]    = useState(false);

  // Frequency-scale dividers in Hz (log scale).
  // Initialised at geometric midpoints between adjacent band freqs.
  const [dividers, setDividers] = useState([400, 800, 5000]);
  const [divDrag,  setDivDrag]  = useState(null); // { idx, barLeft, barWidth }

  // Dev tuning
  const [devBlurScale,        setDevBlurScale]        = useState(0.08);
  const [devBulbVisBright,    setDevBulbVisBright]    = useState(20.0);
  const [devBulbCamMax,       setDevBulbCamMax]       = useState(0.6);
  const [devBtnX,             setDevBtnX]             = useState(0);
  const [devBtnY,             setDevBtnY]             = useState(0);
  const [devShowGraphsX,      setDevShowGraphsX]      = useState(0);
  const [devShowGraphsY,      setDevShowGraphsY]      = useState(0);
  const [devShowGraphsBtnX,   setDevShowGraphsBtnX]   = useState(0);
  const [devShowGraphsBtnY,   setDevShowGraphsBtnY]   = useState(0);
  const [devScreenX,          setDevScreenX]          = useState(0);
  const [devScreenY,          setDevScreenY]          = useState(0);
  const [devBtnYVis,          setDevBtnYVis]          = useState(0);
  const [devBtnYUV,           setDevBtnYUV]           = useState(0);
  const [devBtnYXRay,         setDevBtnYXRay]         = useState(0);
  const [devBtnYPhoto,        setDevBtnYPhoto]        = useState(0);
  // Baked: BTN_CX base +73, CYS [258,306,351,402,449]
  const [devMode, setDevMode] = useState(false);
  const [showGraphs, setShowGraphs] = useState(false);
  const [showTemp, setShowTemp] = useState(false);
  const [godMode, setGodMode] = useState(false);

  useEffect(() => {
    const secrets = ['god mode', 'godmode'];
    let buf = '';
    const handler = e => {
      buf = (buf + e.key).slice(-secrets[0].length);
      if (secrets.some(s => buf.endsWith(s))) setGodMode(true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  const [viewerPos, setViewerPos] = useState({ x: 40, y: 80 });
  const [viewerDrag, setViewerDrag] = useState(null); // { ox, oy }
  const [showDetector, setShowDetector] = useState(false);
  const [graphItemId,  setGraphItemId]  = useState(null);
  const graphItemIdRef = useRef(null);
  graphItemIdRef.current = graphItemId;

  // Viewer layout constants (image is 1224×1024)
  const VIEWER_H = 630;
  const VIEWER_W = Math.round(VIEWER_H * 1224 / 1024); // ≈ 752
  const VS = VIEWER_H / 1024; // scale factor based on height
  const SCREEN_L = 68 + devScreenX;
  const SCREEN_T = 74 + devScreenY;
  const SCREEN_W = Math.round(783 * VS) + 60;
  const SCREEN_H = 495;
  const BENCH_TOP = 30; // bench marginTop in px
  // 4 circular band buttons — positions fine-tuned to the panel image
  const BTN_CX  = Math.round(882 * VS) + 73 + devBtnX;
  const BTN_R   = Math.round(28  * VS);
  const BTN_CYS = [
    258 + devBtnY,
    306 + devBtnY + devBtnYVis,
    351 + devBtnY + devBtnYUV,
    402 + devBtnY + devBtnYXRay,
    449 + devBtnY + devBtnYPhoto,
  ];
  const dev = { blurScale: devBlurScale, glowPower: 0.5, glowScale: 6.0, glowX: 4, glowY: -2,
    bulbVisBright: devBulbVisBright, bulbCamMax: devBulbCamMax,
    bulbOutsideBlur: 22, bulbFilamentBlur: 1,
    bulbOutsideMag: 1.5, bulbFilamentMag: 2.5,
    maskX: { range: -11, bulb: 0, xray: 0, gel: 0, remote: 0, radiator: 0, led: 0, sun: 0 },
    maskY: { range: -25, bulb: 2, xray: 0, gel: 0, remote: 0, radiator: 0, led: 0, sun: 0 },
    benchX: { range: -12, bulb: 0, xray: 0, gel: 0, remote: 0, radiator: 0, led: 0, sun: 0 },
    benchY: { range: -26, bulb: 0, xray: 0, gel: 0, remote: 0, radiator: 0, led: 0, sun: 0 },
    visOpacity: { range: 5.0, bulb: 5.0,  xray: 1.0, gel: 5.0,  remote: 0, radiator: 0, led: 5.0, sun: 5.0 },
    visHue:     { range: -8,  bulb: 0,    xray: 0,   gel: -88,  remote: 0, radiator: 0, led: 0,   sun: 0 },
    visBlur:    { range: 3.0, bulb: 3.0,  xray: 1.0, gel: 4.5,  remote: 1.0, radiator: 1.0, led: 3.0, sun: 3.0 },
    visSat:     { range: 5.0, bulb: 8.0,  xray: 1.0, gel: 28.0, remote: 1.0, radiator: 1.0, led: 5.0, sun: 1.0 },
    visBright:  { range: 1.0, bulb: 1.0,  xray: 1.0, gel: 1.0,  remote: 1.0, radiator: 1.0, led: 1.0, sun: 1.0 } };

  // Band ranges in Hz; freq = geometric mean (midpoint on log scale).
  // pct = visual width % on the log-scale bar.
  const bandRanges = [
    { ...BANDS[0], lo: FREQ_MIN,    hi: dividers[0] },
    { ...BANDS[1], lo: dividers[0], hi: dividers[1] },
    { ...BANDS[2], lo: dividers[1], hi: dividers[2] },
    { ...BANDS[3], lo: dividers[2], hi: FREQ_MAX    },
  ].map(b => ({
    ...b,
    freq: Math.round(Math.sqrt(b.lo * b.hi)),           // geometric mean
    pct:  (hzToPos(b.hi) - hzToPos(b.lo)) * 100,       // visual width %
  }));

  const band = bandRanges.find(b => b.id === selectedBand);

  // ── Graph-in-detector: which item's graph to show ─────────────
  useEffect(() => {
    if (!showGraphs || !showDetector || items.length === 0) {
      if (graphItemIdRef.current !== null) setGraphItemId(null);
      return;
    }
    const screenLeft   = viewerPos.x + SCREEN_L;
    const screenTop    = viewerPos.y + SCREEN_T - BENCH_TOP;
    const screenRight  = screenLeft + SCREEN_W;
    const screenBottom = screenTop  + SCREEN_H;
    const screenArea   = SCREEN_W * SCREEN_H;

    const qualifying = [];
    for (const item of items) {
      const s = SOURCES[item.type];
      const imgH = s.w * (s.natH / s.natW);
      const ix1 = Math.max(item.x, screenLeft);
      const ix2 = Math.min(item.x + s.w, screenRight);
      const iy1 = Math.max(item.y, screenTop);
      const iy2 = Math.min(item.y + imgH, screenBottom);
      if (ix2 <= ix1 || iy2 <= iy1) continue;
      const intersection = (ix2 - ix1) * (iy2 - iy1);
      const passes = item.type === 'radiator'
        ? intersection / screenArea >= 1 / 3
        : intersection / (s.w * imgH) >= 0.5;
      if (passes) qualifying.push({ id: item.id, intersection });
    }

    if (qualifying.length === 0) {
      if (graphItemIdRef.current !== null) setGraphItemId(null);
      return;
    }
    if (qualifying.some(q => q.id === graphItemIdRef.current)) return; // keep current
    const best = qualifying.reduce((a, b) => a.intersection > b.intersection ? a : b);
    setGraphItemId(best.id);
  }, [showGraphs, showDetector, items, viewerPos]);

  const benchRef = useRef(null);
  const partsRef = useRef(null);

  const updateItem = (id, patch) =>
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));

  const startPartsDrag = (e, type) => {
    e.preventDefault();
    const s = SOURCES[type];
    setDrag({
      from: 'parts', type, id: null,
      cx: e.clientX, cy: e.clientY,
      sx: e.clientX, sy: e.clientY,
      ox: s.w / 2,
      oy: s.w * (s.natH / s.natW) * 0.38,
    });
  };

  const startBenchDrag = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setDrag({
      from: 'bench', type: item.type, id: item.id,
      cx: e.clientX, cy: e.clientY,
      sx: e.clientX, sy: e.clientY,
      ox: e.clientX - r.left,
      oy: e.clientY - r.top,
    });
  };

  const startDivDrag = (e, idx, barLeft, barWidth) => {
    e.preventDefault();
    e.stopPropagation();
    setDivDrag({ idx, barLeft, barWidth });
  };

  const onMove = (e) => {
    if (viewerDrag) {
      setViewerPos({ x: e.clientX - viewerDrag.ox, y: e.clientY - viewerDrag.oy });
      return;
    }
    if (divDrag) {
      const { idx, barLeft, barWidth } = divDrag;
      const pos = clamp((e.clientX - barLeft) / barWidth, 0, 1);
      const hz  = posToHz(pos);
      setDividers(prev => {
        const next = [...prev];
        // Keep at least 1 octave (factor 2) between adjacent dividers/edges
        const lo = idx === 0 ? FREQ_MIN * 2   : prev[idx - 1] * 2;
        const hi = idx === 2 ? FREQ_MAX / 2   : prev[idx + 1] / 2;
        next[idx] = clamp(hz, lo, hi);
        return next;
      });
      return;
    }
    if (drag) {
      setDrag(d => ({ ...d, cx: e.clientX, cy: e.clientY }));
      if (drag.from === 'bench' && benchRef.current) {
        const br = benchRef.current.getBoundingClientRect();
        const x = e.clientX - br.left - drag.ox;
        const y = e.clientY - br.top  - drag.oy;
        setItems(prev => prev.map(it => it.id === drag.id ? { ...it, x, y } : it));
      }
    }
  };

  const onUp = (e) => {
    if (viewerDrag) { setViewerDrag(null); return; }
    if (divDrag) { setDivDrag(null); return; }
    if (!drag) return;
    if (drag.from === 'bench' && partsRef.current) {
      const pr = partsRef.current.getBoundingClientRect();
      if (e.clientX >= pr.left && e.clientX <= pr.right &&
          e.clientY >= pr.top  && e.clientY <= pr.bottom) {
        setItems(prev => prev.filter(it => it.id !== drag.id));
        setDrag(null);
        return;
      }
    }
    if (benchRef.current) {
      const br = benchRef.current.getBoundingClientRect();
      const x = e.clientX - br.left - drag.ox;
      const y = e.clientY - br.top  - drag.oy;
      if (drag.from === 'parts' && drag.type === 'viewer') {
        const moved = Math.abs(e.clientX - drag.sx) > 40 || Math.abs(e.clientY - drag.sy) > 40;
        if (moved) {
          setViewerPos({ x: e.clientX - drag.ox, y: e.clientY - drag.oy });
          setShowDetector(true);
        }
        setDrag(null);
        return;
      }
      if (drag.from === 'parts') {
        // Require a real drag — ignore clicks or tiny movements
        const moved = Math.abs(e.clientX - drag.sx) > 40 || Math.abs(e.clientY - drag.sy) > 40;
        if (!moved) { setDrag(null); return; }
        // New drop — only accept if pointer lands inside bench
        if (e.clientX >= br.left && e.clientX <= br.right &&
            e.clientY >= br.top  && e.clientY <= br.bottom) {
          setItems(prev => {
            if (prev.some(it => it.type === drag.type)) return prev;
            return [...prev, {
              id: uid++, type: drag.type, x, y,
              amplitude: drag.type === 'sun' ? 500 : 0, skew: SLIDER_CFG[drag.type].skewDefault ?? 3.0,
              peak: SLIDER_CFG[drag.type].peakDefault,
              widthHz: SLIDER_CFG[drag.type].widthDefault,
              glowX:   GLOW_DEFAULTS[drag.type]?.glowX   ?? 0,
              glowY:   GLOW_DEFAULTS[drag.type]?.glowY   ?? 0,
              glowHue: GLOW_DEFAULTS[drag.type]?.glowHue ?? null,
              ...(drag.type === 'gel' ? { gelBenchLayers: [
                { on: true, opMult: 0.5  },  // 0 dome-T
                { on: true, opMult: 1.5  },  // 1 field
                { on: true, opMult: 1.35 },  // 2 dots-W
                { on: true, opMult: 1.35, hue: 310, lightness: 75 },  // 3 neon-1
                { on: true, opMult: 0.9  },  // 4 neon-2
              ] } : {}),
              ...(drag.type === 'led' ? { ledLayers: [
                { on: true, opacity: 0.85 },  // 0 bench bloom
                { on: true, opacity: 1.0  },  // 1 bench sharp
                { on: true, opacity: 0.85 },  // 2 cam bloom
                { on: true, opacity: 0.9  },  // 3 cam sharp
              ] } : {}),
            }];
          });
        }
      } else {
        // Position already updated live in onMove; nothing more to do
      }
    }
    setDrag(null);
  };

  const benchDragging = drag?.from === 'bench';

  return (
    <div
      className="h-screen w-screen flex flex-col select-none overflow-hidden"
      style={{ cursor: viewerDrag ? 'grabbing' : divDrag ? 'col-resize' : undefined }}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      {/* Dev mode + Show Graphs checkboxes — upper left */}
      <div style={{
        position: 'fixed', top: 6, left: 8, zIndex: 100,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <input
            id="devMode"
            type="checkbox"
            checked={devMode}
            onChange={e => setDevMode(e.target.checked)}
            style={{ accentColor: '#a855f7', width: 11, height: 11, cursor: 'pointer' }}
          />
          <label htmlFor="devMode" style={{
            fontSize: 9, color: 'black', cursor: 'pointer', userSelect: 'none',
          }}>
            Dev Mode
          </label>
        </div>
      </div>


      {/* ══════════════════════════════════════════
          TOP HALF — Lab Bench
      ══════════════════════════════════════════ */}
      <div className="relative flex-1" ref={benchRef} style={{ marginTop: 30 }}>
        <img src={`images/Table.PNG?v=${Date.now()}`}
          className="absolute pointer-events-none"
          style={{ top: -55, right: 0, left: 0, width: '100%', height: 'calc(100% + 55px)',
                   objectFit: 'cover', objectPosition: 'right center' }}
          draggable={false} />

        {/* Parts box */}
        <div ref={partsRef}
          className="absolute top-4 left-4 z-20 shadow-xl backdrop-blur-sm
                     rounded-2xl px-3 pt-2 pb-3 flex flex-col gap-2
                     border transition-colors duration-150"
          style={{
            background:  benchDragging ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0)',
            borderColor: benchDragging ? 'rgba(255,90,60,0.5)' : 'rgba(255,255,255,0.18)',
          }}>
          {/* Detector toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 4px' }}
            onPointerDown={e => e.stopPropagation()}
            onClick={() => setShowDetector(d => !d)}>
            <img src="images/PowerOn.png" draggable={false}
              style={{
                width: 32, height: Math.round(32 * 61/64), cursor: 'pointer', flexShrink: 0,
                opacity: showDetector ? 1 : 0.4,
                filter: showDetector ? 'drop-shadow(0 0 6px #f24a38cc)' : 'none',
              }} />
            <span style={{
              fontSize: 22, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase',
              color: 'black', cursor: 'pointer', userSelect: 'none', lineHeight: 1.1,
            }}>
              Show<br />Detector
            </span>
          </div>


          {/* Source group renderer */}
          {[
            { label: 'Heat Sources', color: 'rgba(251,146,60,0.7)', group: 'hot' },
            { label: 'Other Sources', color: 'rgba(96,165,250,0.7)', group: 'specialized' },
            ...(godMode ? [{ label: '✦ Secret', color: 'rgba(255,220,50,0.9)', group: 'secret' }] : []),
          ].map(({ label, color, group }) => {
            const groupSources = Object.entries(SOURCES).filter(([, s]) => s.group === group);
            return (
              <div key={group}>
                <p style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color, textAlign: 'left', marginBottom: 4 }}>
                  {label}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {groupSources.map(([type, s]) => {
                    const placed = items.some(it => it.type === type);
                    return (
                      <div key={type}
                        className="touch-none"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          opacity: placed ? 0.38 : 1,
                          cursor: placed ? 'default' : 'grab',
                          padding: '3px 4px',
                          borderRadius: 6,
                          background: placed ? 'rgba(255,255,255,0.04)' : 'transparent',
                        }}
                        onPointerDown={placed ? undefined : (e) => startPartsDrag(e, type)}>
                        <img src={s.src} alt={s.label} draggable={false}
                          className="drop-shadow pointer-events-none"
                          style={{ width: 40, height: 40, objectFit: 'contain', flexShrink: 0 }} />
                        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.75)', lineHeight: 1.3, flex: 1 }}>
                          {s.label}
                        </span>
                        {placed && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>✓</span>}
                      </div>
                    );
                  })}
                </div>
                <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '6px 0 4px' }} />
              </div>
            );
          })}
          <p className="text-white/20 text-[7px] text-center mt-0.5">drag back to remove</p>
          {items.length > 0 && (
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={() => setItems([])}
              style={{
                marginTop: 4, width: '100%', padding: '3px 0',
                fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'rgba(255,100,80,0.7)', background: 'rgba(255,60,40,0.1)',
                border: '1px solid rgba(255,80,60,0.25)', borderRadius: 6,
                cursor: 'pointer',
              }}>
              Clear All
            </button>
          )}
        </div>

        {/* Bench items — sliders above */}
        {items.map(item => {
          const isBeingDragged = drag?.from === 'bench' && drag.id === item.id;
          const s    = SOURCES[item.type];
          const imgH = s.w * (s.natH / s.natW);

          // Visible-band intensity for the real-life glow overlay
          const visBand       = bandRanges.find(b => b.id === 'Visible');
          const visIntensity  = bandIntensity(visBand.lo, visBand.hi, item.peak, item.widthHz, item.skew)
                                * (item.amplitude / 400);
          const visC     = visCurve(visIntensity * 2);
          const visBloom = clamp(1 + visC * 5,   1, 6);
          const visSharp = clamp(1 + visC * 4,   1, 5);
          const visBlurB = (10 + visC * 40) * dev.blurScale * dev.visBlur[item.type];
          const visBlurD = (2  + visC * 8)  * dev.blurScale * dev.visBlur[item.type];
          const visOp    = clamp(visC * dev.visOpacity[item.type], 0, 1);

          const gamma = x => x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
          const [gr, gg, gb] = spectrumToRgb(item, visBand);
          const glowColor = item.type === 'range'
            ? 'rgb(255,40,0)'
            : item.type === 'bulb'
            ? 'rgb(255,160,0)'
            : `rgb(${Math.round(gamma(gr)*255)},${Math.round(gamma(gg)*255)},${Math.round(gamma(gb)*255)})`;

          const panelW   = item.type === 'tanbulb' ? Math.round(s.w * 0.85) : s.w;
          const bgExtend = item.type === 'bulb' ? 35 : 0;
          const panelOff = Math.round((s.w - panelW) / 2);

          return (
            <div key={item.id} className="absolute touch-none"
              style={{ left: item.x, top: item.y, width: s.w }}>
              {!isBeingDragged && (devMode || item.type !== 'sun') && <div
                className="absolute rounded-lg px-2 py-2 flex flex-col gap-1.5
                           border border-white/10 backdrop-blur-sm"
                style={{
                  top: '100%',
                  marginTop: item.type === 'range' ? -16 : -6,
                  background: 'rgba(0,0,0,0.65)',
                  left: panelOff - bgExtend + (item.type === 'range' ? 20 : 0),
                  width: panelW + bgExtend * 2 - (item.type === 'range' ? 60 : 0),
                  position: 'absolute',
                  zIndex: 65,
                }}
                onPointerDown={e => e.stopPropagation()}>
                {devMode ? (
                  <>
                    {/* Amplitude */}
                    {item.type !== 'sun' && <div className="flex items-center gap-1.5">
                      <span className="text-[8px] text-zinc-400 w-[28px] shrink-0 uppercase tracking-wide">Amp</span>
                      <input type="range" min="0" max="500" value={item.amplitude}
                        className="flex-1 cursor-pointer accent-orange-400" style={{ height: '3px' }}
                        onChange={e => updateItem(item.id, { amplitude: +e.target.value })} />
                      <span className="text-[8px] text-zinc-500 w-6 text-right tabular-nums">{item.amplitude}</span>
                    </div>}
                    {/* Peak — log scale, per-type range */}
                    {(() => {
                      const cfg  = SLIDER_CFG[item.type];
                      const conv = makePeakConv(cfg.peakMin, cfg.peakMax);
                      return (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[8px] text-zinc-400 w-[28px] shrink-0 uppercase tracking-wide">Peak</span>
                          <span className="text-[7px] text-zinc-600 shrink-0">{fmtHz(cfg.peakMin)}</span>
                          <input type="range" min="0" max="100" value={conv.toSlider(item.peak)}
                            className="flex-1 cursor-pointer accent-sky-400" style={{ height: '3px' }}
                            onChange={e => updateItem(item.id, { peak: conv.fromSlider(+e.target.value) })} />
                          <span className="text-[7px] text-zinc-500 w-8 text-right tabular-nums shrink-0">
                            {fmtHz(item.peak)} Hz
                          </span>
                        </div>
                      );
                    })()}
                    {/* Width — direct Hz, per-type range */}
                    {(() => {
                      const cfg = SLIDER_CFG[item.type];
                      return (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[8px] text-zinc-400 w-[28px] shrink-0 uppercase tracking-wide">Width</span>
                          <span className="text-[7px] text-zinc-600 shrink-0">±{cfg.widthMin}</span>
                          <input type="range" min={cfg.widthMin} max={cfg.widthMax} value={item.widthHz}
                            className="flex-1 cursor-pointer accent-emerald-400" style={{ height: '3px' }}
                            onChange={e => updateItem(item.id, { widthHz: +e.target.value })} />
                          <span className="text-[7px] text-zinc-500 w-10 text-right tabular-nums shrink-0">
                            ±{fmtHz(item.widthHz)} Hz
                          </span>
                        </div>
                      );
                    })()}
                    {/* Skew 0.1–5.0 */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[8px] text-zinc-400 w-[28px] shrink-0 uppercase tracking-wide">Skew</span>
                      <span className="text-[7px] text-zinc-600 shrink-0">∿</span>
                      <input type="range" min="10" max="50" value={Math.round(item.skew * 10)}
                        className="flex-1 cursor-pointer accent-fuchsia-400" style={{ height: '3px' }}
                        onChange={e => updateItem(item.id, { skew: +e.target.value / 10 })} />
                      <span className="text-[7px] text-zinc-500 w-7 text-right tabular-nums shrink-0">
                        {item.skew.toFixed(1)}
                      </span>
                    </div>
                    {/* Glow X/Y offset sliders — hidden for LED (glow covers full image) */}
                    {item.type !== 'led' && <div className="flex items-center gap-1.5">
                      <span className="text-[8px] text-zinc-400 w-[28px] shrink-0 uppercase tracking-wide">Glow X</span>
                      <input type="range" min="-80" max="80" value={item.glowX ?? 0}
                        className="flex-1 cursor-pointer accent-cyan-400" style={{ height: '3px' }}
                        onChange={e => updateItem(item.id, { glowX: +e.target.value })} />
                      <span className="text-[7px] text-zinc-500 w-7 text-right tabular-nums shrink-0">
                        {item.glowX ?? 0}
                      </span>
                    </div>}
                    {item.type !== 'led' && <div className="flex items-center gap-1.5">
                      <span className="text-[8px] text-zinc-400 w-[28px] shrink-0 uppercase tracking-wide">Glow Y</span>
                      <input type="range" min="-80" max="80" value={item.glowY ?? 0}
                        className="flex-1 cursor-pointer accent-cyan-400" style={{ height: '3px' }}
                        onChange={e => updateItem(item.id, { glowY: +e.target.value })} />
                      <span className="text-[7px] text-zinc-500 w-7 text-right tabular-nums shrink-0">
                        {item.glowY ?? 0}
                      </span>
                    </div>}
                    {item.type === 'gel' && item.gelBenchLayers && (() => {
                      const labels = ['dome-T','field','dots-W','neon-1','neon-2'];
                      const upd = (i, patch) => {
                        const next = item.gelBenchLayers.map((l, j) => j === i ? { ...l, ...patch } : l);
                        updateItem(item.id, { gelBenchLayers: next });
                      };
                      return (
                        <div style={{ marginTop: 3 }}>
                          {labels.map((lbl, i) => {
                            const layer = item.gelBenchLayers[i];
                            return (
                              <div key={i} style={{ marginBottom: 3 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <input type="checkbox" checked={layer.on}
                                    style={{ width: 10, height: 10, accentColor: '#a78bfa', flexShrink: 0, cursor: 'pointer' }}
                                    onChange={e => upd(i, { on: e.target.checked })} />
                                  <span style={{ fontSize: 7, fontFamily: 'monospace', width: 42, flexShrink: 0,
                                    color: layer.on ? '#a1a1aa' : '#52525b' }}>{lbl}</span>
                                  <input type="range" min="0" max="200" step="5" value={Math.round(layer.opMult * 100)}
                                    disabled={!layer.on}
                                    style={{ flex: 1, height: 3, cursor: 'pointer', accentColor: '#f472b6' }}
                                    onChange={e => upd(i, { opMult: +e.target.value / 100 })} />
                                  <span style={{ fontSize: 7, fontFamily: 'monospace', width: 28, textAlign: 'right',
                                    flexShrink: 0, color: '#71717a' }}>{layer.opMult.toFixed(2)}×</span>
                                </div>
                                {lbl === 'neon-1' && (<>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, paddingLeft: 14 }}>
                                    <span style={{ fontSize: 6, color: '#71717a', flexShrink: 0, width: 12 }}>hue</span>
                                    <input type="range" min="240" max="340" step="1" value={layer.hue ?? 310}
                                      disabled={!layer.on}
                                      style={{ flex: 1, height: 3, cursor: 'pointer', accentColor: '#cc44ff' }}
                                      onChange={e => upd(i, { hue: +e.target.value })} />
                                    <span style={{ fontSize: 7, fontFamily: 'monospace', width: 28, textAlign: 'right',
                                      flexShrink: 0, color: '#71717a' }}>{layer.hue ?? 310}°</span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, paddingLeft: 14 }}>
                                    <span style={{ fontSize: 6, color: '#71717a', flexShrink: 0, width: 12 }}>lit</span>
                                    <input type="range" min="20" max="90" step="1" value={layer.lightness ?? 50}
                                      disabled={!layer.on}
                                      style={{ flex: 1, height: 3, cursor: 'pointer', accentColor: '#cc44ff' }}
                                      onChange={e => upd(i, { lightness: +e.target.value })} />
                                    <span style={{ fontSize: 7, fontFamily: 'monospace', width: 28, textAlign: 'right',
                                      flexShrink: 0, color: '#71717a' }}>{layer.lightness ?? 50}%</span>
                                  </div>
                                </>)}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                    {item.type === 'led' && item.ledLayers && (() => {
                      const labels = ['bench bloom', 'bench sharp', 'cam bloom', 'cam sharp'];
                      const upd = (i, patch) => {
                        const next = item.ledLayers.map((l, j) => j === i ? { ...l, ...patch } : l);
                        updateItem(item.id, { ledLayers: next });
                      };
                      return (
                        <div style={{ marginTop: 3 }}>
                          {labels.map((lbl, i) => {
                            const layer = item.ledLayers[i];
                            return (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                                <input type="checkbox" checked={layer.on}
                                  style={{ width: 10, height: 10, accentColor: '#fbbf24', flexShrink: 0, cursor: 'pointer' }}
                                  onChange={e => upd(i, { on: e.target.checked })} />
                                <span style={{ fontSize: 7, fontFamily: 'monospace', width: 52, flexShrink: 0,
                                  color: layer.on ? '#a1a1aa' : '#52525b' }}>{lbl}</span>
                                <input type="range" min="0" max="200" step="5" value={Math.round(layer.opacity * 100)}
                                  disabled={!layer.on}
                                  style={{ flex: 1, height: 3, cursor: 'pointer', accentColor: '#fbbf24' }}
                                  onChange={e => upd(i, { opacity: +e.target.value / 100 })} />
                                <span style={{ fontSize: 7, fontFamily: 'monospace', width: 28, textAlign: 'right',
                                  flexShrink: 0, color: '#71717a' }}>{layer.opacity.toFixed(2)}×</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </>
                ) : item.type === 'sun' ? null : (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[8px] text-zinc-400 w-[28px] shrink-0 uppercase tracking-wide">Power</span>
                    <input type="range" min="0" max={item.type === 'radiator' ? 120 : 500} value={item.amplitude}
                      className="flex-1 cursor-pointer accent-orange-400" style={{ height: '3px' }}
                      onChange={e => {
                        const v = +e.target.value;
                        const t = item.type === 'radiator' ? v / 120 : v / 500;
                        if (item.type === 'range') {
                          updateItem(item.id, { amplitude: v, peak: Math.round(50 + t * 190) });
                        } else if (item.type === 'radiator') {
                          updateItem(item.id, { amplitude: v, peak: Math.round(10 + t * 25) });
                        } else if (item.type === 'bulb') {
                          updateItem(item.id, { amplitude: v, peak: Math.round(200 + t * 380) });
                        } else {
                          updateItem(item.id, { amplitude: v });
                        }
                      }} />
                  </div>
                )}
              </div>}
              {/* Item image + visible-light glow overlay */}
              <div style={{ position: 'relative', width: s.w, height: imgH }}>
                {/* Sun bench glow — always on, multiple bloom layers */}
                {item.type === 'sun' && (<>
                  <div style={{ position: 'absolute', left: -s.w, top: -s.w, width: s.w*3, height: s.w*3, borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(255,240,150,0.55) 0%, rgba(255,180,30,0.25) 35%, rgba(255,100,0,0.08) 65%, transparent 100%)',
                    filter: 'blur(30px)', mixBlendMode: 'screen', pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', left: -s.w*0.3, top: -s.w*0.3, width: s.w*1.6, height: s.w*1.6, borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(255,255,220,0.9) 0%, rgba(255,220,80,0.6) 40%, transparent 75%)',
                    filter: 'blur(8px)', mixBlendMode: 'screen', pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', left: s.w*0.05, top: s.w*0.05, width: s.w*0.9, height: s.w*0.9, borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(255,255,255,1) 30%, rgba(255,240,180,0.9) 70%, transparent 100%)',
                    mixBlendMode: 'screen', pointerEvents: 'none' }} />
                </>)}
                <img src={s.src} alt={s.label}
                  style={{ width: s.w, height: imgH, display: 'block' }}
                  className="drop-shadow-lg"
                  draggable={false} />
                {/* Drag hit area — excludes bottom 50px for heater */}
                <div
                  style={{
                    position: 'absolute', top: 0, left: 0, width: s.w,
                    height: item.type === 'range' ? imgH - 50 : imgH,
                    cursor: 'grab',
                  }}
                  onPointerDown={(e) => startBenchDrag(e, item)} />
                {item.type === 'bulb' && visIntensity > 0.005 && (() => {
                  const bX = dev.benchX[item.type], bY = dev.benchY[item.type];
                  const bulbR     = Math.pow(visC, 1.8); // gradual at low, steeper toward high
                  const bulbBlurB = (42 + bulbR * 42) * dev.blurScale * dev.visBlur[item.type];
                  const color = 'rgb(255,160,0)';
                  const colorFilter      = `hue-rotate(${dev.visHue[item.type]}deg) saturate(${dev.visSat[item.type]})`;
                  const filamentColorFilter = `hue-rotate(${dev.visHue[item.type] - 20}deg) saturate(${dev.visSat[item.type]})`;
                  return (
                    <>
                      {/* Outside — wide bloom */}
                      <div style={{
                        position: 'absolute', top: bY, left: bX, width: s.w, height: imgH,
                        filter: `blur(${bulbBlurB}px) brightness(${dev.bulbVisBright})`,
                        opacity: bulbR * 0.95, mixBlendMode: 'screen',
                        isolation: 'isolate', pointerEvents: 'none', backgroundColor: 'black',
                      }}>
                        <img src={s.outsideSrc} draggable={false}
                          style={{ position: 'absolute', inset: 0, width: s.w, height: imgH, filter: `brightness(${visBloom})` }} />
                        <div style={{ position: 'absolute', inset: 0, backgroundColor: color, mixBlendMode: 'multiply', filter: colorFilter }} />
                      </div>
                      {/* Filament — tight core */}
                      <div style={{
                        position: 'absolute', top: bY, left: bX, width: s.w, height: imgH,
                        filter: `blur(${visBlurD}px) brightness(${dev.bulbVisBright * 0.5})`,
                        opacity: clamp(visOp * dev.bulbVisBright / 2, 0, 1), mixBlendMode: 'screen',
                        isolation: 'isolate', pointerEvents: 'none', backgroundColor: 'black',
                      }}>
                        <img src={s.filamentSrc} draggable={false}
                          style={{ position: 'absolute', inset: 0, width: s.w, height: imgH, filter: `brightness(${visSharp})` }} />
                        <div style={{ position: 'absolute', inset: 0, backgroundColor: color, mixBlendMode: 'multiply', filter: filamentColorFilter }} />
                      </div>
                    </>
                  );
                })()}
                {/* Gel lamp — amplitude^0.5 ramp keeps building all the way to 100% */}
                {item.type === 'gel' && item.amplitude > 0 && (() => {
                  const g      = Math.pow(clamp(item.amplitude / 500, 0, 1), 0.5);
                  const gWhite = Math.pow(clamp((item.amplitude - 150) / 350, 0, 1), 0.5);
                  const gTop  = dev.benchY[item.type] + (item.glowY ?? 0);
                  const gLeft = dev.benchX[item.type] + (item.glowX ?? 0);
                  // All glow layers: luminance-mask a solid color, blur the container, normal blend.
                  // Covers underlying pixels (no screen-blend washout over white device image).
                  const glowLayer = (src, blur, color, op) => (
                    <div style={{
                      position: 'absolute', top: gTop, left: gLeft, width: s.w, height: imgH,
                      filter: `blur(${blur}px)`, opacity: Math.min(op, 1),
                      mixBlendMode: 'normal', pointerEvents: 'none', zIndex: 1,
                    }}>
                      <div style={{
                        position: 'absolute', inset: 0,
                        backgroundColor: color,
                        maskImage: `url(${src})`,
                        WebkitMaskImage: `url(${src})`,
                        maskMode: 'luminance',
                        maskSize: '100% 100%',
                        WebkitMaskSize: '100% 100%',
                      }} />
                    </div>
                  );
                  const gl = item.gelBenchLayers ?? [
                    { on: true, opMult: 0.5  }, { on: true, opMult: 1.5  },
                    { on: true, opMult: 1.35 }, { on: true, opMult: 1.35 },
                    { on: true, opMult: 0.9  },
                  ];
                  const vis = i => gl[i].on;
                  const op  = (base, i) => Math.min(base * gl[i].opMult, 1);
                  return (<>
                    {vis(0) && glowLayer(s.outsideSrc,   8 + gWhite * 12, '#6600ff', op(gWhite * 1.40, 0))}
                    {vis(1) && s.fieldSrc && glowLayer(s.fieldSrc, 12 + g * 20, '#bb44ff', op(g * 1.26, 1))}
                    {vis(2) && glowLayer(s.filamentSrc,  1 + g * 2,       '#6600ff', op(g * 1.40, 2))}
                    {vis(4) && glowLayer(s.filamentSrc,  0.4,             '#8800ff', op(g, 4))}
                    {vis(3) && glowLayer(s.filamentSrc,  3 + g * 3,       `hsl(${gl[3].hue ?? 310}, 100%, ${gl[3].lightness ?? 50}%)`, op(g, 3))}
                  </>);
                })()}

                {s.maskSrc && item.type !== 'gel' && item.type !== 'led' && visIntensity > 0.005 && (
                    <>
                      {/* Bloom — wide soft layer */}
                      <div style={{
                        position: 'absolute',
                        top: dev.benchY[item.type] + (item.glowY ?? 0),
                        left: dev.benchX[item.type] + (item.glowX ?? 0),
                        width: s.w, height: imgH,
                        filter: `blur(${visBlurB}px)`,
                        opacity: visOp * 0.7, mixBlendMode: 'screen',
                        isolation: 'isolate', pointerEvents: 'none',
                        backgroundColor: 'black',
                      }}>
                        <img src={s.maskSrc} draggable={false}
                          style={{ position: 'absolute', inset: 0, width: s.w, height: imgH, filter: `brightness(${visBloom})` }} />
                        <div style={{ position: 'absolute', inset: 0, backgroundColor: glowColor, mixBlendMode: 'multiply',
                          filter: `hue-rotate(${dev.visHue[item.type]}deg) saturate(${dev.visSat[item.type]}) brightness(${dev.visBright[item.type]})` }} />
                      </div>
                      {/* Sharp — tight core */}
                      <div style={{
                        position: 'absolute',
                        top: dev.benchY[item.type] + (item.glowY ?? 0),
                        left: dev.benchX[item.type] + (item.glowX ?? 0),
                        width: s.w, height: imgH,
                        filter: `blur(${visBlurD}px)`,
                        opacity: visOp, mixBlendMode: 'screen',
                        isolation: 'isolate', pointerEvents: 'none',
                        backgroundColor: 'black',
                      }}>
                        <img src={s.maskSrc} draggable={false}
                          style={{ position: 'absolute', inset: 0, width: s.w, height: imgH, filter: `brightness(${visSharp})` }} />
                        <div style={{ position: 'absolute', inset: 0, backgroundColor: glowColor, mixBlendMode: 'multiply',
                          filter: `hue-rotate(${dev.visHue[item.type]}deg) saturate(${dev.visSat[item.type]}) brightness(${dev.visBright[item.type]})` }} />
                      </div>
                    </>
                  )}
                {/* LED bench glow — luminance-mask solid color, controlled by ledLayers[0/1] */}
                {item.type === 'led' && s.maskSrc && visIntensity > 0.005 && (() => {
                  const ll = item.ledLayers ?? [
                    { on: true, opacity: 0.85 }, { on: true, opacity: 1.0 },
                    { on: true, opacity: 0.85 }, { on: true, opacity: 0.9 },
                  ];
                  const ledBenchLayer = (blur, color, op) => (
                    <div style={{
                      position: 'absolute', top: 0, left: 0, width: s.w, height: imgH,
                      filter: `blur(${blur}px)`, opacity: op, mixBlendMode: 'normal', pointerEvents: 'none',
                    }}>
                      <div style={{
                        position: 'absolute', inset: 0, backgroundColor: color,
                        maskImage: `url(${s.maskSrc})`, WebkitMaskImage: `url(${s.maskSrc})`,
                        maskMode: 'luminance', maskSize: '100% 100%', WebkitMaskSize: '100% 100%',
                      }} />
                    </div>
                  );
                  const ledI = clamp(visC * dev.visOpacity[item.type], 0, 1);
                  return (<>
                    {ll[0].on && ledBenchLayer(32, '#ffe566', ledI * ll[0].opacity)}
                    {ll[1].on && ledBenchLayer(3,  '#fff5aa', ledI * ll[1].opacity)}
                  </>);
                })()}
              </div>
              {/* Graph on bench — visible in dev mode with Show Graphs, regardless of detector */}
              {devMode && showGraphs && (() => {
                const graphW = (item.type === 'bulb' || item.type === 'xray')
                  ? Math.round(panelW * 1.4) : panelW;
                const graphLeft = Math.round((s.w - graphW) / 2);
                return (
                  <div style={{
                    position: 'absolute',
                    left: graphLeft,
                    bottom: '100%',
                    marginBottom: item.type === 'range' ? 18 : 8,
                    width: graphW,
                    pointerEvents: 'none',
                    zIndex: 30,
                  }}>
                    <EmissionGraph item={item} bandRanges={bandRanges} width={graphW}
                      devMode={devMode} selectedBand={selectedBand} />
                  </div>
                );
              })()}
            </div>
          );
        })}

      </div>

      {/* Dev panel — fixed bottom strip */}
      {devMode && (
        <div className="fixed bottom-0 left-0 right-0 z-40
                        flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-2
                        bg-zinc-950/92 border-t border-zinc-800/60 backdrop-blur-sm">
          <span className="text-[8px] text-zinc-600 uppercase tracking-widest shrink-0">Dev</span>
          <DevSlider label="Blur ×" min={0} max={0.5} step={0.01}
            value={devBlurScale} onChange={setDevBlurScale} fmt={v => v.toFixed(2)} />
          <DevSlider label="Bulb Bright" min={0} max={20} step={0.5}
            value={devBulbVisBright} onChange={setDevBulbVisBright} fmt={v => v.toFixed(1)} />
          <DevSlider label="Cam Vis Max" min={0.05} max={1.0} step={0.025}
            value={devBulbCamMax} onChange={setDevBulbCamMax} fmt={v => v.toFixed(3)} />
          <DevSlider label="ShowGr X" min={-300} max={300} step={1}
            value={devShowGraphsX} onChange={setDevShowGraphsX} fmt={v => v.toFixed(0)} />
          <DevSlider label="ShowGr Y" min={-300} max={300} step={1}
            value={devShowGraphsY} onChange={setDevShowGraphsY} fmt={v => v.toFixed(0)} />
          <DevSlider label="GrBtn X" min={-300} max={700} step={1}
            value={devShowGraphsBtnX} onChange={setDevShowGraphsBtnX} fmt={v => v.toFixed(0)} />
          <DevSlider label="GrBtn Y" min={-300} max={700} step={1}
            value={devShowGraphsBtnY} onChange={setDevShowGraphsBtnY} fmt={v => v.toFixed(0)} />
          <DevSlider label="Screen X" min={-300} max={300} step={1}
            value={devScreenX} onChange={setDevScreenX} fmt={v => v.toFixed(0)} />
          <DevSlider label="Screen Y" min={-300} max={300} step={1}
            value={devScreenY} onChange={setDevScreenY} fmt={v => v.toFixed(0)} />
          <DevSlider label="Btn X" min={-200} max={200} step={1}
            value={devBtnX} onChange={setDevBtnX} fmt={v => v.toFixed(0)} />
          <DevSlider label="Btn Y (all)" min={-200} max={200} step={1}
            value={devBtnY} onChange={setDevBtnY} fmt={v => v.toFixed(0)} />
          <DevSlider label="Vis Y" min={-100} max={100} step={1}
            value={devBtnYVis} onChange={setDevBtnYVis} fmt={v => v.toFixed(0)} />
          <DevSlider label="UV Y" min={-100} max={100} step={1}
            value={devBtnYUV} onChange={setDevBtnYUV} fmt={v => v.toFixed(0)} />
          <DevSlider label="XRay Y" min={-100} max={100} step={1}
            value={devBtnYXRay} onChange={setDevBtnYXRay} fmt={v => v.toFixed(0)} />
          <DevSlider label="Photo Y" min={-100} max={100} step={1}
            value={devBtnYPhoto} onChange={setDevBtnYPhoto} fmt={v => v.toFixed(0)} />
        </div>
      )}

      {/* ══════════════════════════════════════════
          VIEWER — draggable camera device
      ══════════════════════════════════════════ */}
      {showDetector && <div
        style={{
          position: 'fixed', left: viewerPos.x, top: viewerPos.y,
          width: VIEWER_W, height: VIEWER_H,
          zIndex: 60, touchAction: 'none',
          cursor: viewerDrag ? 'grabbing' : 'grab',
        }}
        onPointerDown={e => {
          setViewerDrag({ ox: e.clientX - viewerPos.x, oy: e.clientY - viewerPos.y });
        }}
      >
        {/* Screen — behind the viewer image, visible through its transparent center */}
        <div
          style={{
            position: 'absolute', left: SCREEN_L, top: SCREEN_T,
            width: SCREEN_W, height: SCREEN_H,
            overflow: 'hidden', zIndex: 1,
            background: photoMode ? 'transparent' : '#000',
          }}
        >
          {/* Show Graphs label */}
          <div
            style={{
              position: 'absolute',
              left: 14 + devShowGraphsX,
              top: '50%',
              transform: `translateY(calc(-50% - 78px + ${devShowGraphsY}px))`,
              zIndex: 20, pointerEvents: 'auto', cursor: 'pointer',
            }}
            onClick={() => setShowGraphs(g => !g)}>
            <span style={{
              fontFamily: '"Courier New", Courier, monospace',
              fontSize: 22, fontWeight: 'bold', letterSpacing: '0.08em',
              color: showGraphs ? '#fe2b71' : 'rgba(254,43,113,0.6)',
              textShadow: showGraphs ? [
                '0 0 2px #fe2b71',
                '0 0 8px #fe2b71dd',
                '0 0 18px #fe2b7188',
                '0 0 35px #fe2b7144',
              ].join(', ') : 'none',
              filter: showGraphs ? 'brightness(1.3) contrast(1.1)' : 'none',
              userSelect: 'none', lineHeight: 1.0, textAlign: 'left', display: 'block',
            }}>
              GRAPHS
            </span>
          </div>

          {/* TEMP label — 111px below GRAPHS */}
          <div
            style={{
              position: 'absolute',
              left: 14 + devShowGraphsX,
              top: '50%',
              transform: `translateY(calc(-50% - 78px + ${devShowGraphsY}px + 111px))`,
              zIndex: 20, pointerEvents: 'auto', cursor: 'pointer',
            }}
            onClick={() => setShowTemp(t => !t)}>
            <span style={{
              fontFamily: '"Courier New", Courier, monospace',
              fontSize: 22, fontWeight: 'bold', letterSpacing: '0.08em',
              color: showTemp ? '#4e44ff' : 'rgba(78,68,255,0.6)',
              textShadow: showTemp ? [
                '0 0 2px #4e44ff',
                '0 0 8px #4e44ffdd',
                '0 0 18px #4e44ff88',
                '0 0 35px #4e44ff44',
              ].join(', ') : 'none',
              filter: showTemp ? 'brightness(1.3) contrast(1.1)' : 'none',
              userSelect: 'none', lineHeight: 1.0, textAlign: 'left', display: 'block',
            }}>
              TEMP
            </span>
          </div>

          {/* CRT scanlines */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5,
            backgroundImage: 'repeating-linear-gradient(transparent, transparent 2px, rgba(0,0,0,0.18) 2px, rgba(0,0,0,0.18) 3px)',
            backgroundSize: '100% 3px',
          }} />

          {/* Mode title — always shown, including CAMERA MODE in None */}
          {(() => {
            const titleMap = { IR: 'IR RADIATION', Visible: 'VISIBLE RADIATION', UV: 'UV RADIATION', XRay: 'XRAY RADIATION' };
            const colorMap = { IR: '#ff6622', Visible: '#d4c060', UV: '#aa22ff', XRay: '#44aaff' };
            const title = photoMode ? 'CAMERA MODE' : titleMap[selectedBand];
            const color = photoMode ? '#9df85c' : colorMap[selectedBand];
            return (
              <div style={{
                position: 'absolute', top: 35, left: 0, right: 0,
                display: 'flex', justifyContent: 'center',
                pointerEvents: 'none', zIndex: 10,
              }}>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <span style={{
                    fontFamily: '"Courier New", Courier, monospace',
                    fontSize: 26, fontWeight: 'bold', letterSpacing: '0.18em',
                    color,
                    textShadow: [
                      `0 0 2px ${color}`,
                      `0 0 8px ${color}dd`,
                      `0 0 18px ${color}99`,
                      `0 0 40px ${color}55`,
                    ].join(', '),
                    userSelect: 'none', display: 'block',
                    filter: 'brightness(1.3) contrast(1.1)',
                  }}>
                    {title}
                  </span>
                  {/* Scanlines over the text — hidden in Camera mode (transparent screen) */}
                  {!photoMode && <div style={{
                    position: 'absolute', inset: 0, pointerEvents: 'none',
                    backgroundImage: 'repeating-linear-gradient(transparent, transparent 2px, rgba(0,0,0,0.22) 2px, rgba(0,0,0,0.22) 3px)',
                    backgroundSize: '100% 3px',
                  }} />}
                </div>
              </div>
            );
          })()}

          {/* None mode — screen is transparent; bench shows through physically. No content needed. */}
          {!photoMode && (items.length === 0 ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', textAlign: 'center', padding: 12,
              color: '#3f3f46', fontSize: 10, lineHeight: 1.4,
            }}>
              Place a light source on the bench.
            </div>
          ) : (
            /* Spectrum mode — translate bench coords into detector viewport */
            <div style={{
              position: 'absolute',
              left: -(viewerPos.x + SCREEN_L),
              top:  -(viewerPos.y + SCREEN_T) + BENCH_TOP,
            }}>
              {items.map(item => {
                const intensity = bandIntensity(band.lo, band.hi, item.peak, item.widthHz, item.skew)
                                * (item.amplitude / 400);
                const s = SOURCES[item.type];
                return (
                  <React.Fragment key={item.id}>
                    <EmissionShape item={item} band={band} intensity={intensity} dev={dev} />
                  </React.Fragment>
                );
              })}
            </div>
          ))}

          {/* Graph overlay — below mode title (top ~75px) */}
          {showGraphs && graphItemId && (() => {
            const item = items.find(it => it.id === graphItemId);
            if (!item) return null;
            return (
              <div style={{
                position: 'absolute', left: 30, top: 72, width: SCREEN_W - 70,
                paddingTop: 35, // offsets EmissionGraph's internal marginTop:-35 so background fills correctly
                pointerEvents: 'none', zIndex: 15,
                background: photoMode ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.65)',
                borderBottom: photoMode ? '1px solid rgba(0,0,0,0.15)' : '1px solid rgba(255,255,255,0.12)',
              }}>
                <EmissionGraph item={item} bandRanges={bandRanges} width={SCREEN_W - 70}
                  devMode={devMode} selectedBand={photoMode ? null : selectedBand} />
              </div>
            );
          })()}

          {/* TEMP readout */}
          {showTemp && (() => {
            const item = items.find(it => it.id === graphItemId);
            const temp = item ? itemTemp(item) : null;
            if (temp == null) return null;
            return (
              <div style={{
                position: 'absolute', left: 30, bottom: 28,
                pointerEvents: 'none', zIndex: 15,
              }}>
                <span style={{
                  fontFamily: '"Courier New", Courier, monospace',
                  fontSize: 20, fontWeight: 'bold', letterSpacing: '0.08em',
                  color: '#4e44ff',
                  textShadow: [
                    '0 0 2px #4e44ff',
                    '0 0 8px #4e44ffdd',
                    '0 0 18px #4e44ff88',
                    '0 0 35px #4e44ff44',
                  ].join(', '),
                  filter: 'brightness(1.3) contrast(1.1)',
                  userSelect: 'none',
                }}>
                  TEMP = {temp}°C
                </span>
              </div>
            );
          })()}
        </div>

        {/* Show Graphs rounded rect button — on detector face, above viewer image */}
        <div
          style={{
            position: 'absolute',
            left: 27 + devShowGraphsBtnX,
            top: 222 + devShowGraphsBtnY,
            width: 35, height: 32, borderRadius: 6,
            background: showGraphs ? '#fe2b7180' : 'rgba(0,0,0,0)',
            border: `2px solid ${showGraphs ? '#fe2b71' : 'rgba(254,43,113,0.4)'}`,
            boxShadow: showGraphs ? [
              '0 0 12px 6px #fe2b71D9',
              '0 0 30px 12px #fe2b7194',
              '0 0 60px 20px #fe2b7162',
            ].join(', ') : 'none',
            zIndex: 3, pointerEvents: 'auto', cursor: 'pointer',
            transition: 'background 0.15s, box-shadow 0.15s',
          }}
          onClick={() => setShowGraphs(g => !g)}
        />

        {/* TEMP button — 111px below GRAPHS button */}
        <div
          style={{
            position: 'absolute',
            left: 27 + devShowGraphsBtnX,
            top: 333 + devShowGraphsBtnY,
            width: 35, height: 32, borderRadius: 6,
            background: showTemp ? '#4e44ff80' : 'rgba(0,0,0,0)',
            border: `2px solid ${showTemp ? '#4e44ff' : 'rgba(78,68,255,0.4)'}`,
            boxShadow: showTemp ? [
              '0 0 12px 6px #4e44ffD9',
              '0 0 30px 12px #4e44ff94',
              '0 0 60px 20px #4e44ff62',
            ].join(', ') : 'none',
            zIndex: 3, pointerEvents: 'auto', cursor: 'pointer',
            transition: 'background 0.15s, box-shadow 0.15s',
          }}
          onClick={() => setShowTemp(t => !t)}
        />

        {/* Power button — glows when detector is on, click to hide */}
        <div
          style={{
            position: 'absolute',
            left: 29 + devShowGraphsBtnX,
            top: 362 + devShowGraphsBtnY,
            width: 35, height: 32, borderRadius: 6,
            background: showDetector ? '#f24a3880' : 'rgba(0,0,0,0)',
            border: `1px solid ${showDetector ? '#f24a38' : 'rgba(242,74,56,0.4)'}`,
            boxShadow: showDetector ? [
              '0 0 12px 6px #f24a38D9',
              '0 0 30px 12px #f24a3894',
              '0 0 60px 20px #f24a3862',
            ].join(', ') : 'none',
            zIndex: 3, pointerEvents: 'auto', cursor: 'pointer',
            transition: 'background 0.15s, box-shadow 0.15s',
          }}
          onClick={() => setShowDetector(d => !d)}
        />
        {/* ON label — directly below SHOW GRAPH text */}
        <div style={{
          position: 'absolute',
          left: SCREEN_L + 14 + devShowGraphsX,
          top: 364,
          zIndex: 3, pointerEvents: 'auto', cursor: 'pointer',
          display: 'flex', alignItems: 'center', height: 32,
        }}
          onClick={() => setShowDetector(d => !d)}>
          <span style={{
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: 22, fontWeight: 'bold', letterSpacing: '0.08em',
            color: showDetector ? '#f24a38' : 'rgba(242,74,56,0.6)',
            textShadow: showDetector ? [
              '0 0 2px #f24a38',
              '0 0 8px #f24a38dd',
              '0 0 18px #f24a3888',
              '0 0 35px #f24a3844',
            ].join(', ') : 'none',
            filter: showDetector ? 'brightness(1.3) contrast(1.1)' : 'none',
            userSelect: 'none',
          }}>ON</span>
        </div>

        {/* Device image — on top, transparent center reveals the screen behind */}
        <img src="images/viewer.png" draggable={false}
          style={{
            position: 'absolute', inset: 0,
            width: VIEWER_W, height: VIEWER_H,
            userSelect: 'none', pointerEvents: 'none',
            zIndex: 2,
          }} />

        {/* Band selector buttons + labels */}
        {BANDS.map((b, i) => {
          const isActive = !photoMode && selectedBand === b.id;
          const labelMap = { IR: 'IR', Visible: 'VIS', UV: 'UV', XRay: 'XRAY' };
          const labelRight = VIEWER_W - (BTN_CX - BTN_R - 6);
          return (
            <div key={b.id}>
              {/* Label — right-justified, double size, CRT screen look */}
              <div style={{
                position: 'absolute',
                right: labelRight + 15,
                width: 90,
                textAlign: 'right',
                top:  BTN_CYS[i] - 13,
                zIndex: 10,
                pointerEvents: 'none',
                userSelect: 'none',
              }}>
                <span style={{
                  fontFamily: '"Courier New", Courier, monospace',
                  fontSize: 22, fontWeight: 'bold', letterSpacing: '0.08em',
                  color: isActive ? b.divColor : 'rgba(255,255,255,0.28)',
                  textShadow: isActive ? [
                    `0 0 2px ${b.divColor}`,
                    `0 0 8px ${b.divColor}dd`,
                    `0 0 18px ${b.divColor}88`,
                    `0 0 35px ${b.divColor}44`,
                  ].join(', ') : 'none',
                  transition: 'color 0.12s, text-shadow 0.12s',
                  filter: isActive ? 'brightness(1.3) contrast(1.1)' : 'none',
                  display: 'block',
                }}>
                  {labelMap[b.id]}
                </span>
              </div>
              {/* Hit area — 2px smaller radius, unearthly glow when active */}
              <div
                style={{
                  position: 'absolute',
                  left: BTN_CX - BTN_R + 2,
                  top:  BTN_CYS[i] - BTN_R + 2,
                  width:  BTN_R * 2 - 4,
                  height: BTN_R * 2 - 4,
                  borderRadius: '50%',
                  background: isActive ? `${b.glowColor}80` : `rgba(0,0,0,0)`,
                  transform: isActive ? 'scale(1)' : 'scale(1.05)',
                  boxShadow: isActive ? [
                    `0 0 12px 6px ${b.glowColor}D9`,
                    `0 0 30px 12px ${b.glowColor}94`,
                    `0 0 60px 20px ${b.glowColor}62`,
                  ].join(', ') : 'none',
                  cursor: 'pointer',
                  zIndex: 10,
                  transition: 'background 0.15s, box-shadow 0.15s',
                }}
                onPointerDown={e => e.stopPropagation()}
                onClick={() => { setPhotoMode(false); setSelectedBand(b.id); }}
              />
            </div>
          );
        })}

        {/* Photo mode button — 5th button below XRAY */}
        {(() => {
          const photoColor = '#a0b8a0';
          const photoBtnActive = '#607860';
          const photoGlow = '#9df85c';
          const labelRight = VIEWER_W - (BTN_CX - BTN_R - 6);
          return (
            <div>
              <div style={{
                position: 'absolute',
                right: labelRight + 15,
                width: 90,
                textAlign: 'right',
                top: BTN_CYS[4] - 13,
                zIndex: 10,
                pointerEvents: 'none',
                userSelect: 'none',
              }}>
                <span style={{
                  fontFamily: '"Courier New", Courier, monospace',
                  fontSize: 22, fontWeight: 'bold', letterSpacing: '0.08em',
                  color: photoMode ? photoGlow : 'rgba(255,255,255,0.28)',
                  textShadow: photoMode ? [
                    `0 0 2px ${photoGlow}`,
                    `0 0 8px ${photoGlow}dd`,
                    `0 0 18px ${photoGlow}88`,
                    `0 0 35px ${photoGlow}44`,
                  ].join(', ') : 'none',
                  transition: 'color 0.12s, text-shadow 0.12s',
                  filter: photoMode ? 'brightness(1.3) contrast(1.1)' : 'none',
                  display: 'block',
                }}>
                  CAM
                </span>
              </div>
              <div
                style={{
                  position: 'absolute',
                  left: BTN_CX - BTN_R + 2,
                  top:  BTN_CYS[4] - BTN_R + 2,
                  width:  BTN_R * 2 - 4,
                  height: BTN_R * 2 - 4,
                  borderRadius: '50%',
                  background: photoMode ? `${photoGlow}80` : `rgba(0,0,0,0)`,
                  transform: photoMode ? 'scale(1)' : 'scale(1.05)',
                  boxShadow: photoMode ? [
                    `0 0 12px 6px ${photoGlow}D9`,
                    `0 0 30px 12px ${photoGlow}94`,
                    `0 0 60px 20px ${photoGlow}62`,
                  ].join(', ') : 'none',
                  cursor: 'pointer',
                  zIndex: 10,
                  transition: 'background 0.15s, box-shadow 0.15s',
                }}
                onPointerDown={e => e.stopPropagation()}
                onClick={() => setPhotoMode(p => !p)}
              />
            </div>
          );
        })()}

      </div>}

      {/* Global drag ghost — only for drags from the parts panel */}
      {drag && drag.from !== 'bench' && (() => {
        const isViewer = drag.type === 'viewer';
        const w = isViewer ? VIEWER_W : SOURCES[drag.type].w;
        const h = isViewer ? VIEWER_H : undefined;
        const src = isViewer ? 'images/viewer.png' : SOURCES[drag.type].src;
        return (
          <div className="fixed pointer-events-none z-50"
            style={{ left: drag.cx - drag.ox, top: drag.cy - drag.oy, width: w, height: h }}>
            <img src={src} style={{ width: w, height: h }}
              className="opacity-90" draggable={false} />
          </div>
        );
      })()}
    </div>
  );
}
