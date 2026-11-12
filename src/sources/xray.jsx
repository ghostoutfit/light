// X-ray source — an X-ray tube. Only the X-ray view sees it: the source itself, plus
// a weaker reflection off its reflector.
import { Frame, cameraSignal } from '../glow.jsx';

const W = 200;

function xray({ item, band, intensity, s, imgH }) {
  const { sharp, bloom, blurD, blurB, op } = cameraSignal(intensity, band.id);
  const img = (src, filter, opacity) => (
    <img src={src} draggable={false}
      style={{ position: 'absolute', top: 0, left: 0, width: s.w, height: imgH,
        filter, opacity, mixBlendMode: 'screen' }} />
  );
  return (
    <Frame item={item} s={s} imgH={imgH}>
      {/* XRaySource — full intensity (bloom + sharp) */}
      {img(s.sourceSrc,    `${band.colorFilter} brightness(${bloom}) blur(${blurB}px)`, op * 0.7)}
      {img(s.sourceSrc,    `${band.colorFilter} brightness(${sharp}) blur(${blurD}px)`, op)}
      {/* XRayReflector — 20% of source contribution */}
      {img(s.reflectorSrc, `${band.colorFilter} brightness(${bloom}) blur(${blurB}px)`, op * 0.7 * 0.20)}
      {img(s.reflectorSrc, `${band.colorFilter} brightness(${sharp}) blur(${blurD}px)`, op * 0.20)}
    </Frame>
  );
}

export default {
  label: 'X-Ray Source',
  group: 'specialized',
  src:          'images/XRayEmitter.png',
  sourceSrc:    'images/XRaySource.png',
  reflectorSrc: 'images/XRayReflector.png',
  w: W, natW: 878, natH: 1022,

  spectrum: { peakMin: 5000, peakMax: 20000, widthMin: 200, widthMax: 8000,
              peakDefault: 9700, widthDefault: 700, skewDefault: 1.0 },
  temp: { max: 45 },                    // °C at full power — X-ray tube housing

  layout: { graphWidth: Math.round(W * 1.4) },

  detector: { XRay: xray },
};
