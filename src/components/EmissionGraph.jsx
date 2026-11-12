// ── Emission graph ────────────────────────────────────────────
// A source's spectrum across the four bands (an SVG curve). Shown on the detector
// screen (GRAPHS) and, in dev mode, floating above each bench item.
import { spectralEmission, hzToPos, FREQ_MIN, FREQ_MAX, itemIntensity } from '../physics.js';
import { SOURCES } from '../sources/index.js';

const GRAPH_SAMPLES = 120;

export default function EmissionGraph({ item, bandRanges, width, devMode, selectedBand }) {
  const H = 53; // 44 × 1.2
  const W = width;
  const Y_MAX = 80;
  const PAD = 4;

  // Per-band capture value
  const captures = bandRanges.map(b => ({ ...b, val: itemIntensity(item, b) }));

  // Per-type visual scale for the graph curve only — does not affect detector output.
  const graphVisScale = SOURCES[item.type].graphScale;

  // CEIL sets full-scale: amplitude=400 peaks at (1/CEIL)^PWR of graph height,
  // giving the power curve room to work rather than always slamming the top.
  const CEIL = 1.25, PWR = 1 / 1.25;
  const pts = [];
  for (let i = 0; i <= GRAPH_SAMPLES; i++) {
    const t = i / GRAPH_SAMPLES;
    const f = FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, t);
    const v = spectralEmission(f, item.peak, item.widthHz, item.skew) * (item.amplitude / 400) * graphVisScale;
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
          const x1 = hzToPos(b.lo) * W;
          const x2 = hzToPos(b.hi) * W;
          const cx = (x1 + x2) / 2;
          return (
            <text key={b.id} x={cx} y={H / 2}
              textAnchor="middle" dominantBaseline="middle" fontSize={12} fontFamily="monospace"
              fill={b.divColor} opacity={0.9} style={{ userSelect: 'none' }}>
              {b.short}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
