// "Eigenes Bild als Anzug": turns a picture the user picks into Jarvis' suit.
// Everything happens in the browser and stays on this device (IndexedDB):
// background removal, cut-out of the helmet, finding the glowing chest reactor.
const DB = 'jarvis-suit';
const STORE = 'files';

function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function put(key, value) {
  const d = await db();
  await new Promise((resolve, reject) => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(value, key); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
}
async function get(key) {
  const d = await db();
  return new Promise((resolve, reject) => { const tx = d.transaction(STORE, 'readonly'); const r = tx.objectStore(STORE).get(key); r.onsuccess = () => resolve(r.result || null); r.onerror = () => reject(r.error); });
}

export const customPhoto = () => get('photo').catch(() => null);
export const customHelmet = () => get('helmet').catch(() => null);
export async function saveCustom(result) { await put('photo', result.photo); await put('helmet', result.helmet); }

const hex = (r, g, b) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

// Flood fill from the border: every pixel connected to the edge that looks like
// the background (close to the corner colours) becomes transparent.
function removeBackground(data, w, h) {
  const px = (x, y) => (y * w + x) * 4;
  const corners = [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]].map(([x, y]) => { const i = px(x, y); return [data[i], data[i + 1], data[i + 2]]; });
  const bg = corners.reduce((a, c) => a.map((v, i) => v + c[i] / 4), [0, 0, 0]);
  const spread = Math.max(...corners.map((c) => Math.hypot(c[0] - bg[0], c[1] - bg[1], c[2] - bg[2])));
  if (spread > 60) return false; // busy background (photo) – keep the picture as it is
  const tol = 46;
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x += 1) { stack.push(x, 0, x, h - 1); }
  for (let y = 0; y < h; y += 1) { stack.push(0, y, w - 1, y); }
  while (stack.length) {
    const y = stack.pop(); const x = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const k = y * w + x;
    if (seen[k]) continue;
    seen[k] = 1;
    const i = k * 4;
    if (Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]) > tol) continue;
    data[i + 3] = 0;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  // soften the edge: half-transparent pixels next to removed ones
  for (let y = 1; y < h - 1; y += 1) for (let x = 1; x < w - 1; x += 1) {
    const i = px(x, y);
    if (data[i + 3] && (!data[px(x + 1, y) + 3] || !data[px(x - 1, y) + 3] || !data[px(x, y + 1) + 3] || !data[px(x, y - 1) + 3])) data[i + 3] = 150;
  }
  return true;
}

function bbox(data, w, h, y0 = 0, y1 = h) {
  let minX = w; let maxX = -1; let minY = h; let maxY = -1;
  for (let y = y0; y < y1; y += 1) for (let x = 0; x < w; x += 1) if (data[(y * w + x) * 4 + 3] > 40) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function crop(canvas, box, pad = 0) {
  const c = document.createElement('canvas');
  const x = Math.max(0, box.x - pad); const y = Math.max(0, box.y - pad);
  const w = Math.min(canvas.width - x, box.w + pad * 2); const h = Math.min(canvas.height - y, box.h + pad * 2);
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, w, h);
  return c;
}

export async function processSuitImage(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Bitte ein Bild auswählen.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1100 / bitmap.height, 900 / bitmap.width);
  const w = Math.round(bitmap.width * scale); const h = Math.round(bitmap.height * scale);
  const work = document.createElement('canvas');
  work.width = w; work.height = h;
  const ctx = work.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const cutOut = removeBackground(img.data, w, h);
  ctx.putImageData(img, 0, 0);
  const box = cutOut ? bbox(img.data, w, h) : { x: 0, y: 0, w, h };
  if (!box || box.w < 40 || box.h < 80) throw new Error('Auf dem Bild habe ich keinen Anzug gefunden.');
  const body = crop(work, box, 6);
  const bctx = body.getContext('2d', { willReadFrequently: true });
  const bd = bctx.getImageData(0, 0, body.width, body.height).data;
  const BW = body.width; const BH = body.height;

  // Helmet: from the top down to the neck – the narrowest row below the head.
  const rowWidth = (y) => { let a = -1; let b = -1; for (let x = 0; x < BW; x += 1) if (bd[(y * BW + x) * 4 + 3] > 40) { if (a < 0) a = x; b = x; } return a < 0 ? 0 : b - a; };
  const top = Math.round(BH * 0.02);
  let headMax = 0; let headMaxY = top;
  for (let y = top; y < BH * 0.12; y += 1) { const rw = rowWidth(y); if (rw > headMax) { headMax = rw; headMaxY = y; } }
  let neckY = Math.round(BH * 0.16); let neckW = Infinity;
  for (let y = headMaxY + 4; y < BH * 0.24; y += 1) { const rw = rowWidth(y); if (rw > 0 && rw < neckW) { neckW = rw; neckY = y; } }
  const hb = bbox(bd, BW, BH, 0, neckY + 2) || { x: 0, y: 0, w: BW, h: neckY };
  // keep only the centre part (shoulders can reach into these rows)
  const cx = hb.x + hb.w / 2;
  const hw = Math.min(hb.w, headMax * 1.15 || hb.w);
  const helmet = crop(body, { x: Math.round(cx - hw / 2), y: hb.y, w: Math.round(hw), h: neckY + 2 - hb.y }, 2);

  // Chest reactor: the brightest, slightly bluish spot in the upper body.
  let sum = 0; let sx = 0; let sy = 0; let cr = 0; let cg = 0; let cb = 0;
  const x0 = Math.round(BW * 0.25); const x1 = Math.round(BW * 0.75); const y0 = Math.round(BH * 0.14); const y1 = Math.round(BH * 0.45);
  const scores = [];
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const i = (y * BW + x) * 4;
    if (bd[i + 3] < 200) continue;
    const r = bd[i]; const g = bd[i + 1]; const b = bd[i + 2];
    scores.push([r + g + b + (b - r) * 0.6, x, y, r, g, b]);
  }
  scores.sort((a, b) => b[0] - a[0]);
  const best = scores.slice(0, Math.max(6, Math.round(scores.length * 0.004)));
  for (const [s, x, y, r, g, b] of best) { sum += s; sx += x * s; sy += y * s; cr += r; cg += g; cb += b; }
  const glow = sum && best[0][0] > 560 ? { x: sx / sum / BW, y: sy / sum / BH } : { x: 0.5, y: 0.3 };
  const leuchten = best.length && best[0][0] > 560 ? hex(cr / best.length, cg / best.length, Math.min(255, cb / best.length + 20)) : '#cfeeff';

  // Main colour: average of the strongly coloured pixels.
  let mr = 0; let mg = 0; let mb = 0; let n = 0;
  for (let i = 0; i < bd.length; i += 16) {
    if (bd[i + 3] < 200) continue;
    const r = bd[i]; const g = bd[i + 1]; const b = bd[i + 2];
    const max = Math.max(r, g, b); const min = Math.min(r, g, b);
    if (max - min > 70) { mr += r; mg += g; mb += b; n += 1; }
  }
  const haupt = n ? hex(mr / n, mg / n, mb / n) : '#b3121f';
  return {
    photo: body.toDataURL('image/png'),
    helmet: helmet.toDataURL('image/png'),
    meta: { glow, farben: { haupt, akzent: '#d4a64a', leuchten }, cutOut, ratio: BW / BH, helmetRatio: helmet.width / helmet.height }
  };
}
