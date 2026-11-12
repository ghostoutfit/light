// ── Bench item ────────────────────────────────────────────────
// One placed source on the lab bench: its control panel (power slider, or the dev
// sliders), its image and naked-eye glow, and — in dev mode with GRAPHS on — its
// emission graph. The glow drawing comes from the source's file (bench / benchBehind).
import { useRef, useState } from 'react';
import { clamp, visCurve, itemIntensity } from '../physics.js';
import { GLOW } from '../glow.jsx';
import { SOURCES, imgHeight } from '../sources/index.js';
import EmissionGraph from './EmissionGraph.jsx';
import DevControls from './DevControls.jsx';
import CloseButton from './CloseButton.jsx';

const DeleteButton = ({ onDelete }) => <CloseButton onClick={onDelete} label="Remove from bench" />;

const ARROW_STEP = 4;   // power change per arrow-key press (the slider's own step is 1)

function PowerSlider({ item, s, updateItem, onDelete, onFocusChange }) {
  const input = useRef(null);
  const setPower = v => {
    const t = v / s.power.max;
    updateItem(item.id, s.power.peakAt ? { amplitude: v, peak: s.power.peakAt(t) } : { amplitude: v });
  };
  const onKeyDown = e => {
    const dir = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    setPower(clamp(item.amplitude + dir * ARROW_STEP, 0, s.power.max));
  };
  // A press anywhere on the row (except the ×) focuses the slider, so the arrow keys
  // then change the power. Focus after the press finishes, so nothing steals it back.
  const focusSlider = e => { if (!e.target.closest('button')) setTimeout(() => input.current?.focus()); };
  return (
    <div className="flex items-center gap-1.5" onPointerDown={focusSlider} style={{ cursor: 'pointer' }}>
      <span className="text-[8px] text-zinc-400 w-[28px] shrink-0 uppercase tracking-wide">Power</span>
      <input ref={input} type="range" min="0" max={s.power.max} value={item.amplitude}
        className="flex-1 cursor-pointer accent-orange-400"
        style={{ height: '3px' }}
        onKeyDown={onKeyDown}
        onFocus={() => onFocusChange(true)} onBlur={() => onFocusChange(false)}
        onChange={e => setPower(+e.target.value)} />
      <DeleteButton onDelete={onDelete} />
    </div>
  );
}

export default function BenchItem({ item, isBeingDragged, devMode, showGraphs, bandRanges, selectedBand,
                                    updateItem, startBenchDrag, selected, onPanelPress, onDelete }) {
  const s    = SOURCES[item.type];
  const imgH = imgHeight(s);
  const t    = s.tuning;
  const L    = s.layout;

  // Visible-band intensity for the real-life glow overlay
  const visBand = bandRanges.find(b => b.id === 'Visible');
  const visIntensity = itemIntensity(item, visBand);
  const visC = visCurve(visIntensity * 2);
  const vis = {
    intensity: visIntensity,
    c:     visC,
    bloom: clamp(1 + visC * 5,   1, 6),
    sharp: clamp(1 + visC * 4,   1, 5),
    blurB: (10 + visC * 40) * GLOW.blurScale * t.visBlur,
    blurD: (2  + visC * 8)  * GLOW.blurScale * t.visBlur,
    op:    clamp(visC * t.visOpacity, 0, 1),
  };
  const ctx = { item, s, imgH, vis, visBand };

  // A source with no power slider (the Sun) gets a small panel holding just the ×.
  const fixedPower = s.power.fixed != null;
  const [powerFocus, setPowerFocus] = useState(false);   // slider focused: arrows change the power
  const panel = fixedPower && !devMode ? { left: s.w / 2 - 17, width: 'auto' } : (devMode && L.devPanel) || L.panel;

  return (
    <div className="absolute touch-none"
      style={{ left: item.x, top: item.y, width: s.w }}>
      {!isBeingDragged && <div
        className="absolute rounded-lg px-2 py-2 flex flex-col gap-1.5
                   border border-white/10 backdrop-blur-sm"
        style={{
          top: '100%',
          marginTop: L.panelTop,
          background: 'rgba(0,0,0,0.65)',
          left: panel.left,
          width: panel.width,
          position: 'absolute',
          zIndex: 65,
          // while the power slider has the arrow keys
          outline: powerFocus && !devMode ? '2px dotted #fff' : 'none', outlineOffset: 2,
        }}
        onPointerDown={e => { e.stopPropagation(); onPanelPress(); }}>
        {devMode
          ? <DevControls item={item} s={s} updateItem={updateItem} />
          : fixedPower
          ? <DeleteButton onDelete={onDelete} />
          : <PowerSlider item={item} s={s} updateItem={updateItem} onDelete={onDelete} onFocusChange={setPowerFocus} />}
      </div>}
      {/* Item image + visible-light glow overlay */}
      <div style={{ position: 'relative', width: s.w, height: imgH,
        // selected: the arrow keys move it
        outline: selected ? '2px dashed rgba(255,255,255,0.8)' : 'none', outlineOffset: 4, borderRadius: 6 }}>
        {s.benchBehind && s.benchBehind(ctx)}
        <img src={s.src} alt={s.label}
          style={{ width: s.w, height: imgH, display: 'block' }}
          className="drop-shadow-lg"
          draggable={false} />
        {/* Drag hit area */}
        <div
          style={{
            position: 'absolute', top: 0, left: 0, width: s.w,
            height: imgH - L.grabTrim,
            cursor: 'grab',
          }}
          onPointerDown={(e) => startBenchDrag(e, item)} />
        {s.bench && s.bench(ctx)}
      </div>
      {/* Graph on bench — visible in dev mode with Show Graphs, regardless of detector */}
      {devMode && showGraphs && (
        <div style={{
          position: 'absolute',
          left: Math.round((s.w - L.graphWidth) / 2),
          bottom: '100%',
          marginBottom: L.graphGap,
          width: L.graphWidth,
          pointerEvents: 'none',
          zIndex: 30,
        }}>
          <EmissionGraph item={item} bandRanges={bandRanges} width={L.graphWidth}
            devMode={devMode} selectedBand={selectedBand} />
        </div>
      )}
    </div>
  );
}
