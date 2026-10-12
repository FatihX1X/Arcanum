import { random } from 'remotion';

const PALETTE = ['#f4b62b', '#58b6f5', '#63d9a0', '#ff8f9b', '#b6c0cf', '#ffd76a'];

/** 5×5 mirrored pixel avatar, deterministic per seed. */
export function Identicon({ seed, size = 64, border = '#50627c' }: { seed: string; size?: number; border?: string }) {
  const color = PALETTE[Math.floor(random(`${seed}-c`) * PALETTE.length)];
  const cells: [number, number][] = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 3; c++) {
      if (random(`${seed}-${r}-${c}`) > 0.5) {
        cells.push([r, c]);
        if (c < 2) cells.push([r, 4 - c]);
      }
    }
  }
  return (
    <svg width={size} height={size} viewBox="-1 -1 7 7" shapeRendering="crispEdges" style={{ background: '#0c1320', outline: `2px solid ${border}` }}>
      {cells.map(([r, c], i) => (
        <rect key={i} x={c} y={r} width={1} height={1} fill={color} />
      ))}
    </svg>
  );
}
