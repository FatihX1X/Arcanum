import type { CSSProperties } from 'react';

/** Path data copied from components/PixelIcons.tsx so the film uses the app's exact glyphs. */
const square = 'M6 3H18V5H21V19H18V21H6V19H3V5H6Z';
const check = 'M7 12V15H10V17H12V14H15V11H18V8';
const shield = 'M4 4H8V2H16V4H20V14H18V18H15V20H12V22H9V20H6V18H4Z';
const lock = 'M5 11H19V21H5ZM8 11V5H10V3H14V5H16V11M12 15V17';
const wallet = 'M3 6V3H18V6M3 6H21V21H3ZM21 11H15V16H21M17 13H18';
const key = 'M3 3H11V11H3ZM11 11H14V14H17V17H21V21H17V17M6 6H8V8H6Z';

export const ICONS = {
  wallet: [wallet],
  lock: [lock],
  lockKeyhole: [lock, 'M11 14H13V16H11Z'],
  key: [key],
  layers: ['M12 2H15V4H18V6H21V8H18V10H15V12H9V10H6V8H3V6H6V4H9V2Z', 'M3 12H6V14H9V16H15V14H18V12H21M3 18H6V20H9V22H15V20H18V18H21'],
  message: ['M5 3H19V5H21V17H19V19H9V21H3V5H5ZM7 9H8M11 9H12M15 9H16'],
  users: ['M7 3H13V9H7ZM3 21V15H5V13H15V15H17V21M17 3H21V9H17M20 13H22V21'],
  bot: ['M12 2V5M6 5H18V7H20V19H4V7H6ZM2 10V15M22 10V15M8 10V12M16 10V12M9 16H15'],
  coins: ['M5 3H13V5H16V13H13V16H5V13H2V5H5ZM8 6V12M16 9H19V11H22V19H19V22H11V19H8'],
  swap: ['M3 7H21M17 3V5H19V9H17V11M21 17H3M7 13V15H5V19H7V21'],
  route: ['M3 3H8V8H3ZM16 16H21V21H16ZM8 5H19V11H5V18H16'],
  earn: [square, 'M16 7H9V12H15V17H8M12 5V19'],
  shieldCheck: [shield, 'M8 11V14H11V16H13V13H16V10'],
  send: ['M3 3H6V5H10V7H14V9H18V11H21V13H18V15H14V17H10V19H6V21H3V15H7V9H3ZM7 12H21'],
  check: [check],
  checkSquare: [square, check],
  gavel: ['M5 3H14V7H18V16H14V12H5ZM10 12V15H7V18H4M11 21H22'],
  briefcase: ['M3 7H21V21H3ZM8 7V3H16V7M3 12H21M10 11V15H14V11'],
  clock: [square, 'M12 6V12H17'],
  file: ['M5 2H15V5H18V8H20V22H5ZM15 2V8H20', 'M8 11H13V16H8ZM13 16H16V19'],
  arrowRight: ['M3 12H21M15 6H17V8H19V10H21V14H19V16H17V18H15'],
} as const;

export type IconName = keyof typeof ICONS;

export function PixelIcon({
  name,
  size = 24,
  color = 'currentColor',
  strokeWidth = 2,
  style,
  draw,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: CSSProperties;
  /** 0..1 stroke-draw progress; omit for a fully drawn icon. */
  draw?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="square" strokeLinejoin="miter" style={style}>
      {ICONS[name].map((d, i) => (
        <path
          key={i}
          d={d}
          pathLength={draw === undefined ? undefined : 1}
          strokeDasharray={draw === undefined ? undefined : 1}
          strokeDashoffset={draw === undefined ? undefined : 1 - draw}
        />
      ))}
    </svg>
  );
}

/** Gold icon tile used by the app's feature cards. */
export function IconTile({ name, size = 72, draw, style }: { name: IconName; size?: number; draw?: number; style?: CSSProperties }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'grid',
        placeItems: 'center',
        background: '#30240f',
        border: '2px solid #6b5221',
        color: '#f4b62b',
        ...style,
      }}
    >
      <PixelIcon name={name} size={size * 0.5} draw={draw} />
    </div>
  );
}
