// ═══════════════════════════════════════════════════════════════════════════
//  Glow building blocks — shared by the source files in sources/.
// ═══════════════════════════════════════════════════════════════════════════
//  A glow is a stack of blurred, brightened copies of a source's image, faded in
//  one by one as the intensity from physics.js rises past each layer's threshold.
//  Sources whose glow follows the common pattern use the helpers here; sources
//  with something special (the bulb's filament, the gel lamp's dots, the Sun…)
//  draw their own in their file, using the same palettes.
//
//  Every helper takes a `ctx` built by EmissionShape (detector) or BenchItem (bench):
//    item, s (the source record), imgH  — what's being drawn and its height in px
//    band, intensity                    — detector only: the selected band and the light in it
//    mx, my                             — detector only: glow image offset (tuning + the item's own)
//    vis, visBand                       — bench only: naked-eye glow amounts (see BenchItem)

import React from 'react';
import { clamp, thermalScale, visCurve, spectrumCss } from './physics.js';

// Shared tuning, dialed in with the old dev sliders and baked here.
export const GLOW = {
  blurScale: 0.08,   // multiplies every palette blur
  power:     0.5,    // thermalScale exponent: intensity → glow strength
  scale:     6.0,    // thermalScale multiplier
};

// ── Thermal palette — white on black (infrared view) ──────────
export const THERMAL = [
  { t: 0.05, blur: 80, opacity: 0.38, imgFilter: 'brightness(0.3)'  },
  { t: 0.45, blur: 60, opacity: 0.55, imgFilter: 'brightness(0.6)'  },
  { t: 0.95, blur: 22, opacity: 0.80, imgFilter: 'brightness(1.2)'  },
  { t: 2.10, blur: 38, opacity: 0.92, imgFilter: 'brightness(2.5)'  },
  { t: 4.20, blur: 62, opacity: 0.98, imgFilter: 'brightness(6.0)'  },
  { t: 5.40, blur: 80, opacity: 1.00, imgFilter: 'brightness(14)'   },
];

// ── Visible palette — multi-layer screen-blend like THERMAL ──
// visScale = thermalScale(intensity) same formula, thresholds tuned to
// visible band intensities (bulb peaks ~4.2, heater ~2.1 at full power)
export const VIS_LAYERS = [
  { t: 0.20, blur: 80, opacity: 0.40, bright: 0.5  },  // faint wide halo
  { t: 0.60, blur: 55, opacity: 0.55, bright: 1.2  },  // soft glow
  { t: 1.20, blur: 28, opacity: 0.75, bright: 2.8  },  // mid glow
  { t: 2.00, blur: 40, opacity: 0.88, bright: 6.0  },  // bright bloom
  { t: 3.00, blur: 62, opacity: 0.95, bright: 12.0 },  // wide white bloom
  { t: 4.00, blur: 80, opacity: 1.00, bright: 30.0 },  // white core
];

// How far a glow strength has climbed past one palette layer's threshold (0–1).
export const fadeIn = (strength, layer) => clamp((strength - layer.t) / 0.8, 0, 1);

// Glow strength for the common infrared / visible stacks.
export const glowStrength = intensity => thermalScale(intensity, GLOW.power, GLOW.scale);

// Brightness, blur and opacity for the UV and X-ray views, which are more sensitive.
export function cameraSignal(intensity, bandId) {
  const ic = visCurve(bandId === 'UV' ? intensity * 2 : bandId === 'XRay' ? intensity * 4 : intensity);
  return {
    sharp: clamp(1 + ic * 4, 1, 5),
    bloom: clamp(1 + ic * 5, 1, 6),
    blurD: (2  + ic * 8)  * GLOW.blurScale,
    blurB: (10 + ic * 40) * GLOW.blurScale,
    op:    clamp(ic, 0, 1),
  };
}

// The positioned box every detector glow is drawn in (same place and size as the item).
export function Frame({ item, s, imgH, children }) {
  return (
    <div className="absolute pointer-events-none"
      style={{ left: item.x, top: item.y, width: s.w, height: imgH }}>
      {children}
    </div>
  );
}

// A solid colour shown through an image used as a luminance mask, then blurred.
// Used where screen-blending would wash out over a white device image.
export function MaskedColor({ src, top, left, w, h, blur, color, opacity, zIndex }) {
  return (
    <div style={{
      position: 'absolute', top, left, width: w, height: h,
      filter: `blur(${blur}px)`, opacity,
      mixBlendMode: 'normal', pointerEvents: 'none', zIndex,
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundColor: color,
        maskImage: `url(${src})`,
        WebkitMaskImage: `url(${src})`,
        maskMode: 'luminance',
        maskSize: '100% 100%',
        WebkitMaskSize: '100% 100%',
      }} />
    </div>
  );
}

// ═══ Detector glows (the camera screen) ═════════════════════════════════════

// Infrared: THERMAL stack of `src`. `fade` (0–1) scales every layer; `under`
// (strength → JSX) draws something beneath the stack.
export function irGlow({ item, intensity, s, imgH, mx, my }, src, { fade = 1, under } = {}) {
  if (fade <= 0) return null;
  const therm = glowStrength(intensity);
  return (
    <Frame item={item} s={s} imgH={imgH}>
      {under && under(therm)}
      {THERMAL.map((layer, i) => {
        const f = fadeIn(therm, layer) * fade;
        if (f <= 0.01) return null;
        return (
          <img key={i} src={src}
            style={{
              position: 'absolute',
              top: my, left: mx,
              width: s.w, height: imgH,
              filter: `${layer.imgFilter} blur(${layer.blur * GLOW.blurScale}px)`,
              opacity: f * layer.opacity,
              mixBlendMode: 'screen',
            }}
            draggable={false} />
        );
      })}
    </Frame>
  );
}

// Visible: VIS_LAYERS stack of the source's glow mask.
export function visibleGlow({ item, intensity, s, imgH, mx, my }) {
  const visScale = glowStrength(intensity);
  return (
    <Frame item={item} s={s} imgH={imgH}>
      {VIS_LAYERS.map((layer, i) => {
        const f = fadeIn(visScale, layer);
        if (f <= 0.01) return null;
        return (
          <img key={i} src={s.maskSrc}
            style={{
              position: 'absolute',
              top: my, left: mx,
              width: s.w, height: imgH,
              filter: `brightness(${layer.bright}) blur(${layer.blur * GLOW.blurScale}px)`,
              opacity: f * layer.opacity,
              mixBlendMode: 'screen',
            }}
            draggable={false} />
        );
      })}
    </Frame>
  );
}

// UV / X-ray: VIS_LAYERS stack of the glow mask, tinted with the band's false colour.
export function cameraGlow({ item, band, intensity, s, imgH, mx, my }) {
  const { op } = cameraSignal(intensity, band.id);
  return (
    <Frame item={item} s={s} imgH={imgH}>
      {VIS_LAYERS.map((layer, i) => {
        const f = fadeIn(op, layer);
        if (f <= 0.01) return null;
        return (
          <img key={i} src={s.maskSrc} draggable={false}
            style={{
              position: 'absolute', top: my, left: mx, width: s.w, height: imgH,
              filter: `${band.colorFilter} brightness(${layer.bright}) blur(${layer.blur * GLOW.blurScale}px)`,
              opacity: f * layer.opacity,
              mixBlendMode: 'screen',
            }} />
        );
      })}
    </Frame>
  );
}

// ═══ Bench glows (what you see with the naked eye) ══════════════════════════

// Bloom + sharp core of the glow mask, coloured by the spectrum (or s.benchColor).
export function benchGlow({ item, s, imgH, vis, visBand }) {
  if (vis.intensity <= 0.005) return null;
  const t = s.tuning;
  const color = s.benchColor ?? spectrumCss(item, visBand);
  const layer = (blur, bright, opacity) => (
    <div style={{
      position: 'absolute',
      top: t.benchY + (item.glowY ?? 0),
      left: t.benchX + (item.glowX ?? 0),
      width: s.w, height: imgH,
      filter: `blur(${blur}px)`,
      opacity, mixBlendMode: 'screen',
      isolation: 'isolate', pointerEvents: 'none',
      backgroundColor: 'black',
    }}>
      <img src={s.maskSrc} draggable={false}
        style={{ position: 'absolute', inset: 0, width: s.w, height: imgH, filter: `brightness(${bright})` }} />
      <div style={{ position: 'absolute', inset: 0, backgroundColor: color, mixBlendMode: 'multiply',
        filter: `hue-rotate(${t.visHue}deg) saturate(${t.visSat}) brightness(${t.visBright})` }} />
    </div>
  );
  return (
    <>
      {/* Bloom — wide soft layer */}
      {layer(vis.blurB, vis.bloom, vis.op * 0.7)}
      {/* Sharp — tight core */}
      {layer(vis.blurD, vis.sharp, vis.op)}
    </>
  );
}
