// Quality control for products, run on the server (works while the laptop is
// off). What it really checks – and what it cannot:
//  - HTML structure, title, language, viewport (parsed)
//  - JavaScript syntax with Node's own parser (`node --check`), WITHOUT running it
//  - internal links, anchors and referenced files; external links must be https
//  - responsive rules (viewport, media queries / flexible layout) – static check
//  - security: eval, document.write, http resources, foreign scripts, secrets …
// Running the product (clicks, game logic) needs a browser: the dashboard runs a
// sandboxed runtime test when it is open and stores the result separately.
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ALLOWED_SCRIPT_HOSTS = ['cdn.jsdelivr.net'];
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const CHECKED = new Set(['html', 'head', 'body', 'div', 'section', 'main', 'header', 'footer', 'nav', 'article', 'aside', 'ul', 'ol', 'table', 'form', 'button', 'a', 'script', 'style', 'canvas', 'svg']);

function nodeCheck(code, module) {
  return mkdtemp(join(tmpdir(), 'jarvis-qa-')).then(async (dir) => {
    const file = join(dir, module ? 'check.mjs' : 'check.js');
    try {
      await writeFile(file, code);
      return await new Promise((resolve) => {
        execFile(process.execPath, ['--check', file], { timeout: 15_000 }, (error, stdout, stderr) => {
          if (!error) return resolve(null);
          const lines = String(stderr).split('\n').filter(Boolean);
          const where = lines.find((l) => /check\.m?js:\d+/.test(l))?.match(/:(\d+)/)?.[1];
          const message = lines.find((l) => /Error/.test(l)) || 'Syntaxfehler';
          resolve(`${message.trim()}${where ? ` (Zeile ${where})` : ''}`);
        });
      });
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });
}

export function extractScripts(html) {
  const scripts = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const src = (attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    const type = ((attrs.match(/\btype\s*=\s*["']([^"']+)["']/i) || [])[1] || '').toLowerCase();
    if (type && !/module|javascript|text\/javascript/.test(type)) continue; // importmap, json …
    scripts.push({ src, module: type === 'module', code: m[2] });
  }
  return scripts;
}

// Counts open/close tags for the important elements (ignoring script/style content).
export function tagBalance(html) {
  const stripped = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '<$1></$1>');
  const counts = {};
  const re = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;
  let m;
  while ((m = re.exec(stripped))) {
    const tag = m[1].toLowerCase();
    if (VOID.has(tag) || m[2] === '/' || !CHECKED.has(tag)) continue;
    counts[tag] = (counts[tag] || 0) + (m[0].startsWith('</') ? -1 : 1);
  }
  return Object.entries(counts).filter(([, v]) => v !== 0).map(([tag, v]) => `<${tag}> ${v > 0 ? `${v}× nicht geschlossen` : `${-v}× zu oft geschlossen`}`);
}

export async function runQa(files, { fetchImpl = fetch, checkExternal = true } = {}) {
  const checks = [];
  const add = (name, ok, detail = '', level = 'fehler') => checks.push({ name, ok, detail: String(detail).slice(0, 300), level: ok ? 'ok' : level });
  const byPath = new Map((files || []).map((f) => [f.path, f.content]));
  const html = byPath.get('index.html');
  if (!html) {
    add('Einstiegsseite', false, 'index.html fehlt');
    return summarize(checks);
  }
  // --- HTML -------------------------------------------------------------------
  add('HTML-Doctype', /^\s*<!doctype html>/i.test(html), 'Erste Zeile sollte <!DOCTYPE html> sein', 'warnung');
  add('Seitentitel', /<title>[^<]{2,}<\/title>/i.test(html), '<title> fehlt oder ist leer');
  add('Sprache', /<html[^>]*\blang=/i.test(html), '<html lang="de"> fehlt', 'warnung');
  add('Zeichensatz', /<meta[^>]+charset/i.test(html), '<meta charset="utf-8"> fehlt', 'warnung');
  const balance = tagBalance(html);
  add('HTML-Struktur', balance.length === 0, balance.join(', '));
  const ids = [...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  add('Eindeutige IDs', dupes.length === 0, `doppelt: ${[...new Set(dupes)].join(', ')}`, 'warnung');

  // --- JavaScript syntax --------------------------------------------------------
  const scripts = extractScripts(html);
  const jsFiles = [...byPath.entries()].filter(([p]) => p.endsWith('.js'));
  const jsErrors = [];
  for (const [i, s] of scripts.entries()) {
    if (s.src || !s.code.trim()) continue;
    const error = await nodeCheck(s.code, s.module);
    if (error) jsErrors.push(`Skript ${i + 1} in index.html: ${error}`);
  }
  for (const [path, code] of jsFiles) {
    const module = scripts.some((s) => s.module && s.src.replace(/^\.\//, '') === path) || /^\s*(import|export)\s/m.test(code);
    const error = await nodeCheck(code, module);
    if (error) jsErrors.push(`${path}: ${error}`);
  }
  add('JavaScript-Syntax (Node-Parser)', jsErrors.length === 0, jsErrors.join(' · '));

  // --- links & files --------------------------------------------------------------
  const refs = [...html.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1].trim());
  const missing = [];
  const anchors = [];
  const external = [];
  for (const ref of refs) {
    if (/^(mailto:|tel:|data:|javascript:void)/i.test(ref)) continue;
    if (ref.startsWith('#')) { if (ref.length > 1 && !ref.startsWith('#/') && !ids.includes(decodeURIComponent(ref.slice(1)))) anchors.push(ref); continue; }
    if (/^https?:\/\//i.test(ref)) { external.push(ref); continue; }
    const path = ref.replace(/^\.\//, '').split(/[?#]/)[0];
    if (path && !byPath.has(path)) missing.push(ref);
  }
  add('Interne Links und Dateien', missing.length === 0, `fehlen: ${missing.slice(0, 6).join(', ')}`);
  add('Sprungmarken (#…)', anchors.length === 0, `Ziel fehlt: ${anchors.slice(0, 6).join(', ')}`, 'warnung');
  const insecure = external.filter((u) => u.startsWith('http://'));
  add('Externe Links nur https', insecure.length === 0, insecure.slice(0, 4).join(', '));
  if (checkExternal && external.length) {
    const broken = [];
    for (const url of [...new Set(external.filter((u) => u.startsWith('https://')))].slice(0, 8)) {
      try {
        const r = await fetchImpl(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(6000) });
        if (r.status >= 400 && r.status !== 405 && r.status !== 403) broken.push(`${url} (${r.status})`);
      } catch {
        broken.push(`${url} (nicht erreichbar)`);
      }
    }
    add('Externe Links erreichbar', broken.length === 0, broken.join(', '), 'warnung');
  }

  // --- responsive (static) ---------------------------------------------------------------
  const css = [html, ...[...byPath.entries()].filter(([p]) => p.endsWith('.css')).map(([, c]) => c)].join('\n');
  add('Viewport für Handys', /<meta[^>]+name=["']viewport["'][^>]*width=device-width/i.test(html), '<meta name="viewport" content="width=device-width, initial-scale=1"> fehlt');
  const flexible = /@media|clamp\(|minmax\(|flex-wrap|grid-template|max-width\s*:\s*100%|vw\b/i.test(css);
  add('Flexibles Layout (statisch geprüft)', flexible, 'Keine Media Queries oder flexiblen Regeln gefunden', 'warnung');
  const wide = [...css.matchAll(/(?<![-\w])width\s*:\s*(\d{4,})px/gi)].map((m) => Number(m[1])).filter((v) => v > 1000);
  add('Keine überbreiten festen Breiten', wide.length === 0, `feste Breiten: ${wide.slice(0, 4).join('px, ')}px`, 'warnung');

  // --- security --------------------------------------------------------------------------------
  const allCode = [html, ...jsFiles.map(([, c]) => c)].join('\n');
  const risky = [];
  if (/\beval\s*\(/.test(allCode)) risky.push('eval()');
  if (/new\s+Function\s*\(/.test(allCode)) risky.push('new Function()');
  if (/document\.write\s*\(/.test(allCode)) risky.push('document.write()');
  if (/href\s*=\s*["']javascript:(?!void)/i.test(html)) risky.push('javascript:-Links');
  add('Kein gefährlicher Code', risky.length === 0, risky.join(', '));
  const foreign = scripts.filter((s) => s.src && /^https?:/i.test(s.src) && !ALLOWED_SCRIPT_HOSTS.includes(new URL(s.src).hostname)).map((s) => s.src);
  add('Keine fremden Skripte', foreign.length === 0, foreign.join(', '));
  const blank = [...html.matchAll(/<a\b[^>]*target=["']_blank["'][^>]*>/gi)].filter((m) => !/rel=["'][^"']*noopener/i.test(m[0]));
  add('Neue Tabs mit rel="noopener"', blank.length === 0, `${blank.length} Link(s) ohne noopener`, 'warnung');
  const posts = [...html.matchAll(/<form\b[^>]*action=["'](https?:[^"']+)["']/gi)].map((m) => m[1]);
  add('Keine Formulare an fremde Server', posts.length === 0, posts.join(', '));
  const secret = /(sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|ghp_[A-Za-z0-9]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|xox[bp]-[0-9A-Za-z-]{20,})/.test(allCode);
  add('Keine Zugangsdaten im Code', !secret, 'Etwas, das wie ein API-Schlüssel aussieht');
  const tracking = /google-analytics|googletagmanager|facebook\.net|hotjar/i.test(allCode);
  add('Keine Tracker', !tracking, 'Tracking-Skript gefunden', 'warnung');
  return summarize(checks);
}

function summarize(checks) {
  const errors = checks.filter((c) => c.level === 'fehler');
  const warnings = checks.filter((c) => c.level === 'warnung');
  return {
    ok: errors.length === 0,
    method: 'statisch (Server)',
    at: new Date().toISOString(),
    passed: checks.filter((c) => c.ok).length,
    total: checks.length,
    errors: errors.map((c) => `${c.name}: ${c.detail}`),
    warnings: warnings.map((c) => `${c.name}: ${c.detail}`),
    checks
  };
}
