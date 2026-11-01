// Task mode: Jarvis takes a bigger assignment ("research … and make a
// comparison table", "write a document about …"), plans the steps himself,
// works through them one after another in the background (own knowledge,
// Wikipedia, current news) and delivers a finished document (Markdown with
// tables). Progress is reported live to the app.
import { randomUUID } from 'node:crypto';
import { generateJson, generateText, llmProvider } from './llm.js';
import { lookupWikipedia, searchNews } from './knowledge.js';

const ACTIONS = ['wissen', 'wikipedia', 'nachrichten', 'schreiben'];
const running = new Map();

const PLAN_SYSTEM = `Du bist der Aufgabenplaner von Jarvis. Zerlege den Auftrag in 3–6 konkrete Arbeitsschritte, die Jarvis selbst erledigen kann. Aktionen:
- wissen: etwas aus deinem eigenen Wissen erarbeiten (Fakten, Vergleiche, Code, Ideen)
- wikipedia: einen Begriff in der deutschen Wikipedia nachschlagen (query = Suchbegriff)
- nachrichten: aktuelle Meldungen suchen (query = Suchbegriff), nur wenn Aktualität wichtig ist
- schreiben: das Endergebnis erstellen (immer der letzte Schritt)
Antworte nur mit JSON: {"title":"kurzer Titel","steps":[{"title":"","action":"wissen|wikipedia|nachrichten|schreiben","query":"nur bei wikipedia/nachrichten"}]}`;

const WRITE_SYSTEM = `Du bist Jarvis und lieferst das fertige Ergebnis einer Aufgabe als gut gegliedertes Markdown-Dokument auf Deutsch: Überschrift, kurze Einleitung, dann der Inhalt – Vergleiche IMMER als Markdown-Tabelle (| Spalte | … |), Listen, bei Code vollständige Codeblöcke. Am Ende ein kurzes Fazit oder eine Empfehlung. Kennzeichne ehrlich, was aus deinem Wissen stammt und sich geändert haben könnte (z. B. Preise, Versionen) mit einem Hinweis „Stand: aus Jarvis' Wissen – bitte vor Entscheidungen prüfen“. Erfinde keine Quellen. Keine Einleitungssätze wie „Hier ist …“.`;

export function sanitizePlan(plan, goal) {
  const steps = (Array.isArray(plan?.steps) ? plan.steps : [])
    .filter((s) => s && ACTIONS.includes(s.action) && String(s.title || '').trim())
    .slice(0, 6)
    .map((s) => ({ title: String(s.title).trim().slice(0, 120), action: s.action, query: String(s.query || '').trim().slice(0, 100) }));
  if (!steps.length || steps.at(-1).action !== 'schreiben') steps.push({ title: 'Ergebnis erstellen', action: 'schreiben', query: '' });
  return { title: String(plan?.title || goal).trim().slice(0, 80), steps };
}

export function startTask(goal, { onEvent, generate = generateJson, write = generateText, wiki = lookupWikipedia, news = searchNews }) {
  const wish = String(goal ?? '').trim().slice(0, 800);
  if (!wish) throw new Error('Was ist die Aufgabe?');
  if (!llmProvider() && generate === generateJson) throw new Error('Für den Aufgabenmodus braucht Jarvis seinen KI-Schlüssel (GROQ_API_KEY bei Render).');
  if ([...running.values()].filter((t) => t.status === 'läuft').length >= 2) throw new Error('Es laufen schon zwei Aufgaben. Warte kurz, bis eine fertig ist.');
  const task = { id: randomUUID().slice(0, 8), goal: wish, title: wish.slice(0, 80), status: 'läuft', steps: [], startedAt: Date.now() };
  running.set(task.id, task);
  const emit = (extra = {}) => onEvent({ id: task.id, goal: task.goal, title: task.title, status: task.status, steps: task.steps, ...extra });

  (async () => {
    try {
      emit({ phase: 'plan' });
      const plan = sanitizePlan(await generate({ system: PLAN_SYSTEM, prompt: `Auftrag: ${wish}`, maxTokens: 900 }).catch(() => ({})), wish);
      task.title = plan.title;
      task.steps = plan.steps.map((s) => ({ ...s, status: 'offen' }));
      emit();
      const notes = [];
      for (const step of task.steps) {
        if (task.cancelled) throw new Error('Abgebrochen.');
        step.status = 'läuft';
        emit();
        try {
          if (step.action === 'wikipedia') {
            const article = await wiki(step.query || step.title);
            notes.push(`Wikipedia „${article.titel}“: ${article.zusammenfassung.slice(0, 1200)}`);
            step.result = `Wikipedia: ${article.titel}`;
          } else if (step.action === 'nachrichten') {
            const found = await news(step.query || step.title, { limit: 6 });
            notes.push(`Aktuelle Meldungen zu „${step.query}“: ${found.meldungen.map((m) => `${m.titel} (${m.quelle})`).join('; ') || 'keine gefunden'}`);
            step.result = `${found.meldungen.length} Meldungen`;
          } else if (step.action === 'wissen') {
            const part = await write({ system: 'Du bist Jarvis und erarbeitest einen Zwischenschritt einer Aufgabe. Antworte sachlich, knapp und auf Deutsch, als Stichpunkte oder Tabelle.', prompt: `Gesamtauftrag: ${wish}\nSchritt: ${step.title}\nBisherige Notizen:\n${notes.join('\n\n').slice(-6000)}`, maxTokens: 1800 });
            notes.push(`Ergebnis „${step.title}“:\n${part.trim()}`);
            step.result = 'erarbeitet';
          } else {
            const doc = await write({ system: WRITE_SYSTEM, prompt: `Auftrag: ${wish}\n\nArbeitsnotizen:\n${notes.join('\n\n').slice(-12000)}\n\nErstelle jetzt das fertige Ergebnis.`, maxTokens: 6000 });
            task.document = doc.trim().replace(/^```(?:markdown|md)?\n/, '').replace(/\n```\s*$/, '');
            step.result = 'fertig';
          }
          step.status = 'erledigt';
        } catch (error) {
          step.status = 'fehler';
          step.result = error.message.slice(0, 160);
          if (step.action === 'schreiben') throw error;
        }
        emit();
      }
      task.status = 'fertig';
      emit({ document: task.document });
    } catch (error) {
      task.status = task.cancelled ? 'abgebrochen' : 'fehler';
      for (const step of task.steps) if (step.status === 'offen' || step.status === 'läuft') step.status = task.cancelled ? 'abgebrochen' : step.status;
      emit({ error: error.message });
    } finally {
      setTimeout(() => running.delete(task.id), 60 * 60 * 1000).unref?.();
    }
  })();
  return task;
}

// "Jarvis, stopp die Aufgabe": running tasks stop before their next step.
export function cancelTasks() {
  const stopped = [];
  for (const task of running.values()) {
    if (task.status !== 'läuft') continue;
    task.cancelled = true;
    stopped.push(task.title);
  }
  return stopped;
}
