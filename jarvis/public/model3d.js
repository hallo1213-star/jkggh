// Jarvis' 3D studio: builds real geometry from the scene Jarvis designed
// (houses, towers, pools, trees, flying cars, whole city blocks, primitives),
// shows it with light, shadows and sky, animates flying cars and exports the
// model as a GLB file (opens in Blender, Windows 3D-Viewer, online viewers).
const THREE_URL = 'three';
const STORE_KEY = 'jarvis.models';
const $ = (id) => document.getElementById(id);

const els = {
  overlay: $('model-overlay'),
  view: $('model-view'),
  title: $('model-title'),
  desc: $('model-desc'),
  status: $('model-status'),
  close: $('model-close'),
  spin: $('model-spin'),
  download: $('model-download'),
  list: $('model-list'),
  edit: $('model-edit'),
  loading: $('model-loading')
};

let THREE = null;
let OrbitControls = null;
let GLTFExporter = null;
let renderer = null;
let scene3 = null;
let camera = null;
let controls = null;
let root = null;
let animated = [];
let current = null;
let notify = () => {};
let sendToServer = () => false;
let clock = null;

async function loadThree() {
  if (THREE) return;
  THREE = await import(THREE_URL);
  ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
  ({ GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js'));
}

// --- helpers -------------------------------------------------------------------

function rng(seed = 1) {
  let a = Math.floor(seed * 9973) || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let night = false;
function mat(color = '#cccccc', kind = 'matt') {
  const c = new THREE.Color(color);
  switch (kind) {
    case 'glas': return new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.1, roughness: 0.05, transmission: 0.6, transparent: true, opacity: 0.55, envMapIntensity: 1 });
    case 'metall': return new THREE.MeshStandardMaterial({ color: c, metalness: 0.9, roughness: 0.25 });
    case 'glanz': return new THREE.MeshStandardMaterial({ color: c, metalness: 0.2, roughness: 0.2 });
    case 'leuchtend': return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.6 });
    case 'holz': return new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
    case 'stein': return new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 });
    case 'wasser': return new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.05, transmission: 0.4, transparent: true, opacity: 0.8, emissive: night ? c : new THREE.Color('#000000'), emissiveIntensity: night ? 0.5 : 0 });
    default: return new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
  }
}

function mesh(geometry, material, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

const box = (w, h, d, material, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z);
const windowMat = () => (night ? mat('#ffd38a', 'leuchtend') : mat('#9fd3ff', 'glas'));

// --- components ---------------------------------------------------------------

const builders = {
  house(p) {
    const g = new THREE.Group();
    const floors = Math.round(Math.min(Math.max(p.floors ?? 2, 1), 4));
    const w = Math.min(Math.max(p.width ?? 14, 6), 30);
    const d = Math.min(Math.max(p.depth ?? 10, 6), 30);
    const h = 3.2;
    const style = p.style || 'modern';
    const wall = mat(p.color || (style === 'klassisch' ? '#efe4d2' : '#f2f4f7'), style === 'futuristisch' ? 'glanz' : 'matt');
    const accent = mat(p.accent || '#2b2f36', 'metall');
    const glassShare = Math.min(Math.max(p.glass ?? (style === 'futuristisch' ? 0.6 : 0.4), 0.1), 0.9);
    for (let f = 0; f < floors; f += 1) {
      const shift = style === 'futuristisch' ? (f % 2 ? 2.5 : -1) : 0;
      const fw = style === 'futuristisch' ? w * (1 - f * 0.08) + (f ? 2 : 0) : w;
      const y = f * h + h / 2;
      g.add(box(fw, h, d, wall, shift, y, 0));
      // Windows on front and back: glass bands with frames
      const count = Math.max(2, Math.round(fw / 3.2));
      const gw = (fw / count) * glassShare * 1.4;
      for (let i = 0; i < count; i += 1) {
        const x = shift - fw / 2 + (i + 0.5) * (fw / count);
        if (f === 0 && p.door !== false && i === Math.floor(count / 2)) continue;
        for (const side of [1, -1]) {
          g.add(box(Math.min(gw, fw / count - 0.4), h * 0.62, 0.12, windowMat(), x, y + 0.15, side * (d / 2 + 0.03)));
          g.add(box(Math.min(gw, fw / count - 0.4) + 0.2, 0.12, 0.18, accent, x, y - h * 0.31 + 0.15, side * (d / 2 + 0.05)));
        }
      }
      // Side windows
      for (const side of [1, -1]) g.add(box(0.12, h * 0.55, d * 0.5, windowMat(), shift + side * (fw / 2 + 0.03), y + 0.1, 0));
      g.add(box(fw + 0.3, 0.25, d + 0.3, accent, shift, (f + 1) * h, 0));
    }
    if (p.door !== false) {
      g.add(box(1.4, 2.4, 0.2, mat('#5b3a22', 'holz'), 0, 1.2, d / 2 + 0.08));
      g.add(box(0.12, 0.12, 0.25, accent, 0.5, 1.2, d / 2 + 0.2));
      g.add(box(2.6, 0.18, 1.8, mat('#9aa1a9', 'stein'), 0, 0.09, d / 2 + 0.9));
    }
    if (p.balcony && floors > 1) {
      const y = h;
      g.add(box(w * 0.5, 0.25, 2.2, accent, 0, y + 0.12, d / 2 + 1.1));
      g.add(box(w * 0.5, 1.0, 0.06, mat('#bfe6ff', 'glas'), 0, y + 0.75, d / 2 + 2.2));
    }
    if ((p.roof || (style === 'klassisch' ? 'sattel' : 'flach')) === 'sattel') {
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2 - 0.5, 0); shape.lineTo(w / 2 + 0.5, 0); shape.lineTo(0, h * 1.1); shape.lineTo(-w / 2 - 0.5, 0);
      const roof = mesh(new THREE.ExtrudeGeometry(shape, { depth: d + 1, bevelEnabled: false }), mat('#7a3b2e', 'matt'), 0, floors * h + 0.12, -d / 2 - 0.5);
      g.add(roof);
    } else {
      g.add(box(w + 1.2, 0.35, d + 1.2, mat(style === 'futuristisch' ? '#e9edf2' : '#3a3f47', 'glanz'), 0, floors * h + 0.3, 0));
      if (style === 'futuristisch') g.add(box(w * 0.4, 0.08, d * 0.4, mat('#38e1ff', 'leuchtend'), 0, floors * h + 0.5, 0));
    }
    return g;
  },

  tower(p) {
    const g = new THREE.Group();
    const h = Math.min(Math.max(p.height ?? 60, 10), 300);
    const w = Math.min(Math.max(p.width ?? 16, 5), 40);
    const taper = Math.min(Math.max(p.taper ?? 0, 0), 0.5);
    const glass = (p.glass ?? 0.7) > 0.4;
    const body = new THREE.CylinderGeometry((w / Math.SQRT2) * (1 - taper), w / Math.SQRT2, h, 4, 1);
    body.rotateY(Math.PI / 4);
    const towerColor = new THREE.Color(p.color || '#4a6a88');
    g.add(mesh(body, glass ? new THREE.MeshStandardMaterial({ color: towerColor, metalness: 0.35, roughness: 0.2, emissive: night ? towerColor : new THREE.Color('#000000'), emissiveIntensity: night ? 0.35 : 0 }) : mat(p.color || '#b8bec7'), 0, h / 2, 0));
    if (p.lights !== false) {
      const light = mat(night ? '#9fe8ff' : '#dff6ff', night ? 'leuchtend' : 'glanz');
      for (let y = 4; y < h - 2; y += 6) {
        const s = w * (1 - taper * (y / h)) + 0.15;
        g.add(mesh(new THREE.BoxGeometry(s, 0.35, s), light, 0, y, 0, false));
      }
    }
    if (p.antenna) {
      g.add(mesh(new THREE.CylinderGeometry(0.25, 0.4, h * 0.15, 8), mat('#cfd5dc', 'metall'), 0, h + h * 0.075, 0));
      g.add(mesh(new THREE.SphereGeometry(0.6, 12, 12), mat('#ff3b3b', 'leuchtend'), 0, h * 1.15, 0, false));
    }
    return g;
  },

  pool(p) {
    const g = new THREE.Group();
    const w = Math.min(Math.max(p.width ?? 8, 2), 40);
    const d = Math.min(Math.max(p.depth ?? 4, 2), 20);
    if (p.deck !== false) g.add(box(w + 4, 0.2, d + 3, mat('#a0703c', 'holz'), 0, 0.1, 0));
    g.add(box(w + 0.6, 0.35, d + 0.6, mat('#f4f4f2', 'stein'), 0, 0.22, 0));
    const water = box(w, 0.2, d, mat('#2fb7e8', 'wasser'), 0, 0.36, 0);
    if (p.lights || night) {
      water.material.emissive = new THREE.Color('#1aa7e0');
      water.material.emissiveIntensity = night ? 0.9 : 0.25;
    }
    g.add(water);
    g.add(box(0.6, 0.6, 0.6, mat('#ffffff', 'glanz'), w / 2 + 1.2, 0.5, d / 2 + 0.8));
    return g;
  },

  garden(p) {
    const g = new THREE.Group();
    const w = Math.min(Math.max(p.width ?? 20, 4), 200);
    const d = Math.min(Math.max(p.depth ?? 16, 4), 200);
    g.add(mesh(new THREE.BoxGeometry(w, 0.06, d), mat('#5aa04a'), 0, 0.03, 0, false));
    const r = rng(w * d);
    if (p.hedge !== false) {
      const hedge = mat('#2f6b2a');
      g.add(box(w, 1.3, 0.8, hedge, 0, 0.65, -d / 2));
      g.add(box(0.8, 1.3, d, hedge, -w / 2, 0.65, 0));
      g.add(box(0.8, 1.3, d, hedge, w / 2, 0.65, 0));
      g.add(box(w * 0.38, 1.3, 0.8, hedge, -w * 0.31, 0.65, d / 2));
      g.add(box(w * 0.38, 1.3, 0.8, hedge, w * 0.31, 0.65, d / 2));
    }
    if (p.flowers) {
      const colors = ['#ff5a7a', '#ffd23f', '#ffffff', '#b06cff', '#ff8c42'];
      for (let i = 0; i < 70; i += 1) {
        const x = (r() - 0.5) * (w - 3);
        const z = d / 2 - 1.5 - r() * 2.5;
        g.add(mesh(new THREE.SphereGeometry(0.18, 6, 6), mat(colors[i % colors.length]), x, 0.25, z, false));
      }
    }
    return g;
  },

  tree(p) {
    const g = new THREE.Group();
    const h = Math.min(Math.max(p.height ?? 6, 2), 15);
    const kind = p.kind || 'laub';
    if (kind === 'tanne') {
      g.add(mesh(new THREE.CylinderGeometry(0.2, 0.3, h * 0.3, 8), mat('#6b4a2b', 'holz'), 0, h * 0.15, 0));
      for (let i = 0; i < 3; i += 1) g.add(mesh(new THREE.ConeGeometry(h * (0.32 - i * 0.07), h * 0.38, 10), mat('#2c5f34'), 0, h * (0.35 + i * 0.2), 0));
    } else if (kind === 'palme') {
      let y = 0;
      for (let i = 0; i < 7; i += 1) {
        const seg = mesh(new THREE.CylinderGeometry(0.22, 0.28, h / 7, 8), mat('#8b6b45', 'holz'), i * 0.12, y + h / 14, 0);
        seg.rotation.z = -0.06;
        g.add(seg); y += h / 7;
      }
      for (let i = 0; i < 7; i += 1) {
        const leaf = mesh(new THREE.BoxGeometry(h * 0.42, 0.06, 0.7), mat('#3f8f3a'), 0.84, y, 0);
        leaf.geometry.translate(h * 0.21, 0, 0);
        leaf.rotation.set(0, (i / 7) * Math.PI * 2, -0.45);
        g.add(leaf);
      }
    } else {
      g.add(mesh(new THREE.CylinderGeometry(0.25, 0.35, h * 0.45, 8), mat('#6b4a2b', 'holz'), 0, h * 0.22, 0));
      const leaves = mat('#4a8f3c');
      g.add(mesh(new THREE.IcosahedronGeometry(h * 0.28, 1), leaves, 0, h * 0.62, 0));
      g.add(mesh(new THREE.IcosahedronGeometry(h * 0.2, 1), leaves, h * 0.15, h * 0.78, h * 0.08));
      g.add(mesh(new THREE.IcosahedronGeometry(h * 0.18, 1), leaves, -h * 0.14, h * 0.72, -h * 0.06));
    }
    return g;
  },

  car(p) {
    const g = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color: new THREE.Color(p.color || '#d62839'), metalness: 0.6, roughness: 0.3 });
    g.add(box(4.2, 0.8, 1.9, paint, 0, 0.75, 0));
    g.add(box(2.3, 0.7, 1.7, mat('#9fd3ff', 'glas'), -0.2, 1.45, 0));
    g.add(box(0.1, 0.25, 1.5, mat('#fff4c2', 'leuchtend'), 2.12, 0.85, 0));
    g.add(box(0.1, 0.2, 1.5, mat('#ff2a2a', 'leuchtend'), -2.12, 0.85, 0));
    if (p.flying) {
      for (const x of [-1.4, 1.4]) for (const z of [-0.9, 0.9]) g.add(mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.15, 16), mat('#38e1ff', 'leuchtend'), x, 0.25, z, false));
      g.userData.fly = { altitude: p.altitude ?? 25, orbit: p.orbit ?? 30, speed: 0.15 + Math.random() * 0.2, phase: Math.random() * Math.PI * 2 };
    } else {
      for (const x of [-1.3, 1.3]) for (const z of [-0.95, 0.95]) {
        const wheel = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16), mat('#1b1d21'), x, 0.4, z);
        wheel.rotation.x = Math.PI / 2;
        g.add(wheel);
      }
    }
    return g;
  },

  road(p) {
    const g = new THREE.Group();
    const length = Math.min(Math.max(p.length ?? 40, 4), 600);
    const width = Math.min(Math.max(p.width ?? 8, 3), 30);
    g.add(mesh(new THREE.BoxGeometry(length, 0.08, width), mat('#2e3136', 'stein'), 0, 0.05, 0, false));
    if (p.markings !== false) for (let x = -length / 2 + 2; x < length / 2 - 1; x += 5) g.add(mesh(new THREE.BoxGeometry(2.4, 0.02, 0.18), mat('#f2f2f2', night ? 'leuchtend' : 'matt'), x, 0.1, 0, false));
    return g;
  },

  path(p) {
    const g = new THREE.Group();
    const length = Math.min(Math.max(p.length ?? 10, 2), 200);
    const width = Math.min(Math.max(p.width ?? 1.5, 0.6), 6);
    for (let x = -length / 2 + 0.6; x < length / 2; x += 1.3) g.add(mesh(new THREE.BoxGeometry(1.1, 0.1, width), mat('#c9c3b8', 'stein'), x, 0.07, 0, false));
    return g;
  },

  lamp(p) {
    const g = new THREE.Group();
    const h = Math.min(Math.max(p.height ?? 4.5, 2), 12);
    g.add(mesh(new THREE.CylinderGeometry(0.08, 0.12, h, 8), mat('#2b2f36', 'metall'), 0, h / 2, 0));
    g.add(mesh(new THREE.SphereGeometry(0.35, 12, 12), mat(p.color || '#fff1c4', 'leuchtend'), 0, h, 0, false));
    if (night) g.userData.light = { color: p.color || '#ffd9a0', y: h };
    return g;
  },

  fence(p) {
    const g = new THREE.Group();
    const length = Math.min(Math.max(p.length ?? 10, 1), 200);
    const h = Math.min(Math.max(p.height ?? 1.2, 0.5), 3);
    const m = mat(p.color || '#f4f4f4', 'holz');
    for (let x = -length / 2; x <= length / 2; x += 1.5) g.add(box(0.12, h, 0.12, m, x, h / 2, 0));
    g.add(box(length, 0.1, 0.08, m, 0, h * 0.8, 0));
    g.add(box(length, 0.1, 0.08, m, 0, h * 0.4, 0));
    return g;
  },

  rock(p) {
    const s = Math.min(Math.max(p.size ?? 1.5, 0.3), 10);
    const m = mesh(new THREE.DodecahedronGeometry(s, 0), mat('#8a8d91', 'stein'), 0, s * 0.5, 0);
    m.scale.y = 0.6;
    return m;
  },

  bench(p) {
    const g = new THREE.Group();
    const wood = mat(p.color || '#8b5a2b', 'holz');
    g.add(box(2, 0.1, 0.5, wood, 0, 0.5, 0));
    g.add(box(2, 0.45, 0.08, wood, 0, 0.8, -0.24));
    for (const x of [-0.85, 0.85]) g.add(box(0.08, 0.5, 0.45, mat('#2b2f36', 'metall'), x, 0.25, 0));
    return g;
  },

  fountain(p) {
    const g = new THREE.Group();
    const s = Math.min(Math.max(p.size ?? 3, 1), 15);
    g.add(mesh(new THREE.CylinderGeometry(s, s * 1.05, 0.6, 32), mat('#d9d6cf', 'stein'), 0, 0.3, 0));
    g.add(mesh(new THREE.CylinderGeometry(s * 0.9, s * 0.9, 0.1, 32), mat('#38b6e8', 'wasser'), 0, 0.58, 0, false));
    g.add(mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.8, 12), mat('#d9d6cf', 'stein'), 0, 1.2, 0));
    g.add(mesh(new THREE.SphereGeometry(0.45, 16, 16), mat('#9fe3ff', 'wasser'), 0, 2.2, 0, false));
    return g;
  },

  city(p) {
    const g = new THREE.Group();
    const r = rng(p.seed ?? 3);
    const blocks = Math.round(p.blocks ?? 4);
    const size = 44;
    const roadW = 10;
    const span = blocks * (size + roadW);
    const futur = (p.style || 'futuristisch') === 'futuristisch';
    const palette = futur ? ['#3b5b7a', '#2f4a66', '#466d8f', '#5a7f9f', '#2a3e57'] : ['#b9bfc7', '#8f98a3', '#c9b8a3', '#7f8a96', '#d1d5db'];
    for (let i = 0; i <= blocks; i += 1) {
      const offset = -span / 2 + i * (size + roadW) - roadW / 2;
      const a = builders.road({ length: span + roadW, width: roadW });
      a.position.set(0, 0, offset); g.add(a);
      const b = builders.road({ length: span + roadW, width: roadW });
      b.rotation.y = Math.PI / 2; b.position.set(offset, 0.01, 0); g.add(b);
    }
    for (let bx = 0; bx < blocks; bx += 1) {
      for (let bz = 0; bz < blocks; bz += 1) {
        const cx = -span / 2 + bx * (size + roadW) + size / 2;
        const cz = -span / 2 + bz * (size + roadW) + size / 2;
        g.add(mesh(new THREE.BoxGeometry(size, 0.3, size), mat('#4b5058', 'stein'), cx, 0.15, cz, false));
        const n = 1 + Math.floor(r() * 4);
        const centre = 1 - (Math.abs(cx) + Math.abs(cz)) / span;
        for (let k = 0; k < n; k += 1) {
          const w = 9 + r() * 10;
          const h = Math.max(15, (p.maxHeight ?? 120) * (0.25 + r() * 0.75) * (0.5 + centre * 0.7));
          const t = builders.tower({ height: h, width: w, color: palette[Math.floor(r() * palette.length)], glass: futur ? 0.8 : 0.3, lights: true, taper: futur && r() > 0.6 ? 0.25 : 0, antenna: h > 120 && r() > 0.5 });
          const qx = n === 1 ? 0 : (k % 2 ? 1 : -1) * size / 4;
          const qz = n <= 2 ? 0 : (k < 2 ? -1 : 1) * size / 4;
          t.position.set(cx + qx, 0.3, cz + qz);
          g.add(t);
        }
        if (p.trees !== false) for (const [dx, dz] of [[-size / 2 + 2, -size / 2 + 2], [size / 2 - 2, size / 2 - 2]]) {
          const tree = builders.tree({ kind: futur ? 'palme' : 'laub', height: 5 });
          tree.position.set(cx + dx, 0.3, cz + dz); g.add(tree);
        }
      }
    }
    const colors = ['#ff3b6b', '#38e1ff', '#ffd23f', '#ffffff', '#9b5cff'];
    for (let i = 0; i < (p.flyingCars ?? 8); i += 1) {
      const car = builders.car({ color: colors[i % colors.length], flying: true, altitude: 25 + r() * 70, orbit: 20 + r() * span * 0.4 });
      g.add(car);
    }
    return g;
  },

  box: (p) => box(p.width ?? 2, p.height ?? 2, p.depth ?? 2, mat(p.color || '#cccccc', p.material), 0, (p.height ?? 2) / 2, 0),
  cylinder: (p) => mesh(new THREE.CylinderGeometry(p.radius ?? 1, p.radius ?? 1, p.height ?? 2, 32), mat(p.color || '#cccccc', p.material), 0, (p.height ?? 2) / 2, 0),
  sphere: (p) => mesh(new THREE.SphereGeometry(p.radius ?? 1, 32, 32), mat(p.color || '#cccccc', p.material), 0, p.radius ?? 1, 0),
  cone: (p) => mesh(new THREE.ConeGeometry(p.radius ?? 1, p.height ?? 2, 32), mat(p.color || '#cccccc', p.material), 0, (p.height ?? 2) / 2, 0),
  torus: (p) => mesh(new THREE.TorusGeometry(p.radius ?? 2, p.tube ?? 0.4, 16, 64), mat(p.color || '#cccccc', p.material), 0, (p.radius ?? 2) + (p.tube ?? 0.4), 0),

  text(p) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.fillRect(0, 0, 1024, 256);
    ctx.font = 'bold 150px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = p.color || '#38e1ff'; ctx.shadowColor = p.color || '#38e1ff'; ctx.shadowBlur = 30;
    ctx.fillText(String(p.text || 'JARVIS').slice(0, 24), 512, 128);
    const size = p.size ?? 6;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(size * 4, size), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, side: THREE.DoubleSide }));
    plane.position.y = size;
    return plane;
  }
};

// --- scene ----------------------------------------------------------------------

const SKY = {
  tag: { bg: '#a9d4f5', fog: '#cfe6f7', sun: 1.6, hemi: 0.9 },
  sonnenuntergang: { bg: '#f2a37a', fog: '#f6c4a2', sun: 1.2, hemi: 0.6, sunColor: '#ffb07a' },
  bewoelkt: { bg: '#b7c2cc', fog: '#c9d1d8', sun: 0.6, hemi: 1.0 },
  nacht: { bg: '#050b1a', fog: '#0a1428', sun: 0.15, hemi: 0.25, sunColor: '#8fa8ff' },
  weltraum: { bg: '#000000', fog: null, sun: 1.0, hemi: 0.2 }
};
const GROUND = { gras: '#5f9f4f', sand: '#e3cf9a', beton: '#6c7178', wasser: '#2a7fb8', schnee: '#f2f5f8', weltraum: '#1a1c22', erde: '#7a5a3a' };

function buildScene(spec) {
  night = spec.sky === 'nacht' || spec.sky === 'weltraum';
  const sky = SKY[spec.sky] || SKY.tag;
  scene3 = new THREE.Scene();
  scene3.background = new THREE.Color(sky.bg);
  if (sky.fog) scene3.fog = new THREE.Fog(sky.fog, 250, 1400);
  scene3.add(new THREE.HemisphereLight('#ffffff', '#445566', sky.hemi));
  const sun = new THREE.DirectionalLight(sky.sunColor || '#ffffff', sky.sun);
  sun.position.set(120, 200, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -300, right: 300, top: 300, bottom: -300, far: 800 });
  scene3.add(sun);
  if (spec.sky === 'weltraum') {
    const stars = new THREE.BufferGeometry();
    const pts = new Float32Array(3000 * 3);
    const r = rng(42);
    for (let i = 0; i < pts.length; i += 3) {
      const t = r() * Math.PI * 2; const u = Math.acos(2 * r() - 1); const d = 1500;
      pts[i] = d * Math.sin(u) * Math.cos(t); pts[i + 1] = Math.abs(d * Math.cos(u)); pts[i + 2] = d * Math.sin(u) * Math.sin(t);
    }
    stars.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    scene3.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: '#ffffff', size: 2 })));
  }
  const groundMat = spec.ground === 'wasser' ? mat(GROUND.wasser, 'wasser') : mat(GROUND[spec.ground] || GROUND.gras, 'stein');
  const ground = mesh(new THREE.CircleGeometry(1200, 64), groundMat, 0, 0, 0, false);
  ground.rotation.x = -Math.PI / 2;
  scene3.add(ground);

  root = new THREE.Group();
  root.name = spec.title;
  animated = [];
  let lights = 0;
  for (const item of spec.items) {
    const builder = builders[item.type];
    if (!builder) continue;
    const object = builder(item.params || {});
    object.name = item.name || item.type;
    object.position.x += item.position[0];
    object.position.y += item.position[1];
    object.position.z += item.position[2];
    object.rotation.y += (item.rotation * Math.PI) / 180;
    object.scale.multiplyScalar(item.scale || 1);
    root.add(object);
    object.traverse((child) => {
      if (child.userData.fly) animated.push({ object: child, center: child.parent === root ? object.position.clone() : new THREE.Vector3(), ...child.userData.fly });
      if (child.userData.light && lights < 16) {
        lights += 1;
        const light = new THREE.PointLight(child.userData.light.color, 25, 22);
        light.position.set(0, child.userData.light.y, 0);
        child.add(light);
      }
    });
  }
  scene3.add(root);
  return root;
}

function frame(object) {
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z, 8);
  camera.near = Math.max(0.1, radius / 500);
  camera.far = Math.max(3000, radius * 20);
  camera.updateProjectionMatrix();
  camera.position.set(center.x + radius * 0.9, center.y + radius * 0.6, center.z + radius * 1.1);
  controls.target.copy(center);
  controls.update();
}

function ensureRenderer() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  els.view.append(renderer.domElement);
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.6;
  controls.maxPolarAngle = Math.PI / 2.05;
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
  renderer.setAnimationLoop(() => {
    if (els.overlay.hidden || !scene3) return;
    const t = clock.getElapsedTime();
    for (const a of animated) {
      const angle = a.phase + t * a.speed;
      a.object.position.set(a.center.x + Math.cos(angle) * a.orbit, a.altitude + Math.sin(t * 1.5 + a.phase) * 0.6, a.center.z + Math.sin(angle) * a.orbit);
      a.object.rotation.y = -angle;
    }
    controls.update();
    renderer.render(scene3, camera);
  });
}

// --- saved models ------------------------------------------------------------------

function loadModels() {
  try {
    const list = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveModel(spec) {
  try {
    const list = loadModels().filter((m) => m.title !== spec.title);
    list.unshift({ title: spec.title, savedAt: Date.now(), scene: spec });
    localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, 20)));
  } catch {
    // storage full: the model is still shown
  }
  renderList();
}

function renderList() {
  const list = loadModels();
  els.list.replaceChildren(new Option(`Meine Modelle (${list.length})`, ''), ...list.map((m, i) => new Option(m.title, String(i))));
}

// --- public API ---------------------------------------------------------------------

export async function showModel(spec, { remember = true } = {}) {
  els.overlay.hidden = false;
  document.body.classList.add('model-open');
  els.loading.hidden = false;
  try {
    await loadThree();
    ensureRenderer();
    const object = buildScene(spec);
    frame(object);
    current = spec;
    els.title.textContent = spec.title;
    els.desc.textContent = spec.description || '';
    let parts = 0;
    object.traverse((child) => { if (child.isMesh) parts += 1; });
    els.status.textContent = `${parts.toLocaleString('de-DE')} 3D-Teile · selbst entworfen von Jarvis`;
    if (remember) saveModel(spec);
    sendToServer({ type: 'model_current', scene: spec });
  } catch (error) {
    els.status.textContent = `3D-Ansicht konnte nicht geladen werden: ${error.message}`;
    notify(els.status.textContent, 'error');
  } finally {
    els.loading.hidden = true;
  }
}

export function modelLoading(text = 'Jarvis entwirft dein Modell …') {
  els.overlay.hidden = false;
  els.loading.hidden = false;
  els.loading.querySelector('span:last-child').textContent = text;
}

function closeModel() {
  els.overlay.hidden = true;
  document.body.classList.remove('model-open');
}

function exportGlb() {
  if (!root || !GLTFExporter) return;
  const exporter = new GLTFExporter();
  exporter.parse(root, (result) => {
    const blob = new Blob([result], { type: 'model/gltf-binary' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(current?.title || 'jarvis-modell').replace(/[^\wäöüÄÖÜß-]+/g, '-')}.glb`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    notify('Modell als GLB gespeichert – öffnet sich z. B. in Blender oder im 3D-Viewer.');
  }, (error) => notify(`Export fehlgeschlagen: ${error.message || error}`, 'error'), { binary: true });
}

// "Bau mir eine Stadt" starts something new; "Mach das Dach rot" changes the open model.
const NEW_MODEL = /^\s*(bau|baue|erstell|erschaff|entwirf|entwerf|generier|design|kreier|zeig mir ein|mach mir ein(e|en)? neue)/i;
const CHANGE = /\b(füg|ändere|änder|mach (das|die|den|es)|größer|kleiner|entfern|ersetz|statt|zusätzlich|noch (ein|eine|mehr))/i;

async function editModel(wish) {
  if (!wish.trim()) return;
  const fresh = !current || (NEW_MODEL.test(wish) && !CHANGE.test(wish));
  modelLoading(fresh ? 'Jarvis entwirft dein Modell …' : 'Jarvis baut um …');
  try {
    const response = await fetch('/api/model', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: wish, base: fresh ? null : current }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Fehler');
    await showModel(data.scene);
  } catch (error) {
    els.loading.hidden = true;
    notify(error.message, 'error');
  }
}

export function initModels({ toast, send }) {
  notify = toast;
  sendToServer = send;
  renderList();
  $('model-button').addEventListener('click', () => {
    const list = loadModels();
    if (list.length) showModel(list[0].scene, { remember: false });
    else {
      els.overlay.hidden = false;
      els.status.textContent = 'Sag z. B. „Erstelle mir ein futuristisches Haus mit Pool“ oder tippe unten einen Wunsch ein.';
    }
  });
  els.close.addEventListener('click', closeModel);
  els.spin.addEventListener('click', () => {
    if (!controls) return;
    controls.autoRotate = !controls.autoRotate;
    els.spin.setAttribute('aria-pressed', String(controls.autoRotate));
  });
  els.download.addEventListener('click', exportGlb);
  els.list.addEventListener('change', () => {
    const model = loadModels()[Number(els.list.value)];
    if (model) showModel(model.scene, { remember: false });
    els.list.value = '';
  });
  els.edit.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = els.edit.querySelector('input');
    editModel(input.value);
    input.value = '';
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !els.overlay.hidden) closeModel();
  });
}
