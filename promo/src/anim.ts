import { interpolate, spring, type SpringConfig } from 'remotion';
import { easeIn, easeOut } from './theme';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** 0→1 over [start, start+dur] with expo-out easing. */
export function prog(frame: number, start: number, dur: number, easing = easeOut) {
  return interpolate(frame, [start, start + dur], [0, 1], { ...clamp, easing });
}

/** 1→0 over [start, start+dur] with expo-in easing; for exits. */
export function exitProg(frame: number, start: number, dur: number) {
  return interpolate(frame, [start, start + dur], [1, 0], { ...clamp, easing: easeIn });
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function range(frame: number, input: number[], output: number[]) {
  return interpolate(frame, input, output, clamp);
}

export const springs = {
  snappy: { damping: 14, stiffness: 180, mass: 0.6 } satisfies Partial<SpringConfig>,
  soft: { damping: 20, stiffness: 90, mass: 1 } satisfies Partial<SpringConfig>,
  bouncy: { damping: 9, stiffness: 140, mass: 0.7 } satisfies Partial<SpringConfig>,
  heavy: { damping: 26, stiffness: 120, mass: 1.4 } satisfies Partial<SpringConfig>,
};

export function sp(frame: number, fps: number, start: number, config: Partial<SpringConfig> = springs.snappy) {
  return spring({ frame: frame - start, fps, config });
}

/** Quantize a value so motion steps like pixel art. */
export function step(value: number, unit: number) {
  return Math.round(value / unit) * unit;
}

/** Blur + rise + fade entrance. */
export function enter(frame: number, start: number, dur = 22, dist = 36) {
  const p = prog(frame, start, dur);
  return {
    opacity: p,
    transform: `translateY(${(1 - p) * dist}px)`,
    filter: p < 1 ? `blur(${(1 - p) * 10}px)` : undefined,
  } as const;
}
