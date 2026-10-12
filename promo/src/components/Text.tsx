import type { CSSProperties } from 'react';
import { random, useCurrentFrame } from 'remotion';
import { prog } from '../anim';
import { C } from '../theme';

const GLYPHS = '#%&*+=<>/\\[]{}0123456789ABCDEF';

/**
 * Characters resolve left-to-right out of cycling glyph noise. The real glyph
 * always holds layout so the line never jitters while scrambling.
 */
export function ScrambleText({
  text,
  start,
  speed = 1.6,
  window = 8,
  seed = 'scramble',
  noiseColor = C.accent,
  style,
}: {
  text: string;
  start: number;
  speed?: number;
  window?: number;
  seed?: string;
  noiseColor?: string;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const renderChar = (ch: string, i: number) => {
    const revealAt = start + i * speed + window;
    const visible = frame >= start + i * speed;
    const resolved = frame >= revealAt;
    const glyph = GLYPHS[Math.floor(random(`${seed}-${i}-${Math.floor(frame / 2)}`) * GLYPHS.length)];
    return (
      <span key={i} style={{ position: 'relative', display: 'inline-block' }}>
        <span style={{ opacity: resolved ? 1 : 0 }}>{ch}</span>
        {visible && !resolved ? (
          <span style={{ position: 'absolute', inset: 0, textAlign: 'center', color: noiseColor, opacity: 0.9 }}>{glyph}</span>
        ) : null}
      </span>
    );
  };
  // Words stay unbreakable so wrapping only happens at spaces.
  let index = 0;
  const words = text.split(' ');
  return (
    <span style={style}>
      {words.map((word, w) => {
        const startIndex = index;
        index += word.length + 1;
        return (
          <span key={w}>
            <span style={{ whiteSpace: 'nowrap' }}>{Array.from(word).map((ch, k) => renderChar(ch, startIndex + k))}</span>
            {w < words.length - 1 ? ' ' : null}
          </span>
        );
      })}
    </span>
  );
}

/** Text that morphs from one string to another through glyph noise (e.g. plaintext → ciphertext). */
export function MorphText({
  from,
  to,
  start,
  speed = 0.9,
  window = 10,
  seed = 'morph',
  noiseColor = C.accent,
  toColor,
  style,
}: {
  from: string;
  to: string;
  start: number;
  speed?: number;
  window?: number;
  seed?: string;
  noiseColor?: string;
  toColor?: string;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const len = Math.max(from.length, to.length);
  const chars: { ch: string; color?: string }[] = [];
  for (let i = 0; i < len; i++) {
    const t0 = start + i * speed;
    if (frame < t0) chars.push({ ch: from[i] ?? '' });
    else if (frame < t0 + window) {
      chars.push({ ch: GLYPHS[Math.floor(random(`${seed}-${i}-${Math.floor(frame / 2)}`) * GLYPHS.length)], color: noiseColor });
    } else chars.push({ ch: to[i] ?? '', color: toColor });
  }
  return (
    <span style={style}>
      {chars.map((c, i) => (
        <span key={i} style={{ color: c.color }}>{c.ch}</span>
      ))}
    </span>
  );
}

/** Word-by-word blur/rise reveal. */
export function WordReveal({
  text,
  start,
  stagger = 3,
  dur = 22,
  dist = 28,
  style,
  wordStyle,
  highlight,
}: {
  text: string;
  start: number;
  stagger?: number;
  dur?: number;
  dist?: number;
  style?: CSSProperties;
  wordStyle?: (index: number) => CSSProperties | undefined;
  highlight?: number[];
}) {
  const frame = useCurrentFrame();
  const words = text.split(' ');
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', columnGap: '0.28em', ...style }}>
      {words.map((w, i) => {
        const p = prog(frame, start + i * stagger, dur);
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: p,
              transform: `translateY(${(1 - p) * dist}px)`,
              filter: p < 1 ? `blur(${(1 - p) * 8}px)` : undefined,
              color: highlight?.includes(i) ? C.accent : undefined,
              ...wordStyle?.(i),
            }}
          >
            {w}
          </span>
        );
      })}
    </span>
  );
}

/** Blocky blinking caret. */
export function Caret({ color = C.accent, height = '1em', width = '0.5em', blink = true }: { color?: string; height?: string; width?: string; blink?: boolean }) {
  const frame = useCurrentFrame();
  const on = !blink || Math.floor(frame / 12) % 2 === 0;
  return <span style={{ display: 'inline-block', width, height, background: color, opacity: on ? 1 : 0, verticalAlign: '-0.12em', marginLeft: '0.08em' }} />;
}

export function Typewriter({
  text,
  start,
  cps = 2,
  caret = true,
  caretColor,
  style,
}: {
  text: string;
  start: number;
  /** characters per frame */
  cps?: number;
  caret?: boolean;
  caretColor?: string;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const n = Math.max(0, Math.min(text.length, Math.floor((frame - start) * cps)));
  const typing = n < text.length && frame >= start;
  return (
    <span style={{ whiteSpace: 'pre-wrap', ...style }}>
      {text.slice(0, n)}
      {caret && frame >= start ? <Caret color={caretColor} blink={!typing} /> : null}
    </span>
  );
}

export function CountUp({ to, start, dur = 40, format }: { to: number; start: number; dur?: number; format?: (n: number) => string }) {
  const frame = useCurrentFrame();
  const v = Math.round(to * prog(frame, start, dur));
  return <>{format ? format(v) : String(v)}</>;
}
