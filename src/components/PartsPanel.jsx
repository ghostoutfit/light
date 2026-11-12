// ── Parts panel ───────────────────────────────────────────────
// The boxes at the top left of the bench: the Show Detector switch, the sources
// grouped by kind (drag one onto the bench, or click to place it), and Clear All.
import { SOURCES } from '../sources/index.js';

export default function PartsPanel({ panelRef, showDetector, setShowDetector, godMode, items,
                                     startPartsDrag, onClearAll }) {
  return (
    <div ref={panelRef}
      className="absolute top-4 left-4 z-20 flex flex-col gap-2">
      {/* Detector toggle */}
      <div className={'detector-halo' + (showDetector ? ' on' : '')}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px',
        border: '3px solid rgba(80,80,80,0.8)', borderRadius: 10,
        background: 'rgba(12,12,12,0.88)', backdropFilter: 'blur(8px)' }}
        onPointerDown={e => e.stopPropagation()}
        onClick={() => setShowDetector(d => !d)}>
        <img src="images/PowerOn.png" draggable={false}
          style={{
            width: 32, height: Math.round(32 * 61/64), cursor: 'pointer', flexShrink: 0,
            opacity: showDetector ? 1 : 0.4,
            filter: showDetector ? 'drop-shadow(0 0 6px #f24a38cc)' : 'none',
          }} />
        <span style={{
          fontSize: 18, fontWeight: 700, letterSpacing: '0.04em',
          color: 'white', cursor: 'pointer', userSelect: 'none', lineHeight: 1.1,
        }}>
          Show<br />Detector
        </span>
      </div>


      {/* Source group renderer */}
      {[
        { label: 'Heat Sources', color: 'rgba(251,146,60,0.9)', group: 'hot', borderColor: '#8B2828' },
        { label: 'Other Sources', color: 'rgba(96,165,250,0.9)', group: 'specialized', borderColor: '#1E65CC' },
        ...(godMode ? [{ label: '✦ Secret', color: 'rgba(255,220,50,0.9)', group: 'secret', borderColor: 'rgba(255,220,50,0.5)' }] : []),
      ].map(({ label, color, group, borderColor }) => {
        const groupSources = Object.entries(SOURCES).filter(([, s]) => s.group === group);
        return (
          <div key={group} style={{ border: `3px solid ${borderColor}`, borderRadius: 10, padding: '6px 8px 4px',
            background: 'rgba(12,12,12,0.88)', backdropFilter: 'blur(8px)' }}>
            <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color, textAlign: 'left', marginBottom: 4 }}>
              {label}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {groupSources.map(([type, s]) => {
                const placed = items.some(it => it.type === type);
                // A placed source is dimmed (it can't be added twice). The dimming is applied
                // to the image and background only, so the text keeps readable contrast.
                const dim = placed ? 0.38 : 1;
                const textColor = placed ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.85)';
                return (
                  <div key={type}
                    className="touch-none"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      cursor: placed ? 'default' : 'grab',
                      padding: '3px 4px',
                      borderRadius: 6,
                      background: placed ? `rgba(255,255,255,${0.04 * dim})` : 'transparent',
                    }}
                    onPointerDown={placed ? undefined : (e) => startPartsDrag(e, type)}>
                    <img src={s.src} alt={s.label} draggable={false}
                      className="drop-shadow pointer-events-none"
                      style={{ width: 40, height: 40, objectFit: 'contain', flexShrink: 0, opacity: dim }} />
                    <span style={{ fontSize: 13, color: textColor, lineHeight: 1.3, flex: 1 }}>
                      {s.label}
                    </span>
                    {placed && <span style={{ fontSize: 13, color: textColor, flexShrink: 0 }}>✓</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="text-white/70 text-[10px] text-center mt-0.5">drag back to remove</p>
      {items.length > 0 && (
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={onClearAll}
          style={{
            marginTop: 4, width: '100%', padding: '6px 0',
            fontSize: 16, letterSpacing: '0.04em',
            color: 'rgb(255,190,180)', background: 'rgba(255,60,40,0.1)',
            border: '1px solid rgba(255,80,60,0.25)', borderRadius: 6,
            cursor: 'pointer',
          }}>
          Clear All
        </button>
      )}
    </div>
  );
}
