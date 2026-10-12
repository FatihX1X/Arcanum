import { AbsoluteFill, random, useCurrentFrame } from 'remotion';
import { C } from '../theme';
import { easeInOut } from '../theme';
import { Easing, interpolate } from 'remotion';

const COLS = 32;
const ROWS = 18;
const CELL = 60;
const CELLS = Array.from({ length: COLS * ROWS }, (_, i) => {
  const c = i % COLS;
  const r = Math.floor(i / COLS);
  const g = random(`wipe-g-${i}`);
  return {
    c,
    r,
    jitter: random(`wipe-${i}`),
    color: g > 0.94 ? C.accent : g > 0.6 ? C.surface : C.muted,
  };
});

/**
 * Diagonal pixel dissolve centred on `at` (a cut point, in the parent's frames).
 * Squares grow to cover the frame, the scene underneath swaps, then they shrink away.
 */
export function PixelWipe({ at, half = 11, direction = 1 }: { at: number; half?: number; direction?: 1 | -1 }) {
  const frame = useCurrentFrame();
  if (frame < at - half - 2 || frame > at + half + 2) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {CELLS.map((cell, i) => {
        const diag = (direction === 1 ? cell.c : COLS - 1 - cell.c) / COLS * 0.6 + (cell.r / ROWS) * 0.25 + cell.jitter * 0.15;
        const coverStart = at - half + diag * (half * 0.55);
        const coverEnd = coverStart + half * 0.45;
        const uncoverStart = at + diag * (half * 0.55);
        const uncoverEnd = uncoverStart + half * 0.45;
        const s =
          frame < at
            ? interpolate(frame, [coverStart, coverEnd], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeInOut })
            : interpolate(frame, [uncoverStart, uncoverEnd], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.quad) });
        if (s <= 0) return null;
        const size = Math.ceil((CELL + 1) * s / 4) * 4;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: cell.c * CELL + (CELL - size) / 2,
              top: cell.r * CELL + (CELL - size) / 2,
              width: size,
              height: size,
              background: cell.color,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
}
