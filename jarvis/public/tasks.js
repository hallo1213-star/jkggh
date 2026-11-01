// Task overview: live progress of Jarvis' bigger tasks and a viewer for the
// finished documents (Markdown with tables, safely rendered).
const STORE_KEY = 'jarvis.tasks';
const $ = (id) => document.getElementById(id);

const els = {
  modal: $('tasks-modal'),
  body: $('tasks-body'),
  close: $('tasks-close'),
  badge: $('tasks-badge'),
  doc: $('doc-overlay'),
  docTitle: $('doc-title'),
  docBody: $('doc-body'),
  docClose: $('doc-close'),
  docCopy: $('doc-copy'),
  docDownload: $('doc-download')
};

const live = new Map();
let openDoc = null;
let notify = () => {};

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

// Small Markdown renderer: headings, paragraphs, lists, tables, code, quotes.
export function renderMarkdown(markdown) {
  const lines = String(markdown).replace(/\r/g, '').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const code = [];
      for (i += 1; i < lines.length && !/^```/.test(lines[i]); i += 1) code.push(lines[i]);
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
    } else if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows = [];
      for (; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i += 1) rows.push(lines[i]);
      i -= 1;
      const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const body = rows.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r));
      const [head, ...rest] = body;
      out.push(`<div class="doc-table"><table><thead><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rest.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    } else if (/^#{1,4}\s/.test(line)) {
      const level = Math.min(line.match(/^#+/)[0].length + 1, 5);
      out.push(`<h${level}>${inline(line.replace(/^#+\s*/, ''))}</h${level}>`);
    } else if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line);
      const items = [];
      for (; i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i]); i += 1) items.push(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ''));
      i -= 1;
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
    } else if (/^>\s?/.test(line)) {
      out.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`);
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      out.push('<hr>');
    } else if (line.trim()) {
      const para = [line];
      while (i + 1 < lines.length && lines[i + 1].trim() && !/^(#|```|\s*\||\s*([-*•]|\d+[.)])\s|>)/.test(lines[i + 1])) para.push(lines[(i += 1)]);
      out.push(`<p>${inline(para.join(' '))}</p>`);
    }
  }
  return out.join('\n');
}

function loadSaved() {
  try {
    const list = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveDone(task) {
  let list = [task, ...loadSaved().filter((t) => t.id !== task.id)].slice(0, 15);
  while (list.length) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(list));
      break;
    } catch {
      list = list.slice(0, -1);
    }
  }
}

const ICON = { offen: '○', läuft: '⏳', erledigt: '✅', fehler: '⚠️', abgebrochen: '⏹️' };

function renderTasks() {
  const running = [...live.values()].filter((t) => t.status === 'läuft');
  els.badge.hidden = !running.length;
  els.badge.textContent = String(running.length);
  if (els.modal.hidden) return;
  const saved = loadSaved().filter((t) => !live.has(t.id));
  const all = [...live.values()].reverse().concat(saved);
  if (!all.length) {
    els.body.innerHTML = '<p class="empty">Noch keine Aufgaben. Sag z. B. „Recherchiere die besten kostenlosen 3D-Programme für Windows und erstelle mir eine Vergleichstabelle.“</p>';
    return;
  }
  els.body.replaceChildren(...all.map((task) => {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.dataset.status = task.status;
    const done = (task.steps || []).filter((s) => s.status === 'erledigt').length;
    const total = (task.steps || []).length || 1;
    card.innerHTML = `<div class="task-head"><b>${escapeHtml(task.title)}</b><span>${escapeHtml(task.status === 'läuft' ? `läuft · ${done}/${total}` : task.status)}</span></div>
      <div class="money-progress"><span style="width:${Math.round((task.status === 'fertig' ? 1 : done / total) * 100)}%"></span></div>
      <ol class="task-steps">${(task.steps || []).map((s) => `<li data-status="${escapeHtml(s.status)}">${ICON[s.status] || '○'} ${escapeHtml(s.title)}${s.result && s.status !== 'erledigt' ? ` – ${escapeHtml(s.result)}` : ''}</li>`).join('')}</ol>
      ${task.error ? `<p class="order-missing">${escapeHtml(task.error)}</p>` : ''}`;
    if (task.document) {
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'ctrl';
      open.textContent = 'Ergebnis öffnen';
      open.addEventListener('click', () => showDocument(task));
      card.append(open);
    }
    return card;
  }));
}

export function showDocument(task) {
  openDoc = task;
  els.docTitle.textContent = task.title;
  els.docBody.innerHTML = renderMarkdown(task.document || '');
  els.modal.hidden = true;
  els.doc.hidden = false;
}

export function handleTaskEvent(message) {
  const task = { ...(live.get(message.id) || {}), ...message };
  live.set(message.id, task);
  if (message.status === 'fertig' && message.document) {
    saveDone(task);
    showDocument(task);
    notify(`Aufgabe fertig: ${task.title}`);
  }
  if (message.phase === 'plan') {
    els.modal.hidden = false;
  }
  renderTasks();
}

export function initTasks({ toast }) {
  notify = toast;
  $('tasks-button').addEventListener('click', () => {
    els.modal.hidden = false;
    renderTasks();
  });
  els.close.addEventListener('click', () => { els.modal.hidden = true; });
  els.modal.addEventListener('click', (event) => { if (event.target === els.modal) els.modal.hidden = true; });
  els.docClose.addEventListener('click', () => { els.doc.hidden = true; });
  els.docCopy.addEventListener('click', () => openDoc && navigator.clipboard?.writeText(openDoc.document).then(() => notify('Text kopiert.'), () => {}));
  els.docDownload.addEventListener('click', () => {
    if (!openDoc) return;
    const url = URL.createObjectURL(new Blob([openDoc.document], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${openDoc.title.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^\w-]+/g, '-')}.md`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });
  const observer = new MutationObserver(renderTasks);
  observer.observe(els.modal, { attributes: true, attributeFilter: ['hidden'] });
  renderTasks();
}
