// Stimm-Schloss: on-device voice print (port of the Resemblyzer encoder).
import { readFileSync } from 'node:fs';
const v = await import('../../public/voice-id.js');
const assert = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };
const tone = (f, sec, amp = 0.3) => Float32Array.from({ length: Math.round(v.SR * sec) }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / v.SR));
// mel spectrogram: frames like librosa (center) and energy in the right band
const mel = v.melSpectrogram(tone(1000, 1));
assert(mel.frames === 101, 'Mel: 101 Frames für 1 s (wie librosa, center=True)');
const mid = Array.from(mel.data.subarray(50 * 40, 51 * 40)); const peak = mid.indexOf(Math.max(...mid));
assert(peak >= 13 && peak <= 17, `Mel: 1 kHz-Ton landet im passenden Band (${peak})`);
// model file loads with the exact parameter count
const model = v.loadWeights(readFileSync(new URL('../../public/voice-encoder.bin', import.meta.url)).buffer.slice(0));
assert(model.layers.length === 3 && model.layers[0].wih.length === 4 * 256 * 40 && model.lb.length === 256, 'Stimm-Modell: 3 LSTM-Schichten, richtige Größen');
// a synthetic "voice": harmonic buzz with a pitch contour
const buzz = (f0, sec) => { const o = new Float32Array(Math.round(v.SR * sec)); let ph = 0; for (let i = 0; i < o.length; i++) { const f = f0 * (1 + 0.08 * Math.sin(i / 3000)); ph += (2 * Math.PI * f) / v.SR; let s = 0; for (let h = 1; h < 12; h++) s += Math.sin(h * ph) / h; o[i] = 0.15 * s * (0.6 + 0.4 * Math.sin(i / 1700)); } return o; };
const a = v.embedUtterance(model, buzz(110, 2.5), { maxPartials: 2 });
const a2 = v.embedUtterance(model, buzz(110, 2.5), { maxPartials: 2 });
const b = v.embedUtterance(model, buzz(240, 2.5), { maxPartials: 2 });
let norm = 0; for (const x of a) norm += x * x;
assert(Math.abs(norm - 1) < 1e-4 && a.every((x) => x >= 0), 'Stimm-Abdruck: normiert, 256 Werte ≥ 0');
assert(v.similarity(a, a2) > 0.9999, 'gleiche Aufnahme → gleicher Abdruck');
assert(v.similarity(a, b) < v.similarity(a, a2), 'andere Stimmlage → geringere Übereinstimmung');
// preprocessing: resampling and voice detection
assert(v.to16k(new Int16Array(48000), 48000).length === 16000 && v.to16k(new Int16Array(44100), 44100).length === 16000, '48/44,1 kHz → 16 kHz');
const withPause = new Float32Array(v.SR * 3); withPause.set(buzz(120, 1), 0); withPause.set(buzz(120, 1), v.SR * 2);
const vv = v.voiced(withPause);
assert(vv.seconds > 1.7 && vv.seconds < 2.3, `Pausen werden entfernt (${vv.seconds.toFixed(2)} s Stimme von 3 s)`);
assert(v.voiced(new Float32Array(v.SR)).seconds < 0.1, 'Stille → keine Stimme');
// the voice gate thresholds stay in a sensible order
const src = readFileSync(new URL('../../public/voice-gate.js', import.meta.url), 'utf8');
const lv = JSON.parse(src.match(/LEVELS = (\{[^}]+\})/)[1].replace(/(\w+):/g, '"$1":'));
assert(lv.locker < lv.normal && lv.normal < lv.streng && lv.normal >= 0.84, `Strenge-Stufen locker < normal < streng (${Object.values(lv).join(' / ')})`);
