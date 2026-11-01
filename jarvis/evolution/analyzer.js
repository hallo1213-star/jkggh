// Code analysis for the Self-Evolution Engine. Two layers:
//  1. Static checks (deterministic, always honest): duplicate functions, very
//     long functions/files, risky patterns, unguarded JSON.parse, timers with
//     async callbacks, modules without tests, outdated dependencies.
//  2. Optional AI review of one file: every finding must quote real code – a
//     finding whose quote is not found in the file is discarded (no invented
//     problems).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SKIP_DIRS = new Set(['node_modules', '.git', 'data', 'tests', 'laptop/node_modules']);
const hash = (text) => createHash('sha1').update(text).digest('hex').slice(0, 10);

export function listSources(root) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const rel = relative(root, full).replace(/\\/g, '/');
      if (SKIP_DIRS.has(name) || SKIP_DIRS.has(rel)) continue;
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (/\.(m?js)$/.test(name) && st.size < 400_000) out.push(rel);
    }
  };
  walk(root);
  return out.sort();
}

// Blanks out strings, template literals and comments (same length), so that
// braces inside them do not confuse the function finder.
export function maskCode(code) {
  let out = '';
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    const n = code[i + 1];
    if (c === '/' && n === '/') { const end = code.indexOf('\n', i); const stop = end < 0 ? code.length : end; out += ' '.repeat(stop - i); i = stop; continue; }
    if (c === '/' && n === '*') { const end = code.indexOf('*/', i + 2); const stop = end < 0 ? code.length : end + 2; out += code.slice(i, stop).replace(/[^\n]/g, ' '); i = stop; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < code.length && code[j] !== c) { if (code[j] === '\\') j++; if (c !== '`' && code[j] === '\n') break; j++; }
      out += c + code.slice(i + 1, j).replace(/[^\n]/g, ' ') + (j < code.length ? c : '');
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

const lineAt = (code, index) => code.slice(0, index).split('\n').length;

// Named functions: declarations, `const x = (…) =>`, object/class methods.
export function findFunctions(code) {
  const masked = maskCode(code);
  const re = /(?:^|\n)[ \t]*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{|(?:^|\n)[ \t]*(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{|\n[ \t]+(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g;
  const result = [];
  let m;
  while ((m = re.exec(masked))) {
    const name = m[1] || m[2] || m[3];
    if (['if', 'for', 'while', 'switch', 'catch', 'function', 'return'].includes(name)) continue;
    const open = masked.indexOf('{', m.index + m[0].length - 1);
    let depth = 0;
    let end = -1;
    for (let i = open; i < masked.length; i++) {
      if (masked[i] === '{') depth++;
      else if (masked[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) continue;
    const start = m.index + (masked[m.index] === '\n' ? 1 : 0);
    result.push({ name, start, end, line: lineAt(code, start), lines: lineAt(code, end) - lineAt(code, start) + 1, body: code.slice(open + 1, end), maskedBody: masked.slice(open + 1, end) });
  }
  return result;
}

function finding(f) {
  return { id: hash(`${f.type}|${f.file}|${f.function || ''}|${f.problem}`), source: 'statisch', ...f };
}

export function staticAnalysis(root, { files = listSources(root) } = {}) {
  const findings = [];
  const bodies = new Map();
  const testsText = (() => {
    try {
      return readdirSync(join(root, 'tests', 'unit')).filter((f) => f.endsWith('.mjs')).map((f) => readFileSync(join(root, 'tests', 'unit', f), 'utf8')).join('\n');
    } catch {
      return '';
    }
  })();
  for (const file of files) {
    const code = readFileSync(join(root, file), 'utf8');
    const masked = maskCode(code);
    const total = code.split('\n').length;
    const fns = findFunctions(code);
    if (total > 1400) {
      findings.push(finding({ type: 'struktur', severity: 'mittel', file, function: '', line: 1, problem: `Sehr große Datei (${total} Zeilen)`, explanation: 'Große Dateien sind schwer zu überblicken; Änderungen an einer Stelle können leicht andere Teile beeinflussen.', suggestion: 'Zusammengehörige Teile in eigene Module auslagern (z. B. Routen, Werkzeug-Gruppen).', impact: 'Bessere Wartbarkeit, kleinere und sicherere Änderungen.', risk: 'hoch – viele Abhängigkeiten, nur schrittweise und beaufsichtigt' }));
    }
    for (const fn of fns) {
      if (fn.lines > 150) {
        findings.push(finding({ type: 'komplexitaet', severity: 'niedrig', file, function: fn.name, line: fn.line, problem: `Sehr lange Funktion (${fn.lines} Zeilen)`, explanation: 'Lange Funktionen machen mehrere Dinge auf einmal und sind schwer zu testen.', suggestion: 'In kleinere, benannte Hilfsfunktionen aufteilen.', impact: 'Lesbarkeit und Testbarkeit steigen.', risk: 'mittel' }));
      }
      if (fn.lines >= 6) {
        const key = hash(fn.maskedBody.replace(/\s+/g, ''));
        const list = bodies.get(key) || [];
        list.push({ file, name: fn.name, line: fn.line });
        bodies.set(key, list);
      }
      // JSON.parse outside any try block in this function
      // (deep copies via JSON.parse(JSON.stringify(…)) and dedicated parse helpers that are meant to throw are fine)
      const parses = /parse|json/i.test(fn.name) ? [] : [...fn.maskedBody.matchAll(/JSON\.parse\(/g)].map((x) => x.index).filter((p) => !/^JSON\.parse\(\s*JSON\.stringify/.test(fn.body.slice(p, p + 40)));
      if (parses.length) {
        const tries = [...fn.maskedBody.matchAll(/\btry\s*\{/g)].map((x) => {
          let depth = 0;
          for (let i = x.index + x[0].length - 1; i < fn.maskedBody.length; i++) {
            if (fn.maskedBody[i] === '{') depth++;
            else if (fn.maskedBody[i] === '}') { depth--; if (depth === 0) return [x.index, i]; }
          }
          return [x.index, fn.maskedBody.length];
        });
        const unguarded = parses.filter((p) => !tries.some(([a, b]) => p > a && p < b) && !/\.catch\(/.test(fn.maskedBody.slice(p, p + 200)));
        if (unguarded.length && /request|message|body|data|text|response/.test(fn.body.slice(0, 2000))) {
          findings.push(finding({ type: 'fehlerbehandlung', severity: 'niedrig', file, function: fn.name, line: fn.line + fn.body.slice(0, unguarded[0]).split('\n').length - 1, problem: 'JSON.parse ohne Fehlerbehandlung', explanation: 'Ungültige Daten (z. B. eine kaputte Antwort) lösen hier eine Ausnahme aus, die bis nach oben durchschlägt.', suggestion: 'JSON.parse in try/catch fassen oder vorher prüfen und eine verständliche Meldung liefern.', impact: 'Robustere Verarbeitung fremder Daten.', risk: 'niedrig' }));
        }
      }
    }
    // risky patterns
    if (/\beval\s*\(/.test(masked) || /new\s+Function\s*\(/.test(masked)) {
      findings.push(finding({ type: 'sicherheit', severity: 'hoch', file, function: '', line: lineAt(code, masked.search(/\beval\s*\(|new\s+Function\s*\(/)), problem: 'Dynamische Code-Ausführung (eval / new Function)', explanation: 'Wenn fremder Text dort ankommt, kann er als Code ausgeführt werden.', suggestion: 'Durch einen sicheren Parser oder feste Logik ersetzen.', impact: 'Schließt eine mögliche Sicherheitslücke.', risk: 'mittel' }));
    }
    const execTemplate = masked.search(/\bexec(?:Sync)?\s*\(\s*`/);
    if (execTemplate >= 0 && /\$\{/.test(code.slice(execTemplate, execTemplate + 300))) {
      findings.push(finding({ type: 'sicherheit', severity: 'hoch', file, function: '', line: lineAt(code, execTemplate), problem: 'Shell-Befehl mit eingesetzten Werten', explanation: 'Werte in einem Shell-String können Befehle einschleusen (Command Injection).', suggestion: 'execFile mit Argument-Liste statt exec mit Template-String verwenden.', impact: 'Verhindert eingeschleuste Befehle.', risk: 'niedrig' }));
    }
    if (file.startsWith('public/')) {
      for (const m of masked.matchAll(/\.innerHTML\s*[+]?=\s*([^;\n]+)/g)) {
        const stmtEnd = code.indexOf(';', m.index);
        const expr = code.slice(m.index, stmtEnd < 0 ? m.index + 4000 : Math.min(stmtEnd, m.index + 4000));
        // Only data fields (${x.y}) that are not escaped count as risky; plain numbers like ${w} do not.
        const TEXTY = /\.(title|name|text|message|label|description|content|html|caption|answer|query|url|link|summary|detail|error|value)\b/;
        const risky = [...expr.matchAll(/\$\{\s*([^}]*)\}/g)].map((x) => x[1].trim()).filter((e) => TEXTY.test(e) && !/escape|esc\(|encodeURIComponent|Number\(|Math\./.test(e));
        if (risky.length) {
          findings.push(finding({ type: 'sicherheit', severity: 'mittel', file, function: '', line: lineAt(code, m.index), problem: 'innerHTML mit eingesetzten Werten', explanation: 'Eingesetzte Texte können HTML/Skripte enthalten (Cross-Site-Scripting).', suggestion: 'textContent oder DOM-Elemente statt innerHTML verwenden.', impact: 'Schließt eine XSS-Lücke.', risk: 'niedrig' }));
          break;
        }
      }
    }
    const timerAt = masked.search(/setInterval\(\s*async\b/);
    if (timerAt >= 0 && !/^[^{]*\{\s*try\s*\{/.test(masked.slice(timerAt, timerAt + 200))) {
      findings.push(finding({ type: 'fehlerbehandlung', severity: 'niedrig', file, function: '', line: lineAt(code, timerAt), problem: 'Asynchroner Timer ohne sichtbare Fehlerbehandlung', explanation: 'Ein Fehler im Timer wird zu einer unbehandelten Promise-Ablehnung.', suggestion: 'Den Timer-Körper mit .catch() oder try/catch absichern.', impact: 'Keine unbemerkten Abstürze im Hintergrund.', risk: 'niedrig' }));
    }
    for (const m of code.matchAll(/\/\/\s*(TODO|FIXME|HACK)\b[^\n]*/g)) {
      findings.push(finding({ type: 'offen', severity: 'niedrig', file, function: '', line: lineAt(code, m.index), problem: `${m[1]}-Kommentar`, explanation: m[0].slice(0, 160), suggestion: 'Offenen Punkt erledigen oder Kommentar entfernen.', impact: 'Weniger offene Baustellen.', risk: 'niedrig' }));
    }
    // modules without tests (only server-side top-level modules)
    if (!file.includes('/') && file !== 'server.js') {
      const base = file.replace(/\.m?js$/, '');
      if (!new RegExp(`['"\`/]${base.replace(/[-.]/g, '\\$&')}\\.js`).test(testsText)) {
        findings.push(finding({ type: 'tests', severity: 'niedrig', file, function: '', line: 1, problem: 'Keine automatischen Tests für dieses Modul', explanation: 'Änderungen an diesem Modul können nicht automatisch auf Fehler geprüft werden.', suggestion: `Eine Testdatei tests/unit/${base}.test.mjs mit Unit-Tests für die exportierten Funktionen anlegen (ohne Netzwerk, mit Attrappen).`, impact: 'Sicherere spätere Änderungen; Regressionen werden erkannt.', risk: 'sehr niedrig – fügt nur Tests hinzu' }));
      }
    }
  }
  for (const list of bodies.values()) {
    const distinct = list.filter((x, i) => list.findIndex((y) => y.file === x.file && y.name === x.name) === i);
    if (distinct.length < 2) continue;
    const [a, ...rest] = distinct;
    findings.push(finding({ type: 'duplikat', severity: 'niedrig', file: a.file, function: a.name, line: a.line, problem: `Doppelte Funktion (identisch mit ${rest.map((r) => `${r.file}:${r.name}`).join(', ')})`, explanation: 'Derselbe Code an mehreren Stellen muss bei Änderungen überall angepasst werden.', suggestion: 'Eine gemeinsame Hilfsfunktion in einem Modul anlegen und an allen Stellen importieren.', impact: 'Weniger doppelter Code, Fehler werden nur einmal behoben.', risk: 'niedrig bis mittel – mehrere Dateien betroffen' }));
  }
  return findings;
}

// Outdated dependencies (npm registry, read only). Network errors → no finding.
export async function dependencyFindings(root, { fetchImpl = fetch } = {}) {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  } catch {
    return [];
  }
  const deps = { ...pkg.dependencies, ...pkg.optionalDependencies };
  const findings = [];
  for (const [name, range] of Object.entries(deps)) {
    try {
      const response = await fetchImpl(`https://registry.npmjs.org/${encodeURIComponent(name).replace('%40', '@')}/latest`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) continue;
      const latest = (await response.json()).version;
      const current = String(range).replace(/^[^\d]*/, '');
      if (latest && current && Number(latest.split('.')[0]) > Number(current.split('.')[0])) {
        findings.push(finding({ type: 'abhaengigkeit', severity: 'niedrig', file: 'package.json', function: name, line: 1, problem: `Veraltete Hauptversion: ${name} ${current} → ${latest}`, explanation: 'Neue Hauptversionen enthalten oft Sicherheits- und Fehlerkorrekturen, können aber Änderungen erfordern.', suggestion: `Changelog von ${name} prüfen und gezielt aktualisieren.`, impact: 'Aktuelle Sicherheitskorrekturen.', risk: 'mittel – Hauptversionen können inkompatibel sein; nur mit Freigabe' }));
      }
    } catch {
      // offline: no claim either way
    }
  }
  return findings;
}

// Optional AI review of one file. Findings must quote real code.
export async function aiReview(root, file, { generate, lessons = [] }) {
  const code = readFileSync(join(root, file), 'utf8');
  const lines = code.split('\n');
  const numbered = lines.slice(0, 700).map((l, i) => `${i + 1}: ${l}`).join('\n');
  const data = await generate({
    system: 'Du bist ein erfahrener, sehr nüchterner Code-Reviewer für Node.js. Melde NUR echte, konkrete Probleme (Fehler, fehlende Fehlerbehandlung, falsche Bedingungen, unnötige API-Aufrufe, Sicherheitslücken, Ineffizienz). Erfinde nichts. Wenn du nichts Wesentliches findest, gib eine leere Liste zurück. Jede Meldung muss ein wörtliches Zitat (quote) aus dem Code enthalten. Antworte nur mit JSON.',
    prompt: `Datei: ${file}\n${lessons.length ? `Bekannte Erfahrungen (nicht wiederholen): ${lessons.slice(0, 8).join(' | ')}\n` : ''}\nCode (mit Zeilennummern):\n${numbered}\n\nJSON: {"findings": [{"line": Zahl, "function": "Name", "quote": "wörtlicher Codeausschnitt, max. 1 Zeile", "type": "fehler|fehlerbehandlung|sicherheit|leistung|struktur", "severity": "niedrig|mittel|hoch", "problem": "...", "explanation": "...", "suggestion": "...", "impact": "...", "risk": "niedrig|mittel|hoch"}]}`,
    maxTokens: 2500
  });
  return (Array.isArray(data?.findings) ? data.findings : []).slice(0, 8).filter((f) => {
    const quote = String(f?.quote || '').trim();
    return quote.length >= 6 && code.includes(quote);
  }).map((f) => finding({
    type: String(f.type || 'fehler').slice(0, 20),
    severity: ['niedrig', 'mittel', 'hoch'].includes(f.severity) ? f.severity : 'niedrig',
    file,
    function: String(f.function || '').slice(0, 60),
    line: lineAt(code, code.indexOf(String(f.quote).trim())),
    problem: String(f.problem || '').slice(0, 200),
    explanation: String(f.explanation || '').slice(0, 500),
    suggestion: String(f.suggestion || '').slice(0, 500),
    impact: String(f.impact || '').slice(0, 200),
    risk: String(f.risk || 'mittel').slice(0, 80),
    quote: String(f.quote).trim().slice(0, 200),
    source: 'KI (Zitat geprüft)'
  }));
}
