// Procedurally synthesises the promo soundtrack, locked to src/timeline.json.
// Output: public/soundtrack.wav (48 kHz, 16-bit stereo). No samples, no dependencies.
import { readFileSync, writeFileSync } from 'node:fs';

const timeline = JSON.parse(readFileSync(new URL('../src/timeline.json', import.meta.url)));
const SR = 48000;
const FPS = timeline.fps;
const DUR = timeline.total / FPS;
const N = Math.ceil(DUR * SR);
const BPM = 120;
const BEAT = 60 / BPM;
const at = (frame) => frame / FPS;
const scene = Object.fromEntries(timeline.scenes.map((s) => [s.id, s]));

// Buses: dry and reverb send (stereo)
const dryL = new Float32Array(N), dryR = new Float32Array(N);
const sendL = new Float32Array(N), sendR = new Float32Array(N);

let seed = 1337;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

function add(i, l, r, send = 0) {
  if (i < 0 || i >= N) return;
  dryL[i] += l; dryR[i] += r;
  if (send) { sendL[i] += l * send; sendR[i] += r * send; }
}

const polyblep = (t, dt) => {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
};

/* ---------------------------------------------------------------- pad */
// A minor: Am – F – C – G, two bars each
const CHORDS = [
  [57, 60, 64, 69], // Am
  [53, 57, 60, 65], // F
  [48, 55, 60, 64], // C
  [55, 59, 62, 67], // G
];
const chordAt = (t) => CHORDS[Math.floor(t / (BEAT * 8)) % 4];

function pad() {
  const voices = 4, det = [-0.11, 0.09];
  const phases = Array.from({ length: voices * 2 }, () => rnd());
  let lp1L = 0, lp2L = 0, lp1R = 0, lp2R = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const chord = chordAt(t);
    const bar = (t % (BEAT * 8)) / (BEAT * 8);
    let l = 0, r = 0;
    for (let v = 0; v < voices; v++) {
      for (let d = 0; d < 2; d++) {
        const k = v * 2 + d;
        const f = mtof(chord[v] + det[d]);
        const dt = f / SR;
        phases[k] = (phases[k] + dt) % 1;
        const s = 2 * phases[k] - 1 - polyblep(phases[k], dt);
        if (d === 0) l += s; else r += s;
      }
    }
    // filter opens over the film and breathes per chord
    const intensity = Math.min(1, t / 20) * (t > at(scene.outro.from) + 4 ? 0.7 : 1);
    const cutoff = 380 + 1500 * intensity + 500 * Math.sin(bar * Math.PI);
    const a = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
    lp1L += a * (l - lp1L); lp2L += a * (lp1L - lp2L);
    lp1R += a * (r - lp1R); lp2R += a * (lp1R - lp2R);
    const swell = Math.min(1, bar * 6) * (1 - 0.15 * bar);
    const g = 0.055 * swell * Math.min(1, t / 1.2);
    add(i, lp2L * g, lp2R * g, 0.6);
  }
}

/* -------------------------------------------------------------- drums */
function kick(t0, gain = 1, long = false) {
  const len = (long ? 1.4 : 0.42) * SR;
  const s0 = Math.floor(t0 * SR);
  let ph = 0;
  for (let j = 0; j < len; j++) {
    const t = j / SR;
    const f = 42 + 110 * Math.exp(-t * 28);
    ph += (2 * Math.PI * f) / SR;
    const env = Math.exp(-t * (long ? 3.2 : 9)) * Math.min(1, j / 40);
    const click = j < 200 ? (rnd() * 2 - 1) * (1 - j / 200) * 0.25 : 0;
    const v = Math.tanh((Math.sin(ph) * env + click) * 1.6) * 0.42 * gain;
    add(s0 + j, v, v, long ? 0.3 : 0.02);
  }
}

function hat(t0, gain = 1, open = false) {
  const len = (open ? 0.18 : 0.05) * SR;
  const s0 = Math.floor(t0 * SR);
  let hp = 0, prev = 0;
  for (let j = 0; j < len; j++) {
    const n = rnd() * 2 - 1;
    hp = 0.92 * (hp + n - prev); prev = n;
    const env = Math.exp((-j / SR) * (open ? 22 : 90));
    const v = hp * env * 0.06 * gain;
    add(s0 + j, v * 0.8, v, 0.1);
  }
}

function sub(t0, midi, dur, gain = 1) {
  const s0 = Math.floor(t0 * SR), len = Math.floor(dur * SR);
  let ph = 0;
  const f = mtof(midi);
  for (let j = 0; j < len; j++) {
    ph += (2 * Math.PI * f) / SR;
    const t = j / SR;
    const duck = 1 - 0.85 * Math.exp(-((t % BEAT) / BEAT) * 10); // pumping
    const env = Math.min(1, j / 400) * Math.min(1, (len - j) / 2000);
    const v = Math.sin(ph) * 0.16 * env * duck * gain;
    add(s0 + j, v, v);
  }
}

/* ------------------------------------------------------------- chip arp */
function chipNote(t0, midi, dur, gain = 1, duty = 0.25) {
  const s0 = Math.floor(t0 * SR), len = Math.floor(dur * SR);
  const f = mtof(midi);
  let ph = 0;
  for (let j = 0; j < len; j++) {
    ph = (ph + f / SR) % 1;
    const sq = ph < duty ? 1 : -1;
    const env = Math.exp((-j / SR) * 14) * Math.min(1, j / 60);
    const v = Math.round(sq * env * 8) / 8 * 0.035 * gain; // 3-bit amplitude steps
    add(s0 + j, v * 0.7, v, 0.35);
  }
}

/* ----------------------------------------------------------------- fx */
function whoosh(tCenter, dur = 0.9, gain = 1, up = true) {
  const s0 = Math.floor((tCenter - dur * 0.75) * SR), len = Math.floor(dur * SR);
  let bp1 = 0, bp2 = 0;
  for (let j = 0; j < len; j++) {
    const x = j / len;
    const f = up ? 300 + 5200 * x * x : 5500 - 5000 * x;
    const q = 0.35;
    const w = (2 * Math.PI * f) / SR;
    const n = rnd() * 2 - 1;
    // state-variable bandpass
    bp1 += w * (n - bp1 - q * bp2);
    bp2 += w * bp1;
    const env = x < 0.75 ? (x / 0.75) ** 2 : Math.exp(-(x - 0.75) * 18);
    const v = bp2 * env * 0.22 * gain;
    const pan = Math.sin(x * Math.PI * 2) * 0.5;
    add(s0 + j, v * (1 - pan), v * (1 + pan), 0.5);
  }
}

function impact(t0, gain = 1) {
  kick(t0, 1.3 * gain, true);
  const s0 = Math.floor(t0 * SR), len = 1.6 * SR;
  let lp = 0;
  for (let j = 0; j < len; j++) {
    const n = rnd() * 2 - 1;
    lp += 0.08 * (n - lp);
    const v = lp * Math.exp((-j / SR) * 3) * 0.5 * gain;
    add(s0 + j, v, v, 0.8);
  }
}

function blip(t0, midi, gain = 1, dur = 0.12) {
  const s0 = Math.floor(t0 * SR), len = Math.floor(dur * SR);
  const f = mtof(midi);
  let ph = 0;
  for (let j = 0; j < len; j++) {
    ph += (2 * Math.PI * f) / SR;
    const env = Math.exp((-j / SR) * 30);
    const v = (Math.sin(ph) + 0.3 * Math.sin(ph * 2)) * env * 0.08 * gain;
    add(s0 + j, v, v, 0.5);
  }
}

function click(t0, gain = 1) {
  const s0 = Math.floor(t0 * SR);
  for (let j = 0; j < 260; j++) {
    const v = (rnd() * 2 - 1) * Math.exp(-j / 40) * 0.09 * gain;
    add(s0 + j, v, v * 0.9, 0.05);
  }
}

function glitch(t0, dur = 0.35, gain = 1) {
  const s0 = Math.floor(t0 * SR), len = Math.floor(dur * SR);
  let hold = 0;
  for (let j = 0; j < len; j++) {
    if (j % 90 === 0) hold = (rnd() * 2 - 1) * (rnd() > 0.5 ? 1 : 0.2);
    const env = Math.sin((j / len) * Math.PI);
    const v = Math.round(hold * 4) / 4 * env * 0.05 * gain;
    add(s0 + j, v, -v, 0.2);
  }
}

function riser(t0, t1) {
  const s0 = Math.floor(t0 * SR), len = Math.floor((t1 - t0) * SR);
  let ph = 0, lp = 0;
  for (let j = 0; j < len; j++) {
    const x = j / len;
    ph += (2 * Math.PI * (220 + 880 * x * x)) / SR;
    const n = rnd() * 2 - 1;
    lp += (0.02 + 0.5 * x) * (n - lp);
    const v = (Math.sin(ph) * 0.05 + lp * 0.14) * x * x;
    add(s0 + j, v, v, 0.6);
  }
}

/* ------------------------------------------------------------- arrange */
pad();

const tHook = at(scene.hook.from);
const tPipe = at(scene.pipeline.from);
const tApp = at(scene.app.from);
const tFeat = at(scene.features.from);
const tMain = at(scene.mainnet.from);
const tOutro = at(scene.outro.from);

// Intro sparkles while the coin assembles, then the impact on the sheen
const penta = [69, 72, 74, 76, 79, 81, 84, 86, 88];
for (let k = 0; k < 34; k++) {
  const t = 0.15 + (k / 34) ** 1.4 * 2.2;
  blip(t, penta[Math.floor(rnd() * penta.length)] + 12, 0.4 + rnd() * 0.4, 0.25);
}
impact(at(72), 0.8);
for (let f = 96; f < 116; f += 2) click(at(f), 0.7); // wordmark scramble
for (let f = 104; f < 124; f += 3) click(at(f), 0.35);

// Groove
for (let t = tHook; t < tOutro - 0.01; t += BEAT) {
  const inPipe = t >= tPipe;
  if (inPipe) kick(t, t < tApp ? 0.75 : 1);
  const beatIdx = Math.round((t - tHook) / BEAT);
  if (t >= tApp) {
    hat(t + BEAT / 2, 1, beatIdx % 4 === 3);
    if (t >= tFeat) hat(t + BEAT / 4, 0.45), hat(t + (3 * BEAT) / 4, 0.45);
  }
}
for (let t = tHook; t < tOutro; t += BEAT * 8) {
  const chord = chordAt(t);
  sub(t, chord[0] - 24, Math.min(BEAT * 8, tOutro - t), t < tPipe ? 0.6 : 1);
}

// Chip arpeggio from the app reveal to the outro (16ths, up-down pattern)
const pattern = [0, 1, 2, 3, 2, 1, 2, 3];
for (let t = tApp, k = 0; t < tOutro - 0.01; t += BEAT / 4, k++) {
  const chord = chordAt(t);
  const note = chord[pattern[k % pattern.length]] + 12;
  const g = t < tFeat ? 0.6 : 1;
  chipNote(t, note, BEAT / 4, g);
  chipNote(t + (BEAT * 3) / 4, note, BEAT / 4, g * 0.35); // dotted echo
}

// Scene transitions: whoosh into every cut, glitch on the pixel wipe
for (const s of timeline.scenes.slice(1)) {
  const t = at(s.from);
  if (s.id === 'outro') continue;
  whoosh(t, 0.9, 1);
  glitch(t - 0.12, 0.3, 1);
}

// Hook: lock stamp
impact(at(scene.hook.from + 104), 0.55);
blip(at(scene.hook.from + 104), 93, 0.5, 0.3);
for (let f = 88; f < 118; f += 2) click(at(scene.hook.from + f), 0.45);

// Pipeline: packet arrives at each node (rising)
[84, 130, 178, 228].forEach((f, i) => {
  blip(at(scene.pipeline.from + f), [76, 79, 83, 88][i], 0.9, 0.25);
  if (i < 3) whoosh(at(scene.pipeline.from + f + 24), 0.5, 0.35);
});

// App: typing, click, send
for (let f = 122; f < 160; f += 2) click(at(scene.app.from + f), 0.5 + rnd() * 0.5);
click(at(scene.app.from + 184), 1.6);
blip(at(scene.app.from + 184), 84, 0.7);
whoosh(at(scene.app.from + 192), 0.5, 0.6);
blip(at(scene.app.from + 192), 91, 0.7, 0.3);
[228, 238, 248].forEach((f, i) => blip(at(scene.app.from + f), [81, 84, 88][i], 0.6));

// Features: a stinger at every slide, batch ticks, escrow release
for (let i = 0; i < 6; i++) {
  const t = tFeat + at(i * timeline.featureDuration);
  if (i > 0) whoosh(t, 0.45, 0.45);
  blip(t + 0.05, 88, 0.5, 0.2);
}
const batchStart = tFeat + at(2 * timeline.featureDuration);
for (let k = 0; k < 24; k++) blip(batchStart + at(16 + k * 2), 72 + k, 0.25, 0.05);
blip(batchStart + at(64), 96, 0.6, 0.35);
impact(tFeat + at(5 * timeline.featureDuration + 40), 0.35);
blip(tFeat + at(5 * timeline.featureDuration + 74), 91, 0.7, 0.4);

// Mainnet: typing in the terminal
for (let f = 44; f < 76; f += 2) click(at(scene.mainnet.from + f), 0.4);

// Outro: riser, the big hit as the coin lands, CTA pop
riser(tOutro - 2, tOutro);
impact(at(scene.outro.from + 50), 1.1);
for (let k = 0; k < 20; k++) blip(at(scene.outro.from + 4 + k * 2.2), penta[k % penta.length] + 12, 0.3, 0.2);
blip(at(scene.outro.from + 112), 81, 0.8, 0.4);
blip(at(scene.outro.from + 112), 88, 0.6, 0.5);
// final sustained chord
for (const m of [45, 57, 60, 64, 69, 76]) {
  const s0 = Math.floor(at(scene.outro.from + 50) * SR), len = N - s0;
  let ph = 0;
  for (let j = 0; j < len; j++) {
    ph += (2 * Math.PI * mtof(m)) / SR;
    const env = Math.min(1, j / 4000) * Math.exp((-j / SR) * 0.55);
    const v = (Math.sin(ph) + 0.25 * Math.sin(ph * 3)) * env * 0.03;
    add(s0 + j, v, v, 0.7);
  }
}

/* -------------------------------------------------------------- reverb */
function reverb(inp, combs, out, wet) {
  const allp = [556, 441];
  const bufs = combs.map((d) => ({ d, b: new Float32Array(d), i: 0, lp: 0 }));
  const aps = allp.map((d) => ({ d, b: new Float32Array(d), i: 0 }));
  for (let n = 0; n < N; n++) {
    let acc = 0;
    for (const c of bufs) {
      const y = c.b[c.i];
      c.lp = y * 0.7 + c.lp * 0.3;
      c.b[c.i] = inp[n] + c.lp * 0.86;
      c.i = (c.i + 1) % c.d;
      acc += y;
    }
    for (const a of aps) {
      const buffered = a.b[a.i];
      const y = -0.5 * acc + buffered;
      a.b[a.i] = acc + 0.5 * y;
      a.i = (a.i + 1) % a.d;
      acc = y;
    }
    out[n] += acc * wet;
  }
}
reverb(sendL, [1557, 1617, 1491, 1422, 1277, 1356], dryL, 0.12);
reverb(sendR, [1580, 1640, 1514, 1445, 1300, 1379], dryR, 0.12);

/* -------------------------------------------------------------- master */
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fade = Math.min(1, t / 0.25) * Math.min(1, (DUR - t) / 1.2);
  dryL[i] = Math.tanh(dryL[i] * 1.2) * fade;
  dryR[i] = Math.tanh(dryR[i] * 1.2) * fade;
  peak = Math.max(peak, Math.abs(dryL[i]), Math.abs(dryR[i]));
}
const norm = 0.89 / (peak || 1);
const data = Buffer.alloc(44 + N * 4);
data.write('RIFF', 0); data.writeUInt32LE(36 + N * 4, 4); data.write('WAVE', 8);
data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22);
data.writeUInt32LE(SR, 24); data.writeUInt32LE(SR * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34);
data.write('data', 36); data.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  data.writeInt16LE(Math.round(dryL[i] * norm * 32767), 44 + i * 4);
  data.writeInt16LE(Math.round(dryR[i] * norm * 32767), 46 + i * 4);
}
writeFileSync(new URL('../public/soundtrack.wav', import.meta.url), data);
console.log(`soundtrack.wav: ${DUR.toFixed(2)}s, peak ${peak.toFixed(3)} → normalised`);
