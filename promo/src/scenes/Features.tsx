import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion';
import { exitProg, lerp, prog } from '../anim';
import { FeatureVisual, SHOTS, VH, VW } from '../components/FeatureVisuals';
import { IconTile, type IconName } from '../components/Icons';
import { useCopy } from '../components/useCopy';
import { Chip, Shot } from '../components/Panel';
import { ScrambleText, WordReveal } from '../components/Text';
import type { FeatureId } from '../copy';
import timeline from '../timeline.json';
import { C, F } from '../theme';

const D = timeline.featureDuration;
const OVERLAP = 8;

const ICON: Record<FeatureId, IconName> = {
  groups: 'users',
  agents: 'bot',
  batch: 'coins',
  bridge: 'route',
  earn: 'earn',
  escrow: 'shieldCheck',
};

function Slide({ index }: { index: number }) {
  const frame = useCurrentFrame();
  const f = useCopy().features[index];
  const enterP = prog(frame, 0, 14);
  // Sequences overlap by OVERLAP frames: this slide exits while the next one enters.
  const exit = exitProg(frame, D - 2, OVERLAP + 2);
  const shot = SHOTS[f.id];
  const shotP = prog(frame, 0, 30);
  const num = String(index + 1).padStart(2, '0');

  return (
    <AbsoluteFill
      style={{
        opacity: Math.min(enterP, exit),
        transform: `translateX(${(1 - enterP) * 80 - (1 - exit) * 80}px)`,
        filter: exit < 1 ? `blur(${(1 - exit) * 8}px)` : undefined,
      }}
    >
      {/* giant outline index */}
      <div
        style={{
          position: 'absolute',
          left: 60,
          top: 40,
          fontFamily: F.pixel,
          fontSize: 560,
          lineHeight: 1,
          color: C.elevated,
          opacity: 0.55 * shotP,
          transform: `translateY(${(1 - shotP) * 60 + frame * -0.4}px)`,
        }}
      >
        {num}
      </div>

      {/* text column */}
      <div style={{ position: 'absolute', left: 140, top: 0, height: '100%', width: 760, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <IconTile name={ICON[f.id]} size={92} draw={prog(frame, 2, 26)} style={{ transform: `scale(${lerp(0.6, 1, prog(frame, 0, 16))})` }} />
          <div style={{ fontFamily: F.mono, fontSize: 24, letterSpacing: '0.2em', color: C.accent }}>
            <ScrambleText text={`${num} / 06`} start={2} speed={1.2} seed={`fnum-${index}`} />
          </div>
        </div>
        <div style={{ marginTop: 34, fontFamily: F.pixel, fontSize: 86, lineHeight: 1.04, color: C.text, textShadow: '6px 6px 0 rgb(0 0 0 / 45%)' }}>
          <ScrambleText text={f.title} start={4} speed={1.1} window={7} seed={`ftitle-${index}`} style={{ whiteSpace: 'normal' }} />
        </div>
        <div style={{ marginTop: 26, fontFamily: F.sans, fontSize: 36, lineHeight: 1.35, color: C.text2, maxWidth: 700 }}>
          <WordReveal text={f.desc} start={12} stagger={2} />
        </div>
        <div style={{ marginTop: 40, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {f.chips.map((chip, i) => {
            const p = prog(frame, 24 + i * 4, 16);
            return (
              <Chip key={chip} tone={i === 0 ? 'gold' : 'default'} style={{ opacity: p, transform: `translateY(${(1 - p) * 20}px)` }}>
                {chip}
              </Chip>
            );
          })}
        </div>
      </div>

      {/* real UI behind the motion graphic */}
      {shot ? (
        <div
          style={{
            position: 'absolute',
            left: 1010,
            top: 180,
            width: 1600,
            height: 900,
            transformOrigin: '0 0',
            transform: `perspective(2400px) translateX(${(1 - shotP) * 200 + frame * -0.6}px) rotateY(-20deg) rotateX(5deg) scale(0.6)`,
            opacity: 0.32 * shotP,
            filter: 'blur(1.5px) saturate(0.8)',
          }}
        >
          <Shot src={shot} />
        </div>
      ) : null}

      <div style={{ position: 'absolute', left: 940, top: 190, width: VW, height: VH }}>
        <FeatureVisual id={f.id} />
      </div>
    </AbsoluteFill>
  );
}

function Progress() {
  const frame = useCurrentFrame();
  const total = D * 6;
  const appear = prog(frame, 4, 16) * exitProg(frame, total - 12, 12);
  return (
    <div style={{ position: 'absolute', left: 140, bottom: 72, display: 'flex', gap: 10, opacity: appear }}>
      {Array.from({ length: 6 }, (_, i) => {
        const p = Math.min(1, Math.max(0, (frame - i * D) / D));
        return (
          <div key={i} style={{ width: 76, height: 8, background: C.border }}>
            <div style={{ width: `${p * 100}%`, height: '100%', background: C.accent }} />
          </div>
        );
      })}
    </div>
  );
}

export function Features() {
  return (
    <AbsoluteFill>
      {Array.from({ length: 6 }, (_, i) => (
        <Sequence key={i} from={i * D} durationInFrames={i < 5 ? D + OVERLAP : D} layout="none">
          <Slide index={i} />
        </Sequence>
      ))}
      <Progress />
    </AbsoluteFill>
  );
}
