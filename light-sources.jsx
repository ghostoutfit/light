import { useState, useRef } from 'react';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── Spectral emission model ───────────────────────────────────
// Log-normal distribution. bandFreq and peak share the same Hz-like
// scale (bands at 200/800/3200/12000; peak slider 20–20000).
// width [0.01–1.0]: log-space sigma multiplier — tight spike vs broad
// skew  [0.1–5.0]:  sigma = width × skew; higher = wider, longer tail
// Normalised as a proper log-normal PDF so narrow peaks stay bright and
// broad curves spread energy across bands without total-energy inflation.
function spectralEmission(bandFreq, peak, width, skew) {
  const s = Math.max(width, 0.001);
  const x = bandFreq / peak;

  // Skew ≈ 0: fall back to a plain Gaussian in linear space
  if (Math.abs(skew) < 0.001) {
    return Math.exp(-0.5 * ((bandFreq - peak) / (s * peak)) ** 2);
  }

  // Log-normal: sharp rise, long right tail — approximates Planck curve
  const sigma = s * Math.abs(skew);
  const lnX   = Math.log(x) / sigma;
  return Math.exp(-0.5 * lnX * lnX) / (x * sigma);
}

// Log-scale helpers for peak slider (20 – 20 000 Hz)
const PEAK_MIN = 20, PEAK_MAX = 20000;
const peakToSlider = p => Math.round(Math.log(p / PEAK_MIN) / Math.log(PEAK_MAX / PEAK_MIN) * 100);
const sliderToPeak = v => Math.round(PEAK_MIN * Math.pow(PEAK_MAX / PEAK_MIN, v / 100));
const fmtHz = p => p >= 1000 ? (p / 1000).toFixed(p >= 10000 ? 0 : 1) + 'k' : String(p);

// ── Blackbody / thermal scaling ───────────────────────────────
function thermalScale(intensity, power, scale) {
  return Math.pow(clamp(intensity, 0, 1), power) * scale;
}

// ── Thermal false-colour palette (cold → hot) ─────────────────
const THERMAL = [
  { t: 0.05, blur: 80, opacity: 0.40, color: '#110018', imgFilter: 'sepia(1) saturate(4) hue-rotate(258deg) brightness(0.35)' },
  { t: 0.55, blur: 55, opacity: 0.55, color: '#440060', imgFilter: 'sepia(1) saturate(6) hue-rotate(272deg) brightness(0.55)' },
  { t: 1.10, blur: 22, opacity: 0.70, color: '#880010', imgFilter: 'sepia(1) saturate(8) hue-rotate(330deg)' },
  { t: 1.70, blur: 16, opacity: 0.80, color: '#cc2200', imgFilter: 'sepia(1) saturate(8) hue-rotate(-8deg)' },
  { t: 2.40, blur: 28, opacity: 0.85, color: '#ff6600', imgFilter: 'sepia(1) saturate(7) hue-rotate(-42deg) brightness(1.4)' },
  { t: 3.20, blur: 52, opacity: 0.90, color: '#ffdd00', imgFilter: 'sepia(0.3) saturate(5) brightness(2.8)' },
  { t: 4.40, blur: 82, opacity: 1.00, color: '#ffffff', imgFilter: 'brightness(10)' },
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

let uid = 1;

// ── Emission shape ────────────────────────────────────────────
function EmissionShape({ item, band, intensity, dev }) {
  if (intensity < 0.005) return null;

  const s    = SOURCES[item.type];
  const imgH = s.w * (s.natH / s.natW);

  if (band.id === 'IR') {
    const therm = thermalScale(intensity, dev.glowPower, dev.glowScale);
    if (s.maskSrc) {
      return (
        <div className="absolute pointer-events-none"
          style={{ left: item.x, top: item.y, width: s.w, height: imgH }}>
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

// ── App ───────────────────────────────────────────────────────
export default function App() {
  const [items,        setItems]        = useState([]);
  const [drag,         setDrag]         = useState(null);
  const [selectedBand, setSelectedBand] = useState('IR');

  // Frequency-scale dividers in Hz (log scale).
  // Initialised at geometric midpoints between adjacent band freqs.
  const [dividers, setDividers] = useState([400, 1600, 6200]);
  const [divDrag,  setDivDrag]  = useState(null); // { idx, barLeft, barWidth }

  // Dev tuning
  const [devBlurScale, setDevBlurScale] = useState(0.08);
  const [devGlowPower, setDevGlowPower] = useState(0.5);
  const [devGlowScale, setDevGlowScale] = useState(6.0);
  const dev = { blurScale: devBlurScale, glowPower: devGlowPower, glowScale: devGlowScale };

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
          setItems(prev => [...prev, {
            id: uid++, type: drag.type, x, y,
            amplitude: 50, peak: 440, width: 0.3, skew: 1.5,
          }]);
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
      <div className="h-1/2 relative overflow-hidden" ref={benchRef}>
        <img src="images/Table.PNG"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
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
                {/* Peak — log scale 20–20 000 Hz */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[8px] text-zinc-400 w-[28px] shrink-0 uppercase tracking-wide">Peak</span>
                  <span className="text-[7px] text-zinc-600 shrink-0">20</span>
                  <input type="range" min="0" max="100" value={peakToSlider(item.peak)}
                    className="flex-1 cursor-pointer accent-sky-400" style={{ height: '3px' }}
                    onChange={e => updateItem(item.id, { peak: sliderToPeak(+e.target.value) })} />
                  <span className="text-[7px] text-zinc-500 w-7 text-right tabular-nums shrink-0">
                    {fmtHz(item.peak)}
                  </span>
                </div>
                {/* Width 0.01–1.0, displayed as ±Hz bandwidth */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[8px] text-zinc-400 w-[28px] shrink-0 uppercase tracking-wide">Width</span>
                  <span className="text-[7px] text-zinc-600 shrink-0">•</span>
                  <input type="range" min="1" max="100" value={Math.round(item.width * 100)}
                    className="flex-1 cursor-pointer accent-emerald-400" style={{ height: '3px' }}
                    onChange={e => updateItem(item.id, { width: +e.target.value / 100 })} />
                  <span className="text-[7px] text-zinc-500 w-10 text-right tabular-nums shrink-0">
                    ±{fmtHz(Math.round(item.peak * (Math.exp(item.width * item.skew) - 1)))}
                  </span>
                </div>
                {/* Skew 0.1–5.0 */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[8px] text-zinc-400 w-[28px] shrink-0 uppercase tracking-wide">Skew</span>
                  <span className="text-[7px] text-zinc-600 shrink-0">∿</span>
                  <input type="range" min="1" max="50" value={Math.round(item.skew * 10)}
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
            </div>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════
          BOTTOM HALF — Camera View
      ══════════════════════════════════════════ */}
      <div className="h-1/2 relative overflow-hidden border-t border-zinc-800"
        style={{ background: selectedBand === 'IR' ? '#38006a' : '#000' }}>

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
            {items.map(item => {
              const intensity = spectralEmission(band.freq, item.peak, item.width, item.skew)
                              * (item.amplitude / 100);
              return (
                <EmissionShape key={item.id} item={item} band={band} intensity={intensity} dev={dev} />
              );
            })}
          </>
        )}

        {/* ── Camera band scale + buttons ── */}
        <div className="absolute top-0 left-0 right-0 z-10 border-b border-zinc-800/80 backdrop-blur-sm"
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
                  className="relative flex flex-col items-center justify-center overflow-visible"
                  style={{
                    width: `${b.pct}%`,
                    background: isActive ? b.divColor + '50' : b.divColor + '1a',
                    borderRight: bi < 3 ? '1px solid rgba(255,255,255,0.07)' : 'none',
                    transition: 'background 0.1s',
                  }}>

                  {/* Active indicator strip at top */}
                  {isActive && (
                    <div className="absolute top-0 left-0 right-0 h-0.5"
                      style={{ background: b.divColor }} />
                  )}

                  {/* Band label */}
                  <button
                    className="text-[11px] font-semibold tracking-wide leading-none
                               transition-colors duration-100 z-10 relative w-full text-center"
                    style={{ color: isActive ? '#fff' : b.divColor + 'aa' }}
                    onClick={() => setSelectedBand(b.id)}>
                    {b.label}
                  </button>

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
                      onPointerDown={e => startDivDrag(e, bi)}>
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
          <DevSlider label="Glow Power" min={0.5} max={4.0} step={0.05}
            value={devGlowPower} onChange={setDevGlowPower} fmt={v => v.toFixed(2)} />
          <DevSlider label="Glow Scale" min={0.2} max={6.0} step={0.1}
            value={devGlowScale} onChange={setDevGlowScale} fmt={v => v.toFixed(1)} />
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
