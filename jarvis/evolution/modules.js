// Module system for functions Jarvis develops himself. A module lives in
// modules/<name>/ with:
//   module.json  { "name", "version", "description", "capabilities": ["tools", "fetch"] }
//   index.js     export function setup(api) { … }
// The module only gets the API for the capabilities it declares:
//   api.log(text)                       always
//   api.defineTool({ name, description, parameters, run(args) })   "tools"
//   api.fetchJson(url)                  "fetch" – HTTPS GET only, 10 s, 1 MB
// Modules must not import anything outside their folder (checked before they
// are adopted). A module that fails to load is disabled automatically.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CAPABILITIES = ['tools', 'fetch'];
const NAME = /^[a-z0-9-]{2,40}$/;

export function readManifest(root, name) {
  const file = join(root, 'modules', name, 'module.json');
  if (!NAME.test(name) || !existsSync(file)) return null;
  try {
    const m = JSON.parse(readFileSync(file, 'utf8'));
    return {
      name,
      version: /^\d+\.\d+\.\d+$/.test(m.version || '') ? m.version : '0.1.0',
      description: String(m.description || '').slice(0, 300),
      capabilities: (Array.isArray(m.capabilities) ? m.capabilities : []).filter((c) => CAPABILITIES.includes(c))
    };
  } catch {
    return null;
  }
}

export function listModules(root) {
  const dir = join(root, 'modules');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).map((name) => readManifest(root, name)).filter(Boolean);
}

// Static check of a module's code (also run in the sandbox before adoption).
export function checkModuleCode(code) {
  const problems = [];
  if (/\bimport\s*\(|\brequire\s*\(/.test(code)) problems.push('dynamische Imports/require');
  for (const m of code.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) if (!m[1].startsWith('./')) problems.push(`Import von „${m[1]}“`);
  if (/\bprocess\b|\bglobalThis\b|\beval\s*\(|new\s+Function/.test(code)) problems.push('Zugriff auf process/globalThis/eval');
  return problems;
}

async function safeFetchJson(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:') throw new Error('Nur HTTPS erlaubt');
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(u.hostname)) throw new Error('Interne Adressen sind gesperrt');
  const response = await fetch(u, { signal: AbortSignal.timeout(10_000) });
  const text = (await response.text()).slice(0, 1_000_000);
  if (!response.ok) throw new Error(`Status ${response.status}`);
  return JSON.parse(text);
}

// Loads all enabled modules. `addTool` registers a voice/chat tool.
export async function loadModules(root, { enabled = {}, addTool, log = console } = {}) {
  const results = [];
  for (const manifest of listModules(root)) {
    const state = enabled[manifest.name];
    if (state && state.enabled === false) { results.push({ ...manifest, status: 'deaktiviert' }); continue; }
    const file = join(root, 'modules', manifest.name, 'index.js');
    try {
      const code = readFileSync(file, 'utf8');
      const problems = checkModuleCode(code);
      if (problems.length) throw new Error(`Unerlaubter Code: ${problems.join(', ')}`);
      const mod = await import(`${pathToFileURL(file).href}?v=${manifest.version}`);
      if (typeof mod.setup !== 'function') throw new Error('setup(api) fehlt');
      const tools = [];
      const api = {
        log: (text) => log.log(`[Modul ${manifest.name}] ${String(text).slice(0, 300)}`),
        ...(manifest.capabilities.includes('tools') ? {
          defineTool(tool) {
            if (!/^[a-z0-9_]{2,30}$/.test(tool?.name || '') || typeof tool.run !== 'function') throw new Error('Ungültiges Werkzeug');
            const name = `mod_${manifest.name.replace(/-/g, '_')}_${tool.name}`.slice(0, 60);
            tools.push(name);
            addTool?.({
              name,
              description: `[Modul ${manifest.name} v${manifest.version}] ${String(tool.description || '').slice(0, 400)}`,
              parameters: tool.parameters && typeof tool.parameters === 'object' ? tool.parameters : { type: 'object', properties: {} },
              label: () => `Modul ${manifest.name}: ${tool.name}`,
              run: async (args) => {
                const out = await Promise.race([tool.run(JSON.parse(JSON.stringify(args || {}))), new Promise((_, reject) => setTimeout(() => reject(new Error('Modul-Zeitlimit')), 20_000))]);
                return JSON.parse(JSON.stringify(out ?? null).slice(0, 20_000) || 'null');
              }
            });
          }
        } : {}),
        ...(manifest.capabilities.includes('fetch') ? { fetchJson: safeFetchJson } : {})
      };
      await mod.setup(Object.freeze(api));
      results.push({ ...manifest, status: 'aktiv', tools });
    } catch (error) {
      log.warn(`Modul ${manifest.name} deaktiviert: ${error.message}`);
      results.push({ ...manifest, status: 'fehler', error: error.message.slice(0, 300) });
    }
  }
  return results;
}
