import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { exitProg, lerp, prog, sp, springs } from '../anim';
import { PixelIcon } from '../components/Icons';
import { useCopy } from '../components/useCopy';
import { Eyebrow, Shot } from '../components/Panel';
import { ScrambleText, Typewriter, WordReveal } from '../components/Text';
import { C, F, easeInOut } from '../theme';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const T = {
  flyIn: 6,
  connect: 64,
  incoming: 78,
  zoomIn: 100,
  type: 122,
  cursor: 164,
  click: 184,
  sent: 188,
  zoomOut: 214,
  callouts: 228,
  exit: 286,
};

const SEND = { x: 1468, y: 713 };
const FOCUS = { x: 1083, y: 560 };

/** Mask a region of the screenshot with app-coloured surface. */
function Patch({ x, y, w, h, children, style }: { x: number; y: number; w: number; h: number; children?: ReactNode; style?: CSSProperties }) {
  return <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, ...style }}>{children}</div>;
}

function PrivatePill({ label }: { label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 6px', border: `1px solid #2b5c49`, background: C.successSoft, color: C.success, fontSize: 11, fontWeight: 600 }}>
      <PixelIcon name="lock" size={10} color={C.success} />
      {label}
    </span>
  );
}

function Bubble({ text, outgoing, meta, style }: { text: string; outgoing?: boolean; meta: string; style?: CSSProperties }) {
  return (
    <div
      style={{
        maxWidth: '72%',
        marginLeft: outgoing ? 'auto' : undefined,
        padding: '10px 14px',
        border: `1px solid ${outgoing ? '#6e5626' : C.border}`,
        background: outgoing ? C.accentSoft : C.elevated,
        fontFamily: F.sans,
        ...style,
      }}
    >
      <div style={{ fontSize: 17, color: C.text, lineHeight: 1.4 }}>{text}</div>
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, fontSize: 11, color: C.textMuted }}>
        <PrivatePill label="Private" />
        <span>{meta}</span>
      </div>
    </div>
  );
}

function Callout({ x, y, side, label, start, icon }: { x: number; y: number; side: 'left' | 'down'; label: string; start: number; icon: 'lock' | 'wallet' | 'coins' }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const line = prog(frame, start, 16);
  const tag = sp(frame, fps, start + 8, springs.snappy);
  const len = 150;
  const dot = sp(frame, fps, start, springs.bouncy);
  return (
    <div style={{ position: 'absolute', left: x, top: y }}>
      <div style={{ position: 'absolute', left: -9, top: -9, width: 18, height: 18, background: C.accent, transform: `scale(${dot})`, boxShadow: `0 0 0 6px rgb(244 182 43 / 25%)` }} />
      {side === 'left' ? (
        <div style={{ position: 'absolute', top: -2, right: 0, height: 4, width: len * line, background: C.accent }} />
      ) : (
        <div style={{ position: 'absolute', left: -2, top: 0, width: 4, height: len * 0.7 * line, background: C.accent }} />
      )}
      <div
        style={{
          position: 'absolute',
          ...(side === 'left' ? { top: -34, right: len + 8 } : { top: len * 0.7 + 6, right: -40 }),
          opacity: tag,
          transform: side === 'left' ? `translateX(${(1 - tag) * 30}px)` : `translateY(${(1 - tag) * -24}px)`,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '14px 22px',
          background: C.accent,
          color: C.canvas,
          fontFamily: F.pixel,
          fontSize: 34,
          whiteSpace: 'nowrap',
          boxShadow: '6px 6px 0 rgb(0 0 0 / 50%)',
        }}
      >
        <PixelIcon name={icon} size={28} color={C.canvas} strokeWidth={2.5} />
        {label}
      </div>
    </div>
  );
}

export function AppReveal() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = useCopy().app;
  const exit = exitProg(frame, T.exit, 14);

  const fly = sp(frame, fps, T.flyIn, springs.heavy);
  const zin = prog(frame, T.zoomIn, 36, easeInOut);
  const zout = prog(frame, T.zoomOut, 34, easeInOut);
  const w = zin * (1 - zout); // focus weight

  const scale = lerp(0.62, 0.8, fly) * lerp(1, 1.68, w) * lerp(1, 1.08, zout);
  const rotX = lerp(lerp(lerp(44, 9, fly), 0, zin), 5, zout);
  const rotY = lerp(lerp(lerp(-30, -9, fly), 0, zin), -8, zout);
  const baseY = lerp(380, lerp(84, 6, zout), fly);
  const tx = -(FOCUS.x - 800) * scale * w + lerp(0, -70, zout);
  const ty = -(FOCUS.y - 450) * scale * w + baseY * (1 - w);
  const drift = Math.sin(frame / 40) * 4;

  const titleOut = 1 - prog(frame, T.zoomIn - 4, 20);
  const typedDone = frame >= T.sent;
  const outgoing = sp(frame, fps, T.sent, springs.snappy);
  const toast = sp(frame, fps, T.sent + 4, springs.snappy) * (1 - prog(frame, T.exit - 10, 12));

  const cursorX = interpolate(frame, [T.cursor, T.click - 2], [1250, SEND.x], { ...clamp, easing: easeInOut });
  const cursorY = interpolate(frame, [T.cursor, T.click - 2], [840, SEND.y], { ...clamp, easing: easeInOut });
  const press = frame >= T.click && frame < T.click + 6;
  const cursorOpacity = prog(frame, T.cursor - 6, 8) * (1 - prog(frame, T.sent + 14, 10));
  const connected = frame >= T.connect;

  return (
    <AbsoluteFill style={{ opacity: exit }}>
      {/* title */}
      <div style={{ position: 'absolute', top: 70, width: '100%', textAlign: 'center', opacity: titleOut, transform: `translateY(${(1 - titleOut) * -40}px)` }}>
        <Eyebrow style={{ marginBottom: 16 }}>
          <ScrambleText text={t.eyebrow} start={2} speed={1} seed="app-eyebrow" />
        </Eyebrow>
        <div style={{ fontFamily: F.pixel, fontSize: 84, color: C.text, textShadow: '6px 6px 0 rgb(0 0 0 / 45%)' }}>
          <WordReveal text={t.title} start={6} stagger={4} style={{ justifyContent: 'center' }} highlight={[t.title.split(' ').length - 1]} />
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 160,
          top: 90,
          width: 1600,
          height: 900,
          transformOrigin: '50% 50%',
          transform: `perspective(2600px) translate3d(${tx}px, ${ty + drift}px, 0) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(${scale})`,
          opacity: Math.min(1, fly * 1.6),
        }}
      >
        <Shot src="shots/dm-clean.webp" sweepAt={30}>
          {/* --- connected-state overlays, drawn in the app's own styles --- */}
          {connected ? (
            <>
              <Patch x={1426} y={28} w={138} h={40} style={{ background: C.elevated, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: F.sans, fontSize: 14, fontWeight: 600, color: C.text, opacity: prog(frame, T.connect, 8) }}>
                <PixelIcon name="wallet" size={14} color={C.text} />
                0x51A2...9e04
              </Patch>
              <Patch x={1300} y={34} w={100} h={28} style={{ border: `1px solid #2b5c49`, background: C.successSoft, color: C.success, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F.sans, fontSize: 13, fontWeight: 600, opacity: prog(frame, T.connect + 4, 8) }}>
                Arc · Ready
              </Patch>
              <Patch x={40} y={130} w={100} h={22} style={{ background: C.surface, fontFamily: F.mono, fontSize: 13, color: C.success, display: 'flex', alignItems: 'center' }}>
                Connected
              </Patch>
              <Patch x={1222} y={118} w={222} h={32} style={{ background: C.surface, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', opacity: prog(frame, T.connect + 6, 8) }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', border: `1px solid #2b5c49`, background: C.successSoft, color: C.success, fontFamily: F.sans, fontSize: 13, fontWeight: 600 }}>
                  <PixelIcon name="key" size={13} color={C.success} />
                  {t.keyReady}
                </span>
              </Patch>
              <Patch x={606} y={134} w={600} h={32} style={{ background: C.surface, fontFamily: F.mono, fontSize: 21, color: C.text, display: 'flex', alignItems: 'center' }}>
                0x7a3f...91c2
              </Patch>
              <Patch x={276} y={328} w={276} h={92} style={{ background: C.accentSoft, border: `1px solid ${C.accent}`, padding: '14px 16px', fontFamily: F.sans, opacity: prog(frame, T.connect + 2, 10) }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 600, color: C.text }}>
                  <span style={{ fontFamily: F.mono }}>0x7a3f...91c2</span>
                  <span style={{ color: C.accent, fontSize: 12 }}>{typedDone ? t.justNow : '2m'}</span>
                </div>
                <div style={{ marginTop: 8, fontSize: 14, color: C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {typedDone ? `${t.you}: ${t.typed}` : t.incoming}
                </div>
              </Patch>
              {/* conversation */}
              <Patch x={610} y={198} w={947} h={357} style={{ background: C.surface, padding: '22px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 16 }}>
                {frame >= T.incoming ? (
                  <Bubble
                    text={t.incoming}
                    meta="14:02 · #4182"
                    style={{ opacity: sp(frame, fps, T.incoming, springs.snappy), transform: `translateY(${(1 - sp(frame, fps, T.incoming, springs.snappy)) * 30}px)` }}
                  />
                ) : null}
                {frame >= T.sent ? (
                  <Bubble
                    outgoing
                    text={t.typed}
                    meta={`${t.justNow} · #4183`}
                    style={{ opacity: outgoing, transform: `translateY(${(1 - outgoing) * 120}px) scale(${lerp(0.9, 1, outgoing)})`, transformOrigin: '100% 100%', boxShadow: `0 0 ${30 * (1 - prog(frame, T.sent + 10, 30))}px rgb(244 182 43 / 50%)` }}
                  />
                ) : null}
              </Patch>
            </>
          ) : null}

          {/* composer text */}
          {frame >= T.type && !typedDone ? (
            <Patch x={611} y={575} w={940} h={90} style={{ background: C.muted, padding: '14px 18px', fontFamily: F.sans, fontSize: 18, color: C.text }}>
              <Typewriter text={t.typed} start={T.type} cps={0.95} caretColor={C.text} />
            </Patch>
          ) : null}
          {frame >= T.type && !typedDone ? (
            <Patch x={1500} y={751} w={60} h={16} style={{ background: C.surface, textAlign: 'right', fontFamily: F.sans, fontSize: 12, color: C.textMuted }}>
              {Math.min(t.typed.length, Math.max(0, Math.floor((frame - T.type) * 0.95)))}/280
            </Patch>
          ) : null}

          {/* send button press */}
          <Patch
            x={1379}
            y={692}
            w={180}
            h={44}
            style={{
              background: press ? C.accentHover : frame >= T.type + 6 && !typedDone ? C.accent : 'transparent',
              transform: press ? 'scale(0.95)' : undefined,
              display: frame >= T.type + 6 && frame < T.sent + 6 ? 'flex' : 'none',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              fontFamily: F.sans,
              fontSize: 17,
              fontWeight: 600,
              color: C.canvas,
              boxShadow: press ? `0 0 40px ${C.accent}` : '3px 3px 0 rgb(0 0 0 / 45%)',
            }}
          >
            <PixelIcon name="send" size={18} color={C.canvas} />
            Send on-chain
          </Patch>

          {/* toast */}
          {toast > 0.001 ? (
            <Patch
              x={1180}
              y={86}
              w={380}
              h={64}
              style={{
                transform: `translateY(${(1 - toast) * -30}px)`,
                opacity: toast,
                background: C.elevated,
                border: `1px solid #2b5c49`,
                boxShadow: '4px 4px 0 rgb(0 0 0 / 45%)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '0 16px',
                fontFamily: F.sans,
                fontSize: 15,
                fontWeight: 600,
                color: C.text,
              }}
            >
              <span style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', background: C.success }}>
                <PixelIcon name="check" size={20} color={C.canvas} strokeWidth={3} />
              </span>
              <span>
                {t.toast}
                <span style={{ display: 'block', fontSize: 12, fontWeight: 400, color: C.textMuted, fontFamily: F.mono }}>tx 0xc004…365e · 0.05 USDC</span>
              </span>
            </Patch>
          ) : null}
        </Shot>

        {/* cursor, above the screenshot */}
        {cursorOpacity > 0 ? (
          <svg
            width={34}
            height={44}
            viewBox="0 0 17 22"
            style={{ position: 'absolute', left: cursorX - 4, top: cursorY - 2, opacity: cursorOpacity, transform: press ? 'scale(0.85)' : undefined, transformOrigin: '0 0', filter: 'drop-shadow(3px 3px 0 rgb(0 0 0 / 55%))' }}
            shapeRendering="crispEdges"
          >
            <path d="M0 0H2V1H3V2H4V3H5V4H6V5H7V6H8V7H9V8H10V9H11V10H12V11H13V12H14V14H9V15H10V17H11V19H12V21H9V19H8V17H7V15H6V16H5V17H4V18H3V19H2V20H0Z" fill={C.text} />
            <path d="M2 3H3V4H4V5H5V6H6V7H7V8H8V9H9V10H10V11H11V12H12V13H7V15H8V17H9V19H10V20H11V19H10V17H9V15H8V14H6V15H5V16H4V17H3V18H2Z" fill={C.canvas} opacity={0.9} />
          </svg>
        ) : null}
        {press ? (
          <div style={{ position: 'absolute', left: SEND.x - 60, top: SEND.y - 60, width: 120, height: 120, border: `4px solid ${C.accent}`, borderRadius: '50%', opacity: 1 - (frame - T.click) / 6, transform: `scale(${0.4 + (frame - T.click) / 6})` }} />
        ) : null}

        {/* callouts in screenshot space */}
        <Callout x={612} y={716} side="left" label={t.callouts[0]} start={T.callouts} icon="lock" />
        <Callout x={1495} y={66} side="down" label={t.callouts[1]} start={T.callouts + 10} icon="wallet" />
        <Callout x={1325} y={724} side="down" label={t.callouts[2]} start={T.callouts + 20} icon="coins" />
      </div>
    </AbsoluteFill>
  );
}
