// The project workshop: runs the projects Jarvis programmed (games, apps,
// shops …) in a sandboxed preview, shows the code and exports a ZIP file.
const STORE_KEY = 'jarvis.projects';
const $ = (id) => document.getElementById(id);

const els = {
  overlay: $('project-overlay'),
  frame: $('project-frame'),
  title: $('project-title'),
  desc: $('project-desc'),
  close: $('project-close'),
  reload: $('project-reload'),
  zip: $('project-zip'),
  code: $('project-code'),
  list: $('project-list'),
  edit: $('project-edit'),
  loading: $('project-loading'),
  codeView: $('project-code-view'),
  codeFile: $('project-code-file'),
  codeText: $('project-code-text'),
  codeClose: $('project-code-close')
};

let current = null;
let notify = () => {};
let sendToServer = () => false;

// The preview runs in a sandboxed frame without access to Jarvis; a content
// security policy allows only inline code and the three.js CDN.
const CSP = "default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src https://cdn.jsdelivr.net";

export function buildPreview(project) {
  const files = Object.fromEntries(project.files.map((f) => [f.path, f.content]));
  let html = files['index.html'] || '<p>Keine index.html</p>';
  html = html.replace(/<link\b[^>]*href=["']([^"']+\.css)["'][^>]*>/gi, (tag, href) => (files[href.replace(/^\.\//, '')] !== undefined ? `<style>${files[href.replace(/^\.\//, '')]}</style>` : ''));
  html = html.replace(/<script\b([^>]*)\bsrc=["']([^"']+\.js)["']([^>]*)><\/script>/gi, (tag, before, src, after) => {
    const content = files[src.replace(/^\.\//, '')];
    if (content === undefined) return /^https:\/\/cdn\.jsdelivr\.net\//.test(src) ? tag : '';
    const module = /type=["']module["']/i.test(before + after);
    return `<script${module ? ' type="module"' : ''}>${content.replace(/<\/script/gi, '<\\/script')}</script>`;
  });
  const meta = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head([^>]*)>/i, `<head$1>${meta}`) : `${meta}${html}`;
}

// --- ZIP (stored, no compression) ---------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function makeZip(files) {
  const encoder = new TextEncoder();
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.path);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint16(10, dosTime, true); local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true); local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, data);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true); entry.setUint16(4, 20, true); entry.setUint16(6, 20, true); entry.setUint16(8, 0x0800, true);
    entry.setUint16(12, dosTime, true); entry.setUint16(14, dosDate, true);
    entry.setUint32(16, crc, true); entry.setUint32(20, data.length, true); entry.setUint32(24, data.length, true); entry.setUint16(28, name.length, true); entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = central.reduce((sum, p) => sum + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

// --- saved projects ------------------------------------------------------------------

function loadProjects() {
  try {
    const list = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveProject(project) {
  let list = [project, ...loadProjects().filter((p) => p.title !== project.title)].slice(0, 12);
  while (list.length) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(list));
      break;
    } catch {
      list = list.slice(0, -1); // storage full: drop the oldest
    }
  }
  renderList();
}

function renderList() {
  const list = loadProjects();
  els.list.replaceChildren(new Option(`Meine Projekte (${list.length})`, ''), ...list.map((p, i) => new Option(p.title, String(i))));
}

// --- public API -----------------------------------------------------------------------

export function projectLoading(text = 'Jarvis programmiert …') {
  els.overlay.hidden = false;
  els.loading.hidden = false;
  els.loading.querySelector('span:last-child').textContent = text;
}

export function showProject(project, { remember = true } = {}) {
  current = project;
  els.overlay.hidden = false;
  els.loading.hidden = true;
  els.title.textContent = project.title;
  els.desc.textContent = `${project.description || ''}${project.description ? ' · ' : ''}${project.files.length} Datei${project.files.length === 1 ? '' : 'en'} · selbst programmiert von Jarvis`;
  els.frame.srcdoc = buildPreview(project);
  if (remember) saveProject(project);
  sendToServer({ type: 'project_current', project });
}

function closeProject() {
  els.overlay.hidden = true;
  els.frame.srcdoc = '';
  els.codeView.hidden = true;
}

function showCode() {
  if (!current) return;
  els.codeFile.replaceChildren(...current.files.map((f, i) => new Option(f.path, String(i))));
  els.codeText.textContent = current.files[0]?.content || '';
  els.codeView.hidden = false;
}

async function editProject(wish) {
  if (!wish.trim()) return;
  const fresh = !current || (/^\s*(programmier|erstell|bau|mach mir ein(e|en)? neue|schreib mir)/i.test(wish) && !/\b(füg|änder|mach (das|die|den|es)|schwerer|leichter|schneller|langsamer|größer|kleiner|entfern|ersetz|zusätzlich|noch (ein|eine|mehr))/i.test(wish));
  projectLoading(fresh ? 'Jarvis programmiert …' : 'Jarvis baut um …');
  try {
    const response = await fetch('/api/project', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: wish, base: fresh ? null : current }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Fehler');
    showProject(data.project);
  } catch (error) {
    els.loading.hidden = true;
    notify(error.message, 'error');
  }
}

export function initProjects({ toast, send }) {
  notify = toast;
  sendToServer = send;
  renderList();
  $('project-button').addEventListener('click', () => {
    const list = loadProjects();
    if (list.length) showProject(list[0], { remember: false });
    else {
      els.overlay.hidden = false;
      els.title.textContent = 'Projekt-Werkstatt';
      els.desc.textContent = 'Sag z. B. „Programmier mir ein 3D-Spiel“ oder tippe unten einen Wunsch ein.';
    }
  });
  els.close.addEventListener('click', closeProject);
  els.reload.addEventListener('click', () => current && (els.frame.srcdoc = buildPreview(current)));
  els.zip.addEventListener('click', () => {
    if (!current) return;
    const url = URL.createObjectURL(makeZip(current.files));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${current.title.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss').replace(/[^\w-]+/g, '-')}.zip`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    notify('Projekt als ZIP gespeichert – entpacken und index.html öffnen.');
  });
  els.code.addEventListener('click', showCode);
  els.codeClose.addEventListener('click', () => { els.codeView.hidden = true; });
  els.codeFile.addEventListener('change', () => { els.codeText.textContent = current?.files[Number(els.codeFile.value)]?.content || ''; });
  els.list.addEventListener('change', () => {
    const project = loadProjects()[Number(els.list.value)];
    if (project) showProject(project, { remember: false });
    els.list.value = '';
  });
  els.edit.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = els.edit.querySelector('input');
    editProject(input.value);
    input.value = '';
  });
}
