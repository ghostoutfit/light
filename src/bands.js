// ── Camera bands ──────────────────────────────────────────────
// The detector's four views, lowest frequency first. Their Hz ranges come from
// the dividers in App (see bandRanges there).
//   short / title  — the button label and the screen heading
//   divColor       — the band's colour on graphs and its active button label
//   glowColor      — the active button's glow
//   titleColor     — the screen heading's colour
//   colorFilter    — CSS filter that tints a glow image into the band's false colour
//   label, freq, btnActive — not used by the current UI
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
    btnActive: '#1e4a7a',
    glowColor: '#75e0ff',
    colorFilter: 'sepia(1) saturate(5) hue-rotate(195deg) brightness(1.4)',
  },
];
