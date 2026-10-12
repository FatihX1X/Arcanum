import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { exitProg, lerp, prog, range, sp, springs } from '../anim';
import { IconTile, PixelIcon, type IconName } from '../components/Icons';
import { useCopy } from '../components/useCopy';
import { Eyebrow, Panel } from '../components/Panel';
import { MorphText, ScrambleText, WordReveal } from '../components/Text';
import { C, F, easeInOut } from '../theme';

const XS = [300, 740, 1180, 1620];
const NODE_Y = 680;
const RAIL_Y = 476;
const ICONS: IconName[] = ['wallet', 'lockKeyhole', 'layers', 'key'];
/** [arrive, leave] frames for the packet at each node */
const STOPS: [number, number][] = [
  [84, 104],
  [130, 152],
  [178, 202],
  [228, 270],
];
const PLAIN = 'gm, ready?';
const CIPHER = '0x9f3ac41e';

export function Pipeline() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = useCopy().pipeline;
  const exit = exitProg(frame, 256, 14);

  // packet x along the rail
  const kf: number[] = [];
  const kx: number[] = [];
  STOPS.forEach(([a, b], i) => {
    kf.push(a, b);
    kx.push(XS[i], XS[i]);
  });
  const px = interpolate(frame, kf, kx, { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeInOut });
  const moving = STOPS.every(([a, b]) => frame < a || frame > b) && frame > STOPS[0][1] && frame < STOPS[3][0];
  const packetIn = sp(frame, fps, 76, springs.bouncy);
  const activeIndex = STOPS.findIndex(([a, b]) => frame >= a - 2 && frame <= b + 4);
  const reached = (i: number) => frame >= STOPS[i][0] - 2;

  return (
    <AbsoluteFill style={{ opacity: exit, filter: exit < 1 ? `blur(${(1 - exit) * 10}px)` : undefined }}>
      {/* title */}
      <div style={{ position: 'absolute', top: 120, width: '100%', textAlign: 'center' }}>
        <Eyebrow style={{ marginBottom: 22 }}>
          <ScrambleText text={t.eyebrow} start={2} speed={1} seed="pipe-eyebrow" />
        </Eyebrow>
        <div style={{ fontFamily: F.pixel, fontSize: 78, lineHeight: 1.12, color: C.text, textShadow: '6px 6px 0 rgb(0 0 0 / 45%)' }}>
          <WordReveal text={t.title[0]} start={8} stagger={4} style={{ justifyContent: 'center' }} />
          <br />
          <WordReveal text={t.title[1]} start={18} stagger={4} style={{ justifyContent: 'center' }} highlight={[0, 1, 2, 3]} />
        </div>
      </div>

      {/* rail */}
      {Array.from({ length: 56 }, (_, i) => {
        const x = XS[0] + (i / 55) * (XS[3] - XS[0]);
        const p = prog(frame, 40 + i * 0.6, 10);
        const lit = x <= px + 2 && frame > STOPS[0][0];
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x - 4,
              top: RAIL_Y - 4,
              width: 8,
              height: 8,
              background: lit ? C.accent : C.borderStrong,
              opacity: p * (lit ? 1 : 0.7),
              boxShadow: lit ? `0 0 12px ${C.accent}` : undefined,
            }}
          />
        );
      })}

      {/* nodes */}
      {XS.map((x, i) => {
        const p = sp(frame, fps, 30 + i * 8, springs.snappy);
        const active = activeIndex === i;
        const done = reached(i) && !active;
        const drop = prog(frame, 48 + i * 6, 14);
        return (
          <div key={i}>
            <div
              style={{
                position: 'absolute',
                left: x - 2,
                top: RAIL_Y,
                width: 4,
                height: (NODE_Y - 120 - RAIL_Y) * drop,
                background: reached(i) ? C.accent : C.borderStrong,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: x - 160,
                top: NODE_Y - 120,
                width: 320,
                opacity: Math.min(1, p * 1.4),
                transform: `translateY(${(1 - p) * 80}px) scale(${active ? 1.05 : lerp(0.85, 1, p)})`,
              }}
            >
              <Panel tone={active || done ? 'gold' : 'default'} glow={active} style={{ padding: '30px 26px', height: 250, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                <IconTile name={ICONS[i]} size={88} draw={prog(frame, 36 + i * 8, 26)} style={active ? { background: C.accent, color: C.canvas, borderColor: C.accentHover } : undefined} />
                <div style={{ marginTop: 22, fontFamily: F.pixel, fontSize: 34, color: C.text }}>{t.steps[i]}</div>
                <div style={{ marginTop: 10, fontFamily: F.mono, fontSize: 19, color: active ? C.accent : C.textMuted }}>
                  {i === 2 && reached(2) ? (
                    <span>
                      #{Math.round(range(frame, [STOPS[2][0], STOPS[2][0] + 20], [21380700, 21380714]))}
                    </span>
                  ) : (
                    t.subs[i]
                  )}
                </div>
              </Panel>
              {done ? (
                <div style={{ position: 'absolute', right: -12, top: -12, width: 40, height: 40, display: 'grid', placeItems: 'center', background: C.success, transform: `scale(${sp(frame, fps, STOPS[i][1], springs.bouncy)})` }}>
                  <PixelIcon name="check" size={26} color={C.canvas} strokeWidth={3} />
                </div>
              ) : null}
            </div>
          </div>
        );
      })}

      {/* packet */}
      {frame >= 76 ? (
        <div
          style={{
            position: 'absolute',
            left: px,
            top: RAIL_Y,
            transform: `translate(-50%, -50%) scale(${packetIn * (moving ? 0.92 : 1)}) rotate(${moving ? 0 : 0}deg)`,
          }}
        >
          <div
            style={{
              padding: '14px 24px',
              background: frame >= STOPS[1][0] + 4 && frame < STOPS[3][0] + 6 ? C.accentSoft : C.elevated,
              border: `3px solid ${frame >= STOPS[3][0] + 6 ? C.success : frame >= STOPS[1][0] + 4 ? C.accent : C.text2}`,
              boxShadow: `6px 6px 0 rgb(0 0 0 / 45%), 0 0 40px ${frame >= STOPS[1][0] + 4 ? 'rgb(244 182 43 / 35%)' : 'transparent'}`,
              fontFamily: F.mono,
              fontSize: 28,
              color: C.text,
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <PixelIcon
              name={frame >= STOPS[3][0] + 6 ? 'checkSquare' : frame >= STOPS[1][0] + 4 ? 'lock' : 'message'}
              size={28}
              color={frame >= STOPS[3][0] + 6 ? C.success : frame >= STOPS[1][0] + 4 ? C.accent : C.text2}
            />
            {frame < STOPS[3][0] ? (
              <MorphText from={PLAIN} to={CIPHER} start={STOPS[1][0] + 2} speed={0.8} window={8} toColor={C.accentHover} seed="pkt-enc" />
            ) : (
              <MorphText from={CIPHER} to={PLAIN} start={STOPS[3][0] + 2} speed={0.8} window={8} toColor={C.success} seed="pkt-dec" />
            )}
          </div>
          {/* motion trail */}
          {moving
            ? [1, 2, 3, 4].map((k) => (
                <div
                  key={k}
                  style={{ position: 'absolute', right: '100%', top: '50%', marginTop: -5 + (k % 2) * 6, marginRight: k * 22, width: 12 - k * 2, height: 12 - k * 2, background: C.accent, opacity: 0.7 - k * 0.15 }}
                />
              ))
            : null}
        </div>
      ) : null}

      {/* footer */}
      <div style={{ position: 'absolute', top: 960, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontFamily: F.sans, fontSize: 38, color: C.text2, opacity: prog(frame, 236, 16) }}>
          <PixelIcon name="shieldCheck" size={40} color={C.accent} />
          <WordReveal text={t.footer} start={238} stagger={2} />
        </div>
      </div>
    </AbsoluteFill>
  );
}
