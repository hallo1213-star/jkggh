// Soundtrack for the Video Studio, rendered offline (deterministic): own
// synthesizer music (pad, bass, beat, arpeggio), whooshes/impacts exactly at
// the scene changes, and the voice-over clips placed at their scenes. Music is
// ducked while the voice speaks.
import { timeline } from './video-renderer.js';

const STYLES = {
  epic: { bpm: 84, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], beat: 'boom', arp: false, wave: 'sawtooth', cutoff: 1400 },
  tech: { bpm: 118, chords: [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]], beat: 'four', arp: true, wave: 'sawtooth', cutoff: 2200 },
  chill: { bpm: 78, chords: [[48, 52, 55, 59], [45, 48, 52, 55], [41, 45, 48, 52], [43, 47, 50, 53]], beat: 'soft', arp: true, wave: 'triangle', cutoff: 1200 }
};
const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);
export const VOICE_DELAY = 0.3;

function noiseBuffer(ctx, seconds) {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < data.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; data[i] = seed / 0x3fffffff - 1; }
  return buf;
}

function music(ctx, out, style, total) {
  const st = STYLES[style];
  if (!st) return;
  const beat = 60 / st.bpm;
  const bar = beat * 4;
  const noise = noiseBuffer(ctx, 1);
  for (let t = 0, i = 0; t < total; t += bar, i++) {
    const chord = st.chords[i % st.chords.length];
    // pad
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(st.cutoff * 0.5, t);
    filter.frequency.linearRampToValueAtTime(st.cutoff, t + bar * 0.6);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.09, t + 0.6);
    env.gain.setValueAtTime(0.09, t + bar - 0.4);
    env.gain.linearRampToValueAtTime(0, t + bar + 0.3);
    filter.connect(env).connect(out);
    for (const note of chord) {
      for (const detune of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = st.wave;
        o.frequency.value = freq(note);
        o.detune.value = detune;
        o.connect(filter);
        o.start(t);
        o.stop(t + bar + 0.4);
      }
    }
    // bass on every beat
    for (let b = 0; b < 4; b++) {
      const bt = t + b * beat;
      if (bt >= total) break;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = freq(chord[0] - 12);
      g.gain.setValueAtTime(0.0001, bt);
      g.gain.exponentialRampToValueAtTime(0.22, bt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, bt + beat * 0.9);
      o.connect(g).connect(out);
      o.start(bt);
      o.stop(bt + beat);
      // kick
      if (st.beat === 'four' || (st.beat === 'boom' && b % 2 === 0) || (st.beat === 'soft' && b === 0)) {
        const k = ctx.createOscillator();
        const kg = ctx.createGain();
        k.frequency.setValueAtTime(st.beat === 'boom' ? 90 : 140, bt);
        k.frequency.exponentialRampToValueAtTime(40, bt + 0.25);
        kg.gain.setValueAtTime(st.beat === 'soft' ? 0.3 : 0.55, bt);
        kg.gain.exponentialRampToValueAtTime(0.0001, bt + 0.35);
        k.connect(kg).connect(out);
        k.start(bt);
        k.stop(bt + 0.4);
      }
      // hi-hat off-beat (tech)
      if (st.beat === 'four') {
        const h = ctx.createBufferSource();
        h.buffer = noise;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 7000;
        const hg = ctx.createGain();
        hg.gain.setValueAtTime(0.06, bt + beat / 2);
        hg.gain.exponentialRampToValueAtTime(0.0001, bt + beat / 2 + 0.05);
        h.connect(hp).connect(hg).connect(out);
        h.start(bt + beat / 2, 0, 0.06);
      }
    }
    // arpeggio
    if (st.arp) {
      for (let s = 0; s < 8; s++) {
        const at = t + s * (beat / 2);
        if (at >= total) break;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'square';
        o.frequency.value = freq(chord[s % chord.length] + 12);
        g.gain.setValueAtTime(0.025, at);
        g.gain.exponentialRampToValueAtTime(0.0001, at + beat * 0.4);
        o.connect(g).connect(out);
        o.start(at);
        o.stop(at + beat * 0.45);
      }
    }
  }
}

// Whoosh before and impact on every scene change – the picture and the sound hit together.
function transitions(ctx, out, project) {
  const noise = noiseBuffer(ctx, 1.2);
  const { items } = timeline(project);
  items.slice(1).forEach(({ start }) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(300, Math.max(0, start - 0.7));
    bp.frequency.exponentialRampToValueAtTime(5000, start);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, Math.max(0, start - 0.7));
    g.gain.exponentialRampToValueAtTime(0.18, start - 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
    src.connect(bp).connect(g).connect(out);
    src.start(Math.max(0, start - 0.7), 0, 1);
    const k = ctx.createOscillator();
    const kg = ctx.createGain();
    k.frequency.setValueAtTime(70, start);
    k.frequency.exponentialRampToValueAtTime(30, start + 0.6);
    kg.gain.setValueAtTime(0.35, start);
    kg.gain.exponentialRampToValueAtTime(0.0001, start + 0.8);
    k.connect(kg).connect(out);
    k.start(start);
    k.stop(start + 0.9);
  });
}

export async function buildSoundtrack(project, voices = new Map(), sampleRate = 44100) {
  const { items, total } = timeline(project);
  const length = Math.max(1, Math.ceil((total + 0.2) * sampleRate));
  const ctx = new OfflineAudioContext(2, length, sampleRate);
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const musicBus = ctx.createGain();
  musicBus.connect(master);
  // fade in/out and ducking under the voice
  const base = 0.9;
  musicBus.gain.setValueAtTime(0, 0);
  musicBus.gain.linearRampToValueAtTime(base, 1);
  for (const { scene, start } of items) {
    const voice = voices.get(scene.id);
    if (!voice) continue;
    const vs = start + VOICE_DELAY;
    musicBus.gain.setValueAtTime(base, Math.max(0, vs - 0.25));
    musicBus.gain.linearRampToValueAtTime(base * 0.35, vs);
    musicBus.gain.setValueAtTime(base * 0.35, vs + voice.duration);
    musicBus.gain.linearRampToValueAtTime(base, vs + voice.duration + 0.4);
  }
  master.gain.setValueAtTime(1, Math.max(0, total - 0.8));
  master.gain.linearRampToValueAtTime(0, total);
  if (project.music !== 'none') {
    music(ctx, musicBus, project.music, total);
    transitions(ctx, musicBus, project);
  }
  for (const { scene, start } of items) {
    const voice = voices.get(scene.id);
    if (!voice) continue;
    const src = ctx.createBufferSource();
    src.buffer = voice;
    const g = ctx.createGain();
    g.gain.value = 1.15;
    src.connect(g).connect(master);
    src.start(start + VOICE_DELAY);
  }
  return ctx.startRendering();
}
