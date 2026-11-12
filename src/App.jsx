// ═══════════════════════════════════════════════════════════════════════════
//  LIGHT SOURCES AND DETECTORS  —  App: all state, drag handling, page layout
// ═══════════════════════════════════════════════════════════════════════════
//  The user drags light/heat sources onto a lab bench, then points a camera
//  "detector" at them to see how each looks in Infrared, Visible, Ultraviolet,
//  X-Ray, or plain Camera mode. See README.md for the map of the other files.
//
//  No routing, no global store — App holds all state and passes it down.
//  Type "dev" to toggle hidden tuning sliders; type a secret word to unlock the Sun.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useRef, useEffect } from 'react';
import { clamp, hzToPos, posToHz, FREQ_MIN, FREQ_MAX } from './physics.js';
import { BANDS } from './bands.js';
import { SOURCES, imgHeight, newItem } from './sources/index.js';
import { VIEWER_W, VIEWER_H, SCREEN_L, SCREEN_T, SCREEN_W, SCREEN_H, BENCH_TOP,
         overlapsScreen, viewOverlap } from './detectorGeometry.js';
import PartsPanel from './components/PartsPanel.jsx';
import BenchItem from './components/BenchItem.jsx';
import Detector from './components/Detector.jsx';

export default function App() {
  // ── State ────────────────────────────────────────────────────
  // items = every source placed on the bench (each has type, x/y, amplitude =
  // power, and spectrum params peak/width/skew). The rest track the current
  // drag, which camera band is selected, the frequency-band dividers, and the
  // various mode toggles (dev panel, god/secret mode, detector on/off).
  const [items,        setItems]        = useState([]);
  const [drag,         setDrag]         = useState(null);
  const [selectedBand, setSelectedBand] = useState('Visible');
  const [photoMode,    setPhotoMode]    = useState(false);

  // Frequency-scale dividers in Hz (log scale).
  // Initialised at geometric midpoints between adjacent band freqs.
  const [dividers, setDividers] = useState([400, 800, 5000]);
  const [divDrag,  setDivDrag]  = useState(null); // { idx, barLeft, barWidth }

  const [devMode, setDevMode] = useState(false);
  const [showGraphs, setShowGraphs] = useState(false);
  const [showTemp, setShowTemp] = useState(false);
  const [godMode, setGodMode] = useState(false);

  useEffect(() => {
    const secrets = ['god mode', 'godmode', 'the sun', 'thesun', 'sunlight'];
    const maxLen = Math.max(...secrets.map(s => s.length));
    let buf = '';
    const handler = e => {
      buf = (buf + e.key).slice(-maxLen);
      if (secrets.some(s => buf.endsWith(s))) setGodMode(true);
      if (buf.endsWith('dev')) { setDevMode(d => !d); buf = ''; }
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

  const anyItemInView = showDetector && items.some(item => overlapsScreen(item, viewerPos));

  // ── Graph-in-detector: which item's graph to show ─────────────
  useEffect(() => {
    if ((!showGraphs && !showTemp) || !showDetector || items.length === 0) {
      if (graphItemIdRef.current !== null) setGraphItemId(null);
      return;
    }
    const qualifying = [];
    for (const item of items) {
      const intersection = viewOverlap(item, viewerPos);
      if (intersection) qualifying.push({ id: item.id, intersection });
    }

    if (qualifying.length === 0) {
      if (graphItemIdRef.current !== null) setGraphItemId(null);
      return;
    }
    if (qualifying.some(q => q.id === graphItemIdRef.current)) return; // keep current
    const best = qualifying.reduce((a, b) => a.intersection > b.intersection ? a : b);
    setGraphItemId(best.id);
  }, [showGraphs, showTemp, showDetector, items, viewerPos]);

  const benchRef = useRef(null);
  const partsRef = useRef(null);
  const clickSlotsRef = useRef({ a: null, b: null, last: null });

  // ── Handlers: place & drag sources ───────────────────────────
  // updateItem patches one source's fields. clickPlaceSource drops a new source
  // by clicking (into a free bench slot, or the detector's view). The start*Drag
  // helpers begin a drag from the parts panel, the bench, or a band divider.
  const updateItem = (id, patch) =>
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));

  const clickPlaceSource = (type) => {
    if (type === 'viewer') return;
    const s = SOURCES[type];
    const br = benchRef.current?.getBoundingClientRect();
    const pr = partsRef.current?.getBoundingClientRect();
    if (!br || !pr) return;

    const imgH = imgHeight(s);

    // If detector is visible and no source is currently in its view, place new item at detector center
    if (showDetector && !items.some(item => overlapsScreen(item, viewerPos))) {
      const cx = Math.round(viewerPos.x + SCREEN_L + SCREEN_W / 2 - s.w / 2);
      const cy = Math.round(viewerPos.y + SCREEN_T + SCREEN_H / 2 - imgH / 2 - BENCH_TOP);
      setItems(its => [...its, newItem(type, cx, cy)]);
      return;
    }

    const yPos = Math.round((br.height - imgH) * 0.35);
    const slotAx = Math.round(pr.right - br.left + 20);
    const slotBx = Math.round(window.innerWidth - br.left - 200 - s.w);

    const item = newItem(type, 0, yPos);
    const prev = clickSlotsRef.current;
    if (!prev.a) {
      setItems(its => [...its, { ...item, x: slotAx }]);
      clickSlotsRef.current = { ...prev, a: item.id, last: 'a' };
    } else if (!prev.b) {
      setItems(its => [...its, { ...item, x: slotBx }]);
      clickSlotsRef.current = { ...prev, b: item.id, last: 'b' };
    } else {
      const evict = prev.last === 'a' ? 'b' : 'a';
      const evictId = prev[evict];
      const x = evict === 'a' ? slotAx : slotBx;
      setItems(its => [...its.filter(it => it.id !== evictId), { ...item, x }]);
      clickSlotsRef.current = { ...prev, [evict]: item.id, last: evict };
    }
  };

  const startPartsDrag = (e, type) => {
    e.preventDefault();
    const s = SOURCES[type];
    setDrag({
      from: 'parts', type, id: null,
      cx: e.clientX, cy: e.clientY,
      sx: e.clientX, sy: e.clientY,
      ox: s.w / 2,
      oy: imgHeight(s) * 0.38,
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

  // ── Pointer move / up — live drag + drop ─────────────────────
  // onMove updates whatever is being dragged (the detector, a band divider, or
  // a bench source). onUp finishes the drag: dropping a source back on the parts
  // panel removes it; a click (tiny movement) places into a slot instead.
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
        const sl = clickSlotsRef.current;
        if (sl.a === drag.id) clickSlotsRef.current = { a: null, b: sl.b, last: sl.b ? 'b' : null };
        else if (sl.b === drag.id) clickSlotsRef.current = { a: sl.a, b: null, last: sl.a ? 'a' : null };
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
        // Require a real drag; clicks snap the item to a bench slot instead
        const moved = Math.abs(e.clientX - drag.sx) > 40 || Math.abs(e.clientY - drag.sy) > 40;
        if (!moved) { clickPlaceSource(drag.type); setDrag(null); return; }
        // New drop — only accept if pointer lands inside bench
        if (e.clientX >= br.left && e.clientX <= br.right &&
            e.clientY >= br.top  && e.clientY <= br.bottom) {
          setItems(prev => {
            if (prev.some(it => it.type === drag.type)) return prev;
            return [...prev, newItem(drag.type, x, y)];
          });
        }
      } else {
        // Position already updated live in onMove; nothing more to do
      }
    }
    setDrag(null);
  };

  return (
    <div
      className="h-screen w-screen flex flex-col select-none overflow-hidden"
      style={{ cursor: viewerDrag ? 'grabbing' : divDrag ? 'col-resize' : undefined }}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      {/* Dev mode toggles by typing "dev" — hidden, no UI */}

      {/* ══════════════════════════════════════════
          TOP HALF — Lab Bench
      ══════════════════════════════════════════ */}
      <div className="relative flex-1" ref={benchRef} style={{ marginTop: BENCH_TOP }}>
        <img src={`images/Table.PNG?v=${Date.now()}`}
          className="absolute pointer-events-none"
          style={{ top: -55, right: 0, left: 0, width: '100%', height: 'calc(100% + 55px)',
                   objectFit: 'cover', objectPosition: 'right center' }}
          draggable={false} />

        <PartsPanel panelRef={partsRef} showDetector={showDetector} setShowDetector={setShowDetector}
          godMode={godMode} items={items} startPartsDrag={startPartsDrag}
          onClearAll={() => { setItems([]); clickSlotsRef.current = { a: null, b: null, last: null }; }} />

        {/* Bench items — sliders above */}
        {items.map(item => (
          <BenchItem key={item.id} item={item}
            isBeingDragged={drag?.from === 'bench' && drag.id === item.id}
            devMode={devMode} showGraphs={showGraphs} bandRanges={bandRanges} selectedBand={selectedBand}
            updateItem={updateItem} startBenchDrag={startBenchDrag} />
        ))}

      </div>


      {/* ══════════════════════════════════════════
          VIEWER — draggable camera device
      ══════════════════════════════════════════ */}
      {showDetector && <Detector
        items={items} band={band} bandRanges={bandRanges}
        selectedBand={selectedBand} setSelectedBand={setSelectedBand}
        photoMode={photoMode} setPhotoMode={setPhotoMode}
        showGraphs={showGraphs} setShowGraphs={setShowGraphs}
        showTemp={showTemp} setShowTemp={setShowTemp}
        showDetector={showDetector} setShowDetector={setShowDetector}
        viewerPos={viewerPos} viewerDrag={viewerDrag} setViewerDrag={setViewerDrag}
        anyItemInView={anyItemInView} graphItemId={graphItemId} devMode={devMode} />}

      {/* Global drag ghost — only for drags from the parts panel */}
      {drag && drag.from !== 'bench' && (() => {
        const isViewer = drag.type === 'viewer';
        const w = isViewer ? VIEWER_W : SOURCES[drag.type].w;
        const h = isViewer ? VIEWER_H : undefined;
        const src = isViewer ? 'images/viewer.png?v=2' : SOURCES[drag.type].src;
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
