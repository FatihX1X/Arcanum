import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from 'remotion';
import { exitProg, lerp, prog, sp, springs } from '../anim';
import { PixelIcon } from '../components/Icons';
import { useCopy } from '../components/useCopy';
import { CornerTicks, Panel } from '../components/Panel';
import { MorphText, ScrambleText, WordReveal } from '../components/Text';
import { C, F, easeInOut } from '../theme';

function cipherFor(text: string) {
  const hex = '0123456789abcdef';
  return Array.from(text, (ch, i) => (i < 2 ? '0x'[i] : ch === ' ' && i % 3 === 0 ? ' ' : hex[Math.floor(random(`cipher-${i}`) * 16)])).join('');
}

export function Hook() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = useCopy().hook;
  const lift = prog(frame, 60, 26, easeInOut);
  const exit = exitProg(frame, 138, 12);
  const cardIn = sp(frame, fps, 66, springs.soft);
  const locked = frame >= 98;
  const stamp = sp(frame, fps, 104, springs.bouncy);
  const shake = frame >= 104 && frame < 112 ? Math.sin(frame * 3.1) * (112 - frame) * 1.2 : 0;
  const words = t.line1.split(' ');

  return (
    <AbsoluteFill style={{ opacity: exit, transform: `scale(${lerp(1, 1.04, 1 - exit)})` }}>
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          transform: `translateY(${lift * -300}px) scale(${lerp(1, 0.62, lift)})`,
        }}
      >
        <div style={{ display: 'flex', gap: '0.3em', fontFamily: F.pixel, fontSize: 132, color: C.text, lineHeight: 1.05, textShadow: '8px 8px 0 rgb(0 0 0 / 45%)' }}>
          {words.map((w, i) => {
            const p = sp(frame, fps, 4 + i * 7, springs.snappy);
            return (
              <span key={i} style={{ display: 'inline-block', opacity: Math.min(1, p * 2), transform: `scale(${lerp(1.7, 1, p)})`, color: i === words.length - 1 ? C.accent : undefined }}>
                {w}
              </span>
            );
          })}
        </div>
        <div style={{ marginTop: 26, fontFamily: F.sans, fontSize: 54, color: C.textMuted, letterSpacing: '-0.01em' }}>
          <WordReveal text={t.line2} start={30} stagger={4} />
        </div>
      </AbsoluteFill>

      {frame >= 62 ? (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 170 }}>
          <div style={{ position: 'relative', transform: `translateY(${(1 - cardIn) * 140}px) translateX(${shake}px)`, opacity: Math.min(1, cardIn * 1.5) }}>
            <CornerTicks start={76} color={locked ? C.accent : C.danger} />
            <Panel tone={locked ? 'gold' : 'default'} glow={locked} style={{ width: 1240, padding: '34px 44px', display: 'flex', gap: 36, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: F.mono, fontSize: 20, letterSpacing: '0.18em', color: locked ? C.accent : C.danger, marginBottom: 18 }}>
                  {locked ? <ScrambleText key="p" text={t.privateLabel} start={98} speed={0.7} window={6} seed="hook-label" /> : t.publicLabel}
                </div>
                <div style={{ fontFamily: F.mono, fontSize: 38, lineHeight: 1.45, color: C.text, wordBreak: 'break-all', minHeight: 110 }}>
                  <MorphText from={t.plaintext} to={cipherFor(t.plaintext)} start={88} speed={0.55} window={9} toColor={C.accentHover} seed="hook" />
                </div>
              </div>
              <div
                style={{
                  width: 120,
                  height: 120,
                  flexShrink: 0,
                  display: 'grid',
                  placeItems: 'center',
                  background: locked ? C.accentSoft : C.muted,
                  border: `3px solid ${locked ? C.accent : C.border}`,
                  transform: `scale(${locked ? lerp(2.2, 1, stamp) : 1}) rotate(${locked ? lerp(-18, 0, stamp) : 0}deg)`,
                  boxShadow: locked ? `0 0 ${50 * stamp}px rgb(244 182 43 / 45%)` : undefined,
                }}
              >
                <PixelIcon name={locked ? 'lockKeyhole' : 'message'} size={64} color={locked ? C.accent : C.textMuted} />
              </div>
            </Panel>
          </div>
          <div style={{ marginTop: 56, height: 70, fontFamily: F.pixel, fontSize: 60, color: C.accent, textShadow: '6px 6px 0 rgb(0 0 0 / 45%)' }}>
            {frame >= 112 ? <ScrambleText text={t.caption} start={112} speed={1} window={7} seed="hook-cap" noiseColor={C.text} /> : null}
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
}
