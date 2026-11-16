// ── Camera bands ──────────────────────────────────────────────
// The detector's four views, lowest frequency first. Their Hz ranges come from
// DIVIDERS (BAND_RANGES, at the bottom).
//   short / title  — the button label and the screen heading
//   divColor       — the band's colour on graphs and its active button label
//                    (labelColor, if set, overrides it for that label)
//   glowColor      — the active button's glow
//   titleColor     — the screen heading's colour
//   colorFilter    — CSS filter that tints a glow image into the band's false colour
//   label, freq, btnActive — not used by the current UI
import { hzToPos, FREQ_MIN, FREQ_MAX } from './physics.js';

export const BANDS = [
  {
    id: 'IR',      label: 'Infrared',    freq: 200,
    short: 'IR',    title: 'INFRARED LIGHT',    titleColor: '#ff6622',
    divColor: '#c04020',
    btnActive: '#b83010',
    glowColor: '#ff5321',
    colorFilter: 'sepia(1) saturate(8) hue-rotate(-15deg)',
  },
  {
    id: 'Visible', label: 'Visible',     freq: 800,
    short: 'VIS',   title: 'VISIBLE LIGHT',     titleColor: '#d4c060',
    divColor: '#a09050',
    btnActive: '#706840',
    glowColor: '#e7c32f',
    colorFilter: 'sepia(0.15) saturate(1.4) brightness(1.2)',
  },
  {
    id: 'UV',      label: 'Ultraviolet', freq: 3200,
    short: 'UV',    title: 'ULTRAVIOLET LIGHT', titleColor: '#aa22ff',
    divColor: '#8030cc',
    btnActive: '#6b1faa',
    glowColor: '#d822f0',
    colorFilter: 'sepia(1) saturate(8) hue-rotate(262deg)',
  },
  {
    id: 'XRay',    label: 'X-Ray',       freq: 12000,
    short: 'X-RAY', title: 'X-RAY LIGHT',       titleColor: '#44aaff',
    divColor: '#2060a0',
    labelColor: '#3670aa',   // active button label: a touch lighter than divColor for contrast
    btnActive: '#1e4a7a',
    glowColor: '#75e0ff',
    colorFilter: 'sepia(1) saturate(5) hue-rotate(195deg) brightness(1.4)',
  },
];

// ── Band ranges ───────────────────────────────────────────────
// Where one band ends and the next begins, in Hz (log scale): IR | Visible | UV | X-Ray.
export const DIVIDERS = [400, 800, 5000];

// Each band with its Hz range: lo / hi, freq = the geometric mean (the midpoint on
// the log scale), and pct = its width (%) on a log-scale bar such as the graph's.
export const BAND_RANGES = BANDS.map((b, i) => {
  const lo = i === 0 ? FREQ_MIN : DIVIDERS[i - 1];
  const hi = i === BANDS.length - 1 ? FREQ_MAX : DIVIDERS[i];
  return {
    ...b, lo, hi,
    freq: Math.round(Math.sqrt(lo * hi)),
    pct:  (hzToPos(hi) - hzToPos(lo)) * 100,
  };
});
