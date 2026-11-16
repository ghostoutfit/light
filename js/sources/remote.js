// TV remote — its infrared LED blinks a signal. Only the infrared view sees it.
import { irGlow } from '../glow.js';

export default {
  label: 'TV Remote',
  group: 'specialized',
  src:       'images/Remote.png',
  sourceSrc: 'images/RemoteGlow.png',   // the IR LED at the tip
  w: 200, natW: 1389, natH: 1132,

  spectrum: { peakMin: 20, peakMax: 400, widthMin: 1, widthMax: 50,
              peakDefault: 40, widthDefault: 1.5, skewDefault: 1.0 },
  temp: { max: 22 },                    // °C — a remote barely warms at all

  graphScale: 0.6,                      // shorter curve on its emission graph (display only)

  detector: {
    IR: ctx => irGlow(ctx, ctx.s.sourceSrc),
  },
};
