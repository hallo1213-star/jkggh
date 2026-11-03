// "Öffne deine Systeme": the AI core opens (two shells part), holographic
// panels for Jarvis' REAL modules appear around it (data from the server:
// actual functions + live status) and the camera visits them one by one.
// Tap a panel to focus it. Falls back to a 2D grid if 3D is not available.
import { loop } from '../perf.js';

const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
let current = null;
if (typeof document !== 'undefined') document.addEventListener('jarvis-overlay', (e) => { if (e.detail !== 'cae-sys') current?.close(); });

function cardCanvas(m) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 288;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 288); g.addColorStop(0, 'rgba(40, 4, 9, 0.92)'); g.addColorStop(1, 'rgba(10, 1, 3, 0.92)');
  x.fillStyle = g; x.fillRect(0, 0, 512, 288);
  x.strokeStyle = m.online ? '#ff2a3d' : 'rgba(255, 92, 108, 0.45)'; x.lineWidth = 4; x.strokeRect(4, 4, 504, 280);
  x.fillStyle = 'rgba(255, 42, 61, 0.08)'; for (let y = 10; y < 288; y += 8) x.fillRect(8, y, 496, 2);
  x.font = '64px sans-serif'; x.fillText(m.icon || '◆', 26, 92);
  x.fillStyle = '#fff'; x.font = 'bold 38px Inter, Arial, sans-serif'; x.fillText(String(m.title).slice(0, 22), 112, 78);
  x.fillStyle = '#ffd0d4'; x.font = '24px Inter, Arial, sans-serif';
  const words = String(m.detail).split(' '); let line = ''; let y = 150;
  for (const w of words) { if (x.measureText(`${line} ${w}`).width > 450 && line) { x.fillText(line, 28, y); line = w; y += 34; } else line = `${line} ${w}`.trim(); }
  if (line) x.fillText(line, 28, y);
  x.fillStyle = m.online ? '#ff5c6c' : '#6d4a4e'; x.beginPath(); x.arc(470, 250, 12, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#c9a0a5'; x.font = '20px Inter, Arial, sans-serif'; x.fillText(m.online ? 'ONLINE' : 'OFFLINE', 360, 257);
  return c;
}

export const systemsModule = {
  create({ perf }) {
    current?.close();
    document.dispatchEvent(new CustomEvent('jarvis-overlay', { detail: 'cae-sys' }));
    const root = el('div', 'cae-sys');
    const stage = el('div', 'cae-sys-stage');
    const head = el('p', 'cae-sys-head', 'KERN WIRD GEÖFFNET …');
    const caption = el('p', 'cae-sys-cap', '');
    const x = el('button', 'cae-sys-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Systeme schließen');
    root.append(stage, head, caption, x);
    document.body.append(root);
    let stopLoop = () => {}; let three = null; let modules = null; let closed = false;
    const api = {
      close() {
        if (closed) return; closed = true; stopLoop();
        try { three?.renderer.dispose(); three?.scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material) { o.material.map?.dispose?.(); o.material.dispose?.(); } }); } catch { /* ignore */ }
        root.classList.add('out'); setTimeout(() => root.remove(), 500); if (current === api) current = null;
      }
    };
    current = api;
    x.addEventListener('click', () => api.close());

    const fallback = (list) => {
      stage.replaceChildren();
      const grid = el('div', 'cae-sys-grid');
      list.forEach((m, i) => { const card = el('div', `cae-sys-card${m.online ? '' : ' off'}`); card.style.setProperty('--i', i); card.append(el('b', '', `${m.icon} ${m.title}`), el('small', '', m.detail)); grid.append(card); });
      stage.append(grid);
    };

    // 3D scene
    (async () => {
      let THREE;
      try { THREE = await import('three'); } catch { head.textContent = 'SYSTEME'; if (modules) fallback(modules); return; }
      if (closed) return;
      const w = stage.clientWidth || innerWidth; const h = stage.clientHeight || innerHeight;
      const renderer = new THREE.WebGLRenderer({ antialias: perf.antialias, alpha: true, powerPreference: 'low-power' });
      renderer.setPixelRatio(perf.dpr); renderer.setSize(w, h);
      stage.append(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 100);
      // portrait phones: camera further away so the ring and panels fit
      const fitK = () => 1 / Math.min(1, Math.max(0.45, camera.aspect * 1.5));
      camera.position.set(0, 2.6, 10.5 * fitK());
      const look = new THREE.Vector3(0, 0, 0);
      three = { renderer, scene };
      scene.add(new THREE.AmbientLight(0xffffff, 0.6));
      const coreLight = new THREE.PointLight(0xff2a3d, 3, 20); scene.add(coreLight);
      const inner = new THREE.Mesh(new THREE.SphereGeometry(0.75, 32, 24), new THREE.MeshBasicMaterial({ color: 0xff4d5e }));
      const glow = new THREE.Mesh(new THREE.SphereGeometry(1.15, 32, 24), new THREE.MeshBasicMaterial({ color: 0xff2a3d, transparent: true, opacity: 0.18 }));
      scene.add(inner, glow);
      const shellMat = new THREE.MeshBasicMaterial({ color: 0xff5c6c, wireframe: true, transparent: true, opacity: 0.55 });
      const top = new THREE.Mesh(new THREE.SphereGeometry(1.35, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
      const bottom = new THREE.Mesh(new THREE.SphereGeometry(1.35, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), shellMat);
      scene.add(top, bottom);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.012, 6, 128), new THREE.MeshBasicMaterial({ color: 0xff2a3d, transparent: true, opacity: 0.45 }));
      ring.rotation.x = Math.PI / 2; scene.add(ring);
      const panels = []; const panelGroup = new THREE.Group(); scene.add(panelGroup);
      const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
      let opened = 0; let built = 0; let tour = null; let focus = -1; const camTarget = camera.position.clone(); const lookTarget = look.clone();
      const t0 = performance.now();

      function build(list) {
        // portrait phones: smaller ring and panels so everything fits the narrow screen
        const portrait = camera.aspect < 0.8; const radius = portrait ? 2.6 : 4.3; const ps = portrait ? 0.62 : 1;
        ring.geometry.dispose(); ring.geometry = new THREE.TorusGeometry(radius, 0.012, 6, 128);
        list.forEach((m, i) => {
          const a = (i / list.length) * Math.PI * 2 - Math.PI / 2;
          const tex = new THREE.CanvasTexture(cardCanvas(m)); tex.colorSpace = THREE.SRGBColorSpace;
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.24), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, side: THREE.FrontSide }));
          mesh.position.set(Math.cos(a) * radius, 0.15 + (i % 2) * 0.35 * ps, Math.sin(a) * radius);
          mesh.userData = { m, i, born: performance.now() + i * 160, ps };
          panelGroup.add(mesh); panels.push(mesh);
        });
        built = performance.now();
        head.textContent = `JARVIS · ${list.length} SYSTEME`;
        if (perf.tier !== 'minimal') tour = { i: 0, next: built + list.length * 160 + 900 };
      }
      function focusOn(i) {
        const p = panels[i]; if (!p) return;
        focus = i; const dir = p.position.clone().setY(0).normalize();
        camTarget.copy(p.position).addScaledVector(dir, 4.6 * fitK()).setY(p.position.y + 0.7);
        lookTarget.copy(p.position);
        caption.textContent = `${p.userData.m.icon} ${p.userData.m.title} – ${p.userData.m.detail}`;
      }
      function overview() { focus = -1; camTarget.set(0, 2.6, 10.5 * fitK()); lookTarget.set(0, 0, 0); caption.textContent = 'Tippe ein Modul an.'; }
      renderer.domElement.addEventListener('pointerdown', (e) => {
        const r = renderer.domElement.getBoundingClientRect();
        pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(panels)[0];
        tour = null;
        if (hit) focusOn(hit.object.userData.i); else overview();
      });
      const onResize = () => { const W = stage.clientWidth; const H = stage.clientHeight; if (!W || !H) return; renderer.setSize(W, H); camera.aspect = W / H; camera.updateProjectionMatrix(); };
      addEventListener('resize', onResize);
      api.build = build;
      if (modules) build(modules);
      stopLoop = loop((t, dt) => {
        opened = Math.min(1, (t - t0) / 1300);
        const e = 1 - (1 - opened) ** 3;
        top.position.y = e * 1.1; bottom.position.y = -e * 1.1;
        top.rotation.y += dt * 0.5; bottom.rotation.y -= dt * 0.5;
        inner.scale.setScalar(1 + Math.sin(t / 400) * 0.04); glow.scale.setScalar(1.05 + Math.sin(t / 600) * 0.08 + e * 0.15);
        ring.scale.setScalar(0.4 + e * 0.6); ring.material.opacity = 0.45 * e;
        panelGroup.rotation.y += perf.tier === 'minimal' ? 0 : dt * (focus < 0 && !tour ? 0.05 : 0);
        // panels always face the camera → text is never mirrored
        const q = new THREE.Quaternion(); panelGroup.getWorldQuaternion(q); q.invert().multiply(camera.quaternion);
        for (const p of panels) { const k = Math.min(1, Math.max(0, (t - p.userData.born) / 500)); p.material.opacity = k; p.scale.setScalar((0.6 + 0.4 * k) * p.userData.ps); p.quaternion.copy(q); }
        if (tour && t > tour.next) { if (tour.i < panels.length) { focusOn(tour.i); tour.i += 1; tour.next = t + 1500; } else { tour = null; overview(); } }
        // panels rotate with the group → recompute focus target in world space
        if (focus >= 0) { const wp = new THREE.Vector3(); panels[focus].getWorldPosition(wp); const dir = wp.clone().setY(0).normalize(); camTarget.copy(wp).addScaledVector(dir, 4.6 * fitK()).setY(wp.y + 0.7); lookTarget.copy(wp); }
        camera.position.lerp(camTarget, perf.reduced ? 1 : 0.06); look.lerp(lookTarget, perf.reduced ? 1 : 0.08); camera.lookAt(look);
        renderer.render(scene, camera);
      });
      const oldClose = api.close; api.close = () => { removeEventListener('resize', onResize); oldClose(); };
    })().catch(() => { if (modules) fallback(modules); });

    return {
      data(msg) {
        modules = (Array.isArray(msg.modules) ? msg.modules : []).slice(0, 14);
        if (api.build) api.build(modules); else if (!three) setTimeout(() => { if (!three && !closed && !api.build) fallback(modules); }, 4000);
      },
      complete() { if (!modules) { head.textContent = 'SYSTEME'; } },
      fail(info) { head.textContent = `SYSTEME NICHT ERREICHBAR – ${String(info?.reason || '').slice(0, 60)}`; root.classList.add('bad'); setTimeout(api.close, 3500); },
      close: () => api.close()
    };
  }
};
