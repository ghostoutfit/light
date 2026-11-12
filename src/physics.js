// ═══════════════════════════════════════════════════════════════════════════
//  Physics & math — the spectrum model behind every glow. No React, no images.
// ═══════════════════════════════════════════════════════════════════════════
//  Every source emits a SPECTRUM: a curve of brightness vs. frequency, modeled
//  here as a (skewed) log-normal bump.
//    • spectralEmission() — the curve's height at one frequency.
//    • bandIntensity()    — how much of the curve falls inside a camera band
//                           (IR / Visible / UV / X-Ray). That single number
//                           drives how bright the source's glow is drawn.
//  Frequencies are in the app's own "Hz" scale (20 – 20 000), not real light
//  frequencies; the bands in bands.js are defined on the same scale.

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// Perceptual sensitivity curve: zero slope at onset (never jarring), rapid rise, saturates near 1.
// p > 1 ensures f'(0) = 0; k controls how quickly it climbs.
export const visCurve = v => 1 - Math.exp(-5 * Math.pow(Math.max(0, v), 1.4));

// ── Spectral emission model ───────────────────────────────────
// Log-normal PDF. peak and bandFreq share the same Hz scale.
// widthHz: 1-sigma bandwidth in Hz (stored directly — no unit conversion needed)
// skew   : sigma = skew × ln(1 + widthHz/peak); higher = wider + longer tail
// Returns shape value [0,1] at a single frequency. Peak brightness is always 1.0.
// Asymmetric log-normal: skew stretches the LOW-frequency tail (like a blackbody).
//   skew=1 → symmetric in log-space
//   skew=5 → very asymmetric, heavy low-freq tail, fast high-freq cutoff
export function spectralEmission(bandFreq, peak, widthHz, skew) {
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
export function bandIntensity(lo, hi, peak, widthHz, skew) {
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

// How much of an item's light lands in a band, scaled by its power setting.
export const itemIntensity = (item, band) =>
  bandIntensity(band.lo, band.hi, item.peak, item.widthHz, item.skew) * (item.amplitude / 400);

// ── Frequency axis ────────────────────────────────────────────
// Bounds shared by the peak slider, band dividers, and graphs.
export const FREQ_MIN = 20, FREQ_MAX = 20000;
// Convert Hz → fractional position on the log scale bar [0,1]
export const hzToPos  = f => Math.log(f / FREQ_MIN) / Math.log(FREQ_MAX / FREQ_MIN);
// Convert fractional bar position → Hz
export const posToHz  = p => Math.round(FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, p));

// Log-scale peak slider helpers (per type)
export const makePeakConv = (min, max) => ({
  toSlider:   p => Math.round(Math.log(p / min) / Math.log(max / min) * 100),
  fromSlider: v => Math.round(min * Math.pow(max / min, v / 100)),
});
export const fmtHz = p => p >= 1000 ? (p / 1000).toFixed(p >= 10000 ? 0 : 1) + 'k' : String(Math.round(p));

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
export function spectrumToRgb(item, visBand) {
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

// The spectrum's naked-eye colour as a CSS rgb() string (gamma-encoded sRGB).
export function spectrumCss(item, visBand) {
  const gamma = x => x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  const [gr, gg, gb] = spectrumToRgb(item, visBand);
  return `rgb(${Math.round(gamma(gr)*255)},${Math.round(gamma(gg)*255)},${Math.round(gamma(gb)*255)})`;
}

// ── Blackbody / thermal scaling ───────────────────────────────
export function thermalScale(intensity, power, scale) {
  return Math.pow(Math.max(0, intensity), power) * scale;
}
