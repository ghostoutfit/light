// ═══════════════════════════════════════════════════════════════════════════
//  Source catalogue — every light/heat source, one file each.
// ═══════════════════════════════════════════════════════════════════════════
//  To change how a source looks or behaves, open its file; everything about it is
//  there. To add a source: copy the closest existing file, give it new images in
//  images/, and add it to SOURCES below. Order here = order in the parts panel.
//
//  A source record has:
//    label, group                 — parts-panel name and box ('hot', 'specialized', 'secret')
//    src, w, natW, natH           — bench image, its display width (px) and natural size
//    maskSrc, outsideSrc, …       — extra images its glows use
//    spectrum                     — peak/width (Hz) slider ranges and a new item's starting
//                                   peak, width and skew
//    power   { max, peakAt, fixed } — power slider range; peakAt(t) moves the peak as
//                                   power t (0–1) changes; `fixed` = always that power, no slider
//    temp    { max, curve }       — °C at full power for the TEMP readout (curve: exponent, default √)
//    tuning                       — glow image offsets (px) and naked-eye glow look
//    layout                       — where its control panel and dev graph sit on the bench
//    detector { IR, Visible, UV, XRay } — draws its glow in that detector band (missing = invisible)
//    bench, benchBehind           — draws its naked-eye glow over / under the bench image
//  Optional: benchColor, graphScale, inView, itemDefaults, devGlowOffsets (see the files).

import radiator from './radiator.js';
import range    from './range.js';
import bulb     from './bulb.js';
import gel      from './gel.js';
import led      from './led.js';
import remote   from './remote.js';
import xray     from './xray.js';
import sun      from './sun.js';

// Defaults for anything a source file leaves out.
function complete(s) {
  return {
    graphScale: 1,
    devGlowOffsets: true,
    ...s,
    power:  { max: 500, ...s.power },
    tuning: { maskX: 0, maskY: 0, benchX: 0, benchY: 0,
              visOpacity: 1, visBlur: 1, visHue: 0, visSat: 1, visBright: 1, ...s.tuning },
    layout: { panelTop: -6, panel: { left: 0, width: s.w }, devPanel: null,
              graphWidth: s.w, graphGap: 8, grabTrim: 0, ...s.layout },
    detector: s.detector ?? {},
  };
}

export const SOURCES = Object.fromEntries(
  Object.entries({ radiator, range, bulb, gel, led, remote, xray, sun })
    .map(([type, s]) => [type, complete(s)]));

// Height of a source's bench image (px), from its width and natural aspect ratio.
export const imgHeight = s => s.w * (s.natH / s.natW);

let uid = Date.now(); // unique ids for placed sources

// A freshly placed source at bench position (x, y).
export function newItem(type, x, y) {
  const s = SOURCES[type];
  return {
    id: uid++, type, x, y,
    amplitude: s.power.fixed ?? 0,
    skew:    s.spectrum.skewDefault,
    peak:    s.spectrum.peakDefault,
    widthHz: s.spectrum.widthDefault,
    glowX: 0, glowY: 0,
    ...(s.itemDefaults ? s.itemDefaults() : {}),
  };
}

// Surface temperature (°C) for the detector's TEMP readout: room temperature (22 °C)
// at zero power, rising to temp.max at full power.
export function itemTemp(item) {
  const s = SOURCES[item.type];
  if (!s.temp) return null;
  if (s.power.fixed != null) return s.temp.max;
  return Math.round(22 + (s.temp.max - 22) * Math.pow(item.amplitude / s.power.max, s.temp.curve ?? 0.5));
}
