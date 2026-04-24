import { useState, useRef } from 'react';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── Emission profiles ─────────────────────────────────────────
const EMISSION = {
  range(freq) {
    return {
      IR:      clamp(0.4 + 0.6 * (1 - freq), 0, 1),
      Visible: clamp(0.75 * freq,             0, 1),
      UV:      0,
      XRay:    0,
    };
  },
  tanbulb(freq) {
    return {
      IR:      clamp(0.30 * (1 - freq),        0, 1),
      Visible: clamp(0.35 + 0.30 * (1 - freq), 0, 1),
      UV:      clamp(0.25 + 0.75 * freq,        0, 1),
      XRay:    0,
    };
  },
};

// ── Source catalogue ─────────────────────────────────────────
const SOURCES = {
  range: {
    label: 'Electric Range',
    src:   'images/Heater.png',
    maskSrc: 'images/HeaterElement.png',  // same 732×560, pre-registered
    w: 330, natW: 732, natH: 560,
  },
  tanbulb: {
    label: 'Tanning Bulb',
    src:   'images/Tanbulb.png',
    maskSrc: null,   // drawn with CSS geometry
    w: 420, natW: 737, natH: 409,
  },
};

// ── Camera bands ──────────────────────────────────────────────
// colorFilter: applied to emission mask image to tint it per band.
// The HeaterElement is near-white/gray on transparent; sepia+hue-rotate colorises it.
// glowColors: used for the CSS-drawn tanbulb tubes.
const BANDS = [
  {
    id: 'IR', label: 'IR',
    btnActive:   '#b83010',
    colorFilter: 'sepia(1) saturate(8) hue-rotate(-15deg)',
    glowColors:  ['#ffffff', '#ff5522', 'rgba(255,60,10,0.12)'],
  },
  {
    id: 'Visible', label: 'Visible',
    btnActive:   '#706840',
    colorFilter: 'sepia(0.15) saturate(1.4) brightness(1.2)',
    glowColors:  ['#ffffff', '#fff8e0', 'rgba(255,255,200,0.08)'],
  },
  {
    id: 'UV', label: 'UV',
    btnActive:   '#6b1faa',
    colorFilter: 'sepia(1) saturate(8) hue-rotate(262deg)',
    glowColors:  ['#ffffff', '#cc44ff', 'rgba(140,0,255,0.12)'],
  },
  {
    id: 'XRay', label: 'X-Ray',
    btnActive:   '#1e4a7a',
    colorFilter: 'sepia(1) saturate(5) hue-rotate(195deg) brightness(1.4)',
    glowColors:  ['#eef4ff', '#aaccff', 'rgba(100,160,255,0.10)'],
  },
];

let uid = 1;

// ── Emission shape ────────────────────────────────────────────
// Renders the glowing emission of one item as the camera would see it.
// Positioned at the same (item.x, item.y) as the bench image.
function EmissionShape({ item, band, intensity }) {
  if (intensity < 0.005) return null;

  const s     = SOURCES[item.type];
  const imgH  = s.w * (s.natH / s.natW);
  const sharp = clamp(1 + intensity * 4,   1, 5);   // brightness for detail layer
  const bloom = clamp(1 + intensity * 5,   1, 6);   // brightness for bloom layer
  const blurD = 2  + intensity * 8;                 // blur for detail layer
  const blurB = 10 + intensity * 40;                // blur for bloom layer
  const op    = clamp(0.15 + intensity * 0.85, 0, 1);

  // ── Electric Range — use HeaterElement.png mask ──────────
  if (item.type === 'range' && s.maskSrc) {
    const baseFilter = band.colorFilter;
    return (
      <div className="absolute pointer-events-none"
        style={{ left: item.x, top: item.y, width: s.w, height: imgH }}>
        {/* Bloom layer — heavy blur creates the outer glow */}
        <img src={s.maskSrc}
          style={{
            position: 'absolute', inset: 0,
            width: s.w, height: imgH,
            filter: `${baseFilter} brightness(${bloom}) blur(${blurB}px)`,
            opacity: op * 0.7,
            mixBlendMode: 'screen',
          }}
          draggable={false} />
        {/* Detail layer — tight blur preserves coil shape */}
        <img src={s.maskSrc}
          style={{
            position: 'absolute', inset: 0,
            width: s.w, height: imgH,
            filter: `${baseFilter} brightness(${sharp}) blur(${blurD}px)`,
            opacity: op,
            mixBlendMode: 'screen',
          }}
          draggable={false} />
      </div>
    );
  }

  // ── Tanning Bulb — CSS geometry ───────────────────────────
  // Two horizontal fluorescent tubes + reflector bowl glow.
  // Geometry derived from native 737×409 image.
  if (item.type === 'tanbulb') {
    const [c0, c1, c2] = band.glowColors;
    const tx  = s.w * 0.13,  tw  = s.w * 0.74;
    const t1y = imgH * 0.38, t1h = imgH * 0.085;
    const t2y = imgH * 0.49, t2h = imgH * 0.085;
    const ry  = imgH * 0.42, rh  = imgH * 0.24;

    const tubeGrad = `linear-gradient(90deg,
      transparent 0%, ${c1} 7%, ${c0} 38%, ${c0} 62%, ${c1} 93%, transparent 100%)`;

    return (
      <div className="absolute pointer-events-none"
        style={{ left: item.x, top: item.y }}>
        {/* Reflector bowl */}
        <div style={{
          position: 'absolute', left: tx * 0.6, top: ry,
          width: tw * 1.08, height: rh,
          background: `radial-gradient(ellipse 80% 55% at 50% 35%, ${c2.replace('0.12','0.55')} 0%, transparent 100%)`,
          filter: `blur(${blurD * 2.2}px)`,
          opacity: op * 0.55,
          mixBlendMode: 'screen',
        }} />
        {/* Front tube */}
        <div style={{
          position: 'absolute', left: tx, top: t1y,
          width: tw, height: t1h,
          background: tubeGrad,
          borderRadius: t1h * 0.5,
          filter: `blur(${blurD}px)`,
          opacity: op,
          mixBlendMode: 'screen',
        }} />
        {/* Rear tube */}
        <div style={{
          position: 'absolute', left: tx, top: t2y,
          width: tw, height: t2h,
          background: tubeGrad,
          borderRadius: t2h * 0.5,
          filter: `blur(${blurD * 0.85}px)`,
          opacity: op * 0.80,
          mixBlendMode: 'screen',
        }} />
        {/* Bloom — wide outer glow over whole tube span */}
        <div style={{
          position: 'absolute', left: tx - s.w * 0.05, top: t1y - t1h,
          width: tw + s.w * 0.10, height: (t2y + t2h) - (t1y - t1h),
          background: `radial-gradient(ellipse 90% 50% at 50% 50%, ${c2.replace('0.12','0.4')} 0%, transparent 100%)`,
          filter: `blur(${blurB * 0.6}px)`,
          opacity: op * 0.6,
          mixBlendMode: 'screen',
        }} />
      </div>
    );
  }

  return null;
}

// ── App ───────────────────────────────────────────────────────
export default function App() {
  const [items,        setItems]        = useState([]);
  const [drag,         setDrag]         = useState(null);
  const [selectedBand, setSelectedBand] = useState('IR');

  const benchRef = useRef(null);
  const partsRef = useRef(null);
  const band     = BANDS.find(b => b.id === selectedBand);

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

  const onMove = (e) => {
    if (drag) setDrag(d => ({ ...d, cx: e.clientX, cy: e.clientY }));
  };

  const onUp = (e) => {
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
            amplitude: 50, frequency: 0.5,
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

        {/* Bench items — sliders above the image */}
        {items.map(item => {
          if (drag?.from === 'bench' && drag.id === item.id) return null;
          const s = SOURCES[item.type];
          return (
            <div key={item.id} className="absolute touch-none"
              style={{ left: item.x, top: item.y, width: s.w }}>

              {/* Slider panel — floats above the image via bottom:100% */}
              <div
                className="absolute left-0 right-0 rounded-lg px-2 py-2 flex flex-col gap-1.5
                           border border-white/10 backdrop-blur-sm"
                style={{ bottom: '100%', marginBottom: 4, background: 'rgba(0,0,0,0.65)' }}
                onPointerDown={e => e.stopPropagation()}>
                <div className="flex items-center gap-1.5">
                  <span className="text-[8px] text-zinc-400 w-[26px] shrink-0 uppercase tracking-wide">Amp</span>
                  <input type="range" min="0" max="100" value={item.amplitude}
                    className="flex-1 cursor-pointer accent-orange-400"
                    style={{ height: '3px' }}
                    onChange={e => updateItem(item.id, { amplitude: +e.target.value })} />
                  <span className="text-[8px] text-zinc-500 w-6 text-right tabular-nums">
                    {item.amplitude}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[8px] text-zinc-500 w-[26px] shrink-0">Lo</span>
                  <input type="range" min="0" max="100"
                    value={Math.round(item.frequency * 100)}
                    className="flex-1 cursor-pointer accent-sky-400"
                    style={{ height: '3px' }}
                    onChange={e => updateItem(item.id, { frequency: +e.target.value / 100 })} />
                  <span className="text-[8px] text-zinc-500 w-5 text-right">Hi</span>
                </div>
                <p className="text-[7px] text-zinc-600 text-center uppercase tracking-wider">
                  Frequency
                </p>
              </div>

              {/* Image — drag handle */}
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
      <div className="h-1/2 relative overflow-hidden bg-black border-t border-zinc-800">

        {/* Glow viewport — full height, items at same (x,y) as bench */}
        {items.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center
                          text-zinc-700 text-sm tracking-wide pt-10">
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
              const em        = EMISSION[item.type](item.frequency);
              const intensity = (em[band.id] ?? 0) * (item.amplitude / 100);
              return (
                <EmissionShape key={item.id} item={item} band={band} intensity={intensity} />
              );
            })}
          </>
        )}

        {/* Toggle bar — overlaid on top of viewport */}
        <div className="absolute top-0 left-0 right-0 z-10
                        flex items-center gap-2 px-4 py-2
                        bg-zinc-900/85 border-b border-zinc-800/80 backdrop-blur-sm">
          <span className="text-zinc-600 text-[9px] uppercase tracking-widest mr-1 shrink-0">
            Camera
          </span>
          {BANDS.map(b => (
            <button key={b.id}
              className="px-3 py-1 rounded text-xs font-semibold tracking-wide transition-all duration-100"
              style={selectedBand === b.id
                ? { background: b.btnActive, color: '#fff' }
                : { background: '#27272a',   color: '#52525b' }}
              onClick={() => setSelectedBand(b.id)}>
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* Global drag ghost */}
      {drag && (
        <div className="fixed pointer-events-none z-50"
          style={{
            left:  drag.cx - drag.ox,
            top:   drag.cy - drag.oy,
            width: SOURCES[drag.type].w,
          }}>
          <img src={SOURCES[drag.type].src} style={{ width: SOURCES[drag.type].w }}
            className="opacity-90" draggable={false} />
        </div>
      )}
    </div>
  );
}
