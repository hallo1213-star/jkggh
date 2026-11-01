// SelfEvolutionEngine – Jarvis analyses his own code, proposes improvements,
// develops them in an isolated sandbox, tests them for real and – depending on
// the mode – adopts them via GitHub (Render then deploys) or waits for approval.
//
// Modes:   manuell      analyse + proposals; develops only when asked; never adopts by itself
//          beaufsichtigt develops + tests by itself; adopting needs approval
//          autonom      also adopts small, fully tested, non-critical changes by itself
// Fixed boundaries (every mode): protected files, no secrets/env access, no
// removal of confirmations/login checks, existing tests unchanged, no new
// dependencies or paid services, limits for attempts, AI calls, time, budget.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { aiReview, dependencyFindings, listSources, staticAnalysis } from './analyzer.js';
import { applyChanges, createSandbox, diffStats, isCritical, isProtected, runTestSuite, securityScan, startProbe, syntaxCheck } from './sandbox.js';
import { commitFiles, gitConfig, restoreFiles, verifyBase } from './git.js';
import { checkModuleCode, loadModules } from './modules.js';

export const MODES = ['manuell', 'beaufsichtigt', 'autonom'];
const MODE_LABEL = { manuell: 'Manual Mode', beaufsichtigt: 'Supervised Mode', autonom: 'Autonomous Mode' };
const DEFAULT_LIMITS = { maxAttemptsPerTask: 3, maxAiCallsPerTask: 6, maxAiCallsPerDay: 40, maxMinutesPerTask: 15, budgetEur: 0, autoAnalyseHours: 24, maxAutoDevelopPerDay: 2, maxAutoLines: 80 };
const newId = () => randomUUID().replace(/-/g, '').slice(0, 10);
const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const clip = (v, n) => String(v ?? '').slice(0, n);
const num = (v, def, min, max) => Math.min(Math.max(Number.isFinite(Number(v)) ? Number(v) : def, min), max);

export function sanitizeState(s = {}) {
  const limits = { ...DEFAULT_LIMITS, ...(s.limits || {}) };
  return {
    mode: MODES.includes(s.mode) ? s.mode : 'manuell',
    paused: s.paused === true,
    pauseReason: clip(s.pauseReason, 200),
    limits: {
      maxAttemptsPerTask: num(limits.maxAttemptsPerTask, 3, 1, 5),
      maxAiCallsPerTask: num(limits.maxAiCallsPerTask, 6, 1, 20),
      maxAiCallsPerDay: num(limits.maxAiCallsPerDay, 40, 1, 300),
      maxMinutesPerTask: num(limits.maxMinutesPerTask, 15, 2, 60),
      budgetEur: num(limits.budgetEur, 0, 0, 50),
      autoAnalyseHours: num(limits.autoAnalyseHours, 24, 1, 168),
      maxAutoDevelopPerDay: num(limits.maxAutoDevelopPerDay, 2, 0, 10),
      maxAutoLines: num(limits.maxAutoLines, 80, 5, 300)
    },
    usage: s.usage?.day === today() ? { day: today(), aiCalls: Number(s.usage.aiCalls) || 0, eur: Number(s.usage.eur) || 0, autoDevelops: Number(s.usage.autoDevelops) || 0 } : { day: today(), aiCalls: 0, eur: 0, autoDevelops: 0 },
    month: s.month?.key === today().slice(0, 7) ? s.month : { key: today().slice(0, 7), eur: 0 },
    versions: Array.isArray(s.versions) ? s.versions.slice(-60) : [],
    analysis: s.analysis && typeof s.analysis === 'object' ? s.analysis : null,
    proposals: Array.isArray(s.proposals) ? s.proposals.slice(-40) : [],
    queue: Array.isArray(s.queue) ? s.queue.slice(-40) : [],
    memory: { entries: Array.isArray(s.memory?.entries) ? s.memory.entries.slice(-200) : [], sensitive: s.memory?.sensitive && typeof s.memory.sensitive === 'object' ? s.memory.sensitive : {} },
    modules: s.modules && typeof s.modules === 'object' ? s.modules : {},
    lastTestRun: s.lastTestRun || null,
    pendingDeploy: s.pendingDeploy || null,
    aiReviewCursor: Number(s.aiReviewCursor) || 0,
    log: Array.isArray(s.log) ? s.log.slice(-300) : []
  };
}

// AI answer format for changes (robust for code, unlike JSON).
export function parseChanges(text) {
  const raw = String(text ?? '');
  const field = (name) => (new RegExp(`^${name}:\\s*(.+)$`, 'mi').exec(raw)?.[1] || '').trim();
  const edits = [];
  const newFiles = [];
  const editRe = /=== ÄNDERUNG: ([^\n=]+?) ===\n<<<<<<< SUCHEN\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> ERSETZEN/g;
  let m;
  while ((m = editRe.exec(raw))) edits.push({ file: m[1].trim(), search: m[2], replace: m[3] });
  const fileRe = /=== NEUE DATEI: ([^\n=]+?) ===\n([\s\S]*?)\n=== ENDE ===/g;
  while ((m = fileRe.exec(raw))) newFiles.push({ path: m[1].trim(), content: m[2].replace(/^```[a-z]*\n/, '').replace(/\n?```\s*$/, '') });
  return { summary: field('ZUSAMMENFASSUNG'), why: field('BEGRÜNDUNG'), risk: field('RISIKO').toLowerCase(), affects: field('AUSWIRKUNG'), edits, newFiles };
}

const CHANGE_FORMAT = `Antwortformat GENAU so (keine Erklärtexte außerhalb):
ZUSAMMENFASSUNG: <ein Satz, was geändert wird>
BEGRÜNDUNG: <warum sinnvoll>
AUSWIRKUNG: <welche anderen Module/Funktionen betroffen sein könnten>
RISIKO: <niedrig|mittel|hoch>
=== ÄNDERUNG: <pfad/datei.js> ===
<<<<<<< SUCHEN
<exakter, unveränderter Ausschnitt aus der Datei – muss genau einmal vorkommen, mehrere Zeilen für Eindeutigkeit>
=======
<neuer Code für genau diesen Ausschnitt>
>>>>>>> ERSETZEN
(weitere Änderungen gleich; neue Dateien so:)
=== NEUE DATEI: <pfad> ===
<Inhalt>
=== ENDE ===`;

const RULES = `Regeln (fest, nicht verhandelbar):
- Minimal und gezielt ändern; bestehendes Verhalten und alle Exporte bleiben erhalten.
- Keine neuen Abhängigkeiten, keine neuen externen Dienste, kein Zugriff auf process.env, keine Prozess-Ausführung.
- Keine Sicherheitsabfragen (confirm, Login) entfernen. Geschützte Dateien (auth.js, evolution/, package.json, render.yaml, tests/run.mjs) nicht anfassen.
- Bestehende Testdateien NIE ändern; neue Tests nur als neue Datei tests/unit/<name>.test.mjs.
- Tests: reines Node (node:assert/strict), ohne Netzwerk (fetch per Parameter/Attrappe), Imports relativ ('../../datei.js'), am Ende eine Zeile "console.log(\`<name>: \${n} bestanden\`)"; bei Fehler wirft assert.
- Neue Funktionsmodule nur unter modules/<name>/ (module.json + index.js mit export function setup(api)); nur Imports aus dem eigenen Ordner.`;

export class SelfEvolutionEngine {
  constructor({ root, store, notify = async () => {}, generate, aiCost = () => 0, addTool, broadcast = () => {}, origin = () => '', log = console, fetchImpl = fetch, tickMs = 20_000, sandboxRuns } = {}) {
    Object.assign(this, { root, store, notify, generate, aiCost, addTool, broadcast, origin, log, fetchImpl, tickMs });
    this.sandboxRuns = sandboxRuns; // test hook
    this.state = sanitizeState();
    this.running = null;
    this.moduleStatus = [];
    this.baseline = null;
    this.timer = null;
  }

  // --- persistence & log --------------------------------------------------------
  save(now_ = false) {
    this.broadcast(this.summary());
    return this.store?.save(this.state, { now: now_ });
  }
  addLog(text, level = 'info') {
    this.state.log.push({ at: now(), level, text: clip(text, 500) });
    this.state.log = this.state.log.slice(-300);
  }
  remember(entry) {
    this.state.memory.entries.push({ at: now(), ...entry });
    this.state.memory.entries = this.state.memory.entries.slice(-200);
    if (entry.outcome === 'fehlgeschlagen' && entry.file) this.state.memory.sensitive[entry.file] = (this.state.memory.sensitive[entry.file] || 0) + 1;
  }
  lessonsFor(file) {
    return this.state.memory.entries.filter((e) => !file || e.file === file).slice(-8).map((e) => `${e.outcome === 'erfolg' ? '✓' : '✗'} ${e.title}${e.reason ? ` – ${e.reason}` : ''}${e.lesson ? ` (Lehre: ${e.lesson})` : ''}`);
  }

  get currentVersion() {
    return this.state.versions.at(-1) || null;
  }
  nextVersion() {
    const v = this.currentVersion?.version || '1.0';
    const [major, minor] = v.split('.').map(Number);
    return `${major || 1}.${(minor || 0) + 1}`;
  }

  // --- start, recovery, post-deploy check -----------------------------------------
  async start() {
    const loaded = await this.store?.load().catch(() => null);
    this.state = sanitizeState(loaded || {});
    const git = gitConfig();
    if (!this.state.versions.length) {
      this.state.versions.push({ version: '1.0', sha: git.deployedCommit || 'lokal', at: now(), description: 'Ausgangsversion', files: [], tests: null, status: 'stabil' });
      this.addLog('Self-Evolution gestartet – Ausgangsversion 1.0 festgehalten.');
    }
    // Tasks that were running when the server restarted continue.
    for (const task of this.state.queue) {
      if (task.status === 'läuft') {
        task.status = 'wartet';
        this.addLog(`Nach einem Neustart fortgesetzt: ${task.title}`);
      }
    }
    this.moduleStatus = await loadModules(this.root, { enabled: this.state.modules, addTool: this.addTool, log: this.log }).catch(() => []);
    for (const m of this.moduleStatus) {
      if (m.status === 'fehler') {
        this.state.modules[m.name] = { ...(this.state.modules[m.name] || {}), enabled: false, error: m.error };
        this.addLog(`Modul ${m.name} konnte nicht laden und wurde deaktiviert: ${m.error}`, 'fehler');
      }
    }
    await this.save(true);
    this.postDeployCheck().catch((error) => this.log.warn(`Self-Evolution Nachprüfung: ${error.message}`));
    this.timer = setInterval(() => this.tick().catch((error) => this.log.warn(`Self-Evolution: ${error.message}`)), this.tickMs);
    this.timer.unref?.();
    return this;
  }

  stop() {
    clearInterval(this.timer);
    clearInterval(this.watchTimer);
  }

  // The new version runs: test it for real; roll back automatically if broken.
  async postDeployCheck() {
    const pending = this.state.pendingDeploy;
    const deployed = gitConfig().deployedCommit;
    if (!pending) return;
    if (!deployed || deployed !== pending.sha) {
      if (Date.now() - Date.parse(pending.at) < 25 * 60_000) this.watchDeploy();
      return;
    }
    this.addLog(`Neue Version ${pending.version} ist gestartet – Nachprüfung läuft.`);
    const report = await this.testCurrent({ label: `Nachprüfung ${pending.version}` });
    const version = this.state.versions.find((v) => v.sha === pending.sha);
    this.state.pendingDeploy = null;
    if (report.ok) {
      if (version) version.status = 'stabil';
      this.addLog(`Version ${pending.version} läuft stabil (${report.tests?.passedFiles}/${report.tests?.files} Testdateien).`);
      await this.notify(`Self-Evolution Update:\n\nVersion ${pending.version} läuft stabil.\n\nTests:\n${report.tests?.assertions ?? 0} Prüfungen erfolgreich.`);
      await this.save(true);
    } else {
      if (version) version.status = 'fehlerhaft';
      this.addLog(`Version ${pending.version} besteht die Nachprüfung nicht – automatischer Rollback.`, 'fehler');
      this.enqueue('rollback', `Automatischer Rollback von ${pending.version}`, { reason: report.error || 'Nachprüfung fehlgeschlagen', auto: true });
      await this.save(true);
    }
  }

  // Old instance: if the new version does not come online in time, the deploy
  // failed (e.g. it does not start) → restore the last good files.
  watchDeploy() {
    clearInterval(this.watchTimer);
    const pending = this.state.pendingDeploy;
    if (!pending || !this.origin()) return;
    this.watchTimer = setInterval(async () => {
      const p = this.state.pendingDeploy;
      if (!p || p.sha !== pending.sha) { clearInterval(this.watchTimer); return; }
      try {
        const health = await (await this.fetchImpl(`${this.origin()}/health`, { signal: AbortSignal.timeout(8000) })).json();
        if (health.commit && pending.sha.startsWith(health.commit)) { clearInterval(this.watchTimer); return; } // live
      } catch {
        // keep waiting
      }
      if (Date.now() - Date.parse(p.at) > 20 * 60_000) {
        clearInterval(this.watchTimer);
        this.addLog(`Version ${p.version} ist nach 20 Minuten nicht online gegangen – automatischer Rollback.`, 'fehler');
        this.enqueue('rollback', `Automatischer Rollback von ${p.version}`, { reason: 'Neue Version ist nicht gestartet', auto: true });
        this.state.pendingDeploy = null;
        await this.save(true);
      }
    }, 60_000);
    this.watchTimer.unref?.();
  }

  // --- queue & worker ---------------------------------------------------------------------
  enqueue(type, title, args = {}) {
    const exists = this.state.queue.find((t) => t.type === type && ['wartet', 'läuft'].includes(t.status) && JSON.stringify(t.args) === JSON.stringify(args));
    if (exists) return exists;
    const task = { id: newId(), type, title: clip(title, 160), args, status: 'wartet', createdAt: now(), attempts: 0, steps: [] };
    this.state.queue.push(task);
    this.state.queue = this.state.queue.slice(-40);
    this.save();
    return task;
  }

  async tick() {
    if (this.running) return;
    const s = this.state;
    if (s.usage.day !== today()) s.usage = { day: today(), aiCalls: 0, eur: 0, autoDevelops: 0 };
    // Rollbacks run even while paused (they make things safer).
    let task = s.queue.find((t) => t.status === 'wartet' && t.type === 'rollback');
    if (!task && !s.paused) task = s.queue.find((t) => t.status === 'wartet');
    if (!task && !s.paused) {
      const last = Date.parse(s.analysis?.at || 0);
      if (Date.now() - last > s.limits.autoAnalyseHours * 3600_000) task = this.enqueue('analyse', 'Regelmäßige Codeanalyse', { scheduled: true });
      else if (s.mode !== 'manuell' && s.usage.autoDevelops < s.limits.maxAutoDevelopPerDay) {
        const candidate = this.pickCandidate();
        if (candidate) {
          s.usage.autoDevelops += 1;
          task = this.enqueue('entwickeln', `Verbesserung: ${candidate.problem} (${candidate.file})`, { findingId: candidate.id, auto: true });
        }
      }
    }
    if (task) await this.runTask(task);
  }

  pickCandidate() {
    const findings = this.state.analysis?.findings || [];
    const tried = new Set(this.state.proposals.map((p) => p.findingId));
    const failedTwice = (f) => this.state.memory.entries.filter((e) => e.findingId === f.id && e.outcome === 'fehlgeschlagen').length >= 2;
    const order = { tests: 0, fehlerbehandlung: 1, sicherheit: 2, duplikat: 3 };
    return findings
      .filter((f) => f.type in order && !isCritical(f.file) && !isProtected(f.file) && !tried.has(f.id) && !failedTwice(f) && (this.state.memory.sensitive[f.file] || 0) < 3)
      .sort((a, b) => order[a.type] - order[b.type])[0] || null;
  }

  async runTask(task) {
    const limits = this.state.limits;
    this.running = task;
    task.status = 'läuft';
    task.startedAt = now();
    task.attempts += 1;
    task.aiCalls = 0;
    task.steps = [];
    this.addLog(`Start: ${task.title}`);
    await this.save(true);
    const deadline = Date.now() + limits.maxMinutesPerTask * 60_000;
    const ctx = { task, deadline, step: (name, ok, detail = '') => { task.steps.push({ name, ok, detail: clip(detail, 300), at: now() }); this.broadcast(this.summary()); } };
    try {
      const handler = { analyse: () => this.doAnalyse(ctx), entwickeln: () => this.doDevelop(ctx), testen: () => this.doTest(ctx), uebernehmen: () => this.doAdopt(ctx), rollback: () => this.doRollback(ctx) }[task.type];
      if (!handler) throw new Error(`Unbekannte Aufgabe ${task.type}`);
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error(`Zeitlimit von ${limits.maxMinutesPerTask} Minuten erreicht – abgebrochen`)), Math.max(1000, deadline - Date.now())).unref?.());
      task.result = await Promise.race([handler(), timeout]);
      task.status = 'erledigt';
      this.addLog(`Fertig: ${task.title}${task.result?.text ? ` – ${task.result.text}` : ''}`);
    } catch (error) {
      task.status = error.paused ? 'wartet' : 'fehlgeschlagen';
      task.error = clip(error.message, 400);
      this.addLog(`${error.paused ? 'Pausiert' : 'Fehlgeschlagen'}: ${task.title} – ${error.message}`, 'fehler');
      if (!error.paused && task.type !== 'entwickeln') await this.notify(`Self-Evolution:\n\nEine Aufgabe ist fehlgeschlagen: ${task.title}\nGrund: ${clip(error.message, 300)}`);
    } finally {
      task.finishedAt = now();
      this.running = null;
      await this.save(true);
    }
  }

  // Counted AI call with budget and limits.
  async ai(ctx, options) {
    const s = this.state;
    if (!this.generate) throw new Error('Kein KI-Schlüssel eingerichtet.');
    if (ctx.task.aiCalls >= s.limits.maxAiCallsPerTask) throw new Error(`Limit von ${s.limits.maxAiCallsPerTask} KI-Aufrufen für diese Aufgabe erreicht`);
    if (s.usage.aiCalls >= s.limits.maxAiCallsPerDay) throw this.pause(`Tageslimit von ${s.limits.maxAiCallsPerDay} KI-Aufrufen erreicht`);
    const cost = this.aiCost();
    if (cost > 0 && s.month.eur + cost > s.limits.budgetEur) throw this.pause(`KI-Budget erreicht (${s.month.eur.toFixed(2)} € von ${s.limits.budgetEur.toFixed(2)} € diesen Monat)`);
    if (Date.now() > ctx.deadline) throw new Error('Zeitlimit erreicht');
    ctx.task.aiCalls += 1;
    s.usage.aiCalls += 1;
    s.usage.eur += cost;
    s.month.eur += cost;
    return this.generate(options);
  }

  pause(reason) {
    this.state.paused = true;
    this.state.pauseReason = reason;
    this.addLog(`Selbstverbesserung pausiert: ${reason}`, 'warnung');
    this.notify(`Self-Evolution:\n\nDie Selbstverbesserung wurde pausiert.\nGrund: ${reason}\n\nSag „Jarvis, setze die Selbstverbesserung fort“, wenn es weitergehen soll.`).catch(() => {});
    const error = new Error(reason);
    error.paused = true;
    return error;
  }

  // --- analysis -------------------------------------------------------------------------------
  async doAnalyse(ctx) {
    const files = listSources(this.root);
    const findings = staticAnalysis(this.root, { files });
    ctx.step('Statische Analyse', true, `${files.length} Dateien, ${findings.length} Befunde`);
    const deps = await dependencyFindings(this.root, { fetchImpl: this.fetchImpl }).catch(() => []);
    findings.push(...deps);
    ctx.step('Abhängigkeiten geprüft', true, `${deps.length} veraltet`);
    // AI review of one file per analysis (rotating), only if limits allow.
    let reviewed = null;
    if (this.generate && this.state.usage.aiCalls < this.state.limits.maxAiCallsPerDay && (this.aiCost() === 0 || this.state.month.eur + this.aiCost() <= this.state.limits.budgetEur)) {
      const candidates = files.filter((f) => !f.startsWith('public/vendor'));
      reviewed = candidates[this.state.aiReviewCursor % candidates.length];
      this.state.aiReviewCursor += 1;
      try {
        const ai = await aiReview(this.root, reviewed, { generate: (o) => this.ai(ctx, o), lessons: this.lessonsFor(reviewed) });
        findings.push(...ai);
        ctx.step(`KI-Prüfung ${reviewed}`, true, `${ai.length} belegte Befunde (Zitate im Code gefunden)`);
      } catch (error) {
        if (error.paused) throw error;
        ctx.step(`KI-Prüfung ${reviewed}`, false, error.message);
      }
    }
    const unique = [...new Map(findings.map((f) => [f.id, f])).values()];
    const before = new Set((this.state.analysis?.findings || []).map((f) => f.id));
    const fresh = unique.filter((f) => !before.has(f.id));
    this.state.analysis = { at: now(), files: files.length, findings: unique, reviewed, stats: unique.reduce((acc, f) => ({ ...acc, [f.severity]: (acc[f.severity] || 0) + 1 }), {}) };
    if (fresh.length && !ctx.task.args.scheduled) {
      await this.notify(`Self-Evolution Update:\n\nCodeanalyse fertig: ${unique.length} Befunde (${fresh.length} neu).\n${unique.slice(0, 4).map((f) => `• ${f.problem} (${f.file})`).join('\n')}`);
    }
    return { text: `${unique.length} Befunde (${fresh.length} neu)`, findings: unique.length, fresh: fresh.length };
  }

  // --- development in the sandbox -----------------------------------------------------------------
  findingFor(args) {
    if (args.findingId) {
      const f = (this.state.analysis?.findings || []).find((x) => x.id === args.findingId);
      if (!f) throw new Error('Diesen Befund gibt es nicht (mehr). Bitte zuerst neu analysieren.');
      return f;
    }
    return { id: `wunsch-${newId()}`, type: 'wunsch', severity: 'mittel', file: '', function: '', line: 1, problem: clip(args.description, 300), explanation: 'Wunsch des Nutzers', suggestion: clip(args.description, 500), impact: '', risk: 'mittel' };
  }

  codeContext(file, fn) {
    const code = readFileSync(join(this.root, file), 'utf8');
    const lines = code.split('\n');
    if (lines.length <= 450) return `Datei ${file} (vollständig):\n${code}`;
    let at = fn ? lines.findIndex((l) => new RegExp(`\\b${fn.replace(/[$]/g, '\\$')}\\b`).test(l) && /function|=>|\(/.test(l)) : -1;
    if (at < 0) at = 0;
    const from = Math.max(0, at - 40);
    const exportsList = lines.filter((l) => /^export /.test(l)).map((l) => l.slice(0, 120)).join('\n');
    return `Datei ${file} (${lines.length} Zeilen, Ausschnitt ${from + 1}–${Math.min(lines.length, from + 260)}):\n${lines.slice(from, from + 260).join('\n')}\n\nExporte der Datei:\n${exportsList}`;
  }

  async doDevelop(ctx) {
    const { task } = ctx;
    const finding = this.findingFor(task.args);
    let target = finding.file;
    if (!target) {
      // A wish: let the AI pick the file (one call), only from real files.
      const files = listSources(this.root).filter((f) => !isProtected(f));
      const pick = await this.ai(ctx, { system: 'Du wählst die eine Datei eines Node.js-Projekts, in der ein Wunsch am sinnvollsten umgesetzt wird. Antworte nur mit JSON.', prompt: `Wunsch: ${finding.problem}\nDateien:\n${files.join('\n')}\n\nJSON: {"file": "pfad aus der Liste", "neuesModul": true|false, "modulName": "kebab-case falls neues Modul"}`, maxTokens: 300 });
      target = files.includes(pick?.file) ? pick.file : '';
      if (!target && !pick?.neuesModul) throw new Error('Konnte keine passende Datei für den Wunsch bestimmen.');
      finding.file = target || `modules/${String(pick.modulName || 'neues-modul').replace(/[^a-z0-9-]/g, '').slice(0, 30) || 'neues-modul'}`;
    }
    if (isProtected(finding.file)) throw new Error(`${finding.file} ist geschützt und wird nicht verändert.`);
    const proposal = { id: newId(), findingId: finding.id, title: finding.problem, file: finding.file, function: finding.function, why: finding.explanation, risk: finding.risk, status: 'in Entwicklung', attempts: [], createdAt: now(), auto: Boolean(task.args.auto) };
    this.state.proposals.push(proposal);
    this.state.proposals = this.state.proposals.slice(-40);
    const baseline = await this.getBaseline(ctx);
    let feedback = '';
    const lessons = this.lessonsFor(finding.file);
    for (let attempt = 1; attempt <= this.state.limits.maxAttemptsPerTask; attempt++) {
      const isModule = finding.file.startsWith('modules/');
      const context = finding.type === 'tests'
        ? `${this.codeContext(finding.file, '')}\n\nAufgabe: Lege NUR eine neue Testdatei tests/unit/${finding.file.replace(/\.m?js$/, '').replace(/\//g, '-')}.test.mjs an, die die exportierten Funktionen dieser Datei sinnvoll testet (ohne Netzwerk).`
        : isModule ? `Neues Funktionsmodul ${finding.file}/ (module.json + index.js). Schnittstelle: export function setup(api) mit api.log, api.defineTool({name, description, parameters, run}) (Fähigkeit "tools") und api.fetchJson(url) (Fähigkeit "fetch", nur HTTPS-GET). Lege zusätzlich einen Test tests/unit/modul-${finding.file.split('/')[1]}.test.mjs an, der setup mit einer Attrappe der api aufruft und die Werkzeuge prüft.`
          : this.codeContext(finding.file, finding.function);
      let text;
      try {
        text = await this.ai(ctx, {
          system: `Du bist der Software-Ingenieur von Jarvis (Node.js, ESM). Du verbesserst Jarvis' eigenen Code vorsichtig und nachvollziehbar.\n${RULES}\n\n${CHANGE_FORMAT}`,
          prompt: `Problem: ${finding.problem}\nDatei: ${finding.file}${finding.function ? `, Funktion ${finding.function}` : ''}${finding.line ? ` (Zeile ${finding.line})` : ''}\nErklärung: ${finding.explanation}\nVorschlag: ${finding.suggestion}\n${lessons.length ? `\nFrühere Erfahrungen mit dieser Datei:\n${lessons.join('\n')}\n` : ''}${feedback ? `\nDein letzter Versuch ist gescheitert – behebe genau das:\n${feedback}\n` : ''}\n${context}`,
          maxTokens: 6000,
          raw: true
        });
      } catch (error) {
        proposal.status = 'fehlgeschlagen';
        proposal.error = error.message;
        throw error;
      }
      const changes = parseChanges(text);
      const record = { attempt, at: now(), summary: changes.summary, ok: false };
      proposal.attempts.push(record);
      if (!changes.edits.length && !changes.newFiles.length) { feedback = 'Keine Änderung im vorgeschriebenen Format gefunden.'; record.error = feedback; ctx.step(`Versuch ${attempt}: Format`, false, feedback); continue; }
      const result = await this.testInSandbox(ctx, changes, baseline, `Versuch ${attempt}`);
      Object.assign(record, { ok: result.ok, error: result.error });
      if (result.ok) {
        Object.assign(proposal, {
          status: 'getestet', summary: changes.summary || finding.problem, why: changes.why || finding.explanation, affects: changes.affects, risk: changes.risk || finding.risk,
          changes: { edits: changes.edits, newFiles: changes.newFiles }, originals: result.originals, files: result.files, report: result.report, diff: result.diff, testedAt: now()
        });
        const auto = this.autoAdoptable(proposal);
        proposal.autoAdoptable = auto.ok;
        proposal.manualReason = auto.reason;
        if (this.state.mode === 'autonom' && auto.ok) {
          proposal.status = 'wird übernommen';
          this.enqueue('uebernehmen', `Übernahme: ${proposal.summary}`, { proposalId: proposal.id, auto: true });
        } else {
          proposal.status = 'wartet auf Freigabe';
          await this.notify(`Self-Evolution Update:\n\nEine Verbesserung wurde entwickelt.\n\nModul:\n${proposal.file}\n\nÄnderungen:\n${proposal.summary}\n\nTests:\n${result.report.tests.assertions} erfolgreich (${result.report.tests.passedFiles}/${result.report.tests.files} Testdateien), Startprobe ok.\n\nStatus:\nWartet auf Freigabe${auto.ok ? '' : ` (${auto.reason})`}.`);
        }
        this.remember({ findingId: finding.id, file: finding.file, title: proposal.summary, outcome: 'erfolg', lesson: attempt > 1 ? `Gelang im ${attempt}. Versuch nach: ${clip(feedback, 160)}` : '' });
        return { text: `Getestet (${result.report.tests.assertions} Prüfungen) – ${proposal.status}`, proposalId: proposal.id };
      }
      feedback = result.error;
    }
    proposal.status = 'fehlgeschlagen';
    proposal.error = feedback;
    this.remember({ findingId: finding.id, file: finding.file, title: finding.problem, outcome: 'fehlgeschlagen', reason: clip(feedback, 300), lesson: 'Nicht in derselben Art erneut versuchen.' });
    await this.notify(`Self-Evolution:\n\nVerbesserung „${clip(finding.problem, 120)}“ nach ${this.state.limits.maxAttemptsPerTask} Versuchen verworfen.\nGrund: ${clip(feedback, 300)}\n\nNichts wurde übernommen.`);
    throw new Error(`Nach ${this.state.limits.maxAttemptsPerTask} Versuchen nicht erfolgreich: ${clip(feedback, 200)}`);
  }

  autoAdoptable(p) {
    const files = p.files || [];
    const lines = (p.report?.diff?.added || 0) + (p.report?.diff?.removed || 0);
    if (files.some(isCritical)) return { ok: false, reason: 'betrifft eine kritische Datei' };
    if (files.length > 3) return { ok: false, reason: 'mehr als 3 Dateien' };
    if (lines > this.state.limits.maxAutoLines) return { ok: false, reason: `${lines} geänderte Zeilen (Grenze ${this.state.limits.maxAutoLines})` };
    if (/hoch/.test(p.risk || '')) return { ok: false, reason: 'Risiko hoch' };
    if (!gitConfig().enabled) return { ok: false, reason: 'GitHub-Übernahme nicht eingerichtet' };
    return { ok: true, reason: '' };
  }

  async getBaseline(ctx) {
    if (this.baseline) return this.baseline;
    const box = await createSandbox(this.root);
    try {
      const tests = await runTestSuite(box.dir);
      ctx.step('Ausgangszustand getestet', tests.ran && tests.ok !== undefined, tests.ran ? `${tests.passedFiles}/${tests.files} Testdateien` : tests.error);
      this.baseline = tests;
      return tests;
    } finally {
      await box.dispose();
    }
  }

  async testInSandbox(ctx, changes, baseline, label) {
    const box = await createSandbox(this.root);
    const original = new Map();
    try {
      const applied = await applyChanges(box.dir, changes, { original });
      if (!applied.ok) { ctx.step(`${label}: Sicherheitsregeln`, false, applied.violations.join(' · ')); return { ok: false, error: `Regelverstoß: ${applied.violations.join('; ')}` }; }
      const files = [...applied.changed.keys()];
      ctx.step(`${label}: Änderung in Sandbox angewendet`, true, files.join(', '));
      for (const f of files.filter((x) => x.startsWith('modules/') && x.endsWith('.js'))) {
        const problems = checkModuleCode(applied.changed.get(f).after);
        if (problems.length) return { ok: false, error: `Modul ${f}: ${problems.join(', ')}` };
      }
      const syntax = await syntaxCheck(box.dir, files);
      ctx.step(`${label}: Syntaxprüfung`, syntax.ok, syntax.ok ? `${syntax.checked} Dateien` : syntax.errors.join(' · '));
      if (!syntax.ok) return { ok: false, error: `Syntaxfehler: ${syntax.errors.join('; ')}` };
      const tests = await runTestSuite(box.dir);
      const newlyBroken = (tests.results || []).filter((r) => !r.passed && (baseline?.results || []).some((b) => b.file === r.file && b.passed));
      const newTests = (tests.results || []).filter((r) => !(baseline?.results || []).some((b) => b.file === r.file));
      const failingNew = newTests.filter((r) => !r.passed);
      const testsOk = tests.ran && !tests.error && newlyBroken.length === 0 && failingNew.length === 0 && (tests.results || []).every((r) => r.passed || !(baseline?.results || []).some((b) => b.file === r.file && b.passed));
      ctx.step(`${label}: Tests (Regression + neue Tests)`, testsOk, tests.error || `${tests.passedFiles}/${tests.files} Testdateien, ${tests.assertions} Prüfungen${newlyBroken.length ? `; kaputt: ${newlyBroken.map((r) => r.file).join(', ')}` : ''}${failingNew.length ? `; neue Tests scheitern: ${failingNew.map((r) => `${r.file} (${r.error})`).join(', ')}` : ''}`);
      if (!testsOk) return { ok: false, error: tests.error || [...newlyBroken.map((r) => `Bestehender Test kaputt: ${r.file}: ${r.error}`), ...failingNew.map((r) => `Neuer Test scheitert: ${r.file}: ${r.error}`)].join('; ') };
      const probe = await startProbe(box.dir);
      ctx.step(`${label}: Startprobe des Servers`, probe.ok, probe.error || '/health und Startseite antworten');
      if (!probe.ok) return { ok: false, error: `Server startet nicht: ${probe.error}` };
      const before = securityScan(this.root, files.filter((f) => applied.changed.get(f).before !== null)).length;
      const after = securityScan(box.dir, files).length;
      ctx.step(`${label}: Sicherheitsprüfung`, after <= before, `${after} Sicherheitsbefunde (vorher ${before})`);
      if (after > before) return { ok: false, error: 'Die Änderung bringt neue Sicherheitsprobleme' };
      const diff = diffStats(applied.changed);
      return {
        ok: true, files, diff: diff.diff,
        originals: [...original.entries()].concat(files.filter((f) => applied.changed.get(f).before === null).map((f) => [f, null])),
        report: { syntax, tests: { files: tests.files, passedFiles: tests.passedFiles, assertions: tests.assertions, before: baseline ? { files: baseline.files, passedFiles: baseline.passedFiles, assertions: baseline.assertions } : null }, probe, security: { before, after }, diff: { added: diff.added, removed: diff.removed } }
      };
    } finally {
      await box.dispose();
    }
  }

  // --- test the current version ------------------------------------------------------------------------
  async testCurrent({ label = 'Test der aktuellen Version' } = {}) {
    const box = await createSandbox(this.root);
    try {
      const files = listSources(this.root);
      const syntax = await syntaxCheck(box.dir, files);
      const tests = await runTestSuite(box.dir);
      const probe = await startProbe(box.dir);
      const ok = syntax.ok && tests.ran && tests.ok && probe.ok;
      this.state.lastTestRun = { at: now(), label, ok, syntax: { ok: syntax.ok, checked: syntax.checked, errors: syntax.errors.slice(0, 5) }, tests: { files: tests.files, passedFiles: tests.passedFiles, assertions: tests.assertions, failed: (tests.results || []).filter((r) => !r.passed).map((r) => `${r.file}: ${r.error}`) }, probe, error: ok ? null : [syntax.errors[0], tests.error, (tests.results || []).find((r) => !r.passed)?.file, probe.error].filter(Boolean).join(' · ') };
      this.baseline = tests;
      return this.state.lastTestRun;
    } finally {
      await box.dispose();
    }
  }

  async doTest(ctx) {
    const r = await this.testCurrent();
    ctx.step('Syntax aller Dateien', r.syntax.ok, `${r.syntax.checked} Dateien`);
    ctx.step('Test-Suite', r.tests.passedFiles === r.tests.files, `${r.tests.passedFiles}/${r.tests.files} Testdateien, ${r.tests.assertions} Prüfungen`);
    ctx.step('Startprobe', r.probe.ok, r.probe.error || 'ok');
    await this.notify(`Self-Evolution:\n\nTest der aktuellen Version (${this.currentVersion?.version}): ${r.ok ? 'bestanden' : 'NICHT bestanden'}.\n${r.tests.assertions} Prüfungen in ${r.tests.passedFiles}/${r.tests.files} Testdateien, Startprobe ${r.probe.ok ? 'ok' : 'fehlgeschlagen'}.`);
    return { text: r.ok ? 'Alle Tests bestanden' : `Nicht bestanden: ${r.error}` };
  }

  // --- adopt & roll back ---------------------------------------------------------------------------------
  async doAdopt(ctx) {
    const p = this.state.proposals.find((x) => x.id === ctx.task.args.proposalId);
    if (!p || !p.changes) throw new Error('Vorschlag nicht gefunden.');
    if (!['wartet auf Freigabe', 'wird übernommen'].includes(p.status)) throw new Error(`Vorschlag hat Status „${p.status}“.`);
    const git = gitConfig();
    if (!git.enabled) {
      p.status = 'wartet auf Freigabe';
      throw new Error('GitHub-Übernahme ist nicht eingerichtet (GITHUB_TOKEN, GITHUB_REPO). Du kannst den Patch im Dashboard herunterladen.');
    }
    // Re-test against the current code right before adopting.
    const baseline = await this.getBaseline(ctx);
    const result = await this.testInSandbox(ctx, p.changes, baseline, 'Letzte Prüfung vor Übernahme');
    if (!result.ok) {
      p.status = 'fehlgeschlagen';
      p.error = result.error;
      this.remember({ findingId: p.findingId, file: p.file, title: p.summary, outcome: 'fehlgeschlagen', reason: `Vor Übernahme: ${clip(result.error, 200)}` });
      throw new Error(`Übernahme abgebrochen – Tests vor der Übernahme gescheitert: ${result.error}`);
    }
    const originals = new Map(result.originals);
    const check = await verifyBase(originals, { fetchImpl: this.fetchImpl });
    ctx.step('GitHub-Stand geprüft', check.conflicts.length === 0, check.conflicts.length ? `inzwischen geändert: ${check.conflicts.join(', ')}` : `Basis ${check.head.slice(0, 7)}`);
    if (check.conflicts.length) { p.status = 'veraltet'; throw new Error(`Dateien wurden inzwischen auf GitHub geändert (${check.conflicts.join(', ')}). Bitte neu analysieren.`); }
    const box = await createSandbox(this.root);
    let files;
    try {
      const applied = await applyChanges(box.dir, p.changes);
      files = new Map([...applied.changed].map(([path, v]) => [path, v.after]));
    } finally {
      await box.dispose();
    }
    const version = this.nextVersion();
    const commit = await commitFiles(files, `Jarvis ${version}: ${p.summary}\n\n${p.why || ''}\n\nTests: ${result.report.tests.assertions} Prüfungen, ${result.report.tests.passedFiles}/${result.report.tests.files} Testdateien, Startprobe ok.\nErstellt von der Jarvis Self-Evolution Engine.`, { parent: check.head, fetchImpl: this.fetchImpl });
    ctx.step('Commit auf GitHub', true, commit.sha.slice(0, 7));
    this.state.versions.push({ version, sha: commit.sha, previous: commit.parent, at: now(), description: p.summary, files: [...files.keys()], tests: result.report.tests, status: 'wird ausgerollt', proposalId: p.id, url: commit.url });
    this.state.pendingDeploy = { sha: commit.sha, previous: commit.parent, version, files: [...files.keys()], at: now() };
    p.status = 'übernommen';
    p.version = version;
    this.watchDeploy();
    await this.notify(`Self-Evolution Update:\n\nVersion ${version} wurde übernommen.\n\nÄnderungen:\n${p.summary}\n\nGeänderte Dateien:\n${[...files.keys()].join(', ')}\n\nTests:\n${result.report.tests.assertions} erfolgreich.\n\nStatus:\nRender rollt die neue Version aus. Jarvis prüft sie danach automatisch und stellt bei Fehlern die vorherige Version wieder her.`);
    return { text: `Version ${version} übernommen (${commit.sha.slice(0, 7)})`, version };
  }

  async doRollback(ctx) {
    const git = gitConfig();
    if (!git.enabled) throw new Error('Rollback braucht die GitHub-Übernahme (GITHUB_TOKEN, GITHUB_REPO).');
    const versions = this.state.versions;
    const targetName = ctx.task.args.version;
    const current = versions.at(-1);
    const target = targetName ? versions.find((v) => v.version === targetName) : [...versions].reverse().find((v) => v !== current && v.status === 'stabil' && v.sha !== 'lokal');
    if (!target || !target.sha || target.sha === 'lokal') throw new Error('Keine wiederherstellbare stabile Version gefunden.');
    const after = versions.slice(versions.indexOf(target) + 1);
    const paths = [...new Set(after.flatMap((v) => v.files || []))];
    if (!paths.length) throw new Error('Seit dieser Version wurde nichts geändert.');
    const version = this.nextVersion();
    const commit = await restoreFiles(paths, target.sha, `Jarvis ${version}: Rollback auf Version ${target.version}\n\nGrund: ${ctx.task.args.reason || 'auf Wunsch'}`, { fetchImpl: this.fetchImpl });
    ctx.step('Wiederherstellung auf GitHub', true, `${paths.length} Dateien auf Stand ${target.version}`);
    for (const v of after) if (v.status !== 'fehlerhaft') v.status = 'zurückgenommen';
    versions.push({ version, sha: commit.sha, previous: commit.parent, at: now(), description: `Rollback auf ${target.version}${ctx.task.args.reason ? ` (${ctx.task.args.reason})` : ''}`, files: paths, tests: null, status: 'wird ausgerollt', rollbackOf: target.version });
    this.state.pendingDeploy = { sha: commit.sha, previous: commit.parent, version, files: paths, at: now(), rollback: true };
    const failed = after.find((v) => v.proposalId);
    if (failed) this.remember({ file: (failed.files || [])[0], title: failed.description, outcome: 'fehlgeschlagen', reason: `Zurückgenommen: ${ctx.task.args.reason || 'auf Wunsch'}`, lesson: 'Ähnliche Änderung nur mit zusätzlichem Test erneut versuchen.' });
    await this.notify(`Self-Evolution:\n\n${ctx.task.args.auto ? 'Automatischer ' : ''}Rollback auf Version ${target.version}.\nGrund: ${ctx.task.args.reason || 'auf Wunsch'}\nWiederhergestellte Dateien: ${paths.join(', ')}`);
    return { text: `Rollback auf ${target.version} (${commit.sha.slice(0, 7)})` };
  }

  // --- commands (dashboard, voice, Telegram) -------------------------------------------------------------
  command(action, args = {}) {
    const s = this.state;
    switch (action) {
      case 'analysieren': return { task: this.enqueue('analyse', 'Codeanalyse auf Wunsch', {}) };
      case 'entwickeln': {
        if (!args.findingId && !String(args.description || '').trim()) throw new Error('Welche Verbesserung? (Befund auswählen oder beschreiben)');
        const f = args.findingId ? this.findingFor(args) : null;
        return { task: this.enqueue('entwickeln', `Verbesserung: ${f ? `${f.problem} (${f.file})` : clip(args.description, 120)}`, args.findingId ? { findingId: args.findingId } : { description: clip(args.description, 500) }) };
      }
      case 'testen': return { task: this.enqueue('testen', 'Test der aktuellen Version', {}) };
      case 'freigeben': {
        const p = s.proposals.find((x) => x.id === args.proposalId);
        if (!p || p.status !== 'wartet auf Freigabe') throw new Error('Kein freizugebender Vorschlag gefunden.');
        p.status = 'wird übernommen';
        return { task: this.enqueue('uebernehmen', `Übernahme: ${p.summary}`, { proposalId: p.id }) };
      }
      case 'verwerfen': {
        const p = s.proposals.find((x) => x.id === args.proposalId);
        if (!p) throw new Error('Vorschlag nicht gefunden.');
        p.status = 'verworfen';
        this.remember({ findingId: p.findingId, file: p.file, title: p.summary || p.title, outcome: 'verworfen', reason: 'vom Nutzer abgelehnt' });
        this.save();
        return { ok: true };
      }
      case 'wiederherstellen': return { task: this.enqueue('rollback', `Wiederherstellung${args.version ? ` von ${args.version}` : ' der letzten stabilen Version'}`, { version: args.version || undefined, reason: 'auf Wunsch des Nutzers' }) };
      case 'modus': {
        if (!MODES.includes(args.mode)) throw new Error('Modus: manuell, beaufsichtigt oder autonom');
        s.mode = args.mode;
        this.addLog(`Modus: ${MODE_LABEL[args.mode]}`);
        this.save(true);
        return { mode: args.mode };
      }
      case 'pausieren': s.paused = true; s.pauseReason = 'vom Nutzer pausiert'; this.addLog('Selbstverbesserung pausiert (Nutzer).'); this.save(true); return { paused: true };
      case 'fortsetzen': s.paused = false; s.pauseReason = ''; this.addLog('Selbstverbesserung fortgesetzt.'); this.save(true); return { paused: false };
      case 'limits': s.limits = sanitizeState({ limits: { ...s.limits, ...args.limits } }).limits; this.addLog('Limits geändert.'); this.save(true); return { limits: s.limits };
      case 'modul': {
        if (!/^[a-z0-9-]{2,40}$/.test(args.name || '')) throw new Error('Modulname fehlt');
        s.modules[args.name] = { ...(s.modules[args.name] || {}), enabled: args.enabled !== false };
        this.addLog(`Modul ${args.name} ${args.enabled !== false ? 'aktiviert' : 'deaktiviert'} (wirkt nach dem nächsten Neustart).`);
        this.save(true);
        return { ok: true };
      }
      default: throw new Error(`Unbekannter Befehl ${action}`);
    }
  }

  summary() {
    const s = this.state;
    const git = gitConfig();
    return {
      mode: s.mode, modeLabel: MODE_LABEL[s.mode], paused: s.paused, pauseReason: s.pauseReason,
      version: this.currentVersion, versions: s.versions.slice(-20).reverse(),
      analysis: s.analysis ? { at: s.analysis.at, files: s.analysis.files, stats: s.analysis.stats, reviewed: s.analysis.reviewed, findings: s.analysis.findings.slice(0, 80) } : null,
      proposals: s.proposals.slice().reverse().map(({ changes, originals, diff, ...rest }) => ({ ...rest, hasDiff: Boolean(diff) })),
      queue: s.queue.slice(-15).reverse(), running: this.running ? { id: this.running.id, title: this.running.title, steps: this.running.steps } : null,
      memory: { entries: s.memory.entries.slice(-20).reverse(), sensitive: s.memory.sensitive },
      modules: this.moduleStatus.map((m) => ({ ...m, enabled: s.modules[m.name]?.enabled !== false })),
      limits: s.limits, usage: s.usage, month: s.month, lastTestRun: s.lastTestRun, pendingDeploy: s.pendingDeploy,
      log: s.log.slice(-40).reverse(),
      git: { enabled: git.enabled, repo: git.repo, branch: git.branch, deployed: git.deployedCommit.slice(0, 7) },
      storage: this.store?.status?.() || null,
      ai: Boolean(this.generate), aiCostPerCall: this.aiCost()
    };
  }

  proposalDiff(id) {
    return this.state.proposals.find((p) => p.id === id)?.diff || '';
  }
}
