import { Composition } from 'remotion';
import './fonts';
import { Promo, type PromoProps } from './Promo';
import timeline from './timeline.json';
import { H, W } from './theme';

export function Root() {
  const shared = { component: Promo, durationInFrames: timeline.total, fps: timeline.fps, width: W, height: H } as const;
  return <Composition id="ArcanumPromo" {...shared} defaultProps={{ withAudio: true } satisfies PromoProps} />;
}
