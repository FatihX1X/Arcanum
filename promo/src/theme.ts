import { Easing } from 'remotion';

/** Mirrors the pixel theme tokens in app/globals.css. */
export const C = {
  canvas: '#080d16',
  surface: '#101827',
  elevated: '#182235',
  muted: '#0c1320',
  border: '#334158',
  borderStrong: '#50627c',
  text: '#f5f0dd',
  text2: '#b6c0cf',
  textMuted: '#95a3b8',
  accent: '#f4b62b',
  accentHover: '#ffd76a',
  accentSoft: '#30240f',
  success: '#63d9a0',
  successSoft: '#122c24',
  info: '#58b6f5',
  infoSoft: '#102b43',
  danger: '#ff8f9b',
} as const;

export const F = {
  pixel: "'Pixelify Sans', ui-sans-serif, sans-serif",
  sans: "'Inter', ui-sans-serif, system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
} as const;

export const W = 1920;
export const H = 1080;

/** Expo-out: fast start, long silky settle. */
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);
export const easeIn = Easing.bezier(0.7, 0, 0.84, 0);

export const hardShadow = (size = 6, alpha = 0.45) =>
  `inset 0 1px 0 rgb(255 215 106 / 10%), ${size}px ${size}px 0 rgb(0 0 0 / ${alpha})`;
