// ── Detector ──────────────────────────────────────────────────
// The draggable camera: its screen (band heading, targeting reticle, each source's
// glow via EmissionShape, the GRAPHS and TEMP overlays), the GRAPHS / TEMP / ON
// buttons on its face, and the band-selector buttons down its right side.
// Positions on the artwork are in detectorGeometry.js.
import React from 'react';
import { itemIntensity } from '../physics.js';
import { BANDS } from '../bands.js';
import { itemTemp } from '../sources/index.js';
import { VIEWER_W, VIEWER_H, SCREEN_L, SCREEN_T, SCREEN_W, SCREEN_H, BENCH_TOP,
         BTN_CX, BTN_R, BTN_CYS, viewOverlap } from '../detectorGeometry.js';
import EmissionShape from './EmissionShape.jsx';
import EmissionGraph from './EmissionGraph.jsx';

export default function Detector({
  items, band, bandRanges, selectedBand, setSelectedBand, photoMode, setPhotoMode,
  showGraphs, setShowGraphs, showTemp, setShowTemp, showDetector, setShowDetector,
  viewerPos, viewerDrag, setViewerDrag, anyItemInView, graphItemId, devMode,
}) {
  return (
      <div
        style={{
          position: 'fixed', left: viewerPos.x, top: viewerPos.y,
          width: VIEWER_W, height: VIEWER_H,
          zIndex: 60, touchAction: 'none',
          cursor: viewerDrag ? 'grabbing' : 'grab',
        }}
        onPointerDown={e => {
          setViewerDrag({ ox: e.clientX - viewerPos.x, oy: e.clientY - viewerPos.y });
        }}
      >
        {/* Screen — behind the viewer image, visible through its transparent center */}
        <div
          style={{
            position: 'absolute', left: SCREEN_L, top: SCREEN_T,
            width: SCREEN_W, height: SCREEN_H,
            overflow: 'hidden', zIndex: 1,
            background: photoMode ? 'transparent' : '#000',
          }}
        >
          {/* Show Graphs label */}
          <div
            style={{
              position: 'absolute',
              left: 30,
              top: '50%',
              transform: 'translateY(calc(-50% - 101px))',
              zIndex: 20, pointerEvents: 'auto', cursor: 'pointer',
            }}
            onClick={() => setShowGraphs(g => !g)}>
            <span style={{
              fontFamily: '"Courier New", Courier, monospace',
              fontSize: 22, fontWeight: 'bold', letterSpacing: '0.08em',
              color: showGraphs ? '#fe2b71' : 'rgba(254,43,113,0.6)',
              textShadow: showGraphs ? [
                '0 0 2px #fe2b71',
                '0 0 8px #fe2b71dd',
                '0 0 18px #fe2b7188',
                '0 0 35px #fe2b7144',
              ].join(', ') : 'none',
              filter: showGraphs ? 'brightness(1.3) contrast(1.1)' : 'none',
              userSelect: 'none', lineHeight: 1.0, textAlign: 'left', display: 'block',
            }}>
              GRAPHS
            </span>
          </div>

          {/* TEMP label — 111px below GRAPHS */}
          <div
            style={{
              position: 'absolute',
              left: 29,
              top: '50%',
              transform: 'translateY(calc(-50% - 24px))',
              zIndex: 20, pointerEvents: 'auto', cursor: 'pointer',
            }}
            onClick={() => setShowTemp(t => !t)}>
            <span style={{
              fontFamily: '"Courier New", Courier, monospace',
              fontSize: 22, fontWeight: 'bold', letterSpacing: '0.08em',
              color: showTemp ? '#4e44ff' : 'rgba(78,68,255,0.6)',
              textShadow: showTemp ? [
                '0 0 2px #4e44ff',
                '0 0 8px #4e44ffdd',
                '0 0 18px #4e44ff88',
                '0 0 35px #4e44ff44',
              ].join(', ') : 'none',
              filter: showTemp ? 'brightness(1.3) contrast(1.1)' : 'none',
              userSelect: 'none', lineHeight: 1.0, textAlign: 'left', display: 'block',
            }}>
              TEMP
            </span>
          </div>

          {/* CRT scanlines */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5,
            backgroundImage: 'repeating-linear-gradient(transparent, transparent 2px, rgba(0,0,0,0.18) 2px, rgba(0,0,0,0.18) 3px)',
            backgroundSize: '100% 3px',
          }} />

          {/* Mode title — always shown, including CAMERA MODE in None */}
          {(() => {
            const sel = BANDS.find(b => b.id === selectedBand);
            const title = photoMode ? 'CAMERA MODE' : sel.title;
            const color = photoMode ? '#00ff44' : sel.titleColor;
            return (
              <div style={{
                position: 'absolute', top: 35, left: 0, right: 0,
                display: 'flex', justifyContent: 'center',
                pointerEvents: 'none', zIndex: 10,
              }}>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <span style={{
                    fontFamily: '"Courier New", Courier, monospace',
                    fontSize: 26, fontWeight: 'bold', letterSpacing: '0.18em',
                    color,
                    textShadow: [
                      `0 0 2px ${color}`,
                      `0 0 8px ${color}dd`,
                      `0 0 18px ${color}99`,
                      `0 0 40px ${color}55`,
                    ].join(', '),
                    userSelect: 'none', display: 'block',
                    filter: 'brightness(1.3) contrast(1.1)',
                  }}>
                    {title}
                  </span>
                  {/* Scanlines over the text — hidden in Camera mode (transparent screen) */}
                  {!photoMode && <div style={{
                    position: 'absolute', inset: 0, pointerEvents: 'none',
                    backgroundImage: 'repeating-linear-gradient(transparent, transparent 2px, rgba(0,0,0,0.22) 2px, rgba(0,0,0,0.22) 3px)',
                    backgroundSize: '100% 3px',
                  }} />}
                </div>
              </div>
            );
          })()}

          {/* None mode — screen is transparent; bench shows through physically. No content needed. */}
          {!photoMode && (<>
            {/* Targeting reticle — shown when no source is in view */}
            {!anyItemInView && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none', zIndex: 8,
              }}>
                <svg width={110} height={110} style={{ opacity: 0.65 }}>
                  <circle cx={55} cy={55} r={46} fill="none" stroke="#9df85c" strokeWidth={1.5} strokeDasharray="4 5" />
                  <circle cx={55} cy={55} r={7} fill="none" stroke="#9df85c" strokeWidth={1.5} />
                  <line x1={55} y1={9}   x2={55} y2={46}  stroke="#9df85c" strokeWidth={1.5} />
                  <line x1={55} y1={64}  x2={55} y2={101} stroke="#9df85c" strokeWidth={1.5} />
                  <line x1={9}  y1={55}  x2={46} y2={55}  stroke="#9df85c" strokeWidth={1.5} />
                  <line x1={64} y1={55}  x2={101} y2={55} stroke="#9df85c" strokeWidth={1.5} />
                  <path d="M 18,18 L 18,28 M 18,18 L 28,18" stroke="#9df85c" strokeWidth={1.5} fill="none" />
                  <path d="M 92,18 L 92,28 M 92,18 L 82,18" stroke="#9df85c" strokeWidth={1.5} fill="none" />
                  <path d="M 18,92 L 18,82 M 18,92 L 28,92" stroke="#9df85c" strokeWidth={1.5} fill="none" />
                  <path d="M 92,92 L 92,82 M 92,92 L 82,92" stroke="#9df85c" strokeWidth={1.5} fill="none" />
                </svg>
                <span style={{
                  marginTop: 10, fontSize: 13, fontWeight: 600, letterSpacing: '0.18em',
                  color: '#9df85c', textShadow: '0 0 8px #9df85c88',
                  textTransform: 'uppercase', userSelect: 'none',
                }}>
                  {items.length === 0 ? 'No Source' : 'Out of View'}
                </span>
              </div>
            )}
            {/* Spectrum mode — translate bench coords into detector viewport */}
            {items.length > 0 && (
              <div style={{
                position: 'absolute',
                left: -(viewerPos.x + SCREEN_L),
                top:  -(viewerPos.y + SCREEN_T) + BENCH_TOP,
              }}>
                {items.map(item => (
                  <React.Fragment key={item.id}>
                    <EmissionShape item={item} band={band} intensity={itemIntensity(item, band)} />
                  </React.Fragment>
                ))}
              </div>
            )}
          </>)}

          {/* Graph overlay — below mode title (top ~75px) */}
          {showGraphs && graphItemId && (() => {
            const item = items.find(it => it.id === graphItemId);
            if (!item) return null;
            const gW = Math.round((SCREEN_W - 70) * 0.7);
            return (
              <div style={{
                position: 'absolute', left: Math.round((SCREEN_W - gW) / 2), top: 72, width: gW,
                paddingTop: 35, // offsets EmissionGraph's internal marginTop:-35 so background fills correctly
                pointerEvents: 'none', zIndex: 15,
                background: photoMode ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.65)',
                borderBottom: photoMode ? '1px solid rgba(0,0,0,0.15)' : '1px solid rgba(255,255,255,0.12)',
              }}>
                <EmissionGraph item={item} bandRanges={bandRanges} width={gW}
                  devMode={devMode} selectedBand={photoMode ? null : selectedBand} />
              </div>
            );
          })()}

          {/* TEMP readout — hottest qualifying item in the screen */}
          {showTemp && (() => {
            let temp = null;
            for (const it of items) {
              if (!viewOverlap(it, viewerPos)) continue;
              const t = itemTemp(it);
              if (t != null && (temp === null || t > temp)) temp = t;
            }
            if (temp == null) return null;
            return (
              <div style={{
                position: 'absolute', left: 30, bottom: 40,
                pointerEvents: 'none', zIndex: 15,
              }}>
                <span style={{
                  fontFamily: '"Courier New", Courier, monospace',
                  fontSize: 20, fontWeight: 'bold', letterSpacing: '0.08em',
                  color: '#4e44ff',
                  textShadow: [
                    '0 0 2px #4e44ff',
                    '0 0 8px #4e44ffdd',
                    '0 0 18px #4e44ff88',
                    '0 0 35px #4e44ff44',
                  ].join(', '),
                  filter: 'brightness(1.3) contrast(1.1)',
                  userSelect: 'none',
                }}>
                  TEMP = {temp}°C
                </span>
              </div>
            );
          })()}
        </div>

        {/* Show Graphs rounded rect button — on detector face, above viewer image */}
        <div
          style={{
            position: 'absolute',
            left: 46, top: 190,
            width: 35, height: 32, borderRadius: 6,
            background: showGraphs ? '#fe2b7180' : 'rgba(0,0,0,0)',
            border: showGraphs ? '2px solid #fe2b71' : 'none',
            boxShadow: showGraphs ? [
              '0 0 12px 6px #fe2b71D9',
              '0 0 30px 12px #fe2b7194',
              '0 0 60px 20px #fe2b7162',
            ].join(', ') : 'none',
            zIndex: 3, pointerEvents: 'auto', cursor: 'pointer',
            transition: 'background 0.15s, box-shadow 0.15s',
          }}
          onClick={() => setShowGraphs(g => !g)}
        />

        {/* TEMP button — 111px below GRAPHS button */}
        <div
          style={{
            position: 'absolute',
            left: 45, top: 267,
            width: 36, height: 32, borderRadius: 6,
            background: showTemp ? '#4e44ff80' : 'rgba(0,0,0,0)',
            border: showTemp ? '2px solid #4e44ff' : 'none',
            boxShadow: showTemp ? [
              '0 0 12px 6px #4e44ffD9',
              '0 0 30px 12px #4e44ff94',
              '0 0 60px 20px #4e44ff62',
            ].join(', ') : 'none',
            zIndex: 3, pointerEvents: 'auto', cursor: 'pointer',
            transition: 'background 0.15s, box-shadow 0.15s',
          }}
          onClick={() => setShowTemp(t => !t)}
        />

        {/* Power button — glows when detector is on, click to hide */}
        <div
          style={{
            position: 'absolute',
            left: 47, top: 343,
            width: 36, height: 32, borderRadius: 6,
            background: showDetector ? '#f24a3880' : 'rgba(0,0,0,0)',
            border: showDetector ? '1px solid #f24a38' : 'none',
            boxShadow: showDetector ? [
              '0 0 12px 6px #f24a38D9',
              '0 0 30px 12px #f24a3894',
              '0 0 60px 20px #f24a3862',
            ].join(', ') : 'none',
            zIndex: 3, pointerEvents: 'auto', cursor: 'pointer',
            transition: 'background 0.15s, box-shadow 0.15s',
          }}
          onClick={() => setShowDetector(d => !d)}
        />
        {/* ON label — directly below SHOW GRAPH text */}
        <div style={{
          position: 'absolute',
          left: SCREEN_L + 29,
          top: 346,
          zIndex: 3, pointerEvents: 'auto', cursor: 'pointer',
          display: 'flex', alignItems: 'center', height: 32,
        }}
          onClick={() => setShowDetector(d => !d)}>
          <span style={{
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: 22, fontWeight: 'bold', letterSpacing: '0.08em',
            color: showDetector ? '#f24a38' : 'rgba(242,74,56,0.6)',
            textShadow: showDetector ? [
              '0 0 2px #f24a38',
              '0 0 8px #f24a38dd',
              '0 0 18px #f24a3888',
              '0 0 35px #f24a3844',
            ].join(', ') : 'none',
            filter: showDetector ? 'brightness(1.3) contrast(1.1)' : 'none',
            userSelect: 'none',
          }}>ON</span>
        </div>

        {/* Device image — on top, transparent center reveals the screen behind */}
        <img src="images/viewer.png" draggable={false}
          style={{
            position: 'absolute', inset: 0,
            width: VIEWER_W, height: VIEWER_H,
            userSelect: 'none', pointerEvents: 'none',
            zIndex: 2,
          }} />

        {/* Band selector buttons + labels */}
        {BANDS.map((b, i) => {
          const isActive = !photoMode && selectedBand === b.id;
          const labelRight = VIEWER_W - (BTN_CX - BTN_R - 6);
          return (
            <div key={b.id}>
              {/* Label — right-justified, double size, CRT screen look */}
              <div style={{
                position: 'absolute',
                right: labelRight + 15,
                width: 90,
                textAlign: 'right',
                top:  BTN_CYS[i] - 13,
                zIndex: 10,
                pointerEvents: 'none',
                userSelect: 'none',
              }}>
                <span style={{
                  fontFamily: '"Courier New", Courier, monospace',
                  fontSize: 22, fontWeight: 'bold', letterSpacing: '0.08em',
                  color: isActive ? b.divColor : 'rgba(255,255,255,0.28)',
                  textShadow: isActive ? [
                    `0 0 2px ${b.divColor}`,
                    `0 0 8px ${b.divColor}dd`,
                    `0 0 18px ${b.divColor}88`,
                    `0 0 35px ${b.divColor}44`,
                  ].join(', ') : 'none',
                  transition: 'color 0.12s, text-shadow 0.12s',
                  filter: isActive ? 'brightness(1.3) contrast(1.1)' : 'none',
                  display: 'block',
                }}>
                  {b.short}
                </span>
              </div>
              {/* Hit area — 2px smaller radius, unearthly glow when active */}
              <div
                style={{
                  position: 'absolute',
                  left: BTN_CX - BTN_R + 2,
                  top:  BTN_CYS[i] - BTN_R + 2,
                  width:  BTN_R * 2 - 4,
                  height: BTN_R * 2 - 4,
                  borderRadius: '50%',
                  background: isActive ? `${b.glowColor}80` : `rgba(0,0,0,0)`,
                  transform: isActive ? 'scale(1)' : 'scale(1.05)',
                  boxShadow: isActive ? [
                    `0 0 12px 6px ${b.glowColor}D9`,
                    `0 0 30px 12px ${b.glowColor}94`,
                    `0 0 60px 20px ${b.glowColor}62`,
                  ].join(', ') : 'none',
                  cursor: 'pointer',
                  zIndex: 10,
                  transition: 'background 0.15s, box-shadow 0.15s',
                }}
                onPointerDown={e => e.stopPropagation()}
                onClick={() => { setPhotoMode(false); setSelectedBand(b.id); }}
              />
            </div>
          );
        })}

        {/* Photo mode button — 5th button below X-RAY */}
        {(() => {
          const photoColor = '#a0b8a0';
          const photoBtnActive = '#607860';
          const photoGlow = '#9df85c';
          const labelRight = VIEWER_W - (BTN_CX - BTN_R - 6);
          return (
            <div>
              <div style={{
                position: 'absolute',
                right: labelRight + 15,
                width: 90,
                textAlign: 'right',
                top: BTN_CYS[4] - 13,
                zIndex: 10,
                pointerEvents: 'none',
                userSelect: 'none',
              }}>
                <span style={{
                  fontFamily: '"Courier New", Courier, monospace',
                  fontSize: 22, fontWeight: 'bold', letterSpacing: '0.08em',
                  color: photoMode ? photoGlow : 'rgba(255,255,255,0.28)',
                  textShadow: photoMode ? [
                    `0 0 2px ${photoGlow}`,
                    `0 0 8px ${photoGlow}dd`,
                    `0 0 18px ${photoGlow}88`,
                    `0 0 35px ${photoGlow}44`,
                  ].join(', ') : 'none',
                  transition: 'color 0.12s, text-shadow 0.12s',
                  filter: photoMode ? 'brightness(1.3) contrast(1.1)' : 'none',
                  display: 'block',
                }}>
                  CAM
                </span>
              </div>
              <div
                style={{
                  position: 'absolute',
                  left: BTN_CX - BTN_R + 2,
                  top:  BTN_CYS[4] - BTN_R + 2,
                  width:  BTN_R * 2 - 4,
                  height: BTN_R * 2 - 4,
                  borderRadius: '50%',
                  background: photoMode ? `${photoGlow}80` : `rgba(0,0,0,0)`,
                  transform: photoMode ? 'scale(1)' : 'scale(1.05)',
                  boxShadow: photoMode ? [
                    `0 0 12px 6px ${photoGlow}D9`,
                    `0 0 30px 12px ${photoGlow}94`,
                    `0 0 60px 20px ${photoGlow}62`,
                  ].join(', ') : 'none',
                  cursor: 'pointer',
                  zIndex: 10,
                  transition: 'background 0.15s, box-shadow 0.15s',
                }}
                onPointerDown={e => e.stopPropagation()}
                onClick={() => setPhotoMode(p => !p)}
              />
            </div>
          );
        })()}

      </div>
  );
}
