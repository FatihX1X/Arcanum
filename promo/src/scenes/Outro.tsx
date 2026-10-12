import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { lerp, prog, range, sp, springs } from '../anim';
import { PixelIcon } from '../components/Icons';
import { useCopy } from '../components/useCopy';
import { PixelRings } from '../components/PixelCoin';
import { ScrambleText } from '../components/Text';
import { C, F, easeInOut, easeOut } from '../theme';

export function Outro() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = useCopy();

  const spin = range(frame, [0, 54], [0, 1]);
  const angle = (1 - easeOut(spin)) * 900;
  const coinScale = lerp(0.2, 1, sp(frame, fps, 0, springs.heavy));
  const rise = prog(frame, 52, 26, easeInOut);
  const facing = Math.cos((angle * Math.PI) / 180);
  const cta = sp(frame, fps, 112, springs.bouncy);
  const fadeOut = range(frame, [186, 210], [1, 0]);
  const rays = prog(frame, 20, 60);

  return (
    <AbsoluteFill style={{ opacity: fadeOut }}>
      {/* rotating light rays */}
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', transform: `translateY(${rise * -170}px)` }}>
        <div
          style={{
            width: 1600,
            height: 1600,
            background: `repeating-conic-gradient(from ${frame * 0.4}deg, rgb(244 182 43 / 9%) 0deg 6deg, transparent 6deg 18deg)`,
            maskImage: 'radial-gradient(circle, black 0%, transparent 55%)',
            WebkitMaskImage: 'radial-gradient(circle, black 0%, transparent 55%)',
            opacity: rays,
          }}
        />
        <div style={{ position: 'absolute', width: 900, height: 900, background: 'radial-gradient(circle, rgb(244 182 43 / 30%) 0%, transparent 60%)', opacity: rays }} />
      </AbsoluteFill>

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', transform: `translateY(${rise * -170}px) scale(${lerp(1, 0.78, rise)})` }}>
        <div style={{ position: 'relative', width: 340, height: 340 }}>
          <PixelRings start={50} size={340} count={4} gap={6} />
          <div style={{ width: 340, height: 340, transform: `scale(${coinScale}) scaleX(${Math.max(0.04, Math.abs(facing))})`, filter: `brightness(${facing < 0 ? 0.7 : 1})` }}>
            <Img src={staticFile('arcanum-coin.png')} style={{ width: 340, height: 340, imageRendering: 'pixelated' }} />
          </div>
        </div>
      </AbsoluteFill>

      {/* tagline */}
      <div style={{ position: 'absolute', top: 560, width: '100%', display: 'flex', justifyContent: 'center', gap: 30, fontFamily: F.pixel, fontSize: 74, color: C.text, textShadow: '6px 6px 0 rgb(0 0 0 / 45%)' }}>
        {t.outro.lines.map((line, i) => {
          const p = sp(frame, fps, 66 + i * 12, springs.snappy);
          return (
            <span key={i} style={{ display: 'inline-block', opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * 50}px) scale(${lerp(1.3, 1, p)})`, color: i === 2 ? C.accent : undefined }}>
              {line}
            </span>
          );
        })}
      </div>

      {/* CTA */}
      <div style={{ position: 'absolute', top: 730, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 22,
            padding: '24px 44px',
            background: C.accent,
            color: C.canvas,
            fontFamily: F.pixel,
            fontSize: 52,
            transform: `scale(${cta})`,
            boxShadow: `8px 8px 0 rgb(0 0 0 / 55%), 0 0 ${60 + Math.sin(frame / 8) * 20}px rgb(244 182 43 / 45%)`,
          }}
        >
          arcanumchat.xyz
          <PixelIcon name="arrowRight" size={46} color={C.canvas} strokeWidth={2.6} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, fontFamily: F.mono, fontSize: 26, color: C.textMuted, opacity: prog(frame, 126, 16) }}>
          <span>
            <span style={{ color: C.text, fontWeight: 700 }}>X</span> {t.outro.handle}
          </span>
          <span style={{ width: 8, height: 8, background: C.border }} />
          {frame >= 130 ? <ScrambleText text={t.intro.eyebrow} start={130} speed={0.8} seed="outro-eyebrow" style={{ color: C.accent, letterSpacing: '0.2em' }} /> : null}
        </div>
      </div>
    </AbsoluteFill>
  );
}
