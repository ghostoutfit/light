// ── Emission shape ────────────────────────────────────────────
// One source's glow as seen through the detector in the selected band. The
// drawing itself lives with each source (sources/*.jsx → detector[band.id]);
// a source with no entry for a band is invisible in it.
import { SOURCES, imgHeight } from '../sources/index.js';

export default function EmissionShape({ item, band, intensity }) {
  if (intensity < 0.005) return null;
  const s = SOURCES[item.type];
  const draw = s.detector[band.id];
  if (!draw) return null;
  return draw({
    item, band, intensity, s,
    imgH: imgHeight(s),
    mx: s.tuning.maskX + (item.glowX ?? 0),
    my: s.tuning.maskY + (item.glowY ?? 0),
  });
}
