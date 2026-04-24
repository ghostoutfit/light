import { useState, useRef } from 'react';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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

  // Total emission normalizer (sqrt(π/2) factors cancel in numerator and denominator)
  // ∫_{-∞}^{0} below-Gaussian du = sigma_lo  ;  ∫_{0}^{+∞} above-Gaussian du = sigma_hi
  const total = sigma_lo + sigma_hi;

  return (below + above) / total;
}

// ── Per-type slider config ────────────────────────────────────
// peak: log-scale range in Hz; widthHz: linear range in Hz
const SLIDER_CFG = {
  range: {
    peakMin: 20,  peakMax: 400,
    widthMin: 5,  widthMax: 300,
    peakDefault: 250, widthDefault: 200,
  },
  tanbulb: {
    peakMin: 700,  peakMax: 1500,
    widthMin: 5,   widthMax: 200,
    peakDefault: 920, widthDefault: 100, skewDefault: 1.0,
  },
};
// Log-scale peak slider helpers (per type)
const makePeakConv = (min, max) => ({
  toSlider:   p => Math.round(Math.log(p / min) / Math.log(max / min) * 100),
  fromSlider: v => Math.round(min * Math.pow(max / min, v / 100)),
});
const fmtHz = p => p >= 1000 ? (p / 1000).toFixed(p >= 10000 ? 0 : 1) + 'k' : String(Math.round(p));

// ── Blackbody / thermal scaling ───────────────────────────────
function thermalScale(intensity, power, scale) {
  return Math.pow(Math.max(0, intensity), power) * scale;
}

// ── Thermal false-colour palette (cold → hot) ─────────────────
const THERMAL = [
  { t: 0.05, blur: 80, opacity: 0.45, color: '#0d0018', imgFilter: 'sepia(1) saturate(4) hue-rotate(258deg) brightness(0.30)' },
  { t: 0.60, blur: 58, opacity: 0.60, color: '#3a0060', imgFilter: 'sepia(1) saturate(7) hue-rotate(268deg) brightness(0.50)' },
  { t: 1.30, blur: 30, opacity: 0.75, color: '#8800cc', imgFilter: 'sepia(1) saturate(9) hue-rotate(276deg) brightness(0.85)' },
  { t: 2.20, blur: 18, opacity: 0.88, color: '#ff6600', imgFilter: 'sepia(1) saturate(10) hue-rotate(-42deg) brightness(1.5)' },
  { t: 3.20, blur: 36, opacity: 0.94, color: '#ffaa00', imgFilter: 'sepia(1) saturate(8) hue-rotate(-50deg) brightness(2.2)' },
  { t: 4.40, blur: 72, opacity: 1.00, color: '#ffffff', imgFilter: 'brightness(10)' },
];

// ── Source catalogue ─────────────────────────────────────────
const SOURCES = {
  range: {
    label: 'Electric Range',
    src:   'images/Heater.png',
    maskSrc: 'images/HeaterElement.png',
    w: 330, natW: 732, natH: 560,
  },
  tanbulb: {
    label: 'Tanning Bulb',
    src:   'images/Tanbulb.png',
    maskSrc: 'images/TanbulbElement.png',
    w: 420, natW: 737, natH: 409,
  },
};

// ── Camera bands ──────────────────────────────────────────────
// divColor: the colour used for the frequency scale segment.
const BANDS = [
  {
    id: 'IR',      label: 'IR',     freq: 200,
    divColor: '#c04020',
    btnActive: '#b83010',
    colorFilter: 'sepia(1) saturate(8) hue-rotate(-15deg)',
  },
  {
    id: 'Visible', label: 'Vis',    freq: 800,
    divColor: '#a09050',
    btnActive: '#706840',
    colorFilter: 'sepia(0.15) saturate(1.4) brightness(1.2)',
  },
  {
    id: 'UV',      label: 'UV',     freq: 3200,
    divColor: '#8030cc',
    btnActive: '#6b1faa',
    colorFilter: 'sepia(1) saturate(8) hue-rotate(262deg)',
  },
  {
    id: 'XRay',    label: 'X-Ray',  freq: 12000,
    divColor: '#2060a0',
    btnActive: '#1e4a7a',
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

// ── Emission shape ────────────────────────────────────────────
function EmissionShape({ item, band, intensity, dev }) {
  if (intensity < 0.005) return null;

  const s    = SOURCES[item.type];
  const imgH = s.w * (s.natH / s.natW);

  if (band.id === 'IR') {
    const therm = thermalScale(intensity, dev.glowPower, dev.glowScale);
    if (s.maskSrc) {
      const glowOp = clamp((therm - 2.6) / 4.0, 0, 1.0);
      return (
        <div className="absolute pointer-events-none"
          style={{ left: item.x, top: item.y, width: s.w, height: imgH }}>
          {/* Whole-body orange ambient glow — heater only */}
          {item.type === 'range' && glowOp > 0 && (
            <img src={s.src}
              style={{
                position: 'absolute',
                top: dev.glowY, left: dev.glowX,
                width: s.w, height: imgH,
                filter: 'sepia(1) saturate(14) hue-rotate(-20deg) brightness(2.0) blur(8px)',
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
                  position: 'absolute', inset: 0,
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

  const sharp = clamp(1 + intensity * 4,   1, 5);
  const bloom = clamp(1 + intensity * 5,   1, 6);
  const blurD = (2  + intensity * 8)  * dev.blurScale;
  const blurB = (10 + intensity * 40) * dev.blurScale;
  const op    = clamp(0.15 + intensity * 0.85, 0, 1);

  if (s.maskSrc) {
    return (
      <div className="absolute pointer-events-none"
        style={{ left: item.x, top: item.y, width: s.w, height: imgH }}>
        <img src={s.maskSrc}
          style={{
            position: 'absolute', inset: 0, width: s.w, height: imgH,
            filter: `${band.colorFilter} brightness(${bloom}) blur(${blurB}px)`,
            opacity: op * 0.7, mixBlendMode: 'screen',
          }}
          draggable={false} />
        <img src={s.maskSrc}
          style={{
            position: 'absolute', inset: 0, width: s.w, height: imgH,
            filter: `${band.colorFilter} brightness(${sharp}) blur(${blurD}px)`,
            opacity: op, mixBlendMode: 'screen',
          }}
          draggable={false} />
      </div>
    );
  }
  return null;
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
      <span className="text-[9px] text-zinc-400 tabular-nums w-9">
        {fmt ? fmt(value) : value}
      </span>
    </div>
  );
}

// ── Emission graph (floats below bench item) ──────────────────
const GRAPH_SAMPLES = 120;
function EmissionGraph({ item, bandRanges, width }) {
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
      {/* Band capture values — above graph, rendered in front of item image */}
      <div style={{ display: 'flex', width: W, marginBottom: 1, position: 'relative', zIndex: 10 }}>
        {captures.map(b => (
          <div key={b.id} style={{ width: b.pct + '%', textAlign: 'center' }}>
            <span style={{
              fontSize: 14, fontFamily: 'monospace',
              color: b.val > 0.005 ? b.divColor : 'rgba(255,255,255,0.2)',
            }}>
              {b.val >= 0.005 ? (b.val * Y_MAX).toFixed(1) : '·'}
            </span>
          </div>
        ))}
      </div>
      <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
        {/* Band regions */}
        {bandRanges.map(b => {
          const x1 = hzToPos(b.lo) * W;
          const x2 = hzToPos(b.hi) * W;
          return <rect key={b.id} x={x1} y={0} width={x2 - x1} height={H}
            fill={b.divColor} opacity={0.18} />;
        })}
        {/* Band divider lines */}
        {bandRanges.slice(0, -1).map(b => {
          const x = hzToPos(b.hi) * W;
          return <line key={b.id} x1={x} y1={0} x2={x} y2={H}
            stroke="rgba(255,255,255,0.15)" strokeWidth={1} />;
        })}
        {/* Emission curve */}
        <path d={d} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={1.5} />
        {/* Peak marker */}
        {(() => {
          const px = hzToPos(item.peak) * W;
          return <line x1={px} y1={0} x2={px} y2={H}
            stroke="rgba(255,255,255,0.30)" strokeWidth={1} strokeDasharray="2,2" />;
        })()}
      </svg>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────
export default function App() {
  const [items,        setItems]        = useState([]);
  const [drag,         setDrag]         = useState(null);
  const [selectedBand, setSelectedBand] = useState('IR');

  // Frequency-scale dividers in Hz (log scale).
  // Initialised at geometric midpoints between adjacent band freqs.
  const [dividers, setDividers] = useState([400, 800, 5000]);
  const [divDrag,  setDivDrag]  = useState(null); // { idx, barLeft, barWidth }

  // Dev tuning
  const [devBlurScale, setDevBlurScale] = useState(0.08);
  const dev = { blurScale: devBlurScale, glowPower: 0.5, glowScale: 6.0, glowX: 13, glowY: 20 };

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

  const benchRef = useRef(null);
  const partsRef = useRef(null);
  const scaleRef = useRef(null);

  const updateItem = (id, patch) =>
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));

  const startPartsDrag = (e, type) => {
    e.preventDefault();
    const s = SOURCES[type];
    setDrag({
      from: 'parts', type, id: null,
      cx: e.clientX, cy: e.clientY,
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
      ox: e.clientX - r.left,
      oy: e.clientY - r.top,
    });
  };

  const startDivDrag = (e, idx) => {
    e.preventDefault();
    e.stopPropagation();
    const r = scaleRef.current.getBoundingClientRect();
    setDivDrag({ idx, barLeft: r.left, barWidth: r.width });
  };

  const onMove = (e) => {
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
    if (drag) setDrag(d => ({ ...d, cx: e.clientX, cy: e.clientY }));
  };

  const onUp = (e) => {
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
      if (e.clientX >= br.left && e.clientX <= br.right &&
          e.clientY >= br.top  && e.clientY <= br.bottom) {
        const x = e.clientX - br.left - drag.ox;
        const y = e.clientY - br.top  - drag.oy;
        if (drag.from === 'parts') {
          setItems(prev => {
            if (prev.some(it => it.type === drag.type)) return prev; // one of each type only
            return [...prev, {
              id: uid++, type: drag.type, x, y,
              amplitude: 50, skew: SLIDER_CFG[drag.type].skewDefault ?? 3.0,
              peak: SLIDER_CFG[drag.type].peakDefault,
              widthHz: SLIDER_CFG[drag.type].widthDefault,
            }];
          });
        } else {
          setItems(prev =>
            prev.map(it => it.id === drag.id ? { ...it, x, y } : it));
        }
      }
    }
    setDrag(null);
  };

  const benchDragging = drag?.from === 'bench';

  return (
    <div
      className="h-screen w-screen flex flex-col select-none overflow-hidden"
      style={{ cursor: divDrag ? 'col-resize' : undefined }}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      {/* ══════════════════════════════════════════
          TOP HALF — Lab Bench
      ══════════════════════════════════════════ */}
      <div className="h-1/2 relative" ref={benchRef} style={{ marginTop: 30 }}>
        <img src={`images/Table.PNG?v=${Date.now()}`}
          className="absolute left-0 w-full pointer-events-none"
          style={{ height: 'auto', top: -55, width: '100%' }}
          draggable={false} />

        {/* Parts box */}
        <div ref={partsRef}
          className="absolute top-4 left-4 z-20 shadow-xl backdrop-blur-sm
                     rounded-2xl px-3 pt-2 pb-3 flex flex-col gap-3
                     border transition-colors duration-150"
          style={{
            background:  benchDragging ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.55)',
            borderColor: benchDragging ? 'rgba(255,90,60,0.5)' : 'rgba(255,255,255,0.18)',
          }}>
          <p className="text-white/45 text-[9px] font-bold uppercase tracking-[0.15em] text-center">
            Parts
          </p>
          {Object.entries(SOURCES).map(([type, s]) => (
            <div key={type}
              className="flex flex-col items-center gap-1 cursor-grab active:cursor-grabbing touch-none"
              onPointerDown={(e) => startPartsDrag(e, type)}>
              <img src={s.src} alt={s.label} style={{ width: 66 }}
                className="drop-shadow pointer-events-none" draggable={false} />
              <span className="text-white/40 text-[8px] leading-tight text-center">
                {s.label}
              </span>
            </div>
          ))}
          <p className="text-white/20 text-[7px] text-center mt-0.5">drag back to remove</p>
        </div>

        {/* Bench items — sliders above */}
        {items.map(item => {
          if (drag?.from === 'bench' && drag.id === item.id) return null;
          const s = SOURCES[item.type];
          return (
            <div key={item.id} className="absolute touch-none"
              style={{ left: item.x, top: item.y, width: s.w }}>
              <div
                className="absolute left-0 right-0 rounded-lg px-2 py-2 flex flex-col gap-1.5
                           border border-white/10 backdrop-blur-sm"
                style={{ bottom: '100%', marginBottom: 4, background: 'rgba(0,0,0,0.65)' }}
                onPointerDown={e => e.stopPropagation()}>
                {/* Amplitude */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[8px] text-zinc-400 w-[28px] shrink-0 uppercase tracking-wide">Amp</span>
                  <input type="range" min="0" max="500" value={item.amplitude}
                    className="flex-1 cursor-pointer accent-orange-400" style={{ height: '3px' }}
                    onChange={e => updateItem(item.id, { amplitude: +e.target.value })} />
                  <span className="text-[8px] text-zinc-500 w-6 text-right tabular-nums">{item.amplitude}</span>
                </div>
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
              </div>
              <img src={s.src} alt={s.label} style={{ width: s.w }}
                className="drop-shadow-lg cursor-grab active:cursor-grabbing block"
                draggable={false}
                onPointerDown={(e) => startBenchDrag(e, item)} />
              <EmissionGraph item={item} bandRanges={bandRanges} width={s.w} />
            </div>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════
          BOTTOM HALF — Camera View
      ══════════════════════════════════════════ */}
      <div className="relative overflow-hidden border-t border-zinc-800"
        style={{ marginTop: 50, height: 'calc(50% - 50px)', background: selectedBand === 'IR' ? '#38006a' : '#000' }}>

        {/* Glow viewport */}
        {items.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm tracking-wide"
            style={{ color: selectedBand === 'IR' ? '#7a40a0' : '#3f3f46', paddingTop: 56 }}>
            Place a light source on the bench.
          </div>
        ) : (
          <>
            <div className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: 'repeating-linear-gradient(transparent, transparent 3px, rgba(255,255,255,0.013) 3px, rgba(255,255,255,0.013) 4px)',
                backgroundSize:  '100% 4px',
              }} />
            <div style={{ position: 'absolute', inset: 0, top: -90 }}>
              {items.map(item => {
                const intensity = bandIntensity(band.lo, band.hi, item.peak, item.widthHz, item.skew)
                                * (item.amplitude / 400);
                return (
                  <EmissionShape key={item.id} item={item} band={band} intensity={intensity} dev={dev} />
                );
              })}
            </div>
          </>
        )}

        {/* ── Camera band scale + buttons ── */}
        <div className="absolute left-0 right-0 z-10 border-b border-zinc-800/80 backdrop-blur-sm" style={{ top: 50 }}
          style={{ background: 'rgba(9,9,11,0.92)' }}>

          {/* "Camera" label row */}
          <div className="px-4 pt-1.5 pb-0">
            <span className="text-zinc-600 text-[8px] uppercase tracking-widest">Camera</span>
          </div>

          {/* Frequency scale — draggable band columns, log Hz axis */}
          <div ref={scaleRef} className="flex h-11 relative">
            {bandRanges.map((b, bi) => {
              const isActive = selectedBand === b.id;
              return (
                <div key={b.id}
                  className="relative flex flex-col items-center justify-center overflow-visible cursor-pointer"
                  style={{
                    width: `${b.pct}%`,
                    background: isActive ? b.divColor + '50' : b.divColor + '1a',
                    borderRight: bi < 3 ? '1px solid rgba(255,255,255,0.07)' : 'none',
                    transition: 'background 0.1s',
                  }}
                  onClick={() => setSelectedBand(b.id)}>

                  {/* Active indicator strip at top */}
                  {isActive && (
                    <div className="absolute top-0 left-0 right-0 h-0.5"
                      style={{ background: b.divColor }} />
                  )}

                  {/* Band label */}
                  <span
                    className="text-[11px] font-semibold tracking-wide leading-none
                               transition-colors duration-100 z-10 relative w-full text-center"
                    style={{ color: isActive ? '#fff' : b.divColor + 'aa' }}>
                    {b.label}
                  </span>

                  {/* Hz range */}
                  <span className="text-[7px] leading-none mt-0.5 tabular-nums"
                    style={{ color: isActive ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.18)' }}>
                    {fmtHz(b.lo)}–{fmtHz(b.hi)}
                  </span>

                  {/* Draggable divider handle — right edge */}
                  {bi < 3 && (
                    <div
                      className="absolute top-0 bottom-0 z-20 flex items-center justify-center"
                      style={{ right: -5, width: 10, cursor: 'col-resize' }}
                      onPointerDown={e => { e.stopPropagation(); startDivDrag(e, bi); }}>
                      <div
                        className="rounded-full transition-all duration-100"
                        style={{
                          width:   divDrag?.idx === bi ? 3 : 1,
                          height:  20,
                          background: divDrag?.idx === bi
                            ? 'rgba(255,255,255,0.75)'
                            : 'rgba(255,255,255,0.22)',
                        }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Dev panel */}
        <div className="absolute bottom-0 left-0 right-0 z-10
                        flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-2
                        bg-zinc-950/92 border-t border-zinc-800/60 backdrop-blur-sm">
          <span className="text-[8px] text-zinc-600 uppercase tracking-widest shrink-0">Dev</span>
          <DevSlider label="Blur ×" min={0} max={0.5} step={0.01}
            value={devBlurScale} onChange={setDevBlurScale} fmt={v => v.toFixed(2)} />
        </div>
      </div>

      {/* Global drag ghost */}
      {drag && (
        <div className="fixed pointer-events-none z-50"
          style={{ left: drag.cx - drag.ox, top: drag.cy - drag.oy, width: SOURCES[drag.type].w }}>
          <img src={SOURCES[drag.type].src} style={{ width: SOURCES[drag.type].w }}
            className="opacity-90" draggable={false} />
        </div>
      )}
    </div>
  );
}
