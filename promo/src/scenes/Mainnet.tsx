import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { exitProg, lerp, prog, sp, springs } from '../anim';
import { PixelIcon } from '../components/Icons';
import { useCopy } from '../components/useCopy';
import { Eyebrow, Panel } from '../components/Panel';
import { CountUp, ScrambleText, Typewriter, WordReveal } from '../components/Text';
import { C, F } from '../theme';

const CONTRACTS: [string, string][] = [
  ['ArcanumMessenger', '0xC004...365e'],
  ['ArcanumAgents', '0x2AB2...8108'],
  ['ArcanumGroups', '0x6bB7...56aD'],
  ['ArcanumBulkSender', '0xD0aF...41D7'],
  ['ArcanumGigBoard', '0xE238...2b4A'],
  ['ArcanumEscrow', '0xf9DD...a93E'],
];

const CODE = [
  "import { createPublicClient, http } from 'viem';",
  "import { arcMainnet, createArcanumSdk } from 'arcanum-chat-sdk';",
  '',
  'const publicClient = createPublicClient({',
  '  chain: arcMainnet, transport: http(),',
  '});',
  'const arcanum = createArcanumSdk({ publicClient });',
  'const gigs = await arcanum.gigBoard',
  "  .read('getGigsPage', [0n, 25n]);",
];

const KEYWORDS = new Set(['import', 'from', 'const', 'await']);

function highlight(line: string) {
  const parts = line.split(/('[^']*'|\b\d+n\b|[A-Za-z_]+|[^A-Za-z_'\d]+)/).filter(Boolean);
  return parts.map((p, i) => {
    let color: string = C.text;
    if (p.startsWith("'")) color = C.success;
    else if (KEYWORDS.has(p)) color = C.accent;
    else if (/^\d+n$/.test(p)) color = C.info;
    else if (/^[^A-Za-z_]+$/.test(p)) color = C.textMuted;
    else if (/^[A-Z]/.test(p) || p.startsWith('create')) color = C.accentHover;
    return (
      <span key={i} style={{ color }}>
        {p}
      </span>
    );
  });
}

export function Mainnet() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = useCopy().mainnet;
  const exit = exitProg(frame, 226, 14);
  const term = sp(frame, fps, 30, springs.soft);

  const stats = [
    { node: <CountUp to={6} start={24} dur={24} />, label: t.stats[0] },
    { node: <CountUp to={5042} start={30} dur={36} />, label: t.stats[1] },
    { node: <CountUp to={100} start={36} dur={36} />, label: t.stats[2] },
    { node: <ScrambleText text="USDC" start={42} speed={2} seed="gas" />, label: t.stats[3] },
  ];

  return (
    <AbsoluteFill style={{ opacity: exit, transform: `scale(${lerp(1, 0.97, 1 - exit)})` }}>
      {/* left */}
      <div style={{ position: 'absolute', left: 140, top: 170, width: 800 }}>
        <Eyebrow>
          <ScrambleText text={t.eyebrow} start={2} speed={1.2} seed="mn-eyebrow" />
        </Eyebrow>
        <div style={{ marginTop: 16, fontFamily: F.pixel, fontSize: 80, color: C.text, lineHeight: 1.05, textShadow: '6px 6px 0 rgb(0 0 0 / 45%)' }}>
          <WordReveal text={t.title} start={6} stagger={4} highlight={[t.title.split(' ').length - 1]} />
        </div>

        <div style={{ marginTop: 44, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '26px 40px' }}>
          {stats.map((s, i) => {
            const p = prog(frame, 22 + i * 6, 20);
            return (
              <div key={i} style={{ opacity: p, transform: `translateY(${(1 - p) * 30}px)`, borderLeft: `6px solid ${C.accent}`, paddingLeft: 22 }}>
                <div style={{ fontFamily: F.pixel, fontSize: 88, lineHeight: 1, color: C.accent }}>{s.node}</div>
                <div style={{ marginTop: 8, fontFamily: F.sans, fontSize: 24, color: C.textMuted }}>{s.label}</div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 50, fontFamily: F.mono, fontSize: 18, letterSpacing: '0.2em', color: C.textMuted, opacity: prog(frame, 64, 14) }}>{t.contracts.toLocaleUpperCase('en-US')}</div>
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 28px' }}>
          {CONTRACTS.map(([name, addr], i) => {
            const p = prog(frame, 70 + i * 6, 14);
            return (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: p, transform: `translateX(${(1 - p) * -24}px)`, fontFamily: F.mono, fontSize: 19 }}>
                <PixelIcon name="checkSquare" size={20} color={C.success} />
                <span style={{ color: C.text }}>{name.replace('Arcanum', '')}</span>
                <span style={{ color: C.textMuted }}>{addr}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* right: terminal */}
      <div style={{ position: 'absolute', left: 980, top: 196, width: 820, opacity: Math.min(1, term * 1.4), transform: `perspective(2000px) rotateY(${lerp(-16, -4, term)}deg) translateX(${(1 - term) * 120}px)` }}>
        <div style={{ fontFamily: F.pixel, fontSize: 40, color: C.text, marginBottom: 20 }}>
          <ScrambleText text={t.sdk} start={34} speed={1} seed="sdk-title" />
        </div>
        <Panel glow style={{ padding: 0, background: C.muted }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `2px solid ${C.border}`, background: C.surface }}>
            {[C.danger, C.accent, C.success].map((c) => (
              <span key={c} style={{ width: 14, height: 14, background: c }} />
            ))}
            <span style={{ marginLeft: 12, fontFamily: F.mono, fontSize: 16, color: C.textMuted }}>arcanum-chat-sdk — zsh</span>
          </div>
          <div style={{ padding: '24px 28px', fontFamily: F.mono, fontSize: 18, lineHeight: 1.75, minHeight: 500 }}>
            <div>
              <span style={{ color: C.success }}>$ </span>
              <Typewriter text="npm install arcanum-chat-sdk viem" start={44} cps={1.1} caret={frame < 80} caretColor={C.text} style={{ color: C.text }} />
            </div>
            <div style={{ color: C.success, opacity: prog(frame, 80, 6) }}>+ arcanum-chat-sdk@0.1.0 · typed Viem clients</div>
            <div style={{ height: 16 }} />
            {CODE.map((line, i) => {
              const p = prog(frame, 92 + i * 7, 12);
              return (
                <div key={i} style={{ opacity: p, transform: `translateX(${(1 - p) * 20}px)`, whiteSpace: 'pre', minHeight: '1.7em' }}>
                  <span style={{ display: 'inline-block', width: 34, color: C.border }}>{line ? i + 1 : ''}</span>
                  {highlight(line)}
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </AbsoluteFill>
  );
}
