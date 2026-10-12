import { Img, random, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CSSProperties } from 'react';
import { prog } from '../anim';
import { C } from '../theme';

const GRID = 25;
const SIZE = 400; // 16px blocks keep every seam on an integer pixel

const BLOCKS = Array.from({ length: GRID * GRID }, (_, i) => {
  const c = i % GRID;
  const r = Math.floor(i / GRID);
  const dx = c - (GRID - 1) / 2;
  const dy = r - (GRID - 1) / 2;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) + (random(`ca${i}`) - 0.5) * 1.4;
  const far = 420 + random(`cf${i}`) * 700;
  return {
    c,
    r,
    delay: dist * 1.25 + random(`cd${i}`) * 8,
    ox: Math.cos(angle) * far,
    oy: Math.sin(angle) * far,
    rot: (random(`cr${i}`) - 0.5) * 180,
  };
});
const MAX_DELAY = Math.max(...BLOCKS.map((b) => b.delay));

const coinMask: CSSProperties = {
  maskImage: `url(${staticFile('arcanum-coin.png')})`,
  WebkitMaskImage: `url(${staticFile('arcanum-coin.png')})`,
  maskSize: '100% 100%',
  WebkitMaskSize: '100% 100%',
};

/** The Arcanum coin assembling itself out of its own pixels, then catching a light sweep. */
export function PixelCoin({ start = 0, sheenAt, size = SIZE }: { start?: number; sheenAt?: number; size?: number }) {
  const frame = useCurrentFrame() - start;
  const { fps } = useVideoConfig();
  const scale = size / SIZE;
  const done = frame > MAX_DELAY + 34;
  const block = SIZE / GRID;
  const sheen = sheenAt === undefined ? 0 : prog(frame + start, sheenAt, 34);

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: SIZE, height: SIZE, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
        {done ? (
          <Img src={staticFile('arcanum-coin.png')} style={{ width: SIZE, height: SIZE, imageRendering: 'pixelated' }} />
        ) : (
          BLOCKS.map((b, i) => {
            const p = spring({ frame: frame - b.delay, fps, config: { damping: 15, stiffness: 120, mass: 0.7 } });
            if (p <= 0.001) return null;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: b.c * block,
                  top: b.r * block,
                  width: block,
                  height: block,
                  backgroundImage: `url(${staticFile('arcanum-coin.png')})`,
                  backgroundSize: `${SIZE}px ${SIZE}px`,
                  backgroundPosition: `-${b.c * block}px -${b.r * block}px`,
                  imageRendering: 'pixelated',
                  opacity: Math.min(1, p * 1.6),
                  transform: `translate(${(1 - p) * b.ox}px, ${(1 - p) * b.oy}px) rotate(${(1 - p) * b.rot}deg) scale(${0.3 + 0.7 * p})`,
                }}
              />
            );
          })
        )}
      </div>
      {sheen > 0 && sheen < 1 ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            ...coinMask,
            background: `linear-gradient(115deg, transparent ${sheen * 160 - 40}%, rgb(255 246 214 / 85%) ${sheen * 160 - 25}%, transparent ${sheen * 160 - 10}%)`,
            mixBlendMode: 'screen',
          }}
        />
      ) : null}
    </div>
  );
}

/** Square "pixel" shockwave rings. */
export function PixelRings({ start, count = 3, gap = 9, size = 400, color = C.accent }: { start: number; count?: number; gap?: number; size?: number; color?: string }) {
  const frame = useCurrentFrame();
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const p = prog(frame, start + i * gap, 50);
        if (p <= 0 || p >= 1) return null;
        const s = Math.round((size * (0.9 + p * 1.6)) / 16) * 16;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: s,
              height: s,
              marginLeft: -s / 2,
              marginTop: -s / 2,
              border: `${Math.max(2, Math.round(8 * (1 - p)))}px solid ${color}`,
              borderRadius: '50%',
              opacity: (1 - p) * 0.6,
              boxShadow: `0 0 40px ${color}55`,
            }}
          />
        );
      })}
    </>
  );
}
