import { AbsoluteFill, random, useCurrentFrame } from 'remotion';
import { C, H, W } from '../theme';

const DUST = Array.from({ length: 46 }, (_, i) => ({
  x: random(`dx${i}`) * W,
  y: random(`dy${i}`) * H,
  size: [2, 3, 4, 6][Math.floor(random(`ds${i}`) * 4)],
  speed: 0.15 + random(`dv${i}`) * 0.55,
  phase: random(`dp${i}`) * Math.PI * 2,
  gold: random(`dc${i}`) > 0.35,
}));

/** Persistent atmosphere: drifting glows, pixel grid, floating pixel dust, scanlines, grain, vignette. */
export function Background() {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const gx = 50 + Math.sin(t * 0.21) * 18;
  const gy = 40 + Math.cos(t * 0.17) * 14;
  const bx = 30 + Math.cos(t * 0.13) * 20;
  const by = 70 + Math.sin(t * 0.19) * 12;

  return (
    <AbsoluteFill style={{ background: C.canvas, overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(900px 640px at ${gx}% ${gy}%, rgb(244 182 43 / 11%), transparent 70%),
            radial-gradient(1000px 700px at ${bx}% ${by}%, rgb(88 182 245 / 8%), transparent 70%),
            radial-gradient(1400px 900px at 50% 120%, rgb(24 34 53 / 90%), transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${C.border} 2px, transparent 2px), linear-gradient(90deg, ${C.border} 2px, transparent 2px)`,
          backgroundSize: '64px 64px',
          backgroundPosition: `${(frame * 0.35) % 64}px ${(frame * 0.2) % 64}px`,
          opacity: 0.14,
          maskImage: 'radial-gradient(ellipse 70% 65% at 50% 50%, black 10%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 65% at 50% 50%, black 10%, transparent 75%)',
        }}
      />
      {DUST.map((d, i) => {
        const y = (((d.y - frame * d.speed * 2) % (H + 40)) + H + 40) % (H + 40) - 20;
        const x = d.x + Math.sin(t * 0.6 + d.phase) * 18;
        const tw = 0.25 + 0.75 * Math.abs(Math.sin(t * 1.3 + d.phase));
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: Math.round(x / 2) * 2,
              top: Math.round(y / 2) * 2,
              width: d.size,
              height: d.size,
              background: d.gold ? C.accentHover : C.info,
              opacity: tw * (d.gold ? 0.55 : 0.35),
              boxShadow: d.size > 3 ? `0 0 ${d.size * 3}px ${d.gold ? C.accent : C.info}` : undefined,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
}

/** Film finish on top of everything. */
export function Finish() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, rgb(0 0 0 / 22%) 0px, rgb(0 0 0 / 22%) 1px, transparent 1px, transparent 4px)',
          opacity: 0.28,
          mixBlendMode: 'multiply',
        }}
      />
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0, opacity: 0.07, mixBlendMode: 'overlay' }}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={frame % 12} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 85% 80% at 50% 50%, transparent 55%, rgb(2 4 9 / 72%) 100%)' }} />
    </AbsoluteFill>
  );
}
