// Sound design for the start animation, generated live with Web Audio (no
// files, no external service). Every sound is scheduled on the same timeline
// as the picture: drone → scan beam → reactor power-on → charging whine with
// sparkles → energy impact → interface whoosh + chord → "online" confirmation.
function noiseBuffer(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) d[i] = Math.random() * 2 - 1;
  return buf;
}

export function bootSound(ctx, T, { volume = 0.9 } = {}) {
  const master = ctx.createGain();
  master.gain.value = volume;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  const s = ctx.currentTime + 0.05;
  const nodes = [];
  const track = (n) => { nodes.push(n); return n; };
  const noise = noiseBuffer(ctx, 2.5);

  const osc = (type, f, at, dur) => { const o = track(ctx.createOscillator()); o.type = type; o.frequency.setValueAtTime(f, s + at); o.start(s + at); o.stop(s + at + dur + 0.1); return o; };
  const gain = (at, points) => { const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, s + at); for (const [t, v] of points) g.gain.exponentialRampToValueAtTime(Math.max(0.0001, v), s + t); return g; };
  const noiseSrc = (at, dur) => { const n = track(ctx.createBufferSource()); n.buffer = noise; n.loop = true; n.start(s + at); n.stop(s + at + dur + 0.1); return n; };

  // 1. deep drone under everything
  const droneG = gain(0, [[T.form, 0.10], [T.pulse - 0.1, 0.16], [T.pulse + 0.3, 0.12], [T.end + 1.5, 0.0001]]);
  for (const f of [55, 82.4, 110.1]) { const o = osc(f === 55 ? 'triangle' : 'sine', f, 0, T.end + 1.6); o.connect(droneG); }
  droneG.connect(master);

  // 2. scan beam top → bottom: filtered noise sweeping down + a thin tone
  if (T.form > T.beam) {
    const bd = T.form - T.beam;
    const n = noiseSrc(T.beam, bd);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 6;
    bp.frequency.setValueAtTime(7000, s + T.beam); bp.frequency.exponentialRampToValueAtTime(350, s + T.form);
    const g = gain(T.beam, [[T.beam + 0.08, 0.22], [T.form - 0.1, 0.12], [T.form + 0.1, 0.0001]]);
    n.connect(bp).connect(g).connect(master);
    const o = osc('sine', 3200, T.beam, bd); o.frequency.exponentialRampToValueAtTime(420, s + T.form);
    const og = gain(T.beam, [[T.beam + 0.05, 0.04], [T.form, 0.0001]]);
    o.connect(og).connect(master);
  }

  // 3. reactor power-on: heavy thump + metallic shimmer
  {
    const o = osc('sine', 150, T.form, 0.9); o.frequency.exponentialRampToValueAtTime(36, s + T.form + 0.6);
    o.connect(gain(T.form, [[T.form + 0.01, 0.6], [T.form + 0.9, 0.0001]])).connect(master);
    for (const [f, v] of [[659, 0.07], [988, 0.05], [1480, 0.03]]) {
      const b = osc('sine', f, T.form + 0.02, 1.4);
      b.connect(gain(T.form + 0.02, [[T.form + 0.04, v], [T.form + 1.4, 0.0001]])).connect(master);
    }
  }

  // 4. charging whine (rings spin faster and brighter) + sparkles for the particles
  {
    const a = T.form + 0.15; const b = T.pulse;
    const o = osc('sawtooth', 110, a, b - a + 0.05); o.frequency.exponentialRampToValueAtTime(880, s + b);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 8;
    lp.frequency.setValueAtTime(300, s + a); lp.frequency.exponentialRampToValueAtTime(4200, s + b);
    const trem = ctx.createGain();
    const lfo = osc('sine', 5, a, b - a + 0.05); lfo.frequency.exponentialRampToValueAtTime(26, s + b);
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.5; lfo.connect(lfoG).connect(trem.gain);
    trem.gain.value = 0.5;
    o.connect(lp).connect(trem).connect(gain(a, [[b - 0.05, 0.09], [b + 0.05, 0.0001]])).connect(master);
    for (let i = 0; i < 28; i += 1) {
      const t = T.charge + Math.random() * Math.max(0.1, T.pulse - T.charge - 0.05);
      const sp = osc('sine', 1800 + Math.random() * 2600, t, 0.08);
      sp.connect(gain(t, [[t + 0.005, 0.035], [t + 0.07, 0.0001]])).connect(master);
    }
  }

  // 5. energy impact: rising whoosh into a boom with a sub drop
  {
    const w = noiseSrc(T.pulse - 0.4, 0.45);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass';
    hp.frequency.setValueAtTime(400, s + T.pulse - 0.4); hp.frequency.exponentialRampToValueAtTime(5000, s + T.pulse);
    w.connect(hp).connect(gain(T.pulse - 0.4, [[T.pulse - 0.02, 0.18], [T.pulse + 0.05, 0.0001]])).connect(master);
    const boom = noiseSrc(T.pulse, 1.6);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2200, s + T.pulse); lp.frequency.exponentialRampToValueAtTime(180, s + T.pulse + 1.4);
    boom.connect(lp).connect(gain(T.pulse, [[T.pulse + 0.01, 0.7], [T.pulse + 1.5, 0.0001]])).connect(master);
    const sub = osc('sine', 95, T.pulse, 1.5); sub.frequency.exponentialRampToValueAtTime(27, s + T.pulse + 1.3);
    sub.connect(gain(T.pulse, [[T.pulse + 0.01, 0.75], [T.pulse + 1.5, 0.0001]])).connect(master);
  }

  // 6. interface appears: airy whoosh + soft minor chord
  {
    const a = T.ui + 0.05;
    const n = noiseSrc(a, 1.0);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(700, s + a); bp.frequency.exponentialRampToValueAtTime(3200, s + a + 0.9);
    n.connect(bp).connect(gain(a, [[a + 0.3, 0.08], [a + 1.0, 0.0001]])).connect(master);
    for (const f of [146.8, 220, 293.7, 349.2]) {
      const o = osc('triangle', f, a, 2.6);
      o.connect(gain(a, [[a + 0.35, 0.045], [a + 2.6, 0.0001]])).connect(master);
    }
  }

  // 7. "Alle Systeme sind online." – HUD confirmation
  const confirm = (at) => {
    for (const [f, d] of [[880, 0], [1318.5, 0.13]]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = ctx.createGain(); const t = ctx.currentTime + at + d;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g).connect(comp); o.start(t); o.stop(t + 0.25);
    }
  };
  const confirmAt = Math.max(0, T.end - 1.2 + 0.05);
  let confirmed = false;
  const confirmTimer = setTimeout(() => { confirmed = true; confirm(0); }, confirmAt * 1000);

  return {
    // skip: fade everything out quickly and play the confirmation right away
    stop() {
      clearTimeout(confirmTimer);
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      setTimeout(() => nodes.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } }), 300);
      if (!confirmed) { confirmed = true; confirm(0.05); }
    }
  };
}
