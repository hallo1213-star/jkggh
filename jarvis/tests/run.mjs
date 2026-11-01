// Runs every tests/unit/*.test.mjs in its own Node process – without any of the
// server's secrets (API keys, passwords) in the environment – and reports the
// real result. Usage: node tests/run.mjs [--json] [projectDir]
// Exit code 0 only if every test file passed.
import { execFile } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const json = args.includes('--json');
const root = resolve(args.find((a) => !a.startsWith('--')) || new URL('..', import.meta.url).pathname);
const dir = join(root, 'tests', 'unit');
const SAFE_ENV = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'SYSTEMROOT', 'TZ'];

export function cleanEnv() {
  const env = { TZ: 'Europe/Berlin', NODE_ENV: 'test' };
  for (const key of SAFE_ENV) if (process.env[key] && key !== 'TZ') env[key] = process.env[key];
  return env;
}

function runFile(file) {
  return new Promise((done) => {
    const started = Date.now();
    execFile(process.execPath, [join(dir, file)], { cwd: root, env: cleanEnv(), timeout: 120_000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      const out = `${stdout}\n${stderr}`;
      const okLines = (out.match(/^ok\s/gm) || []).length;
      const failLines = (out.match(/^FAIL\b/gm) || []).length;
      const counted = [...out.matchAll(/(\d+)\s+bestanden/g)].reduce((n, m) => n + Number(m[1]), 0);
      done({
        file,
        passed: !error,
        assertions: counted || okLines,
        failedAssertions: failLines,
        ms: Date.now() - started,
        error: error ? (error.killed ? 'Zeitlimit überschritten' : out.split('\n').filter((l) => /Error|FAIL|assert/i.test(l)).slice(0, 4).join(' | ').slice(0, 600) || `Exit-Code ${error.code}`) : null
      });
    });
  });
}

export async function runTests() {
  const files = readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort();
  const results = [];
  for (const file of files) results.push(await runFile(file));
  return {
    ok: results.every((r) => r.passed),
    files: results.length,
    passedFiles: results.filter((r) => r.passed).length,
    assertions: results.reduce((n, r) => n + r.assertions, 0),
    results
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runTests();
  if (json) console.log(JSON.stringify(report));
  else {
    for (const r of report.results) console.log(`${r.passed ? '✔' : '✘'} ${r.file.padEnd(28)} ${String(r.assertions).padStart(3)} Prüfungen  ${r.ms} ms${r.error ? `\n    ${r.error}` : ''}`);
    console.log(`\n${report.passedFiles}/${report.files} Testdateien bestanden, ${report.assertions} Prüfungen.`);
  }
  process.exitCode = report.ok ? 0 : 1;
}
