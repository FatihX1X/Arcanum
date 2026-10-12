import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { exitProg, lerp, prog, range } from '../anim';
import { useCopy } from '../components/useCopy';
import { PixelCoin, PixelRings } from '../components/PixelCoin';
import { ScrambleText, WordReveal } from '../components/Text';
import { C, F, easeInOut } from '../theme';

export function Intro() {
  const frame = useCurrentFrame();
  const t = useCopy().intro;

  const glow = prog(frame, 10, 70);
  const move = prog(frame, 88, 34, easeInOut);
  const coinSize = 400;
  const coinScale = lerp(1, 0.56, move);
  const coinX = lerp(0, -440, move);
  const exit = exitProg(frame, 160, 20);
  const push = range(frame, [0, 180], [1, 1.05]);
  const bar = prog(frame, 112, 30);

  return (
    <AbsoluteFill style={{ transform: `scale(${push})`, opacity: exit, filter: exit < 1 ? `blur(${(1 - exit) * 14}px)` : undefined }}>
      {/* back glow */}
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            width: 1100,
            height: 1100,
            transform: `translateX(${coinX}px) scale(${0.4 + glow * 0.6 * lerp(1, 0.75, move)})`,
            background: 'radial-gradient(circle, rgb(244 182 43 / 32%) 0%, rgb(244 182 43 / 8%) 35%, transparent 65%)',
            opacity: glow,
          }}
        />
      </AbsoluteFill>

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: coinSize, height: coinSize, transform: `translateX(${coinX}px) scale(${coinScale})` }}>
          <PixelRings start={52} size={coinSize} />
          <PixelCoin start={4} sheenAt={70} size={coinSize} />
        </div>
      </AbsoluteFill>

      {/* wordmark block */}
      <div style={{ position: 'absolute', left: 690, top: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ height: 34, marginBottom: 6 }}>
          {frame >= 104 ? (
            <ScrambleText text={t.eyebrow} start={104} speed={0.9} seed="intro-eyebrow" style={{ fontFamily: F.mono, fontSize: 24, letterSpacing: '0.26em', color: C.accent }} />
          ) : null}
        </div>
        <div style={{ fontFamily: F.pixel, fontSize: 196, lineHeight: 1, color: C.text, letterSpacing: '-0.01em', textShadow: '8px 8px 0 rgb(0 0 0 / 45%)' }}>
          {frame >= 96 ? <ScrambleText text="Arcanum" start={96} speed={2.4} window={9} seed="intro-word" /> : null}
        </div>
        <div style={{ height: 8, marginTop: 18, width: 640 * bar, background: `linear-gradient(90deg, ${C.accent}, ${C.accentHover} 60%, transparent)` }} />
        <div style={{ marginTop: 26, fontFamily: F.sans, fontSize: 40, fontWeight: 400, color: C.text2, letterSpacing: '-0.01em' }}>
          <WordReveal text={t.tagline} start={122} stagger={3} />
        </div>
      </div>
    </AbsoluteFill>
  );
}
