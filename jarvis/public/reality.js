// JARVIS DIGITAL REALITY – Jarvis' own explorable 3D world (Three.js, the same
// engine the 3D studio and the memory palace already use).
// Opening: screen dims → reactor spins up → portal opens → camera flies through.
// World: universe with stars and nebula, floating platform with holograms,
// a city below that can be switched on, a big portal plus three small portals,
// data crystals, particles, real lights and shadows.
// Controls: WASD + mouse (PC), joystick + swipe + pinch (iPhone), click/tap objects.
// Voice: tool "digital_reality" → actions portal / stadt / umgebung / zurueck.

const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
let deps = { toast: () => {} };
let world = null;
let THREE = null;

const ENVS = [
  { key: 'cyber', name: 'CYBER-NEXUS', sky: ['#01030b', '#041833', '#0a3a6b'], neb: ['#1ec8ff', '#2b6bff'], fog: 0x030a18, accent: 0x38e1ff, accent2: 0x2b6bff, sun: 0x9fdcff },
  { key: 'aurora', name: 'AURORA-FELD', sky: ['#010806', '#032318', '#0a4a3a'], neb: ['#3dffb5', '#1ad2c8'], fog: 0x02120d, accent: 0x3dffc8, accent2: 0x1ad2ff, sun: 0xb8ffe6 },
  { key: 'nebula', name: 'NEBEL-SEKTOR', sky: ['#05010b', '#1a0633', '#3d0d66'], neb: ['#b45cff', '#ff4fd8'], fog: 0x0c0418, accent: 0xb87cff, accent2: 0x38e1ff, sun: 0xe0c8ff },
  { key: 'solar', name: 'SOLAR-KERN', sky: ['#0b0401', '#331204', '#6b2a0a'], neb: ['#ffb347', '#ff5e3a'], fog: 0x180903, accent: 0xffc06b, accent2: 0x38e1ff, sun: 0xffe0b0 }
];

// --- sound ------------------------------------------------------------------------------
let audio = null;
function ac() { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); return audio; }
function tone(f, dur, type = 'sine', vol = 0.1, delay = 0, to = f) {
  try { const a = ac(); const t = a.currentTime + delay; const o = a.createOscillator(); const g = a.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05); } catch { /* no audio */ }
}
function drone() {
  try {
    const a = ac(); const g = a.createGain(); g.gain.value = 0; g.connect(a.destination);
    const oscs = [55, 82.5, 110.2].map((f, i) => { const o = a.createOscillator(); o.type = i ? 'sine' : 'triangle'; o.frequency.value = f; const lfo = a.createOscillator(); const lg = a.createGain(); lfo.frequency.value = 0.07 + i * 0.05; lg.gain.value = 1.5; lfo.connect(lg).connect(o.frequency); o.connect(g); o.start(); lfo.start(); return [o, lfo]; });
    g.gain.linearRampToValueAtTime(0.05, a.currentTime + 3);
    return () => { try { g.gain.linearRampToValueAtTime(0, a.currentTime + 1); oscs.forEach(([o, l]) => { o.stop(a.currentTime + 1.1); l.stop(a.currentTime + 1.1); }); } catch { /* ignore */ } };
  } catch { return () => {}; }
}

// --- canvas textures -------------------------------------------------------------------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function drawSky(ctx, w, h, env) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, env.sky[0]); g.addColorStop(0.55, env.sky[1]); g.addColorStop(1, env.sky[2]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  let seed = 3;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 26; i += 1) {
    const x = rnd() * w; const y = h * (0.15 + rnd() * 0.55); const r = 60 + rnd() * 260;
    const n = ctx.createRadialGradient(x, y, 0, x, y, r);
    const col = env.neb[i % 2];
    n.addColorStop(0, `${col}55`); n.addColorStop(0.5, `${col}18`); n.addColorStop(1, `${col}00`);
    ctx.fillStyle = n; ctx.beginPath(); ctx.ellipse(x, y, r * 1.8, r, rnd() * 3, 0, Math.PI * 2); ctx.fill();
  }
}
function gridTex(color) {
  return canvasTex(1024, 1024, (ctx, w) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, w);
    ctx.strokeStyle = color; ctx.globalAlpha = 0.35; ctx.lineWidth = 2;
    for (let i = 0; i <= 32; i += 1) { const p = (i / 32) * w; ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, w); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(w, p); ctx.stroke(); }
    ctx.globalAlpha = 0.9; ctx.lineWidth = 5;
    for (const r of [0.18, 0.32, 0.47]) { ctx.beginPath(); ctx.arc(w / 2, w / 2, r * w, 0, Math.PI * 2); ctx.stroke(); }
    ctx.lineWidth = 3; ctx.setLineDash([30, 20]);
    ctx.beginPath(); ctx.arc(w / 2, w / 2, 0.4 * w, 0, Math.PI * 2); ctx.stroke();
  });
}
function windowsTex() {
  return canvasTex(256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    for (let y = 8; y < h; y += 14) for (let x = 6; x < w; x += 12) {
      if (Math.random() < 0.45) continue;
      const v = 120 + Math.random() * 135;
      ctx.fillStyle = Math.random() < 0.15 ? `rgb(${v},${v * 0.8},${v * 0.5})` : `rgb(${v * 0.5},${v * 0.85},${v})`;
      ctx.fillRect(x, y, 6, 7);
    }
  });
}
function panelTex(title, lines) {
  return canvasTex(512, 320, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(10,40,70,0.55)'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#7ff3ff'; ctx.lineWidth = 4; ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = '#bff9ff'; ctx.font = '900 34px Inter, sans-serif'; ctx.fillText(title, 26, 56);
    ctx.font = '500 22px Inter, sans-serif'; ctx.fillStyle = '#7fdcff';
    lines.forEach((l, i) => ctx.fillText(l, 26, 100 + i * 34));
    ctx.strokeStyle = '#38e1ff'; ctx.lineWidth = 3; ctx.beginPath();
    for (let x = 0; x <= 200; x += 10) ctx.lineTo(w - 230 + x, 250 - Math.abs(Math.sin(x / 23)) * 70 - x * 0.2);
    ctx.stroke();
  });
}

// --- world construction ---------------------------------------------------------------
function build(canvas) {
  const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 760;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const env = ENVS[0];
  scene.fog = new THREE.FogExp2(env.fog, 0.0042);
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 2400);
  camera.position.set(0, 40, 260);

  const W = { renderer, scene, camera, mobile, env: 0, objects: [], interactive: [], anim: [], cityOn: false, portalPower: 0, portalTarget: 0, t0: performance.now() };

  // sky + stars
  const skyTex = canvasTex(2048, 1024, (ctx, w, h) => drawSky(ctx, w, h, env));
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 48, 24), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
  scene.add(sky);
  W.sky = sky; W.skyTex = skyTex;
  const starCount = mobile ? 2500 : 6000;
  const sp = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) { const v = new THREE.Vector3().randomDirection().multiplyScalar(900 + Math.random() * 250); sp.set([v.x, Math.abs(v.y) * 0.9 + 20, v.z], i * 3); }
  const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.9, fog: false }));
  scene.add(stars); W.stars = stars;

  // lights (real lighting + shadows)
  const hemi = new THREE.HemisphereLight(0x8fd8ff, 0x050a18, 0.55); scene.add(hemi); W.hemi = hemi;
  const sun = new THREE.DirectionalLight(env.sun, 2.2);
  sun.position.set(40, 80, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 220 });
  sun.shadow.bias = -0.0005;
  scene.add(sun); W.sun = sun;
  const core = new THREE.PointLight(env.accent, 60, 70, 1.6); core.position.set(0, 8, 0); scene.add(core); W.coreLight = core;

  // floating platform
  const platform = new THREE.Group(); scene.add(platform); W.platform = platform;
  const metal = new THREE.MeshStandardMaterial({ color: 0x0b1626, metalness: 0.85, roughness: 0.32 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(30, 24, 3, 96, 1), metal);
  base.receiveShadow = true; base.castShadow = true; platform.add(base);
  const deckTex = gridTex('#38e1ff');
  const deck = new THREE.Mesh(new THREE.CircleGeometry(29.6, 96), new THREE.MeshStandardMaterial({ color: 0x0a1424, metalness: 0.6, roughness: 0.4, emissive: env.accent, emissiveMap: deckTex, emissiveIntensity: 0.9 }));
  deck.rotation.x = -Math.PI / 2; deck.position.y = 1.52; deck.receiveShadow = true; platform.add(deck); W.deck = deck;
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: env.accent, emissiveIntensity: 2.4 });
  const edge = new THREE.Mesh(new THREE.TorusGeometry(30, 0.28, 12, 128), edgeMat); edge.rotation.x = Math.PI / 2; edge.position.y = 1.5; platform.add(edge); W.edgeMat = edgeMat;
  const under = new THREE.Mesh(new THREE.TorusGeometry(20, 0.6, 12, 96), edgeMat); under.rotation.x = Math.PI / 2; under.position.y = -1.6; platform.add(under);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const glow = new THREE.Mesh(new THREE.ConeGeometry(2.2, 9, 24, 1, true), new THREE.MeshBasicMaterial({ color: env.accent, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    glow.position.set(Math.cos(a) * 18, -6.5, Math.sin(a) * 18); glow.rotation.x = Math.PI; platform.add(glow); W.anim.push((t) => { glow.material.opacity = 0.14 + Math.sin(t * 6 + i) * 0.05; });
  }

  // central hologram: wireframe globe with rings
  const holo = new THREE.Group(); holo.position.set(0, 8, 0); platform.add(holo);
  const holoMat = new THREE.MeshBasicMaterial({ color: env.accent, wireframe: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending });
  const globe = new THREE.Mesh(new THREE.IcosahedronGeometry(3.2, 3), holoMat); holo.add(globe);
  const ringMat = new THREE.MeshBasicMaterial({ color: env.accent, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const rings = [5, 6.2, 7.4].map((r, i) => { const m = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.12, 96), ringMat); m.rotation.x = Math.PI / 2 + i * 0.4; holo.add(m); return m; });
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2, 4, 32), metal); pillar.position.y = 3.5; pillar.castShadow = true; pillar.receiveShadow = true; platform.add(pillar);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 1.2, 6, 32, 1, true), new THREE.MeshBasicMaterial({ color: env.accent, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); beam.position.y = 8; platform.add(beam);
  W.holoMats = [holoMat, ringMat, beam.material];
  W.anim.push((t) => { globe.rotation.y = t * 0.3; globe.rotation.x = Math.sin(t * 0.2) * 0.2; rings.forEach((r, i) => { r.rotation.z = t * (0.3 + i * 0.25) * (i % 2 ? -1 : 1); }); holo.position.y = 8 + Math.sin(t * 1.2) * 0.3; });
  W.interactive.push({ mesh: globe, name: 'Holo-Kern', info: 'Jarvis-Kern · alle Systeme online', act: () => { pulse(globe, 1.6); tone(523, 0.4, 'triangle', 0.1); tone(784, 0.5, 'triangle', 0.08, 0.1); } });

  // holographic panels
  const panels = [
    ['SYSTEMSTATUS', ['Realität: stabil', 'Energie: 98 %', 'Sektor: Nexus']],
    ['DATENSTROM', ['Partikel aktiv', 'Portale: 4', 'Stadt: Standby']],
    ['NAVIGATION', ['WASD / Joystick', 'Maus / Wischen: Umsehen', 'Klicken: Interagieren']]
  ];
  panels.forEach(([title, lines], i) => {
    const a = Math.PI * 0.75 + i * 0.5;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 4.4), new THREE.MeshBasicMaterial({ map: panelTex(title, lines), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    m.position.set(Math.cos(a) * 14, 6.5, Math.sin(a) * 14); m.lookAt(0, 6.5, 0); platform.add(m);
    W.anim.push((t) => { m.position.y = 6.5 + Math.sin(t * 0.9 + i) * 0.35; });
    W.interactive.push({ mesh: m, name: title, info: lines.join(' · '), act: () => { pulse(m, 1.25); tone(880, 0.15, 'square', 0.05); } });
  });

  // data crystals
  const crystalNames = ['Datenkern · Erinnerungen', 'Datenkern · Projekte', 'Datenkern · Wissen', 'Datenkern · Zukunft'];
  crystalNames.forEach((name, i) => {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const mat = new THREE.MeshPhysicalMaterial({ color: 0x0a2a44, emissive: env.accent2, emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.1, transmission: 0.25, thickness: 1, clearcoat: 1 });
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(1.3, 0), mat); c.castShadow = true;
    const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 1.2, 6), metal); holder.castShadow = true; holder.receiveShadow = true;
    holder.position.set(Math.cos(a) * 22, 2.1, Math.sin(a) * 22); platform.add(holder);
    c.position.set(Math.cos(a) * 22, 4.6, Math.sin(a) * 22); c.scale.y = 1.6; platform.add(c);
    let spin = 0.6;
    W.anim.push((t, dt) => { spin += (0.6 - spin) * dt; c.rotation.y += spin * dt; c.position.y = 4.6 + Math.sin(t * 1.5 + i) * 0.4; });
    W.interactive.push({ mesh: c, name, info: 'Aktiviert – Daten werden synchronisiert', act: () => { spin = 14; mat.emissiveIntensity = 4; setTimeout(() => { mat.emissiveIntensity = 0.9; }, 700); burst(c.getWorldPosition(new THREE.Vector3())); tone(660, 0.2, 'triangle', 0.1); tone(990, 0.3, 'triangle', 0.08, 0.08); } });
    W.crystals = (W.crystals || []).concat(mat);
  });

  // big portal with animated shader
  const portalUniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color(env.accent) }, uPower: { value: 0.15 } };
  const portalMat = new THREE.ShaderMaterial({
    uniforms: portalUniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform float uPower; varying vec2 vUv;
      void main(){ vec2 p = vUv*2.0-1.0; float r = length(p); float a = atan(p.y,p.x);
        float swirl = sin(a*7.0 + r*14.0 - uTime*(2.0+uPower*4.0))*0.5+0.5;
        float swirl2 = sin(a*3.0 - r*9.0 + uTime*1.5)*0.5+0.5;
        float core = smoothstep(1.0, 0.0, r);
        vec3 col = uColor*(0.35+swirl*0.5+swirl2*0.3)*core*(0.4+uPower*1.4) + vec3(1.0)*pow(core, 5.0)*uPower*1.2;
        float alpha = clamp(core*(0.35+uPower*0.65), 0.0, 1.0) * smoothstep(1.02, 0.96, r);
        gl_FragColor = vec4(col, alpha); }`
  });
  const portal = new THREE.Group(); portal.position.set(0, 10.5, -24); platform.add(portal);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(8, 0.7, 24, 128), new THREE.MeshStandardMaterial({ color: 0x0d1a2c, metalness: 0.9, roughness: 0.25, emissive: env.accent, emissiveIntensity: 0.6 }));
  frame.castShadow = true; portal.add(frame); W.portalFrame = frame;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(7.6, 96), portalMat); portal.add(disc);
  const portalLight = new THREE.PointLight(env.accent, 20, 50, 1.6); portalLight.position.set(0, 0, 4); portal.add(portalLight);
  const fstand = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), metal); fstand.position.set(0, -9.4, 0); fstand.castShadow = true; portal.add(fstand);
  W.portal = { group: portal, uniforms: portalUniforms, light: portalLight, disc };
  W.interactive.push({ mesh: disc, name: 'Haupt-Portal', info: 'Klicken: öffnen · nochmal: betreten', act: () => (W.portalTarget > 0.5 ? enterPortal() : openPortal()) });
  W.interactive.push({ mesh: frame, name: 'Haupt-Portal', info: 'Klicken: öffnen · nochmal: betreten', act: () => (W.portalTarget > 0.5 ? enterPortal() : openPortal()) });

  // three small portals → environments
  [1, 2, 3].forEach((envIndex, i) => {
    const a = Math.PI * 0.15 + i * 0.35;
    const g = new THREE.Group(); g.position.set(Math.cos(a) * 26, 4.6, Math.sin(a) * 26); g.lookAt(0, 4.6, 0); platform.add(g);
    const u = { uTime: portalUniforms.uTime, uColor: { value: new THREE.Color(ENVS[envIndex].accent) }, uPower: { value: 0.55 } };
    const m = new THREE.Mesh(new THREE.CircleGeometry(2.6, 64), portalMat.clone()); m.material.uniforms = u; g.add(m);
    const f = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.25, 12, 64), new THREE.MeshStandardMaterial({ color: 0x0d1a2c, metalness: 0.9, roughness: 0.3, emissive: ENVS[envIndex].accent, emissiveIntensity: 1.4 })); f.castShadow = true; g.add(f);
    W.interactive.push({ mesh: m, name: `Portal · ${ENVS[envIndex].name}`, info: 'Klicken: Umgebung wechseln', act: () => travel(envIndex) });
  });

  // city below the platform
  const cityCount = mobile ? 220 : 520;
  const cityMat = new THREE.MeshStandardMaterial({ color: 0x070d18, metalness: 0.4, roughness: 0.6, emissive: 0x9fe8ff, emissiveMap: windowsTex(), emissiveIntensity: 0.12 });
  const city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), cityMat, cityCount);
  const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const tallest = [];
  for (let i = 0; i < cityCount; i += 1) {
    const a = Math.random() * Math.PI * 2; const r = 90 + Math.random() * 220;
    const h = 12 + Math.random() ** 2 * 110 * (1 - (r - 90) / 330); const w = 5 + Math.random() * 10;
    const pos = new THREE.Vector3(Math.cos(a) * r, -70, Math.sin(a) * r);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
    m4.compose(pos, q, new THREE.Vector3(w, h, w)); city.setMatrixAt(i, m4);
    if (h > 70) tallest.push(pos.clone().setY(-70 + h + 1));
  }
  scene.add(city); W.cityMat = cityMat;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(340, 64), new THREE.MeshStandardMaterial({ color: 0x02050b, metalness: 0.2, roughness: 0.9 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -70; scene.add(ground);
  const beaconGeo = new THREE.BufferGeometry(); beaconGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tallest.flatMap((p) => [p.x, p.y, p.z])), 3));
  const beacons = new THREE.Points(beaconGeo, new THREE.PointsMaterial({ color: 0xff3344, size: 5, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); scene.add(beacons); W.beacons = beacons;
  // flying traffic (GPU animated)
  const tc = mobile ? 300 : 800;
  const tpos = new Float32Array(tc * 3); const tseed = new Float32Array(tc);
  for (let i = 0; i < tc; i += 1) { tpos.set([110 + Math.random() * 180, -40 + Math.random() * 45, Math.random() * Math.PI * 2], i * 3); tseed[i] = Math.random(); }
  const tGeo = new THREE.BufferGeometry(); tGeo.setAttribute('position', new THREE.BufferAttribute(tpos, 3)); tGeo.setAttribute('seed', new THREE.BufferAttribute(tseed, 1));
  const trafficU = { uTime: portalUniforms.uTime, uOn: { value: 0 }, uColor: { value: new THREE.Color(0xffd27a) } };
  const traffic = new THREE.Points(tGeo, new THREE.ShaderMaterial({ uniforms: trafficU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute float seed; uniform float uTime; varying float vS; void main(){ float r = position.x; float a = position.z + uTime*(0.05+seed*0.12)*(seed>0.5?1.0:-1.0); vec3 p = vec3(cos(a)*r, position.y, sin(a)*r); vS = seed; vec4 mv = modelViewMatrix*vec4(p,1.0); gl_PointSize = min(7.0, (2.0+seed*3.0)*(160.0/-mv.z)); gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'uniform float uOn; uniform vec3 uColor; varying float vS; void main(){ float d = length(gl_PointCoord-0.5); if(d>0.5) discard; vec3 c = mix(uColor, vec3(0.5,0.9,1.0), step(0.5,vS)); gl_FragColor = vec4(c, (1.0-d*2.0)*uOn); }' }));
  scene.add(traffic); W.trafficU = trafficU;

  // floating particles around the platform
  const pc = mobile ? 900 : 2200;
  const ppos = new Float32Array(pc * 3); const pseed = new Float32Array(pc);
  for (let i = 0; i < pc; i += 1) { const a = Math.random() * Math.PI * 2; const r = Math.random() * 70; ppos.set([Math.cos(a) * r, Math.random() * 60 - 20, Math.sin(a) * r], i * 3); pseed[i] = Math.random(); }
  const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3)); pGeo.setAttribute('seed', new THREE.BufferAttribute(pseed, 1));
  const partU = { uTime: portalUniforms.uTime, uColor: { value: new THREE.Color(env.accent) } };
  scene.add(new THREE.Points(pGeo, new THREE.ShaderMaterial({ uniforms: partU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute float seed; uniform float uTime; varying float vA; void main(){ vec3 p = position; p.y = mod(p.y + uTime*(0.6+seed*1.6) + 20.0, 60.0) - 20.0; p.x += sin(uTime*0.5+seed*30.0)*1.5; vA = 0.4+0.6*sin(uTime*2.0+seed*50.0); vec4 mv = modelViewMatrix*vec4(p,1.0); gl_PointSize = min(6.0, (0.8+seed*1.6)*(90.0/-mv.z)); gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'uniform vec3 uColor; varying float vA; void main(){ float d = length(gl_PointCoord-0.5); if(d>0.5) discard; gl_FragColor = vec4(uColor, (1.0-d*2.0)*vA); }' })));
  W.partU = partU;

  // burst rings for interactions
  W.bursts = [];
  return W;
}

function pulse(mesh, k) {
  const s = mesh.scale.clone();
  mesh.scale.multiplyScalar(k);
  const start = performance.now();
  world.anim.push(function back() { const p = Math.min(1, (performance.now() - start) / 500); mesh.scale.lerpVectors(s.clone().multiplyScalar(k), s, p); if (p >= 1) world.anim.splice(world.anim.indexOf(back), 1); });
}
function burst(pos) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.9, 48), new THREE.MeshBasicMaterial({ color: ENVS[world.env].accent, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
  m.position.copy(pos); m.lookAt(world.camera.position); world.scene.add(m);
  world.bursts.push({ m, t: performance.now() });
}

// --- actions (also used by voice) ------------------------------------------------------------
function hudMsg(text) {
  const box = world?.ui.querySelector('.dr-msg');
  if (!box) return;
  box.textContent = text;
  box.classList.remove('show'); void box.offsetWidth; box.classList.add('show');
}
function openPortal() {
  if (!world) return;
  world.portalTarget = 1;
  tone(120, 1.6, 'sawtooth', 0.08, 0, 600); tone(900, 1.2, 'sine', 0.06, 0.3, 1500);
  hudMsg('PORTAL GEÖFFNET · nochmal klicken zum Betreten');
}
function enterPortal() { travel((world.env + 1) % ENVS.length, { through: world.portal.group }); }
function toggleCity(on = !world.cityOn) {
  world.cityOn = on;
  tone(on ? 220 : 440, 0.9, 'triangle', 0.08, 0, on ? 880 : 110);
  hudMsg(on ? 'STADT AKTIVIERT · Lichter, Verkehr, Signale' : 'STADT IM STANDBY');
}
function travel(index, { through = null } = {}) {
  if (!world || world.traveling) return;
  world.traveling = true;
  const cam = world.camera;
  const from = cam.position.clone();
  const target = through ? through.getWorldPosition(new THREE.Vector3()) : cam.position.clone().add(new THREE.Vector3(0, 0, -30).applyQuaternion(cam.quaternion));
  const start = performance.now();
  world.ui.classList.add('warp');
  tone(80, 1.6, 'sawtooth', 0.12, 0, 1200); tone(2000, 1.2, 'sine', 0.05, 0.4, 300);
  world.flight = (now) => {
    const k = Math.min(1, (now - start) / 1100);
    cam.position.lerpVectors(from, target, k * k);
    cam.fov = 70 + k * 40; cam.updateProjectionMatrix();
    if (k >= 1) {
      world.flight = null;
      setEnv(index);
      cam.position.set(0, 9, 42); world.yaw = 0; world.pitch = -0.08; cam.fov = 70; cam.updateProjectionMatrix();
      world.portalTarget = 0;
      setTimeout(() => { world && world.ui.classList.remove('warp'); world && (world.traveling = false); }, 350);
      hudMsg(`UMGEBUNG: ${ENVS[index].name}`);
    }
  };
}
function setEnv(index) {
  const env = ENVS[index];
  world.env = index;
  const ctx = world.skyTex.image.getContext('2d');
  drawSky(ctx, world.skyTex.image.width, world.skyTex.image.height, env);
  world.skyTex.needsUpdate = true;
  world.scene.fog.color.setHex(env.fog);
  world.sun.color.setHex(env.sun);
  [world.coreLight, world.portal.light].forEach((l) => l.color.setHex(env.accent));
  world.deck.material.emissive.setHex(env.accent);
  world.edgeMat.emissive.setHex(env.accent);
  world.portalFrame.material.emissive.setHex(env.accent);
  world.portal.uniforms.uColor.value.setHex(env.accent);
  world.partU.uColor.value.setHex(env.accent);
  world.holoMats.forEach((m) => m.color.setHex(env.accent));
  world.crystals.forEach((m) => m.emissive.setHex(env.accent2));
  const label = world.ui.querySelector('.dr-env');
  if (label) label.textContent = env.name;
}

// --- controls ---------------------------------------------------------------------------------
function setupControls(W, canvas, ui) {
  W.keys = new Set(); W.yaw = 0; W.pitch = -0.12; W.vel = new THREE.Vector3(); W.move = { x: 0, y: 0 };
  const onKey = (e) => {
    if (e.target.closest?.('input, textarea')) return;
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'q', 'e', ' ', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { e.preventDefault(); if (e.type === 'keydown') W.keys.add(k); else W.keys.delete(k); }
    if (e.type === 'keydown' && k === 'escape') closeReality();
  };
  addEventListener('keydown', onKey); addEventListener('keyup', onKey);
  // mouse look (drag) + click to interact
  let drag = null;
  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  const pick = (x, y) => { ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, W.camera); const hit = ray.intersectObjects(W.interactive.map((o) => o.mesh), false)[0]; return hit ? W.interactive.find((o) => o.mesh === hit.object) : null; };
  const label = ui.querySelector('.dr-label');
  canvas.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') return; drag = { x: e.clientX, y: e.clientY, moved: 0 }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    if (drag) { const dx = e.clientX - drag.x; const dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); W.yaw -= dx * 0.0042; W.pitch = Math.max(-1.3, Math.min(1.3, W.pitch - dy * 0.0042)); drag.x = e.clientX; drag.y = e.clientY; }
    const o = pick(e.clientX, e.clientY);
    canvas.style.cursor = o ? 'pointer' : drag ? 'grabbing' : 'grab';
    showLabel(label, o, e.clientX, e.clientY);
  });
  canvas.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') return; if (drag && drag.moved < 6) pick(e.clientX, e.clientY)?.act(); drag = null; });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); W.camera.fov = Math.max(30, Math.min(95, W.camera.fov + e.deltaY * 0.03)); W.camera.updateProjectionMatrix(); }, { passive: false });
  // touch: look by swiping, pinch to zoom, tap to interact
  const touches = new Map(); let pinch = null; let tap = null;
  canvas.addEventListener('touchstart', (e) => { for (const t of e.changedTouches) touches.set(t.identifier, { x: t.clientX, y: t.clientY }); if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), fov: W.camera.fov }; } tap = touches.size === 1 ? { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY, t: performance.now(), moved: 0 } : null; }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const prev = touches.get(t.identifier); if (!prev) continue;
      if (touches.size === 1) { const dx = t.clientX - prev.x; const dy = t.clientY - prev.y; W.yaw -= dx * 0.006; W.pitch = Math.max(-1.3, Math.min(1.3, W.pitch - dy * 0.006)); if (tap) tap.moved += Math.abs(dx) + Math.abs(dy); }
      touches.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
    if (pinch && touches.size === 2) { const [a, b] = [...touches.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); W.camera.fov = Math.max(30, Math.min(95, pinch.fov * (pinch.d / d))); W.camera.updateProjectionMatrix(); }
  }, { passive: false });
  canvas.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) touches.delete(t.identifier);
    if (touches.size < 2) pinch = null;
    if (tap && tap.moved < 10 && performance.now() - tap.t < 400) { const o = pick(tap.x, tap.y); if (o) { o.act(); showLabel(label, o, tap.x, tap.y); setTimeout(() => showLabel(label, null), 1600); } }
    tap = null;
  });
  // virtual joystick (touch devices)
  const stick = ui.querySelector('.dr-stick'); const knob = stick.querySelector('i');
  let stickId = null; let center = null;
  const setStick = (x, y) => { const dx = x - center.x; const dy = y - center.y; const r = Math.min(46, Math.hypot(dx, dy)); const a = Math.atan2(dy, dx); knob.style.transform = `translate(${Math.cos(a) * r}px, ${Math.sin(a) * r}px)`; W.move = { x: (Math.cos(a) * r) / 46, y: (Math.sin(a) * r) / 46 }; };
  stick.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; stickId = t.identifier; const r = stick.getBoundingClientRect(); center = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; setStick(t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
  stick.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) if (t.identifier === stickId) setStick(t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
  const endStick = (e) => { for (const t of e.changedTouches) if (t.identifier === stickId) { stickId = null; W.move = { x: 0, y: 0 }; knob.style.transform = ''; } };
  stick.addEventListener('touchend', endStick); stick.addEventListener('touchcancel', endStick);
  ui.querySelectorAll('[data-fly]').forEach((b) => {
    const dir = b.dataset.fly;
    const on = (e) => { e.preventDefault(); W.keys.add(dir === 'up' ? ' ' : 'shift'); };
    const off = () => W.keys.delete(dir === 'up' ? ' ' : 'shift');
    b.addEventListener('touchstart', on, { passive: false }); b.addEventListener('touchend', off); b.addEventListener('mousedown', on); b.addEventListener('mouseup', off);
  });
  const onResize = () => { W.renderer.setSize(innerWidth, innerHeight, false); W.camera.aspect = innerWidth / innerHeight; W.camera.updateProjectionMatrix(); };
  addEventListener('resize', onResize);
  W.cleanup = () => { removeEventListener('keydown', onKey); removeEventListener('keyup', onKey); removeEventListener('resize', onResize); };
}
function showLabel(label, o, x, y) {
  if (!o) { label.classList.remove('show'); return; }
  label.replaceChildren(el('b', '', o.name), el('small', '', o.info));
  label.style.transform = `translate(${Math.min(innerWidth - 240, x + 18)}px, ${y + 18}px)`;
  label.classList.add('show');
}

// --- main loop ------------------------------------------------------------------------------------
function loop(now) {
  if (!world) return;
  world.raf = requestAnimationFrame(loop);
  if (document.hidden) return;
  const W = world;
  const dt = Math.min(0.05, (now - (W.last || now)) / 1000); W.last = now;
  const t = (now - W.t0) / 1000;
  W.portal.uniforms.uTime.value = t;
  // intro flight from the portal into the world
  if (W.intro) { const k = Math.min(1, (now - W.intro) / 3200); const e = 1 - (1 - k) ** 3; W.camera.position.set(0, 40 - 31 * e, 260 - 218 * e); W.pitch = -0.12 - (1 - e) * 0.1; if (k >= 1) W.intro = 0; }
  if (W.flight) W.flight(now);
  else if (!W.intro) {
    const forward = new THREE.Vector3(-Math.sin(W.yaw), 0, -Math.cos(W.yaw)); const right = new THREE.Vector3(Math.cos(W.yaw), 0, -Math.sin(W.yaw));
    const k = W.keys; const acc = new THREE.Vector3();
    if (k.has('w') || k.has('arrowup')) acc.add(forward); if (k.has('s') || k.has('arrowdown')) acc.sub(forward);
    if (k.has('d') || k.has('arrowright')) acc.add(right); if (k.has('a') || k.has('arrowleft')) acc.sub(right);
    if (k.has('e') || k.has(' ')) acc.y += 1; if (k.has('q') || k.has('shift')) acc.y -= 1;
    acc.addScaledVector(forward, -W.move.y).addScaledVector(right, W.move.x);
    if (acc.lengthSq() > 1) acc.normalize();
    W.vel.lerp(acc.multiplyScalar(22), 1 - Math.exp(-dt * 5));
    W.camera.position.addScaledVector(W.vel, dt);
    const p = W.camera.position; const r = Math.hypot(p.x, p.z);
    if (r > 260) { p.x *= 260 / r; p.z *= 260 / r; }
    p.y = Math.max(-55, Math.min(90, p.y));
    if (r < 29.5 && p.y < 4.2 && p.y > -3) p.y = 4.2; // stand on the platform, not inside it
  }
  W.camera.rotation.set(W.pitch, W.yaw, 0, 'YXZ');
  // portal power, city
  W.portalPower += (W.portalTarget - W.portalPower) * (1 - Math.exp(-dt * 2.5));
  W.portal.uniforms.uPower.value = 0.15 + W.portalPower * 0.85;
  W.portal.light.intensity = 20 + W.portalPower * 140;
  W.portal.group.rotation.z = Math.sin(t * 0.3) * 0.02;
  W.portalFrame.rotation.z += dt * (0.1 + W.portalPower * 1.5);
  const cityK = W.cityOn ? 1 : 0;
  W.cityMat.emissiveIntensity += ((0.12 + cityK * 1.5) - W.cityMat.emissiveIntensity) * (1 - Math.exp(-dt * 1.5));
  W.trafficU.uOn.value += (cityK - W.trafficU.uOn.value) * (1 - Math.exp(-dt * 1.5));
  W.beacons.material.opacity = cityK * (0.5 + 0.5 * Math.sin(t * 4));
  W.platform.position.y = Math.sin(t * 0.6) * 0.4;
  W.stars.rotation.y = t * 0.004;
  W.sky.rotation.y = t * 0.002;
  for (const f of [...W.anim]) f(t, dt);
  for (const b of W.bursts) { const k = (now - b.t) / 700; b.m.scale.setScalar(1 + k * 6); b.m.material.opacity = 1 - k; }
  W.bursts = W.bursts.filter((b) => { if (now - b.t > 700) { W.scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); return false; } return true; });
  W.renderer.render(W.scene, W.camera);
  W.frames = (W.frames || 0) + 1;
}

// --- open / close -----------------------------------------------------------------------------------
export async function openReality() {
  if (world || document.querySelector('.dr-intro')) return;
  document.dispatchEvent(new CustomEvent('jarvis-overlay', { detail: 'reality' }));
  const intro = el('div', 'dr-intro');
  intro.innerHTML = '<div class="dr-intro-reactor"><span class="r1"></span><span class="r2"></span><span class="r3"></span><span class="core"></span></div><div class="dr-portal"></div><p class="dr-intro-text">DIGITALE REALITÄT WIRD INITIALISIERT</p>';
  document.body.append(intro);
  requestAnimationFrame(() => intro.classList.add('dim'));
  tone(60, 2.4, 'sawtooth', 0.1, 0, 220);
  setTimeout(() => { intro.classList.add('spin'); tone(300, 1.4, 'sine', 0.07, 0, 1200); }, 700);
  setTimeout(() => { intro.classList.add('portal'); tone(1200, 1.4, 'sine', 0.06, 0, 200); }, 1900);
  const loading = (async () => {
    THREE = THREE || await import('three');
  })();
  let failed = null;
  try { await Promise.all([loading, new Promise((r) => setTimeout(r, 3000))]); } catch (error) { failed = error; }
  if (failed) {
    intro.querySelector('.dr-intro-text').textContent = 'Die 3D-Engine konnte nicht geladen werden – Internet prüfen.';
    setTimeout(() => { intro.classList.add('out'); setTimeout(() => intro.remove(), 700); }, 2600);
    deps.toast('Digitale Realität: 3D-Engine nicht geladen.', 'error');
    return;
  }
  // build the world behind the portal
  const ui = el('div', 'dr');
  ui.innerHTML = `<canvas class="dr-canvas" aria-label="Digitale Realität"></canvas>
    <div class="dr-hud">
      <div class="dr-top"><p><b>JARVIS</b> · DIGITALE REALITÄT</p><span class="dr-env">${ENVS[0].name}</span></div>
      <div class="dr-cross"></div>
      <div class="dr-menu"><button type="button" data-act="portal">Portal</button><button type="button" data-act="stadt">Stadt</button><button type="button" data-act="umgebung">Umgebung</button><button type="button" class="dr-back" data-act="zurueck">← Zurück zu Jarvis</button></div>
      <p class="dr-help">${matchMedia('(pointer: coarse)').matches ? 'Joystick: bewegen · Wischen: umsehen · Zwei Finger: Zoom · Tippen: interagieren' : 'WASD: bewegen · Leertaste/Shift: hoch/runter · Maus ziehen: umsehen · Rad: Zoom · Klicken: interagieren'}</p>
      <p class="dr-msg"></p>
      <div class="dr-label"></div>
      <div class="dr-stick"><i></i></div>
      <div class="dr-fly"><button type="button" data-fly="up">▲</button><button type="button" data-fly="down">▼</button></div>
    </div>`;
  document.body.append(ui);
  document.body.classList.add('dr-open');
  try {
    world = build(ui.querySelector('canvas'));
  } catch (error) {
    ui.remove(); document.body.classList.remove('dr-open');
    intro.querySelector('.dr-intro-text').textContent = `3D konnte nicht starten: ${error.message}`;
    setTimeout(() => { intro.classList.add('out'); setTimeout(() => intro.remove(), 700); }, 2600);
    return;
  }
  world.ui = ui;
  setupControls(world, ui.querySelector('canvas'), ui);
  ui.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => handleRealityMessage({ action: b.dataset.act, on: b.dataset.act === 'stadt' ? !world?.cityOn : undefined })));
  world.intro = performance.now();
  world.stopDrone = drone();
  world.raf = requestAnimationFrame(loop);
  intro.classList.add('through');
  setTimeout(() => { intro.classList.add('out'); setTimeout(() => intro.remove(), 900); }, 700);
  setTimeout(() => ui.querySelector('.dr-help')?.classList.add('fade'), 9000);
}

export function closeReality() {
  if (!world) return;
  const W = world;
  world = null;
  cancelAnimationFrame(W.raf);
  W.cleanup?.();
  W.stopDrone?.();
  tone(1200, 1, 'sine', 0.07, 0, 120);
  const outro = el('div', 'dr-intro dim portal closing');
  outro.innerHTML = '<div class="dr-portal"></div><p class="dr-intro-text">ZURÜCK ZU JARVIS</p>';
  document.body.append(outro);
  setTimeout(() => {
    W.scene.traverse((o) => { o.geometry?.dispose?.(); const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; mats.forEach((m) => { m.map?.dispose?.(); m.emissiveMap?.dispose?.(); m.dispose?.(); }); });
    W.renderer.dispose();
    W.ui.remove();
    document.body.classList.remove('dr-open');
    outro.classList.add('out');
    setTimeout(() => outro.remove(), 800);
  }, 900);
}
document.addEventListener('jarvis-overlay', (e) => { if (e.detail !== 'reality' && world) closeReality(); });

export function initReality(options) { deps = { ...deps, ...options }; }
export function realityOpen() { return Boolean(world); }
export function realityStats() { return world ? { frames: world.frames || 0, env: ENVS[world.env].key, city: world.cityOn, portal: world.portalTarget, pos: world.camera.position.toArray().map((v) => Math.round(v)) } : null; }
export function handleRealityMessage(message) {
  const a = message.action;
  if (a === 'oeffnen') { openReality(); return; }
  if (a === 'zurueck') { closeReality(); return; }
  if (!world) { openReality().then(() => setTimeout(() => handleRealityMessage(message), 3500)); return; }
  if (a === 'portal') { if (world.portalTarget > 0.5) enterPortal(); else openPortal(); }
  else if (a === 'stadt') toggleCity(message.on !== undefined ? message.on : true);
  else if (a === 'stadt_aus') toggleCity(false);
  else if (a === 'umgebung') travel((world.env + 1) % ENVS.length);
}
