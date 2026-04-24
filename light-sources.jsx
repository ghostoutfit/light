import { useState, useRef } from 'react';

// ── Source item catalogue ────────────────────────────────────
const SOURCES = {
  range:   { label: 'Electric Range', src: 'images/Heater.png',  w: 110 },
  tanbulb: { label: 'Tanning Bulb',   src: 'images/Tanbulb.png', w: 140 },
};

let uid = 1;

// ── Drag state shape ─────────────────────────────────────────
// {
//   from:  'parts' | 'bench'
//   type:  keyof SOURCES
//   id:    number | null        — bench item id (bench drags only)
//   cx, cy: number              — current pointer position (client coords)
//   ox, oy: number              — pointer offset from item top-left
// }

export default function App() {
  const [items, setItems]   = useState([]);   // items placed on bench
  const [drag,  setDrag]    = useState(null);
  const benchRef            = useRef(null);

  // ── Start drag from parts box ────────────────────────────
  const startPartsDrag = (e, type) => {
    e.preventDefault();
    const s = SOURCES[type];
    setDrag({
      from: 'parts', type, id: null,
      cx: e.clientX, cy: e.clientY,
      ox: s.w / 2,   oy: s.w * 0.4,   // centre under cursor
    });
  };

  // ── Start drag of existing bench item ────────────────────
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

  // ── Global pointer move / up ─────────────────────────────
  const onMove = (e) => {
    if (drag) setDrag(d => ({ ...d, cx: e.clientX, cy: e.clientY }));
  };

  const onUp = (e) => {
    if (!drag) return;
    const bench = benchRef.current;
    if (bench) {
      const r  = bench.getBoundingClientRect();
      const x  = e.clientX - r.left - drag.ox;
      const y  = e.clientY - r.top  - drag.oy;
      const inside =
        e.clientX >= r.left && e.clientX <= r.right &&
        e.clientY >= r.top  && e.clientY <= r.bottom;

      if (inside) {
        if (drag.from === 'parts') {
          setItems(prev => [...prev, { id: uid++, type: drag.type, x, y }]);
        } else {
          setItems(prev =>
            prev.map(it => it.id === drag.id ? { ...it, x, y } : it)
          );
        }
      }
    }
    setDrag(null);
  };

  return (
    <div
      className="h-screen w-screen flex flex-col select-none overflow-hidden"
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      {/* ══════════════════════════════════════════════════════
          TOP HALF — Lab Bench
      ══════════════════════════════════════════════════════ */}
      <div className="h-1/2 relative overflow-hidden" ref={benchRef}>

        {/* Bench background */}
        <img
          src="images/Table.PNG"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          draggable={false}
        />

        {/* ── Parts box (upper left) ── */}
        <div className="absolute top-4 left-4 z-20
                        bg-black/55 backdrop-blur-sm
                        border border-white/20 rounded-2xl
                        px-3 pt-2 pb-3 flex flex-col gap-3
                        shadow-xl">
          <p className="text-white/50 text-[9px] font-bold uppercase tracking-[0.15em] text-center">
            Parts
          </p>

          {Object.entries(SOURCES).map(([type, s]) => (
            <div
              key={type}
              className="flex flex-col items-center gap-1
                         cursor-grab active:cursor-grabbing touch-none"
              onPointerDown={(e) => startPartsDrag(e, type)}
            >
              <img
                src={s.src}
                alt={s.label}
                style={{ width: 68 }}
                className="drop-shadow pointer-events-none"
                draggable={false}
              />
              <span className="text-white/45 text-[9px] leading-tight text-center">
                {s.label}
              </span>
            </div>
          ))}
        </div>

        {/* ── Items placed on bench ── */}
        {items.map(item => {
          // Hide the original while it's being dragged (ghost takes over)
          if (drag?.from === 'bench' && drag.id === item.id) return null;
          const s = SOURCES[item.type];
          return (
            <div
              key={item.id}
              className="absolute cursor-grab active:cursor-grabbing touch-none"
              style={{ left: item.x, top: item.y, width: s.w }}
              onPointerDown={(e) => startBenchDrag(e, item)}
            >
              <img
                src={s.src}
                alt={s.label}
                style={{ width: s.w }}
                className="drop-shadow-lg pointer-events-none"
                draggable={false}
              />
            </div>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════
          BOTTOM HALF — (coming soon)
      ══════════════════════════════════════════════════════ */}
      <div className="h-1/2 bg-slate-950 border-t border-slate-800
                      flex items-center justify-center">
        <span className="text-slate-700 text-sm tracking-wide">
          — bottom half coming soon —
        </span>
      </div>

      {/* ── Global drag ghost (follows cursor for any active drag) ── */}
      {drag && (
        <div
          className="fixed pointer-events-none z-50"
          style={{
            left:  drag.cx - drag.ox,
            top:   drag.cy - drag.oy,
            width: SOURCES[drag.type].w,
          }}
        >
          <img
            src={SOURCES[drag.type].src}
            style={{ width: SOURCES[drag.type].w }}
            className="drop-shadow-2xl"
            draggable={false}
          />
        </div>
      )}
    </div>
  );
}
