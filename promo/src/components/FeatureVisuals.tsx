import type { ComponentType } from 'react';
import { random, useCurrentFrame, useVideoConfig } from 'remotion';
import { lerp, prog, range, sp, springs, step } from '../anim';
import type { FeatureId } from '../copy';
import { C, F, easeInOut } from '../theme';
import { IconTile, PixelIcon } from './Icons';
import { Identicon } from './Identicon';
import { useCopy } from './useCopy';
import { Chip, Panel, Shot } from './Panel';
import { MorphText } from './Text';

export const VW = 900;
export const VH = 700;

/* ------------------------------------------------------------------ groups */

function GroupsVisual() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const v = useCopy().visuals;
  const cx = VW / 2;
  const cy = VH / 2 - 20;
  const REMOVED = 4;
  const removeP = prog(frame, 42, 18);
  const spin = step(range(frame, [48, 64], [0, 360]) , 15);
  const flash = range(frame, [52, 56, 70], [0, 1, 0]);
  const keyIn = sp(frame, fps, 4, springs.bouncy);

  const members = Array.from({ length: 6 }, (_, i) => {
    const a = (-90 + i * 60) * (Math.PI / 180);
    return { x: cx + Math.cos(a) * 310, y: cy + Math.sin(a) * 240, seed: `member-${i}` };
  });

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <svg width={VW} height={VH} style={{ position: 'absolute', inset: 0 }}>
        {members.map((m, i) => {
          const replaced = i === REMOVED;
          const draw = replaced ? (frame < 42 ? prog(frame, 10 + i * 3, 14) : prog(frame, 62, 12)) : prog(frame, 10 + i * 3, 14);
          if (replaced && frame >= 42 && frame < 62) {
            const retract = 1 - prog(frame, 42, 10);
            return <line key={i} x1={cx} y1={cy} x2={lerp(cx, m.x, retract)} y2={lerp(cy, m.y, retract)} stroke={C.danger} strokeWidth={4} />;
          }
          return (
            <line key={i} x1={cx} y1={cy} x2={lerp(cx, m.x, draw)} y2={lerp(cy, m.y, draw)} stroke={frame >= 56 ? C.accentHover : C.accent} strokeWidth={4} opacity={0.85} />
          );
        })}
        {/* re-wrapped key packets */}
        {frame >= 58
          ? members.map((m, i) => {
              const p = prog(frame, 58 + i * 2, 16);
              if (p <= 0 || p >= 1) return null;
              return <rect key={i} x={lerp(cx, m.x, p) - 7} y={lerp(cy, m.y, p) - 7} width={14} height={14} fill={C.accentHover} />;
            })
          : null}
      </svg>

      {members.map((m, i) => {
        const p = sp(frame, fps, 8 + i * 3, springs.snappy);
        const replaced = i === REMOVED;
        const gone = replaced && frame >= 42;
        const fresh = replaced && frame >= 60;
        const np = sp(frame, fps, 60, springs.bouncy);
        const dx = (m.x - cx) * 0.5 * removeP;
        const dy = (m.y - cy) * 0.5 * removeP;
        return (
          <div key={i}>
            {(!gone || frame < 60) && (
              <div
                style={{
                  position: 'absolute',
                  left: m.x - 40 + (gone ? dx : 0),
                  top: m.y - 40 + (gone ? dy : 0),
                  transform: `scale(${p})`,
                  opacity: gone ? 1 - removeP : 1,
                  textAlign: 'center',
                }}
              >
                <Identicon seed={m.seed} size={80} border={gone ? C.danger : C.borderStrong} />
              </div>
            )}
            {fresh ? (
              <div style={{ position: 'absolute', left: m.x - 40, top: m.y - 40, transform: `scale(${np})` }}>
                <Identicon seed="member-new" size={80} border={C.success} />
                <div style={{ position: 'absolute', right: -14, top: -14, width: 30, height: 30, background: C.success, display: 'grid', placeItems: 'center' }}>
                  <PixelIcon name="check" size={20} color={C.canvas} strokeWidth={3} />
                </div>
              </div>
            ) : null}
          </div>
        );
      })}

      <div style={{ position: 'absolute', left: cx - 75, top: cy - 75, width: 150, height: 150, transform: `scale(${keyIn}) rotate(${spin}deg)` }}>
        <div style={{ position: 'absolute', inset: -30, background: `radial-gradient(circle, rgb(255 215 106 / ${0.25 + flash * 0.5}), transparent 70%)` }} />
        <IconTile name="key" size={150} style={{ background: C.accent, color: C.canvas, borderColor: C.accentHover, boxShadow: '8px 8px 0 rgb(0 0 0 / 45%)' }} />
      </div>
      <div style={{ position: 'absolute', left: 0, width: VW, top: cy + 100, textAlign: 'center', fontFamily: F.mono, fontSize: 24, letterSpacing: '0.2em', color: C.accent, opacity: keyIn }}>
        {v.epoch} <MorphText from="03" to="04" start={54} speed={1} window={8} toColor={C.accentHover} seed="epoch" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ agents */

function AgentsVisual() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const v = useCopy().visuals;
  const panel = sp(frame, fps, 2, springs.soft);
  const ask = sp(frame, fps, 12, springs.snappy);
  const pay = sp(frame, fps, 22, springs.bouncy);
  const reply = sp(frame, fps, 52, springs.snappy);
  const coinP = prog(frame, 24, 16, easeInOut);
  const typing = frame >= 34 && frame < 52;
  const blink = Math.floor(frame / 3) % 14 === 0;

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
      <div style={{ transform: `translateY(${(1 - panel) * 60}px)`, opacity: Math.min(1, panel * 1.5) }}>
        <Panel style={{ width: 780, padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '22px 26px', borderBottom: `2px solid ${C.border}` }}>
            <div style={{ position: 'relative' }}>
              <IconTile name="bot" size={64} />
              {blink ? <div style={{ position: 'absolute', left: 21, top: 30, width: 22, height: 4, background: C.accentSoft }} /> : null}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: F.pixel, fontSize: 30, color: C.text }}>{v.agentName}</div>
              <div style={{ fontFamily: F.mono, fontSize: 16, color: C.textMuted, marginTop: 4 }}>0x2AB2...8108</div>
            </div>
            <Chip tone="success" style={{ fontSize: 18, padding: '6px 14px' }}>
              <PixelIcon name="checkSquare" size={18} color={C.success} />
              {v.registered}
            </Chip>
          </div>
          <div style={{ padding: 26, display: 'flex', flexDirection: 'column', gap: 18, minHeight: 360 }}>
            <div style={{ alignSelf: 'flex-end', maxWidth: '80%', opacity: ask, transform: `translateY(${(1 - ask) * 24}px)` }}>
              <div style={{ padding: '16px 20px', background: C.accentSoft, border: '2px solid #6e5626', fontFamily: F.sans, fontSize: 24, color: C.text, lineHeight: 1.35 }}>{v.agentAsk}</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                <Chip tone="gold" style={{ fontSize: 19, padding: '6px 14px', transform: `scale(${pay})` }}>
                  <PixelIcon name="coins" size={18} color={C.accent} />+ 1.00 USDC
                </Chip>
              </div>
            </div>
            {typing ? (
              <div style={{ alignSelf: 'flex-start', display: 'flex', gap: 8, padding: '18px 22px', background: C.elevated, border: `2px solid ${C.border}` }}>
                {[0, 1, 2].map((k) => (
                  <div key={k} style={{ width: 12, height: 12, background: C.text2, transform: `translateY(${Math.sin((frame - k * 4) / 3) * 5}px)` }} />
                ))}
              </div>
            ) : null}
            {frame >= 52 ? (
              <div style={{ alignSelf: 'flex-start', maxWidth: '84%', opacity: reply, transform: `translateY(${(1 - reply) * 24}px)` }}>
                <div style={{ padding: '16px 20px', background: C.elevated, border: `2px solid ${C.border}`, fontFamily: F.sans, fontSize: 24, color: C.text, lineHeight: 1.35 }}>{v.agentReply}</div>
                <div style={{ marginTop: 10 }}>
                  <Chip tone="success" style={{ fontSize: 17, padding: '5px 12px' }}>
                    <PixelIcon name="lock" size={16} color={C.success} />
                    {v.encrypted}
                  </Chip>
                </div>
              </div>
            ) : null}
          </div>
        </Panel>
      </div>
      {coinP > 0 && coinP < 1 ? (
        <div
          style={{
            position: 'absolute',
            left: lerp(700, 96, coinP),
            top: lerp(330, 92, coinP) - Math.sin(coinP * Math.PI) * 120,
            width: 26,
            height: 26,
            background: C.accent,
            border: `3px solid ${C.accentHover}`,
            boxShadow: `0 0 24px ${C.accent}`,
          }}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------- batch */

const BATCH_ORDER = Array.from({ length: 100 }, (_, i) => i).sort((a, b) => {
  const ka = (a % 10) + random(`bo${a}`) * 4;
  const kb = (b % 10) + random(`bo${b}`) * 4;
  return ka - kb;
});
const BATCH_RANK = BATCH_ORDER.reduce<Record<number, number>>((acc, cell, rank) => ({ ...acc, [cell]: rank }), {});

function BatchVisual() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const v = useCopy().visuals;
  const src = sp(frame, fps, 2, springs.snappy);
  const fill = range(frame, [16, 62], [0, 100]);
  const lit = Math.floor(fill);
  const done = sp(frame, fps, 64, springs.bouncy);
  const GX = 400;
  const GY = 120;
  const CELL = 36;
  const GAP = 8;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', left: 20, top: 250, transform: `scale(${src})`, transformOrigin: 'left center' }}>
        <Panel tone="gold" glow style={{ width: 250, padding: 24 }}>
          <IconTile name="wallet" size={64} />
          <div style={{ marginTop: 18, fontFamily: F.sans, fontSize: 18, color: C.textMuted }}>{v.batchSource}</div>
          <div style={{ fontFamily: F.mono, fontSize: 32, color: C.text, marginTop: 4 }}>
            {(lit * 25).toLocaleString('en-US')}
            <span style={{ color: C.accent, fontSize: 20 }}> USDC</span>
          </div>
        </Panel>
      </div>

      {/* streaming packets */}
      {frame >= 14 && frame < 64
        ? Array.from({ length: 10 }, (_, k) => {
            const p = ((frame - 14 + k * 5) % 14) / 14;
            const row = Math.floor(random(`bp${k}-${Math.floor((frame - 14 + k * 5) / 14)}`) * 10);
            const y0 = 360;
            const y1 = GY + row * (CELL + GAP) + CELL / 2;
            return <div key={k} style={{ position: 'absolute', left: lerp(280, GX - 10, p) - 6, top: lerp(y0, y1, p) - 6, width: 12, height: 12, background: C.accentHover, opacity: 1 - p * 0.4 }} />;
          })
        : null}

      {Array.from({ length: 100 }, (_, i) => {
        const r = Math.floor(i / 10);
        const c = i % 10;
        const rank = BATCH_RANK[i];
        const on = rank < lit;
        const pop = on ? Math.min(1, (fill - rank) / 3) : 0;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: GX + c * (CELL + GAP),
              top: GY + r * (CELL + GAP),
              width: CELL,
              height: CELL,
              background: on ? C.accent : C.muted,
              border: `2px solid ${on ? C.accentHover : C.border}`,
              transform: `scale(${on ? lerp(1.4, 1, pop) : 1})`,
              boxShadow: on && pop < 1 ? `0 0 18px ${C.accent}` : undefined,
              opacity: prog(frame, 2 + (r + c) * 0.6, 10),
            }}
          />
        );
      })}

      <div style={{ position: 'absolute', left: GX, top: GY + 10 * (CELL + GAP) + 18, display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <span style={{ fontFamily: F.pixel, fontSize: 64, color: C.text }}>{lit}</span>
        <span style={{ fontFamily: F.mono, fontSize: 24, color: C.textMuted }}>/ 100 {v.recipients}</span>
      </div>
      {frame >= 64 ? (
        <div style={{ position: 'absolute', left: GX + 200, top: GY - 70, transform: `scale(${done})`, transformOrigin: 'left center' }}>
          <Chip tone="success" style={{ fontSize: 22 }}>
            <PixelIcon name="checkSquare" size={22} color={C.success} />
            {v.oneTx}
          </Chip>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ bridge */

const CHAINS = ['Ethereum', 'Base', 'Arbitrum', 'Optimism', 'Avalanche', 'Polygon', 'Unichain', 'Linea', 'Sonic', 'Sei', 'World Chain', 'Monad'];

function quad(t: number, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number) {
  const u = 1 - t;
  return [u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1];
}

function BridgeVisual() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cx = VW / 2;
  const cy = 310;
  const hub = sp(frame, fps, 2, springs.bouncy);
  const swapSpin = step(range(frame, [52, 64], [0, 180]), 30);
  const pill = sp(frame, fps, 40, springs.snappy);

  const nodes = CHAINS.map((name, i) => {
    const a = (-90 + (i * 360) / CHAINS.length) * (Math.PI / 180);
    const x = cx + Math.cos(a) * 370;
    const y = cy + Math.sin(a) * 250;
    const ctrlX = (cx + x) / 2 + Math.sin(a) * 70;
    const ctrlY = (cy + y) / 2 - Math.cos(a) * 70;
    return { name, x, y, ctrlX, ctrlY };
  });

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <svg width={VW} height={VH} style={{ position: 'absolute', inset: 0 }}>
        {nodes.map((n, i) => {
          const d = prog(frame, 8 + i * 2.5, 16);
          return (
            <path
              key={i}
              d={`M${cx} ${cy} Q${n.ctrlX} ${n.ctrlY} ${n.x} ${n.y}`}
              stroke={C.borderStrong}
              strokeWidth={3}
              fill="none"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - d}
            />
          );
        })}
      </svg>
      {/* USDC packets riding the routes */}
      {frame >= 24
        ? [0, 2, 4, 7, 9].map((i, k) => {
            const n = nodes[i];
            const t = (((frame - 24 + k * 7) % 26) / 26);
            const out = k % 2 === 0;
            const [x, y] = quad(out ? t : 1 - t, cx, cy, n.ctrlX, n.ctrlY, n.x, n.y);
            return (
              <div key={k} style={{ position: 'absolute', left: x - 9, top: y - 9, width: 18, height: 18, background: C.info, border: '2px solid #b9e2ff', boxShadow: `0 0 16px ${C.info}` }} />
            );
          })
        : null}
      {nodes.map((n, i) => {
        const p = sp(frame, fps, 12 + i * 2.5, springs.snappy);
        return (
          <div
            key={n.name}
            style={{
              position: 'absolute',
              left: n.x,
              top: n.y,
              transform: `translate(-50%, -50%) scale(${p})`,
              padding: '8px 14px',
              background: C.surface,
              border: `2px solid ${C.border}`,
              fontFamily: F.sans,
              fontSize: 20,
              fontWeight: 600,
              color: C.text2,
              whiteSpace: 'nowrap',
              boxShadow: '4px 4px 0 rgb(0 0 0 / 45%)',
            }}
          >
            {n.name}
          </div>
        );
      })}
      <div
        style={{
          position: 'absolute',
          left: cx - 85,
          top: cy - 85,
          width: 170,
          height: 170,
          transform: `scale(${hub})`,
          display: 'grid',
          placeItems: 'center',
          background: C.accentSoft,
          border: `4px solid ${C.accent}`,
          boxShadow: `8px 8px 0 rgb(0 0 0 / 45%), 0 0 70px rgb(244 182 43 / 35%)`,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: F.pixel, fontSize: 56, color: C.accent, lineHeight: 1 }}>ARC</div>
          <div style={{ fontFamily: F.mono, fontSize: 16, color: C.text2, marginTop: 8 }}>CCTP V2</div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, width: VW, top: 630, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 18, opacity: pill, transform: `translateY(${(1 - pill) * 30}px)` }}>
        <Chip style={{ fontSize: 26, color: C.info, borderColor: '#25557a', background: C.infoSoft }}>USDC</Chip>
        <div style={{ transform: `rotate(${swapSpin}deg)`, display: 'grid', placeItems: 'center' }}>
          <PixelIcon name="swap" size={40} color={C.accent} />
        </div>
        <Chip style={{ fontSize: 26, color: C.success, borderColor: '#2b5c49', background: C.successSoft }}>EURC</Chip>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- earn */

function EarnVisual() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const v = useCopy().visuals;
  const inP = sp(frame, fps, 2, springs.soft);
  const pan = range(frame, [0, 90], [0, 1]);
  const s = 1.32;
  const tx = -282 * s;
  const ty = -lerp(240, 470, easeInOut(pan)) * s;
  const box = prog(frame, 14, 16);
  const c1 = sp(frame, fps, 22, springs.bouncy);
  const c2 = sp(frame, fps, 34, springs.bouncy);
  const apy = range(frame, [24, 54], [0, 4.29]);
  const dep = range(frame, [36, 66], [0, 89.7]);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', left: 30, top: 40, width: 840, height: 610, overflow: 'hidden', border: `2px solid ${C.borderStrong}`, boxShadow: '12px 12px 0 rgb(0 0 0 / 40%), 0 50px 100px rgb(0 0 0 / 50%)', opacity: inP, transform: `scale(${lerp(0.92, 1, inP)})` }}>
        <div style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${tx}px, ${ty}px) scale(${s})`, transformOrigin: '0 0' }}>
          <Shot src="shots/arcanum-earn.webp" style={{ border: 'none', boxShadow: 'none' }}>
            {/* highlight Galaxy USDC row */}
            <div style={{ position: 'absolute', left: 297, top: 302, width: 638 * box, height: 120, border: `3px solid ${C.accent}`, borderRightWidth: box < 1 ? 0 : 3, boxShadow: box >= 1 ? `0 0 30px rgb(244 182 43 / 35%)` : undefined }} />
            <div style={{ position: 'absolute', left: 297, top: 856, width: 638, height: 54, border: `3px solid ${C.success}`, opacity: prog(frame, 50, 10) }} />
          </Shot>
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 70%, rgb(8 13 22 / 85%))' }} />
      </div>

      <div style={{ position: 'absolute', right: -10, top: 70, transform: `scale(${c1})`, transformOrigin: 'right top' }}>
        <Panel tone="gold" glow style={{ padding: '22px 28px', minWidth: 290 }}>
          <div style={{ fontFamily: F.sans, fontSize: 20, color: C.textMuted }}>{v.maxApy}</div>
          <div style={{ fontFamily: F.pixel, fontSize: 72, color: C.accent, lineHeight: 1.05 }}>{apy.toFixed(2)}%</div>
          <div style={{ fontFamily: F.mono, fontSize: 15, color: C.text2 }}>Bitwise Premium RWA USDC</div>
        </Panel>
      </div>
      <div style={{ position: 'absolute', left: -20, bottom: 40, transform: `scale(${c2})`, transformOrigin: 'left bottom' }}>
        <Panel style={{ padding: '20px 26px', minWidth: 300 }}>
          <div style={{ fontFamily: F.sans, fontSize: 20, color: C.textMuted }}>{v.deposits}</div>
          <div style={{ fontFamily: F.pixel, fontSize: 60, color: C.text, lineHeight: 1.1 }}>
            {dep.toFixed(1)}M <span style={{ fontSize: 28, color: C.accent }}>USDC</span>
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ escrow */

function EscrowVisual() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const v = useCopy().visuals;
  const gig = sp(frame, fps, 2, springs.snappy);
  const vault = sp(frame, fps, 14, springs.snappy);
  const locked = frame >= 40;
  const lockPop = sp(frame, fps, 40, springs.bouncy);
  const bar = range(frame, [42, 74], [0, 1]);
  const released = frame >= 74;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', left: 60, top: 20, width: 780, opacity: gig, transform: `translateY(${(1 - gig) * -40}px)` }}>
        <Panel style={{ padding: '24px 28px', display: 'flex', gap: 22, alignItems: 'center' }}>
          <IconTile name="briefcase" size={72} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: F.pixel, fontSize: 32, color: C.text }}>{v.gigTitle}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <Chip style={{ fontSize: 17, padding: '5px 12px' }}>
                <PixelIcon name="clock" size={16} color={C.text2} />
                {v.gigChips[0]}
              </Chip>
              <Chip tone="success" style={{ fontSize: 17, padding: '5px 12px' }}>
                <PixelIcon name="lock" size={16} color={C.success} />
                {v.gigChips[1]}
              </Chip>
            </div>
          </div>
          <div style={{ fontFamily: F.pixel, fontSize: 44, color: C.accent }}>250</div>
        </Panel>
      </div>

      {/* vault */}
      <div style={{ position: 'absolute', left: 280, top: 200, width: 340, height: 230, opacity: vault, transform: `scale(${lerp(0.8, 1, vault)})` }}>
        {/* falling coins */}
        {Array.from({ length: 8 }, (_, k) => {
          const p = prog(frame, 18 + k * 2.5, 12);
          if (released || p <= 0) return null;
          const x = 60 + (k % 4) * 60 + (Math.floor(k / 4) % 2) * 30;
          return <div key={k} style={{ position: 'absolute', left: x, top: lerp(-120, 150, p), width: 30, height: 30, background: C.accent, border: `3px solid ${C.accentHover}`, opacity: p < 1 ? 1 : 0.95 }} />;
        })}
        <Panel tone={locked ? 'gold' : 'default'} glow={locked} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
          <div style={{ transform: `scale(${locked ? lerp(1.8, 1, lockPop) : 1})` }}>
            <PixelIcon name={released ? 'checkSquare' : 'lockKeyhole'} size={52} color={released ? C.success : locked ? C.accent : C.textMuted} />
          </div>
          <div>
            <div style={{ fontFamily: F.pixel, fontSize: 40, color: C.text, lineHeight: 1 }}>250 USDC</div>
            <div style={{ fontFamily: F.sans, fontSize: 18, color: C.textMuted, marginTop: 6 }}>{v.locked}</div>
          </div>
        </Panel>
      </div>

      {/* timeline */}
      <div style={{ position: 'absolute', left: 90, top: 500, width: 720 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 18, height: 6, background: C.border }} />
        <div style={{ position: 'absolute', left: 0, top: 18, height: 6, width: `${bar * 100}%`, background: released ? C.success : C.accent, boxShadow: `0 0 16px ${C.accent}` }} />
        {v.escrowSteps.map((label, i) => {
          const at = i / 2;
          const reached = bar >= at - 0.001 && frame >= 40;
          const pop = sp(frame, fps, 42 + i * 16, springs.bouncy);
          return (
            <div key={label} style={{ position: 'absolute', left: `${at * 100}%`, top: 0, transform: 'translateX(-50%)', textAlign: 'center', opacity: prog(frame, 26 + i * 4, 10) }}>
              <div style={{ width: 42, height: 42, margin: '0 auto', display: 'grid', placeItems: 'center', background: reached ? (i === 2 ? C.success : C.accent) : C.muted, border: `3px solid ${reached ? C.accentHover : C.border}`, transform: `scale(${reached ? lerp(1.3, 1, pop) : 1})` }}>
                {reached ? <PixelIcon name="check" size={24} color={C.canvas} strokeWidth={3} /> : null}
              </div>
              <div style={{ marginTop: 12, fontFamily: F.sans, fontSize: 22, fontWeight: 600, color: reached ? C.text : C.textMuted, whiteSpace: 'nowrap' }}>{label}</div>
            </div>
          );
        })}
      </div>

      <div style={{ position: 'absolute', right: 40, top: 610, opacity: prog(frame, 56, 12) }}>
        <Chip style={{ fontSize: 19 }}>
          <PixelIcon name="gavel" size={20} color={C.accent} />
          {v.arbitration}
        </Chip>
      </div>

      {/* release burst */}
      {released
        ? Array.from({ length: 10 }, (_, k) => {
            const p = prog(frame, 74 + (k % 3), 14);
            const a = (k / 10) * Math.PI * 2;
            return <div key={k} style={{ position: 'absolute', left: 450 + Math.cos(a) * 180 * p - 10, top: 360 + Math.sin(a) * 120 * p - 10, width: 20, height: 20, background: C.success, opacity: 1 - p }} />;
          })
        : null}
    </div>
  );
}

const VISUALS: Record<FeatureId, ComponentType> = {
  groups: GroupsVisual,
  agents: AgentsVisual,
  batch: BatchVisual,
  bridge: BridgeVisual,
  earn: EarnVisual,
  escrow: EscrowVisual,
};

export const SHOTS: Record<FeatureId, string | null> = {
  groups: 'shots/encrypted-groups.webp',
  agents: 'shots/agent-messages.webp',
  batch: 'shots/usdc-batch.webp',
  bridge: 'shots/bridge.webp',
  earn: null,
  escrow: 'shots/arcanumescrow.webp',
};

export function FeatureVisual({ id }: { id: FeatureId }) {
  const Visual = VISUALS[id];
  return <Visual />;
}
