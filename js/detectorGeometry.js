// ── Detector geometry ─────────────────────────────────────────
// Where the screen and buttons sit on the detector artwork (images/viewer.png,
// 1369 × 1149 px), and which bench items its screen can see. Positions are in px
// relative to the detector's top-left corner.
import { SOURCES, imgHeight } from './sources/index.js';

export const VIEWER_H = 630;
export const VIEWER_W = Math.round(VIEWER_H * 1369 / 1149); // ≈ 751
const VS = VIEWER_H / 1149; // scale factor based on height
export const SCREEN_L = 71;
export const SCREEN_T = 71;
export const SCREEN_W = Math.round(783 * VS) + 191;
export const SCREEN_H = 475;
export const BENCH_TOP = 30; // bench marginTop in px
// 4 circular band buttons + CAM — positions fine-tuned to the panel image
export const BTN_CX  = Math.round(882 * VS) + 203;
export const BTN_R   = Math.round(28  * VS);
export const BTN_CYS = [
  223,
  271,
  322,
  372,
  423,
];

// The detector screen's rectangle in bench coordinates.
function screenRect(viewerPos) {
  const left = viewerPos.x + SCREEN_L;
  const top  = viewerPos.y + SCREEN_T - BENCH_TOP;
  return { left, top, right: left + SCREEN_W, bottom: top + SCREEN_H };
}

// Does any part of the item show on the screen?
export function overlapsScreen(item, viewerPos) {
  const s = SOURCES[item.type];
  const ih = imgHeight(s);
  const sl = viewerPos.x + SCREEN_L;
  const st = viewerPos.y + SCREEN_T - BENCH_TOP;
  return (
    Math.min(item.x + s.w, sl + SCREEN_W) > Math.max(item.x, sl) &&
    Math.min(item.y + ih, st + SCREEN_H) > Math.max(item.y, st)
  );
}

// Is the item properly in view (for the graph and TEMP readouts)? At least half of it
// must be on screen — or, for a source bigger than the screen (inView: 'screen'), it
// must fill a third of the screen. Returns the overlap area in px², or 0.
export function viewOverlap(item, viewerPos) {
  const scr = screenRect(viewerPos);
  const s = SOURCES[item.type];
  const imgH = imgHeight(s);
  const ix1 = Math.max(item.x, scr.left);
  const ix2 = Math.min(item.x + s.w, scr.right);
  const iy1 = Math.max(item.y, scr.top);
  const iy2 = Math.min(item.y + imgH, scr.bottom);
  if (ix2 <= ix1 || iy2 <= iy1) return 0;
  const intersection = (ix2 - ix1) * (iy2 - iy1);
  const passes = s.inView === 'screen'
    ? intersection / (SCREEN_W * SCREEN_H) >= 1 / 3
    : intersection / (s.w * imgH) >= 0.5;
  return passes ? intersection : 0;
}
