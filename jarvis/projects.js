// Jarvis' project workshop: he writes complete small software projects himself
// (3D games, apps, tools, online shops …) as static web projects. The app runs
// them in a sandboxed preview and offers them as a ZIP download. No templates
// from the web – the code is written by Jarvis' AI.
import { generateText, llmProvider } from './llm.js';

const FILE = /^[a-z0-9][a-z0-9_-]{0,40}(\/[a-z0-9_-]{1,40})?\.(html|css|js|json|svg|md|txt)$/;
const MAX_FILES = 8;
const MAX_BYTES = 300_000;
export const KINDS = ['spiel', 'website', 'app', 'werkzeug'];

const SYSTEM = `Du bist der Programmierer von Jarvis. Du schreibst selbst vollständige, sofort lauffähige Web-Projekte (HTML, CSS, JavaScript) – keine Platzhalter, keine TODOs, keine Erklärtexte außerhalb der Dateien.
Regeln:
- Statisches Projekt, das im Browser läuft: index.html ist der Einstieg. Am besten alles in index.html (CSS in <style>, JS in <script>); höchstens 3 Dateien.
- Erlaubte externe Bibliothek nur: three.js über die Import-Map {"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/"}} (für 3D-Spiele und 3D-Szenen). Sonst keine externen Skripte, keine Netzwerkanfragen, keine Formulare, die Daten verschicken.
- Oberfläche auf Deutsch, modernes, schönes Design, funktioniert auf Handy (Touch) und Computer (Tastatur/Maus). Spiele: Startbildschirm, Steuerung erklärt, Punkte, Game Over und Neustart.
- Daten (z. B. Warenkorb) nur im Browser (localStorage). Zahlungen nie echt – höchstens eine deutlich markierte Demo-Kasse.
- Kompakt programmieren, damit alles in die Antwort passt.
Antwortformat GENAU so:
TITEL: <kurzer Name>
ART: <spiel|website|app|werkzeug>
BESCHREIBUNG: <1–2 Sätze, was es kann und wie man es bedient>
=== DATEI: index.html ===
<Inhalt>
=== ENDE ===
(weitere Dateien genauso)`;

export function parseProject(textValue) {
  const raw = String(textValue ?? '');
  const field = (name) => (new RegExp(`^${name}:\\s*(.+)$`, 'mi').exec(raw)?.[1] || '').trim();
  const files = [];
  const re = /=== DATEI: ([^\n=]+?) ===\n([\s\S]*?)\n=== ENDE ===/g;
  let match;
  while ((match = re.exec(raw)) && files.length < MAX_FILES) {
    const path = match[1].trim().toLowerCase();
    if (!FILE.test(path) || files.some((f) => f.path === path)) continue;
    files.push({ path, content: match[2].replace(/^```[a-z]*\n|```\s*$/g, '') });
  }
  return { title: field('TITEL'), kind: field('ART').toLowerCase(), description: field('BESCHREIBUNG'), files };
}

export function sanitizeProject(input) {
  const project = input && typeof input === 'object' ? input : {};
  let total = 0;
  const files = (Array.isArray(project.files) ? project.files : [])
    .filter((f) => f && typeof f.path === 'string' && FILE.test(f.path) && typeof f.content === 'string')
    .slice(0, MAX_FILES)
    .filter((f) => (total += f.content.length) <= MAX_BYTES)
    .map((f) => ({ path: f.path, content: f.content }));
  return {
    title: String(project.title ?? '').replace(/[<>\n]/g, ' ').trim().slice(0, 60) || 'Mein Projekt',
    kind: KINDS.includes(project.kind) ? project.kind : 'app',
    description: String(project.description ?? '').replace(/[<>]/g, ' ').trim().slice(0, 400),
    files
  };
}

export async function writeProject(prompt, { base = null, generate = generateText } = {}) {
  const wish = String(prompt ?? '').trim().slice(0, 800);
  if (!wish) throw new Error('Was soll ich programmieren?');
  if (!llmProvider() && generate === generateText) throw new Error('Zum Programmieren braucht Jarvis seinen KI-Schlüssel (GROQ_API_KEY bei Render, kostenlos bei console.groq.com).');
  const request = base
    ? `Bisheriges Projekt "${base.title}":\n${base.files.map((f) => `=== DATEI: ${f.path} ===\n${f.content}\n=== ENDE ===`).join('\n')}\n\nÄnderungswunsch: ${wish}\n\nGib das komplette geänderte Projekt im Antwortformat zurück (alle Dateien vollständig).`
    : `Programmiere: ${wish}`;
  let project = sanitizeProject(parseProject(await generate({ system: SYSTEM, prompt: request, maxTokens: 8000 })));
  if (!project.files.some((f) => f.path === 'index.html')) {
    // One retry with a reminder of the format.
    project = sanitizeProject(parseProject(await generate({ system: SYSTEM, prompt: `${request}\n\nWICHTIG: Halte dich exakt an das Antwortformat mit "=== DATEI: index.html ===" und "=== ENDE ===".`, maxTokens: 8000 })));
  }
  if (!project.files.some((f) => f.path === 'index.html')) throw new Error('Das Projekt kam unvollständig zurück. Versuch es etwas einfacher zu beschreiben.');
  return project;
}
