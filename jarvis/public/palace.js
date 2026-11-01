// Jarvis Memory Palace: Jarvis' real memory as a holographic 3D network.
// Category hubs, memory nodes around them, topic nodes linking related
// memories (e.g. "Jarvis Studio"), floating particles. Click a node to read,
// edit or delete it; search highlights related memories.
const $ = (id) => document.getElementById(id);
const els = {
  overlay: $('palace-overlay'), view: $('palace-view'), close: $('palace-close'), search: $('palace-search'), panel: $('palace-panel'),
  stats: $('palace-stats'), add: $('palace-add'), loading: $('palace-loading')
};

let THREE = null;
let OrbitControls = null;
let renderer, scene, camera, controls, clock;
let data = { memories: [], categories: {} };
let nodes = []; // { mesh, kind: 'hub'|'memory'|'topic', key, memory, label, base }
let lines = [];
let selected = null;
let highlight = null; // Set of node keys
let notify = () => {};
let labelLayer = null;

const COLORS = { praeferenz: '#5ee7ff', projekt: '#3ba7ff', wissen: '#8ab4ff', aufgabe: '#4dffd2', gespraech: '#a78bfa', entscheidung: '#ffd166', offen: '#ff7aa8' };

async function load() {
  const response = await fetch('/api/memories', { cache: 'no-store' });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || 'Fehler');
  data = json;
}

async function change(body) {
  const response = await fetch('/api/memories', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || 'Fehler');
  data = json;
  build();
}

function hash(text) {
  let h = 2166136261;
  for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}

function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(160,240,255,0.6)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

let glow = null;
function addNode(kind, key, position, color, size, memory = null, labelText = '') {
  const group = new THREE.Group();
  const geometry = kind === 'hub' ? new THREE.IcosahedronGeometry(size, 1) : kind === 'topic' ? new THREE.OctahedronGeometry(size) : new THREE.SphereGeometry(size, 16, 16);
  const material = new THREE.MeshBasicMaterial({ color, wireframe: kind === 'hub', transparent: true, opacity: kind === 'hub' ? 0.9 : 0.95 });
  const mesh = new THREE.Mesh(geometry, material);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, opacity: kind === 'memory' ? 0.55 : 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(size * (kind === 'hub' ? 7 : 5));
  group.add(mesh, halo);
  group.position.copy(position);
  scene.add(group);
  let label = null;
  if (labelText) {
    label = document.createElement('div');
    label.className = `palace-label palace-label-${kind}`;
    label.textContent = labelText;
    labelLayer.append(label);
  }
  const node = { group, mesh, halo, kind, key, memory, label, base: position.clone(), phase: hash(key) * Math.PI * 2, color };
  mesh.userData.node = node;
  nodes.push(node);
  return node;
}

function connect(a, b, color, opacity = 0.35) {
  const geometry = new THREE.BufferGeometry().setFromPoints([a.group.position, b.group.position]);
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  line.userData = { a, b, base: opacity };
  scene.add(line);
  lines.push(line);
}

function clear() {
  for (const n of nodes) {
    scene.remove(n.group);
    n.label?.remove();
  }
  for (const l of lines) scene.remove(l);
  nodes = [];
  lines = [];
}

function build() {
  clear();
  const cats = Object.keys(data.categories);
  const hubs = {};
  cats.forEach((cat, i) => {
    const angle = (i / cats.length) * Math.PI * 2;
    const count = data.memories.filter((m) => m.category === cat).length;
    hubs[cat] = addNode('hub', `hub:${cat}`, new THREE.Vector3(Math.cos(angle) * 46, Math.sin(i * 1.7) * 8, Math.sin(angle) * 46), COLORS[cat], 3.2, null, `${data.categories[cat]} (${count})`);
  });
  const topics = {};
  const topicNames = [...new Set(data.memories.flatMap((m) => m.links || []))];
  topicNames.forEach((name, i) => {
    const angle = (i / Math.max(topicNames.length, 1)) * Math.PI * 2 + 0.4;
    topics[name.toLowerCase()] = addNode('topic', `topic:${name.toLowerCase()}`, new THREE.Vector3(Math.cos(angle) * 18, 14 + Math.sin(i) * 6, Math.sin(angle) * 18), '#e0faff', 1.6, null, name);
  });
  for (const memory of data.memories) {
    const hub = hubs[memory.category] || hubs.wissen;
    const h = hash(memory.id);
    const r = 9 + h * 9;
    const angle = h * Math.PI * 12;
    const pos = hub.base.clone().add(new THREE.Vector3(Math.cos(angle) * r, (hash(`${memory.id}y`) - 0.5) * 16, Math.sin(angle) * r));
    const node = addNode('memory', `mem:${memory.id}`, pos, COLORS[memory.category] || '#8ab4ff', 0.9, memory, '');
    connect(node, hub, COLORS[memory.category] || '#5ee7ff', 0.28);
    for (const link of memory.links || []) if (topics[link.toLowerCase()]) connect(node, topics[link.toLowerCase()], '#bff6ff', 0.45);
  }
  els.stats.textContent = `${data.memories.length} Erinnerungen · ${topicNames.length} Themen · ${cats.length} Bereiche`;
  applyHighlight();
}

function related(node) {
  const keys = new Set([node.key]);
  for (const l of lines) {
    if (l.userData.a === node) keys.add(l.userData.b.key);
    if (l.userData.b === node) keys.add(l.userData.a.key);
  }
  if (node.kind === 'memory') for (const link of node.memory.links || []) for (const n of nodes) if (n.memory?.links?.some((x) => x.toLowerCase() === link.toLowerCase())) keys.add(n.key);
  return keys;
}

function applyHighlight() {
  for (const n of nodes) {
    const on = !highlight || highlight.has(n.key);
    n.mesh.material.opacity = on ? 0.95 : 0.12;
    n.halo.material.opacity = on ? (n.kind === 'memory' ? 0.55 : 0.8) : 0.05;
    if (n.label) n.label.style.opacity = on ? '1' : '0.15';
  }
  for (const l of lines) l.material.opacity = !highlight || (highlight.has(l.userData.a.key) && highlight.has(l.userData.b.key)) ? (highlight ? 0.9 : l.userData.base) : 0.03;
}

function focus(points) {
  if (!points.length) return;
  const center = points.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(points.length);
  const start = controls.target.clone();
  const startCam = camera.position.clone();
  const dir = startCam.clone().sub(start).normalize();
  const endCam = center.clone().add(dir.multiplyScalar(points.length > 1 ? 70 : 32));
  const t0 = performance.now();
  const step = () => {
    const t = Math.min((performance.now() - t0) / 900, 1);
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    controls.target.lerpVectors(start, center, e);
    camera.position.lerpVectors(startCam, endCam, e);
    if (t < 1) requestAnimationFrame(step);
  };
  step();
}

function showPanel(node) {
  selected = node;
  highlight = related(node);
  applyHighlight();
  focus([node.group.position]);
  const panel = els.panel;
  panel.hidden = false;
  panel.replaceChildren();
  const title = document.createElement('h4');
  const body = document.createElement('div');
  if (node.kind !== 'memory') {
    const items = node.kind === 'hub' ? data.memories.filter((m) => `hub:${m.category}` === node.key) : data.memories.filter((m) => (m.links || []).some((l) => `topic:${l.toLowerCase()}` === node.key));
    title.textContent = node.label?.textContent || '';
    body.innerHTML = items.length ? '' : '<p class="muted">Noch keine Erinnerungen hier.</p>';
    for (const m of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'palace-item';
      b.textContent = m.text;
      b.addEventListener('click', () => showPanel(nodes.find((n) => n.memory?.id === m.id)));
      body.append(b);
    }
    panel.append(title, body, closeButton());
    return;
  }
  const m = node.memory;
  title.textContent = data.categories[m.category] || 'Erinnerung';
  const text = Object.assign(document.createElement('textarea'), { value: m.text, rows: 3, maxLength: 200 });
  const cat = document.createElement('select');
  for (const [k, v] of Object.entries(data.categories)) cat.append(new Option(v, k, false, k === m.category));
  const links = Object.assign(document.createElement('input'), { type: 'text', value: (m.links || []).join(', '), placeholder: 'Verknüpfungen, z. B. Jarvis, Jarvis Studio' });
  const when = document.createElement('p');
  when.className = 'muted';
  when.textContent = `Zuletzt geändert: ${new Date(m.updatedAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
  const actions = document.createElement('div');
  actions.className = 'palace-actions';
  const save = button('Speichern', async () => {
    try { await change({ action: 'update', id: m.id, text: text.value, category: cat.value, links: links.value }); notify('Erinnerung gespeichert.'); showPanel(nodes.find((n) => n.memory?.id === m.id)); } catch (error) { notify(error.message, 'error'); }
  });
  const del = button('Löschen', async () => {
    if (!confirm('Diese Erinnerung löschen?')) return;
    try { await change({ action: 'delete', id: m.id }); closePanel(); notify('Erinnerung gelöscht.'); } catch (error) { notify(error.message, 'error'); }
  });
  del.classList.add('danger');
  actions.append(save, del);
  panel.append(title, text, cat, links, when, actions, closeButton());
}

function button(label, fn) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ctrl';
  b.textContent = label;
  b.addEventListener('click', fn);
  return b;
}
const closeButton = () => { const b = button('Schließen', closePanel); b.classList.add('palace-close-panel'); return b; };

function closePanel() {
  selected = null;
  highlight = null;
  els.panel.hidden = true;
  applyHighlight();
}

function addForm() {
  els.panel.hidden = false;
  els.panel.replaceChildren();
  const title = document.createElement('h4');
  title.textContent = 'Neue Erinnerung';
  const text = Object.assign(document.createElement('textarea'), { rows: 3, maxLength: 200, placeholder: 'z. B. Arbeitet am Projekt Jarvis Studio' });
  const cat = document.createElement('select');
  for (const [k, v] of Object.entries(data.categories)) cat.append(new Option(v, k));
  const links = Object.assign(document.createElement('input'), { type: 'text', placeholder: 'Verknüpfungen, z. B. Jarvis, Jarvis Studio' });
  const save = button('Hinzufügen', async () => {
    try { await change({ action: 'add', text: text.value, category: cat.value, links: links.value }); closePanel(); notify('Erinnerung hinzugefügt.'); } catch (error) { notify(error.message, 'error'); }
  });
  els.panel.append(title, text, cat, links, save, closeButton());
  text.focus();
}

function search(query) {
  const q = query.trim().toLowerCase();
  if (!q) { closePanel(); return; }
  const hits = nodes.filter((n) => (n.memory && (n.memory.text.toLowerCase().includes(q) || (n.memory.links || []).some((l) => l.toLowerCase().includes(q)))) || (n.kind === 'topic' && n.key.includes(q)));
  highlight = new Set();
  for (const n of hits) for (const k of related(n)) highlight.add(k);
  applyHighlight();
  focus(hits.map((n) => n.group.position));
  els.stats.textContent = hits.length ? `${hits.filter((n) => n.memory).length} Erinnerungen zu „${query.trim()}“` : `Nichts zu „${query.trim()}“ gefunden`;
}

async function setup() {
  THREE = await import('three');
  ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
  glow = glowTexture();
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  els.view.append(renderer.domElement);
  labelLayer = document.createElement('div');
  labelLayer.className = 'palace-labels';
  els.view.append(labelLayer);
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#02060d');
  scene.fog = new THREE.FogExp2('#02060d', 0.0065);
  camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
  camera.position.set(0, 55, 120);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.35;
  controls.minDistance = 12;
  controls.maxDistance = 260;
  // Floating particles
  const points = new Float32Array(1500 * 3);
  for (let i = 0; i < points.length; i += 3) {
    const r = 40 + hash(`p${i}`) * 140;
    const t = hash(`t${i}`) * Math.PI * 2;
    const u = hash(`u${i}`) * Math.PI;
    points[i] = r * Math.sin(u) * Math.cos(t); points[i + 1] = r * Math.cos(u) * 0.6; points[i + 2] = r * Math.sin(u) * Math.sin(t);
  }
  const particles = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(points, 3)), new THREE.PointsMaterial({ color: '#5ee7ff', size: 1.4, map: glow, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(particles);
  const ring = new THREE.Mesh(new THREE.RingGeometry(58, 58.4, 128), new THREE.MeshBasicMaterial({ color: '#38e1ff', transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -14;
  scene.add(ring);
  clock = new THREE.Clock();
  const resize = () => {
    const { clientWidth: w, clientHeight: h } = els.view;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(els.view);
  resize();
  const raycaster = new THREE.Raycaster();
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const rect = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
    raycaster.params.Points = { threshold: 0 };
    const hit = raycaster.intersectObjects(nodes.map((n) => n.mesh))[0];
    if (hit) showPanel(hit.object.userData.node);
  });
  const projected = new THREE.Vector3();
  renderer.setAnimationLoop(() => {
    if (els.overlay.hidden) return;
    const t = clock.getElapsedTime();
    for (const n of nodes) {
      n.group.position.y = n.base.y + Math.sin(t * 0.8 + n.phase) * (n.kind === 'memory' ? 0.8 : 0.4);
      n.mesh.rotation.y += n.kind === 'hub' ? 0.004 : 0.01;
      if (n === selected) n.halo.scale.setScalar(5 + Math.sin(t * 4) * 1.2);
      if (n.label) {
        projected.copy(n.group.position).project(camera);
        const visible = projected.z < 1;
        n.label.style.display = visible ? 'block' : 'none';
        n.label.style.transform = `translate(-50%, -150%) translate(${((projected.x + 1) / 2) * els.view.clientWidth}px, ${((1 - projected.y) / 2) * els.view.clientHeight}px)`;
      }
    }
    for (const l of lines) {
      const pos = l.geometry.attributes.position;
      pos.setXYZ(0, l.userData.a.group.position.x, l.userData.a.group.position.y, l.userData.a.group.position.z);
      pos.setXYZ(1, l.userData.b.group.position.x, l.userData.b.group.position.y, l.userData.b.group.position.z);
      pos.needsUpdate = true;
    }
    particles.rotation.y = t * 0.01;
    controls.update();
    renderer.render(scene, camera);
  });
}

export async function openPalace() {
  els.overlay.hidden = false;
  els.loading.hidden = false;
  try {
    if (!renderer) await setup();
    await load();
    build();
  } catch (error) {
    notify(`Memory Palace: ${error.message}`, 'error');
  } finally {
    els.loading.hidden = true;
  }
}

export function initPalace({ toast }) {
  notify = toast;
  els.close.addEventListener('click', () => { els.overlay.hidden = true; closePanel(); });
  els.search.addEventListener('submit', (e) => { e.preventDefault(); search(els.search.querySelector('input').value); });
  els.search.querySelector('input').addEventListener('input', (e) => { if (!e.target.value) closePanel(); });
  els.add.addEventListener('click', addForm);
}
