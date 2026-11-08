// Voice ID: on-device speaker embedding (no server, no cloud).
// Port of the Resemblyzer voice encoder (Apache-2.0, github.com/resemble-ai/Resemblyzer):
// 40-band mel spectrogram (librosa-compatible) → 3-layer LSTM (256) → linear + ReLU
// → L2-normalised 256-d "voice print". Two prints of the same person have a high
// cosine similarity; different people a lower one. Runs in browsers and in Node (tests).

export const SR = 16000;
const N_FFT = 400; const HOP = 160; const N_MELS = 40; const PARTIAL = 160; const H = 256;

// --- mel spectrogram (librosa.feature.melspectrogram defaults: center, zero pad, hann, power 2, slaney mel) ---
const hzToMel = (f) => { const fsp = 200 / 3; const minLogHz = 1000; const minLogMel = minLogHz / fsp; const logstep = Math.log(6.4) / 27; return f >= minLogHz ? minLogMel + Math.log(f / minLogHz) / logstep : f / fsp; };
const melToHz = (m) => { const fsp = 200 / 3; const minLogHz = 1000; const minLogMel = minLogHz / fsp; const logstep = Math.log(6.4) / 27; return m >= minLogMel ? minLogHz * Math.exp(logstep * (m - minLogMel)) : fsp * m; };
let tables = null;
function getTables() {
  if (tables) return tables;
  const bins = N_FFT / 2 + 1;
  const win = new Float64Array(N_FFT); for (let i = 0; i < N_FFT; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N_FFT);
  const cos = new Float64Array(bins * N_FFT); const sin = new Float64Array(bins * N_FFT);
  for (let k = 0; k < bins; k++) for (let n = 0; n < N_FFT; n++) { const a = (2 * Math.PI * k * n) / N_FFT; cos[k * N_FFT + n] = Math.cos(a) * win[n]; sin[k * N_FFT + n] = Math.sin(a) * win[n]; }
  const fft = Array.from({ length: bins }, (_, k) => (k * SR) / N_FFT);
  const mMin = hzToMel(0); const mMax = hzToMel(SR / 2);
  const pts = Array.from({ length: N_MELS + 2 }, (_, i) => melToHz(mMin + ((mMax - mMin) * i) / (N_MELS + 1)));
  const fb = new Float64Array(N_MELS * bins);
  for (let m = 0; m < N_MELS; m++) {
    const lo = pts[m]; const c = pts[m + 1]; const hi = pts[m + 2]; const enorm = 2 / (hi - lo);
    for (let k = 0; k < bins; k++) { const l = (fft[k] - lo) / (c - lo); const r = (hi - fft[k]) / (hi - c); fb[m * bins + k] = Math.max(0, Math.min(l, r)) * enorm; }
  }
  tables = { bins, cos, sin, fb };
  return tables;
}

export function melSpectrogram(wav) {
  const { bins, cos, sin, fb } = getTables();
  const pad = N_FFT / 2; const n = wav.length; const frames = 1 + Math.floor(n / HOP);
  const out = new Float32Array(frames * N_MELS); const frame = new Float64Array(N_FFT); const power = new Float64Array(bins);
  for (let t = 0; t < frames; t++) {
    const start = t * HOP - pad;
    for (let i = 0; i < N_FFT; i++) { const j = start + i; frame[i] = j >= 0 && j < n ? wav[j] : 0; }
    for (let k = 0; k < bins; k++) {
      let re = 0; let im = 0; const o = k * N_FFT;
      for (let i = 0; i < N_FFT; i++) { re += frame[i] * cos[o + i]; im -= frame[i] * sin[o + i]; }
      power[k] = re * re + im * im;
    }
    for (let m = 0; m < N_MELS; m++) { let s = 0; const o = m * bins; for (let k = 0; k < bins; k++) s += fb[o + k] * power[k]; out[t * N_MELS + m] = s; }
  }
  return { data: out, frames };
}

// --- weights (float16 file → Float32 layers) ---
function f16(h) { const s = h & 0x8000 ? -1 : 1; const e = (h >> 10) & 0x1f; const f = h & 0x3ff; if (e === 0) return s * 2 ** -14 * (f / 1024); if (e === 31) return f ? NaN : s * Infinity; return s * 2 ** (e - 15) * (1 + f / 1024); }
export function loadWeights(buffer) {
  const u16 = new Uint16Array(buffer); const all = new Float32Array(u16.length);
  for (let i = 0; i < u16.length; i++) all[i] = f16(u16[i]);
  let p = 0; const take = (len) => { const a = all.subarray(p, p + len); p += len; return a; };
  const layers = [];
  for (let l = 0; l < 3; l++) { const inp = l ? H : N_MELS; layers.push({ inp, wih: take(4 * H * inp), whh: take(4 * H * H), b: take(4 * H) }); }
  const lw = take(H * H); const lb = take(H);
  if (p !== all.length) throw new Error('Stimm-Modell beschädigt');
  return { layers, lw, lb };
}

const sigm = (x) => 1 / (1 + Math.exp(-x));
// One partial (160 frames × 40 mels) → normalised 256-d embedding.
function embedPartial(model, mel, frameStart) {
  let x = new Float32Array(PARTIAL * N_MELS);
  for (let t = 0; t < PARTIAL; t++) for (let m = 0; m < N_MELS; m++) x[t * N_MELS + m] = mel.data[(frameStart + t) * N_MELS + m] || 0;
  let h = null;
  for (const { inp, wih, whh, b } of model.layers) {
    const seq = new Float32Array(PARTIAL * H); h = new Float32Array(H); const c = new Float32Array(H); const g = new Float32Array(4 * H);
    for (let t = 0; t < PARTIAL; t++) {
      const xo = t * inp;
      for (let r = 0; r < 4 * H; r++) {
        let s = b[r]; const wi = r * inp; const wh = r * H;
        for (let i = 0; i < inp; i++) s += wih[wi + i] * x[xo + i];
        for (let i = 0; i < H; i++) s += whh[wh + i] * h[i];
        g[r] = s;
      }
      // PyTorch gate order: input, forget, cell, output
      for (let j = 0; j < H; j++) {
        const ig = sigm(g[j]); const fg = sigm(g[H + j]); const cg = Math.tanh(g[2 * H + j]); const og = sigm(g[3 * H + j]);
        c[j] = fg * c[j] + ig * cg; h[j] = og * Math.tanh(c[j]); seq[t * H + j] = h[j];
      }
    }
    x = seq;
  }
  const e = new Float32Array(H); let norm = 0;
  for (let r = 0; r < H; r++) { let s = model.lb[r]; const o = r * H; for (let i = 0; i < H; i++) s += model.lw[o + i] * h[i]; e[r] = Math.max(0, s); norm += e[r] * e[r]; }
  norm = Math.sqrt(norm) || 1; for (let r = 0; r < H; r++) e[r] /= norm;
  return e;
}

// Utterance (Float32 16 kHz) → voice print, like Resemblyzer embed_utterance (rate 1.3, min coverage 0.75).
export function embedUtterance(model, wavIn, { maxPartials = 8 } = {}) {
  let wav = wavIn;
  const nFrames = Math.ceil((wav.length + 1) / HOP); const step = Math.round(SR / 1.3 / HOP);
  let slices = []; for (let i = 0; i < Math.max(1, nFrames - PARTIAL + step + 1); i += step) slices.push(i);
  const last = slices[slices.length - 1]; const cov = (wav.length - last * HOP) / (PARTIAL * HOP);
  if (cov < 0.75 && slices.length > 1) slices = slices.slice(0, -1);
  slices = slices.slice(0, maxPartials);
  const need = (slices[slices.length - 1] + PARTIAL) * HOP;
  if (need >= wav.length) { const w = new Float32Array(need); w.set(wav); wav = w; }
  const mel = melSpectrogram(wav);
  const sum = new Float32Array(H);
  for (const s of slices) { const e = embedPartial(model, mel, s); for (let i = 0; i < H; i++) sum[i] += e[i]; }
  return normalise(sum);
}

export function normalise(v) { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; return Float32Array.from(v, (x) => x / n); }
export function similarity(a, b) { let s = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) s += a[i] * b[i]; return s; }
export function averagePrints(prints) { const sum = new Float32Array(H); for (const p of prints) for (let i = 0; i < H; i++) sum[i] += p[i]; return normalise(sum); }

// --- preprocessing for live microphone audio (same steps for enrolment and checks) ---
// Resample Int16/Float audio at `rate` to 16 kHz Float32 (box low-pass + linear interpolation).
export function to16k(samples, rate) {
  const src = samples instanceof Float32Array ? samples : Float32Array.from(samples, (s) => s / 32768);
  if (rate === SR) return src;
  const ratio = rate / SR; const half = Math.max(1, Math.round(ratio / 2));
  const out = new Float32Array(Math.floor(src.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio; const c = Math.floor(pos); let s = 0; let n = 0;
    for (let j = c - half + 1; j <= c + half; j++) if (j >= 0 && j < src.length) { s += src[j]; n += 1; }
    out[i] = n ? s / n : 0;
  }
  return out;
}

// Keeps only the voiced parts (30 ms energy frames, short gaps kept) and normalises the volume.
export function voiced(wav) {
  const win = 480; const n = Math.floor(wav.length / win); if (!n) return { wav, seconds: 0 };
  const energy = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < win; j++) { const v = wav[i * win + j]; s += v * v; } energy[i] = Math.sqrt(s / win); }
  const sorted = Float32Array.from(energy).sort(); const floor = sorted[Math.floor(n * 0.1)] || 0; const peak = sorted[Math.floor(n * 0.95)] || 0;
  const thr = Math.max(0.004, floor * 2.5, peak * 0.08);
  const flags = Array.from(energy, (e) => e > thr);
  // close gaps up to 6 frames (≈180 ms), like the VAD smoothing in Resemblyzer
  for (let i = 0; i < n; i++) if (!flags[i]) { let j = i; while (j < n && !flags[j]) j++; if (i > 0 && j < n && j - i <= 6) for (let k = i; k < j; k++) flags[k] = true; i = j; }
  const keep = flags.filter(Boolean).length; const out = new Float32Array(keep * win); let o = 0;
  for (let i = 0; i < n; i++) if (flags[i]) { out.set(wav.subarray(i * win, (i + 1) * win), o); o += win; }
  // volume normalisation to -30 dBFS (increase only)
  let rms = 0; for (const v of out) rms += v * v; rms = Math.sqrt(rms / (out.length || 1));
  const gain = rms > 0 ? Math.max(1, 10 ** (-30 / 20) / rms) : 1;
  if (gain > 1) for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, out[i] * gain));
  return { wav: out, seconds: out.length / SR };
}
