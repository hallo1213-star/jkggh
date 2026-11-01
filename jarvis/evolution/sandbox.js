// Isolated development environment for the Self-Evolution Engine.
// - A copy of the project in a temporary folder (node_modules is linked
//   read-only-by-convention, nothing is installed).
// - Changes are applied only there; the running production code is never touched.
// - Every command runs WITHOUT the server's secrets (clean environment) and with
//   network access blocked by a preload script (fetch, http(s), net, tls).
// - Checks: syntax (node --check), the full test suite, a server start probe
//   (/health and the login page), security scan of the changed files, diff.
// Honest limit: this is process-level isolation (no container/VM).
import { execFile, spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, resolve } from 'node:path';
import { staticAnalysis } from './analyzer.js';

const COPY_SKIP = new Set(['node_modules', '.git', 'data']);
export const PROTECTED = [
  /^auth\.js$/, /^evolution\//, /^tests\/run\.mjs$/, /^render\.yaml$/, /^package(-lock)?\.json$/,
  /^\.env/, /^\.git/, /^\.gitignore$/, /^\.gitattributes$/, /^business-store\.js$/, /(^|\/)node_modules\//
];
// Changes to these files are possible, but never without the user's approval.
export const CRITICAL = [/^server\.js$/, /^cloud-tools\.js$/, /^agent-config\.js$/, /^telegram-bot\.js$/, /^telegram\.js$/, /^phone-call\.js$/, /^gmail\.js$/, /^llm\.js$/, /^laptop\//, /^public\/app\.js$/, /^public\/index\.html$/];

const BLOCK_NET = `
const blocked = () => { throw new Error('Netzwerk ist in der Jarvis-Sandbox gesperrt'); };
const __realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => { if (/^https?:\\/\\/(127\\.0\\.0\\.1|localhost)(:|\\/)/.test(String(url))) return __realFetch(url, init); blocked(); };
for (const name of ['node:net', 'node:tls']) {
  const mod = await import(name);
  const orig = mod.Socket?.prototype?.connect;
  if (orig) mod.Socket.prototype.connect = function (...args) { const opts = args[0]; const host = typeof opts === 'object' ? opts.host : args[1]; if (host && !/^(127\\.0\\.0\\.1|localhost|::1)$/.test(host)) blocked(); return orig.apply(this, args); };
}
`;

export function isProtected(path) {
  return PROTECTED.some((re) => re.test(path));
}
export function isCritical(path) {
  return CRITICAL.some((re) => re.test(path));
}

export function cleanEnv(extra = {}) {
  const env = { TZ: 'Europe/Berlin', NODE_ENV: 'test' };
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'LANG', 'SYSTEMROOT']) if (process.env[key]) env[key] = process.env[key];
  return { ...env, ...extra };
}

function safePath(path) {
  const clean = normalize(String(path || '')).replace(/\\/g, '/').replace(/^\.\//, '');
  if (!clean || clean.startsWith('/') || clean.startsWith('..') || clean.includes('/../') || /[\0<>:"|?*]/.test(clean)) throw new Error(`Ungültiger Dateipfad: ${path}`);
  return clean;
}

export async function createSandbox(rootDir) {
  const root = resolve(rootDir);
  const dir = await mkdtemp(join(tmpdir(), 'jarvis-evolution-'));
  await cp(root, dir, { recursive: true, filter: (src) => !COPY_SKIP.has(src.split(/[\\/]/).pop()) || src === root });
  if (existsSync(join(root, 'node_modules'))) await symlink(join(root, 'node_modules'), join(dir, 'node_modules'), 'junction').catch(() => {});
  await writeFile(join(dir, '.sandbox-block-net.mjs'), BLOCK_NET);
  return {
    dir,
    async dispose() {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  };
}

// edits: [{ file, search, replace }]  newFiles: [{ path, content }]
// Rules: no protected files, existing tests are never changed, search text must
// occur exactly once, no new access to environment variables / secrets.
export async function applyChanges(dir, { edits = [], newFiles = [] }, { original = new Map() } = {}) {
  const changed = new Map(); // path → { before, after }
  const violations = [];
  for (const edit of edits) {
    const path = safePath(edit.file);
    if (isProtected(path)) { violations.push(`${path} ist geschützt`); continue; }
    if (/^tests\//.test(path)) { violations.push(`Bestehende Tests (${path}) dürfen nicht verändert werden`); continue; }
    const full = join(dir, path);
    if (!existsSync(full)) { violations.push(`${path} existiert nicht`); continue; }
    const before = changed.get(path)?.after ?? await readFile(full, 'utf8');
    if (!original.has(path)) original.set(path, before);
    const search = String(edit.search ?? '');
    if (!search.trim()) { violations.push(`${path}: leerer Suchtext`); continue; }
    const count = before.split(search).length - 1;
    if (count !== 1) { violations.push(`${path}: Suchtext kommt ${count}× vor (muss genau 1× vorkommen)`); continue; }
    const after = before.replace(search, () => String(edit.replace ?? ''));
    changed.set(path, { before: original.get(path), after });
  }
  for (const file of newFiles) {
    const path = safePath(file.path);
    if (isProtected(path)) { violations.push(`${path} ist geschützt`); continue; }
    if (!/^(modules\/[a-z0-9-]+\/[\w.-]+\.(m?js|json|md)|tests\/unit\/[\w.-]+\.test\.mjs|[\w-]+\.js)$/.test(path)) { violations.push(`Neue Datei an nicht erlaubtem Ort: ${path}`); continue; }
    if (existsSync(join(dir, path))) { violations.push(`${path} existiert schon (neue Dateien dürfen nichts überschreiben)`); continue; }
    changed.set(path, { before: null, after: String(file.content ?? '') });
  }
  // Security boundaries on the added lines.
  for (const [path, { before, after }] of changed) {
    const added = addedLines(before || '', after).join('\n');
    if (/process\.env\b/.test(added)) violations.push(`${path}: neuer Zugriff auf Umgebungsvariablen (Zugangsdaten) ist nicht erlaubt`);
    if (/\b(child_process|execSync|spawnSync)\b/.test(added)) violations.push(`${path}: neue Prozess-Ausführung ist nicht erlaubt`);
    const removed = addedLines(after, before || '').join('\n');
    if (/\bconfirm\s*:|isAuthenticated|askConfirmation/.test(removed)) violations.push(`${path}: entfernt eine Sicherheitsabfrage (Bestätigung/Login)`);
    if (path.startsWith('modules/') && /\bimport\s*\(|\brequire\s*\(|from\s+['"](?!\.\/)|globalThis|process\./.test(after)) violations.push(`${path}: Module dürfen nur Dateien aus ihrem eigenen Ordner importieren und nicht auf process/globalThis zugreifen`);
  }
  if (violations.length) return { ok: false, violations, changed };
  for (const [path, { after }] of changed) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), after);
  }
  return { ok: true, violations: [], changed };
}

function addedLines(before, after) {
  const old = new Set(before.split('\n').map((l) => l.trim()));
  return after.split('\n').filter((l) => l.trim() && !old.has(l.trim()));
}

function run(cmd, args, { cwd, env, timeout = 120_000 }) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, env, timeout, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, killed: Boolean(error?.killed), stdout: String(stdout), stderr: String(stderr) }));
  });
}

export async function syntaxCheck(dir, files) {
  const errors = [];
  for (const file of files.filter((f) => /\.m?js$/.test(f))) {
    const r = await run(process.execPath, ['--check', join(dir, file)], { cwd: dir, env: cleanEnv(), timeout: 20_000 });
    if (r.code !== 0) errors.push(`${file}: ${r.stderr.split('\n').filter((l) => /Error/.test(l))[0] || 'Syntaxfehler'}`);
  }
  return { ok: errors.length === 0, checked: files.filter((f) => /\.m?js$/.test(f)).length, errors };
}

export async function runTestSuite(dir, { timeout = 300_000 } = {}) {
  if (!existsSync(join(dir, 'tests', 'run.mjs'))) return { ok: false, ran: false, error: 'Keine Test-Suite (tests/run.mjs) vorhanden' };
  const r = await run(process.execPath, ['--import', join(dir, '.sandbox-block-net.mjs'), join(dir, 'tests', 'run.mjs'), '--json', dir], { cwd: dir, env: cleanEnv(), timeout });
  try {
    const line = r.stdout.trim().split('\n').filter((l) => l.startsWith('{')).pop();
    return { ran: true, ...JSON.parse(line) };
  } catch {
    return { ok: false, ran: true, error: r.killed ? 'Zeitlimit der Tests überschritten' : `Test-Runner lieferte kein Ergebnis: ${(r.stderr || r.stdout).slice(0, 400)}` };
  }
}

// Starts the server from the sandbox with dummy settings (no real keys) on a
// free port, checks /health and the login page, then stops it.
export async function startProbe(dir, { timeout = 25_000 } = {}) {
  const port = 41000 + Math.floor(Math.random() * 8000);
  const child = spawn(process.execPath, ['--import', join(dir, '.sandbox-block-net.mjs'), 'server.js'], { cwd: dir, env: cleanEnv({ PORT: String(port), JARVIS_PASSWORD: 'sandbox-probe-only', SESSION_SECRET: 'sandbox-probe-secret-0123456789abcdef', EVOLUTION_SANDBOX: '1' }), stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  const deadline = Date.now() + timeout;
  const result = { ok: false, health: false, page: false, error: null };
  try {
    while (Date.now() < deadline) {
      const code = await Promise.race([exited, new Promise((r) => setTimeout(() => r('läuft'), 400))]);
      if (code !== 'läuft') { result.error = `Server beendet sich beim Start (Code ${code}): ${output.split('\n').filter((l) => /Error|error/.test(l)).slice(0, 3).join(' | ').slice(0, 400)}`; break; }
      try {
        const h = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1500) });
        if (h.ok) {
          result.health = true;
          const page = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(3000), redirect: 'manual' });
          result.page = page.status === 200 || page.status === 302;
          result.ok = result.page;
          if (!result.page) result.error = `Startseite antwortet mit Status ${page.status}`;
          break;
        }
      } catch {
        // not up yet
      }
    }
    if (!result.ok && !result.error) result.error = 'Server wurde innerhalb des Zeitlimits nicht erreichbar';
  } finally {
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 2000).unref();
  }
  return result;
}

export function securityScan(dir, files) {
  const js = files.filter((f) => /\.m?js$/.test(f) && existsSync(join(dir, f)));
  if (!js.length) return [];
  return staticAnalysis(dir, { files: js }).filter((f) => f.type === 'sicherheit');
}

// Unified diff (line based, LCS). Good for the size of Jarvis' files.
export function unifiedDiff(path, before, after, context = 3) {
  const a = (before ?? '').split('\n');
  const b = after.split('\n');
  if (before === null) return `--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${b.length} @@\n${b.map((l) => `+${l}`).join('\n')}`;
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) { endA--; endB--; }
  const midA = a.slice(start, endA + 1);
  const midB = b.slice(start, endB + 1);
  // LCS on the changed middle part only
  const n = midA.length;
  const m = midB.length;
  if (n * m > 4_000_000) return `--- a/${path}\n+++ b/${path}\n(Änderung zu groß für die Anzeige: ${n} → ${m} Zeilen)`;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = midA[i] === midB[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && midA[i] === midB[j]) { ops.push(` ${midA[i]}`); i++; j++; } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) { ops.push(`+${midB[j]}`); j++; } else { ops.push(`-${midA[i]}`); i++; }
  }
  const pre = a.slice(Math.max(0, start - context), start).map((l) => ` ${l}`);
  const post = a.slice(endA + 1, endA + 1 + context).map((l) => ` ${l}`);
  const fromA = Math.max(0, start - context) + 1;
  const lenA = pre.length + midA.length + post.length;
  const lenB = pre.length + midB.length + post.length;
  return `--- a/${path}\n+++ b/${path}\n@@ -${fromA},${lenA} +${fromA},${lenB} @@\n${[...pre, ...ops, ...post].join('\n')}`;
}

export function diffStats(changed) {
  let plus = 0;
  let minus = 0;
  const parts = [];
  for (const [path, { before, after }] of changed) {
    const d = unifiedDiff(path, before, after);
    parts.push(d);
    for (const line of d.split('\n').slice(3)) {
      if (line.startsWith('+')) plus++;
      else if (line.startsWith('-')) minus++;
    }
  }
  return { diff: parts.join('\n\n'), added: plus, removed: minus };
}
