import { useState, useRef } from 'react';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── Emission profiles ─────────────────────────────────────────
// Returns { IR, Visible, UV, XRay } ∈ [0,1] as a function of freq ∈ [0,1].
// freq=0 → "Low" end of slider; freq=1 → "High" end.
const EMISSION = {
  // Electric Range: freq LOW = deep IR only. freq HIGH = shifts into visible (orange glow).
  range(freq) {
    return {
      IR:      clamp(0.4 + 0.6 * (1 - freq), 0, 1),  // 1.0 → 0.4
      Visible: clamp(0.75 * freq,             0, 1),  // 0   → 0.75
      UV:      0,
      XRay:    0,
    };
  },
  // Tanning Bulb: freq HIGH = strong UV. freq LOW = shifts toward visible/IR.
  tanbulb(freq) {
    return {
      IR:      clamp(0.30 * (1 - freq),              0, 1),  // 0.30 → 0
      Visible: clamp(0.35 + 0.30 * (1 - freq),       0, 1),  // 0.65 → 0.35
      UV:      clamp(0.25 + 0.75 * freq,             0, 1),  // 0.25 → 1.0
      XRay:    0,
    };
  },
};

// ── Source catalogue ─────────────────────────────────────────
const SOURCES = {
  range:   { label: 'Electric Range', src: 'images/Heater.png',  w: 110 },
  tanbulb: { label: 'Tanning Bulb',   src: 'images/Tanbulb.png', w: 140 },
};

// ── Camera bands ──────────────────────────────────────────────
// glowColors: [inner-core, mid, outer-transparent] — used in radial-gradient
const BANDS = [
  {
    id: 'IR', label: 'IR',
    btnActive: '#b83010',
    glowColors: ['#ffffff', '#ff5522', '#ff220008'],
  },
  {
    id: 'Visible', label: 'Visible',
    btnActive: '#706840',
    glowColors: ['#ffffff', '#fff8e8', '#ffffff06'],
  },
  {
    id: 'UV', label: 'UV',
    btnActive: '#6b1faa',
    glowColors: ['#ffffff', '#c044ff', '#8800ff08'],
  },
  {
    id: 'XRay', label: 'X-Ray',
    btnActive: '#1e4a7a',
    glowColors: ['#f0f6ff', '#aaccff', '#6699dd08'],
  },
];

let uid = 1;

// ── Glow ─────────────────────────────────────────────────────
// Renders a radial gradient bloom centred at (cx, 60% height) in camera view.
function Glow({ cx, intensity, glowColors }) {
  if (intensity < 0.005) return null;
  const r   = 28 + intensity * 270;
  const [c0, c1, c2] = glowColors;
  return (
    <div
      className="absolute rounded-full pointer-events-none"
      style={{
        left:      cx - r,
        top:       '60%',
        transform: 'translateY(-50%)',
        width:     r * 2,
        height:    r * 2,
        background: `radial-gradient(circle, ${c0} 0%, ${c1} 22%, ${c2} 65%, transparent 100%)`,
        mixBlendMode: 'screen',
        opacity:   clamp(0.18 + intensity * 0.82, 0, 1),
      }}
    />
  );
}

// ── App ───────────────────────────────────────────────────────
export default function App() {
  const [items,        setItems]        = useState([]);
  const [drag,         setDrag]         = useState(null);
  const [selectedBand, setSelectedBand] = useState('IR');

  const benchRef  = useRef(null);
  const partsRef  = useRef(null);

  const band = BANDS.find(b => b.id === selectedBand);

  const updateItem = (id, patch) =>
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));

  // ── Drag start: from parts box ────────────────────────────
  const startPartsDrag = (e, type) => {
    e.preventDefault();
    const s = SOURCES[type];
    setDrag({
      from: 'parts', type, id: null,
      cx: e.clientX, cy: e.clientY,
      ox: s.w / 2,   oy: s.w * 0.38,
    });
  };

  // ── Drag start: existing bench item ──────────────────────
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

    // Drop on parts box → remove item
    if (drag.from === 'bench' && partsRef.current) {
      const pr = partsRef.current.getBoundingClientRect();
      if (
        e.clientX >= pr.left && e.clientX <= pr.right &&
        e.clientY >= pr.top  && e.clientY <= pr.bottom
      ) {
        setItems(prev => prev.filter(it => it.id !== drag.id));
        setDrag(null);
        return;
      }
    }

    // Drop on bench → place or reposition
    if (benchRef.current) {
      const br = benchRef.current.getBoundingClientRect();
      const inside =
        e.clientX >= br.left && e.clientX <= br.right &&
        e.clientY >= br.top  && e.clientY <= br.bottom;

      if (inside) {
        const x = e.clientX - br.left - drag.ox;
        const y = e.clientY - br.top  - drag.oy;
        if (drag.from === 'parts') {
          setItems(prev => [...prev, {
            id: uid++, type: drag.type, x, y,
            amplitude: 50, frequency: 0.5,
          }]);
        } else {
          setItems(prev =>
            prev.map(it => it.id === drag.id ? { ...it, x, y } : it)
          );
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
      {/* ════════════════════════════════════════════════
          TOP HALF — Lab Bench
      ════════════════════════════════════════════════ */}
      <div className="h-1/2 relative overflow-hidden" ref={benchRef}>

        {/* Background */}
        <img src="images/Table.PNG"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          draggable={false} />

        {/* Parts box ── upper left ─────────────────────── */}
        <div
          ref={partsRef}
          className="absolute top-4 left-4 z-20 shadow-xl
                     backdrop-blur-sm rounded-2xl
                     px-3 pt-2 pb-3 flex flex-col gap-3
                     border transition-colors duration-150"
          style={{
            background: benchDragging ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.55)',
            borderColor: benchDragging ? 'rgba(255,100,80,0.45)' : 'rgba(255,255,255,0.18)',
          }}
        >
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
          <p className="text-white/20 text-[7px] text-center leading-snug mt-0.5">
            drag back to remove
          </p>
        </div>

        {/* Bench items ─────────────────────────────────── */}
        {items.map(item => {
          if (drag?.from === 'bench' && drag.id === item.id) return null;
          const s = SOURCES[item.type];
          return (
            <div key={item.id}
              className="absolute touch-none"
              style={{ left: item.x, top: item.y, width: s.w }}>

              {/* Image — drag handle */}
              <img src={s.src} alt={s.label} style={{ width: s.w }}
                className="drop-shadow-lg cursor-grab active:cursor-grabbing"
                draggable={false}
                onPointerDown={(e) => startBenchDrag(e, item)} />

              {/* Sliders */}
              <div
                className="mt-1 rounded-lg px-2 py-2 flex flex-col gap-1.5
                           border border-white/10 backdrop-blur-sm"
                style={{ background: 'rgba(0,0,0,0.65)' }}
                onPointerDown={(e) => e.stopPropagation()}>

                {/* Amplitude */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[8px] text-zinc-400 w-[26px] shrink-0 uppercase tracking-wide">
                    Amp
                  </span>
                  <input type="range" min="0" max="100" value={item.amplitude}
                    className="flex-1 cursor-pointer accent-orange-400"
                    style={{ height: '3px' }}
                    onChange={e => updateItem(item.id, { amplitude: +e.target.value })} />
                  <span className="text-[8px] text-zinc-500 w-6 text-right tabular-nums">
                    {item.amplitude}
                  </span>
                </div>

                {/* Frequency */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[8px] text-zinc-500 w-[26px] shrink-0">Lo</span>
                  <input type="range" min="0" max="100"
                    value={Math.round(item.frequency * 100)}
                    className="flex-1 cursor-pointer accent-sky-400"
                    style={{ height: '3px' }}
                    onChange={e => updateItem(item.id, { frequency: +e.target.value / 100 })} />
                  <span className="text-[8px] text-zinc-500 w-6 text-right">Hi</span>
                </div>
                <p className="text-[7px] text-zinc-600 text-center uppercase tracking-wider">
                  Frequency
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ════════════════════════════════════════════════
          BOTTOM HALF — Camera View
      ════════════════════════════════════════════════ */}
      <div className="h-1/2 flex flex-col bg-zinc-950 border-t border-zinc-800">

        {/* Band toggle bar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800/80 bg-zinc-900/60">
          <span className="text-zinc-600 text-[9px] uppercase tracking-widest mr-1 shrink-0">
            Camera
          </span>
          {BANDS.map(b => (
            <button key={b.id}
              className="px-3 py-1 rounded text-xs font-semibold tracking-wide
                         transition-all duration-100"
              style={selectedBand === b.id
                ? { background: b.btnActive, color: '#fff' }
                : { background: '#27272a',   color: '#52525b' }
              }
              onClick={() => setSelectedBand(b.id)}>
              {b.label}
            </button>
          ))}
        </div>

        {/* Glow viewport */}
        <div className="flex-1 relative overflow-hidden bg-black">
          {items.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center
                            text-zinc-700 text-sm tracking-wide">
              Place a light source on the bench.
            </div>
          ) : (
            <>
              {/* Subtle scanlines */}
              <div className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(transparent, transparent 3px, rgba(255,255,255,0.018) 3px, rgba(255,255,255,0.018) 4px)',
                  backgroundSize: '100% 4px',
                }} />

              {items.map(item => {
                const em        = EMISSION[item.type](item.frequency);
                const bandEmit  = em[band.id] ?? 0;
                const intensity = bandEmit * (item.amplitude / 100);
                const cx        = item.x + SOURCES[item.type].w / 2;
                return (
                  <Glow key={item.id}
                    cx={cx} intensity={intensity} glowColors={band.glowColors} />
                );
              })}
            </>
          )}
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
            className="drop-shadow-2xl opacity-90" draggable={false} />
        </div>
      )}
    </div>
  );
}
