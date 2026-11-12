// ── Dev controls ──────────────────────────────────────────────
// The hidden tuning sliders under a bench item (type "dev" to show them):
// power, spectrum peak / width / skew, glow offset, and the UV LED's and LED
// bulb's individual glow layers.
import { makePeakConv, fmtHz } from '../physics.js';

export default function DevControls({ item, s, updateItem }) {
  return (
    <>
      {/* Amplitude */}
      {s.power.fixed == null && <div className="flex items-center gap-1.5">
        <span className="text-[8px] text-zinc-400 w-[28px] shrink-0 uppercase tracking-wide">Amp</span>
        <input type="range" min="0" max="500" value={item.amplitude}
          className="flex-1 cursor-pointer accent-orange-400" style={{ height: '3px' }}
          onChange={e => updateItem(item.id, { amplitude: +e.target.value })} />
        <span className="text-[8px] text-zinc-500 w-6 text-right tabular-nums">{item.amplitude}</span>
      </div>}
      {/* Peak — log scale, per-type range */}
      {(() => {
        const cfg  = s.spectrum;
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
        const cfg = s.spectrum;
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
      {s.devGlowOffsets && <div className="flex items-center gap-1.5">
        <span className="text-[8px] text-zinc-400 w-[28px] shrink-0 uppercase tracking-wide">Glow X</span>
        <input type="range" min="-80" max="80" value={item.glowX ?? 0}
          className="flex-1 cursor-pointer accent-cyan-400" style={{ height: '3px' }}
          onChange={e => updateItem(item.id, { glowX: +e.target.value })} />
        <span className="text-[7px] text-zinc-500 w-7 text-right tabular-nums shrink-0">
          {item.glowX ?? 0}
        </span>
      </div>}
      {s.devGlowOffsets && <div className="flex items-center gap-1.5">
        <span className="text-[8px] text-zinc-400 w-[28px] shrink-0 uppercase tracking-wide">Glow Y</span>
        <input type="range" min="-80" max="80" value={item.glowY ?? 0}
          className="flex-1 cursor-pointer accent-cyan-400" style={{ height: '3px' }}
          onChange={e => updateItem(item.id, { glowY: +e.target.value })} />
        <span className="text-[7px] text-zinc-500 w-7 text-right tabular-nums shrink-0">
          {item.glowY ?? 0}
        </span>
      </div>}
      {item.gelBenchLayers && (() => {
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
      {item.ledLayers && (() => {
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
  );
}
