import type { CSSProperties, ReactNode } from 'react';
import { Img, staticFile, useCurrentFrame } from 'remotion';
import { prog } from '../anim';
import { C, F, hardShadow } from '../theme';

/** App-style surface: square corners, hairline border, hard offset shadow, top-left tick. */
export function Panel({ children, style, glow = false, tone = 'default' }: { children?: ReactNode; style?: CSSProperties; glow?: boolean; tone?: 'default' | 'gold' }) {
  return (
    <div
      style={{
        position: 'relative',
        background: C.surface,
        border: `2px solid ${tone === 'gold' ? C.accent : C.border}`,
        boxShadow: `${hardShadow(8)}${glow ? `, 0 0 60px rgb(244 182 43 / 22%)` : ''}`,
        ...style,
      }}
    >
      <span style={{ position: 'absolute', left: 4, top: 4, width: 6, height: 2, background: C.borderStrong }} />
      <span style={{ position: 'absolute', left: 4, top: 4, width: 2, height: 6, background: C.borderStrong }} />
      {children}
    </div>
  );
}

/** HUD brackets that draw in at each corner. */
export function CornerTicks({ start, size = 22, color = C.accent, inset = -14, thickness = 3 }: { start: number; size?: number; color?: string; inset?: number; thickness?: number }) {
  const frame = useCurrentFrame();
  const p = prog(frame, start, 18);
  const len = size * p;
  const corners: CSSProperties[] = [
    { left: inset, top: inset },
    { right: inset, top: inset, transform: 'scaleX(-1)' },
    { left: inset, bottom: inset, transform: 'scaleY(-1)' },
    { right: inset, bottom: inset, transform: 'scale(-1,-1)' },
  ];
  return (
    <>
      {corners.map((pos, i) => (
        <span key={i} style={{ position: 'absolute', width: size, height: size, opacity: p, ...pos }}>
          <span style={{ position: 'absolute', left: 0, top: 0, width: len, height: thickness, background: color }} />
          <span style={{ position: 'absolute', left: 0, top: 0, width: thickness, height: len, background: color }} />
        </span>
      ))}
    </>
  );
}

export function Eyebrow({ children, style, color = C.accent }: { children: ReactNode; style?: CSSProperties; color?: string }) {
  return (
    <div style={{ fontFamily: F.mono, fontSize: 22, letterSpacing: '0.24em', color, textTransform: 'none', ...style }}>{children}</div>
  );
}

export function Chip({ children, style, tone = 'default' }: { children: ReactNode; style?: CSSProperties; tone?: 'default' | 'gold' | 'success' }) {
  const tones = {
    default: { bg: C.muted, border: C.border, color: C.text2 },
    gold: { bg: C.accentSoft, border: '#6b5221', color: C.accent },
    success: { bg: C.successSoft, border: '#2b5c49', color: C.success },
  }[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 18px',
        background: tones.bg,
        border: `2px solid ${tones.border}`,
        color: tones.color,
        fontFamily: F.sans,
        fontSize: 22,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/**
 * A real app screenshot (1600×900 logical, captured at 2×) as a floating device-less card.
 * Children are positioned in screenshot coordinates so overlays move with the 3D transform.
 */
export function Shot({
  src,
  width = 1600,
  height = 900,
  style,
  children,
  sweepAt,
}: {
  src: string;
  width?: number;
  height?: number;
  style?: CSSProperties;
  children?: ReactNode;
  sweepAt?: number;
}) {
  const frame = useCurrentFrame();
  const sweep = sweepAt === undefined ? 0 : prog(frame, sweepAt, 40);
  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        overflow: 'hidden',
        border: `2px solid ${C.borderStrong}`,
        background: C.canvas,
        boxShadow: `0 60px 120px rgb(0 0 0 / 55%), 0 0 0 1px rgb(0 0 0 / 60%), 12px 12px 0 rgb(0 0 0 / 40%)`,
        ...style,
      }}
    >
      <Img src={staticFile(src)} style={{ position: 'absolute', left: 0, top: 0, width: 1600, height: 900 }} />
      {children}
      {sweep > 0 && sweep < 1 ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(105deg, transparent ${sweep * 170 - 50}%, rgb(255 236 180 / 13%) ${sweep * 170 - 30}%, transparent ${sweep * 170 - 10}%)`,
          }}
        />
      ) : null}
    </div>
  );
}
