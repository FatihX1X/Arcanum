import type { ComponentType } from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { Background, Finish } from './components/Background';
import { PixelWipe } from './components/PixelWipe';
import { AppReveal } from './scenes/AppReveal';
import { Features } from './scenes/Features';
import { Hook } from './scenes/Hook';
import { Intro } from './scenes/Intro';
import { Mainnet } from './scenes/Mainnet';
import { Outro } from './scenes/Outro';
import { Pipeline } from './scenes/Pipeline';
import timeline from './timeline.json';

const SCENES: Record<string, ComponentType> = {
  intro: Intro,
  hook: Hook,
  pipeline: Pipeline,
  app: AppReveal,
  features: Features,
  mainnet: Mainnet,
  outro: Outro,
};

export type PromoProps = { withAudio: boolean };

export function Promo({ withAudio }: PromoProps) {
  return (
      <AbsoluteFill>
        <Background />
        {timeline.scenes.map(({ id, from, duration }) => {
          const Scene = SCENES[id];
          return (
            <Sequence key={id} from={from} durationInFrames={duration} name={id}>
              <Scene />
            </Sequence>
          );
        })}
        {timeline.scenes.slice(1).map(({ id, from }, i) => (
          <PixelWipe key={id} at={from} direction={i % 2 === 0 ? 1 : -1} />
        ))}
        <Finish />
        {withAudio ? <Audio src={staticFile('soundtrack.wav')} /> : null}
      </AbsoluteFill>
  );
}
