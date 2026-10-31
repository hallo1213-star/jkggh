// The autonomous money mode. While it is switched on, the server works through
// the active project one task at a time without asking: analyse options, pick
// one, plan, create digital products, sales pages and marketing texts, review
// the real results and plan the next steps. Steps that need the user's own
// accounts, money or a publication (upload to a shop, set a price, register a
// business) become "wartet auf dich" tasks with exact instructions.
import { generateJson, llmLabel, llmProvider } from './llm.js';
import { gumroadConfigured, gumroadProducts } from './gumroad.js';
import { SECTION_TYPES, encodeSite, sanitizeSite } from './public/site-config.js';
import {
  TASK_TYPES, activeProject, addLog, addTasks, clip, incomeTotals, newId, sanitizeMoney, updateProject, updateTask
} from './money-state.js';

const intervalMs = () => Math.max(Number(process.env.MONEY_INTERVAL_MINUTES) || 2, 1) * 60_000;
const dailyLimit = () => Math.max(Number(process.env.MONEY_MAX_TASKS_PER_DAY) || 25, 1);
const REVIEW_AFTER_MS = 12 * 60 * 60 * 1000;
const PLANNABLE = TASK_TYPES.filter((type) => type !== 'analyse');

const RULES = `Du bist der Geld-Modus von Jarvis, einem persönlichen Assistenten eines Nutzers in Deutschland. Du arbeitest selbstständig daran, eine echte, legale Einnahmequelle mit digitalen Produkten und Dienstleistungen aufzubauen.
Feste Regeln:
- Nur legal und ehrlich: kein Betrug, kein Spam, keine unerwünschten Werbe-Mails oder -Nachrichten (in Deutschland nur mit Einwilligung erlaubt), keine Fake-Bewertungen, keine erfundenen Kundenstimmen, Verkaufszahlen oder Erfolgsgarantien, keine Urheberrechts- oder Markenverletzungen, keine Finanz-, Gesundheits- oder Rechtsversprechen.
- Du kannst selbst nichts veröffentlichen, kein Konto eröffnen, kein Geld ausgeben, keine Verträge schließen und keine Preise festlegen. Alles, was das erfordert, wird eine Aufgabe vom Typ "nutzer" mit einer genauen Schritt-für-Schritt-Anleitung.
- Bevorzuge Wege ohne Startkosten, die eine einzelne Person mit Laptop/Handy umsetzen kann: digitale Vorlagen, Checklisten, Planer, E-Books/Leitfäden, Prompt-Sammlungen, kleine Tools, Dienstleistungen (z. B. Websites für lokale Läden, Texte), Verkauf über Plattformen wie Gumroad, Etsy (digitale Downloads), Ko-fi, eigene Verkaufsseite.
- Schätzungen sind Schätzungen: nenne sie vorsichtig und realistisch (Neulinge verdienen in den ersten Monaten oft 0–100 €). Gib keine echten Zahlen vor, die du nicht kennst.
- Hinweise, wo nötig: Bei regelmäßigen Einnahmen ist ein Gewerbe/Steuer nötig; eine Verkaufsseite braucht ein Impressum; Minderjährige brauchen die Zustimmung der Eltern.
- Schreibe auf Deutsch, professionell und konkret.`;

const TASK_SCHEMA = `"tasks": [{"type": one of ${JSON.stringify(PLANNABLE)}, "title": "kurz", "detail": "was genau zu tun ist"}]
Typen: recherche = Plattformen, Zielgruppe, Preise und Suchbegriffe zusammenstellen; produkt = ein fertiges digitales Produkt erstellen (vollständiger Inhalt); verkaufsseite = Verkaufsseite bauen; marketing = Produktbeschreibung, Anzeigentexte und Social-Media-Posts; nutzer = Schritt, den nur der Nutzer selbst machen kann (Konto, Upload, Preis, Gewerbe) mit genauer Anleitung im detail; auswertung = Ergebnisse prüfen und nächste Schritte planen.`;

function projectContext(state, project) {
  const products = state.products.filter((p) => p.projectId === project.id);
  return [
    `Auftrag des Nutzers: ${state.goal || 'Baue eine realistische, legale Einnahmequelle auf.'}`,
    `Projekt: ${project.title}\n${project.summary}`,
    project.lessons.length ? `Bisherige Erkenntnisse: ${project.lessons.join(' | ')}` : '',
    `Aufgaben bisher:\n${project.tasks.map((t) => `- [${t.status}] (${t.type}) ${t.title}${t.result ? ` → ${t.result.slice(0, 200)}` : ''}`).join('\n')}`,
    products.length ? `Erstellte Produkte/Texte: ${products.map((p) => `${p.title} (${p.kind})`).join(', ')}` : '',
    project.buyLink ? `Kauf-Link des Produkts: ${project.buyLink}` : ''
  ].filter(Boolean).join('\n\n');
}

function cleanPlanned(tasks, max) {
  return (Array.isArray(tasks) ? tasks : [])
    .filter((task) => PLANNABLE.includes(task?.type) && clip(task?.title, 140))
    .slice(0, max)
    .map((task) => ({ type: task.type, title: clip(task.title, 140), detail: clip(task.detail, 2000) }));
}

// --- Task runners: each returns { state, result, notify? } -------------------

const runners = {
  async analyse(state, project, { memories, generate }) {
    const reply = await generate({
      system: RULES,
      maxTokens: 4000,
      prompt: `${projectContext(state, project)}

Was über den Nutzer bekannt ist: ${memories.length ? memories.join(' | ') : 'nichts Besonderes'}.
Werkzeuge, die Jarvis selbst hat: Texte und Dateien (Markdown, CSV, HTML) erstellen, Verkaufsseiten bauen (Jarvis-Website-Baukasten, öffentlich teilbarer Link), Telegram-Nachrichten an den Nutzer, Gmail (nur mit Bestätigung), echte Verkaufszahlen von Gumroad lesen${gumroadConfigured() ? ' (verbunden)' : ' (noch nicht verbunden)'}.

Analysiere 3–5 realistische Einnahmequellen, bewerte sie (score 1–10 nach Machbarkeit ohne Startkapital, Zeit bis zum ersten Euro, Potenzial) und wähle die beste. Plane dafür 6–10 konkrete Aufgaben in sinnvoller Reihenfolge (z. B. recherche, produkt, marketing, verkaufsseite, nutzer: Gumroad-Konto anlegen und Produkt hochladen, nutzer: Link zurückgeben, auswertung).
Antworte als JSON: {"options":[{"title":"","reason":"","score":0}], "project":{"title":"","summary":"was genau verkauft wird, an wen, zu welchem Preis-Vorschlag","why":"warum diese Wahl"}, "estimate":{"low":0,"high":0,"basis":"Begründung der Monats-Schätzung in Euro nach 3 Monaten"}, ${TASK_SCHEMA}}`
    });
    const tasks = cleanPlanned(reply.tasks, 12);
    if (!reply.project?.title || !tasks.length) throw new Error('Die Analyse lieferte keinen brauchbaren Plan.');
    let next = updateProject(state, project.id, { title: reply.project.title, summary: reply.project.summary, why: reply.project.why, options: reply.options, estimate: reply.estimate });
    next = addTasks(next, project.id, tasks);
    const plan = tasks.map((t, i) => `${i + 1}. ${t.title}${t.type === 'nutzer' ? ' (du)' : ''}`).join('\n');
    return { state: next, result: `Gewählt: ${clip(reply.project.title, 120)}`, notify: `💡 Geld-Modus: Ich habe mich für „${clip(reply.project.title, 120)}“ entschieden.\n\n${clip(reply.project.why, 500)}\n\nPlan:\n${plan}` };
  },

  async recherche(state, project, { generate }, task) {
    const reply = await generate({
      system: RULES,
      maxTokens: 3000,
      prompt: `${projectContext(state, project)}\n\nAufgabe: ${task.title}\n${task.detail}\n\nStelle die Recherche aus deinem Wissen zusammen (es gibt keinen Live-Internetzugang, markiere Unsicheres). JSON: {"title":"","content":"Markdown mit Abschnitten: Verkaufsplattformen (Gebühren, Vor-/Nachteile), Zielgruppe, Preisempfehlung mit Begründung, Suchbegriffe/Tags, Mitbewerber-Typen, Risiken","summary":"2 Sätze Ergebnis"}`
    });
    const product = { id: newId(), projectId: project.id, kind: 'recherche', format: 'markdown', title: reply.title || task.title, filename: 'recherche', content: `> Aus dem Wissen der KI zusammengestellt – Gebühren und Regeln vor dem Start auf den Seiten der Plattformen prüfen.\n\n${reply.content || ''}` };
    return { state: { ...state, products: [...state.products, product] }, result: clip(reply.summary || 'Recherche erstellt', 300), product };
  },

  async produkt(state, project, { generate }, task) {
    const reply = await generate({
      system: RULES,
      maxTokens: 12000,
      prompt: `${projectContext(state, project)}\n\nAufgabe: ${task.title}\n${task.detail}\n\nErstelle das digitale Produkt VOLLSTÄNDIG und verkaufsfertig – keine Platzhalter wie „hier Text einfügen“, keine Gliederung statt Inhalt. Eigene Inhalte, keine kopierten Texte. Format: "markdown" für E-Books/Leitfäden/Checklisten/Vorlagen, "csv" für Tabellen-Vorlagen/Planer (mit Kopfzeile), "html" nur für ein kleines eigenständiges Tool (eine Datei, ohne externe Skripte).\nJSON: {"title":"Produktname","filename":"dateiname-ohne-endung","format":"markdown|csv|html","description":"Verkaufsbeschreibung in 2–3 Sätzen","price":"Preisvorschlag, z. B. 7 €","content":"der komplette Inhalt"}`
    });
    if (!clip(reply.content, 100).length || String(reply.content).length < 300) throw new Error('Das Produkt war zu kurz – neuer Versuch folgt.');
    const product = { id: newId(), projectId: project.id, kind: 'produkt', format: reply.format, title: reply.title || task.title, filename: reply.filename, description: reply.description, price: reply.price, content: reply.content };
    return { state: { ...state, products: [...state.products, product] }, result: `Erstellt: ${clip(product.title, 100)}${product.price ? ` (Preisvorschlag ${clip(product.price, 30)})` : ''}`, product };
  },

  async marketing(state, project, { generate }, task) {
    const reply = await generate({
      system: RULES,
      maxTokens: 5000,
      prompt: `${projectContext(state, project)}\n\nAufgabe: ${task.title}\n${task.detail}\n\nSchreibe ehrliche, überzeugende Marketingtexte (keine erfundenen Bewertungen, Zahlen oder Garantien; keine Massen-Nachrichten). JSON: {"title":"","content":"Markdown: Produktbeschreibung für die Shop-Plattform (Titel max. 80 Zeichen, Text, 13 Tags), 3 Varianten Anzeigentext, 5 Social-Media-Posts (Instagram/TikTok/Pinterest) mit Hashtags, Ideen für kostenlose Reichweite","summary":"1 Satz"}`
    });
    const product = { id: newId(), projectId: project.id, kind: 'marketing', format: 'markdown', title: reply.title || task.title, filename: 'marketing', content: reply.content || '' };
    return { state: { ...state, products: [...state.products, product] }, result: clip(reply.summary || 'Marketingtexte erstellt', 300), product };
  },

  async verkaufsseite(state, project, { generate, origin }, task) {
    const products = state.products.filter((p) => p.projectId === project.id && p.kind === 'produkt');
    const reply = await generate({
      system: RULES,
      maxTokens: 5000,
      prompt: `${projectContext(state, project)}\nProdukte: ${products.map((p) => `${p.title}: ${p.description} (${p.price})`).join(' | ') || 'noch keins'}\n\nAufgabe: ${task.title}\n${task.detail}\n\nBaue eine Verkaufsseite. JSON: {"title":"","logo":"ein Emoji","font":"modern|klassisch|verspielt|technisch","mode":"hell|dunkel","colors":{"primary":"#hex","accent":"#hex"},"sections":[...],"footer":""}
Abschnitttypen: ${SECTION_TYPES.join(', ')}. Felder: hero {badge, heading, text, button_text, button_link}; text {heading, text}; features {heading, items:[{icon, title, text}]}; list {heading, items:[text]}; pricing {heading, items:[{name, price, text}]}; faq {heading, items:[{q, a}]}; cta {heading, text, button_text, button_link}; impressum {heading, text}.
Der erste Abschnitt ist hero. Kauf-Knöpfe: button_link ${project.buyLink ? `= "${project.buyLink}"` : '= "#section-1" (der Shop-Link wird ergänzt, sobald der Nutzer das Produkt hochgeladen hat)'}. Füge einen impressum-Abschnitt mit dem Text „Angaben nach § 5 DDG – bitte Name und Anschrift ergänzen.“ hinzu. Keine Bewertungen/Zitate erfinden (kein quote-Abschnitt).`
    });
    const site = sanitizeSite({ ...reply, sections: (reply.sections || []).filter((s) => s?.type !== 'quote') });
    if (site.sections.length < 3) throw new Error('Die Verkaufsseite hatte zu wenig Inhalt.');
    const path = `/site.html#${encodeSite(site)}`;
    const page = { id: newId(), projectId: project.id, title: site.title, path, site };
    return { state: { ...state, pages: [...state.pages, page] }, result: `Verkaufsseite: ${site.title}`, notify: `🌐 Neue Verkaufsseite „${site.title}“:\n${origin}${path.length > 3000 ? '/ (im Geld-Dashboard)' : path}` };
  },

  async auswertung(state, project, { generate, gumroad }, task) {
    const totals = incomeTotals(state, gumroad);
    const reply = await generate({
      system: RULES,
      maxTokens: 3000,
      prompt: `${projectContext(state, project)}\n\nEchte Ergebnisse: eingetragene Einnahmen ${totals.manualEur} €${gumroad ? `, Gumroad: ${gumroad.totalSales} Verkäufe, ${gumroad.totalUsd} $ (${gumroad.products.map((p) => `${p.name}: ${p.sales}`).join(', ')})` : ', Gumroad nicht verbunden'}.\n\nAufgabe: ${task.title}\n${task.detail}\n\nWerte ehrlich aus, was funktioniert und was nicht (keine Verkäufe sind auch ein Ergebnis). Plane 2–5 sinnvolle nächste Aufgaben (keine Wiederholung erledigter Aufgaben; nur wenn etwas wirklich fehlt). JSON: {"summary":"","lessons":["Erkenntnis"], ${TASK_SCHEMA}}`
    });
    const tasks = cleanPlanned(reply.tasks, 5);
    let next = updateProject(state, project.id, (p) => ({ ...p, lessons: [...p.lessons, ...(Array.isArray(reply.lessons) ? reply.lessons : [])], lastReview: new Date().toISOString() }));
    next = addTasks(next, project.id, tasks);
    return { state: next, result: clip(reply.summary || 'Ausgewertet', 400), notify: `📊 Auswertung „${project.title}“: ${clip(reply.summary, 600)}${tasks.length ? `\n\nNächste Schritte:\n${tasks.map((t) => `• ${t.title}`).join('\n')}` : ''}` };
  }
};

// Takes the worker's project version (new fields, lessons and tasks) but keeps
// what the user changed on existing tasks, and appends new products and pages.
export function mergeOutcome(latest, result, projectId) {
  const mine = result.projects.find((p) => p.id === projectId);
  const theirs = latest.projects.find((p) => p.id === projectId);
  if (!mine || !theirs) return null;
  const userTasks = new Map(theirs.tasks.map((t) => [t.id, t]));
  const project = { ...mine, status: theirs.status, buyLink: theirs.buyLink || mine.buyLink, tasks: mine.tasks.map((t) => (userTasks.get(t.id)?.status === 'erledigt' && t.status !== 'erledigt' ? userTasks.get(t.id) : t)) };
  const known = (list) => new Set(list.map((item) => item.id));
  const products = known(latest.products);
  const pages = known(latest.pages);
  return sanitizeMoney({
    ...latest,
    projects: latest.projects.map((p) => (p.id === projectId ? project : p)),
    products: [...latest.products, ...result.products.filter((p) => !products.has(p.id))],
    pages: [...latest.pages, ...result.pages.filter((p) => !pages.has(p.id))]
  });
}

// Applies a new shop link to the project's existing sales pages (buttons that
// pointed to the page itself now lead to the shop).
export function relinkPages(state, projectId, buyLink) {
  return {
    ...state,
    pages: state.pages.map((page) => {
      if (page.projectId !== projectId || !page.site) return page;
      const site = { ...page.site, sections: page.site.sections.map((s) => (s.button_link !== undefined && (!s.button_link || s.button_link.startsWith('#')) ? { ...s, button_link: buyLink } : s)) };
      return { ...page, site: sanitizeSite(site), path: `/site.html#${encodeSite(site)}` };
    })
  };
}

export function moneyToolStatus({ telegram, gmail, laptop }) {
  return [
    { name: 'KI (Produkte & Planung)', ok: Boolean(llmProvider()), detail: llmLabel() || 'GROQ_API_KEY fehlt (kostenlos bei console.groq.com)' },
    { name: 'Gumroad (echte Verkäufe)', ok: gumroadConfigured(), detail: gumroadConfigured() ? 'verbunden' : 'GUMROAD_ACCESS_TOKEN fehlt (optional)' },
    { name: 'Telegram (Berichte & Dateien)', ok: telegram, detail: telegram ? 'verbunden' : 'nicht eingerichtet' },
    { name: 'Gmail', ok: gmail, detail: gmail ? 'verbunden (Senden nur mit Bestätigung)' : 'nicht eingerichtet' },
    { name: 'Laptop', ok: laptop, detail: laptop ? 'online' : 'offline' },
    { name: 'Verkaufsseiten', ok: true, detail: 'eingebaut (Jarvis-Websites)' }
  ];
}

export function startMoneyAgent({ getState, setState, notify, sendFile, getMemories, origin, generate = generateJson, log = console }) {
  let running = false;

  async function tick() {
    if (running) return;
    let state = getState();
    if (!state.enabled || (!llmProvider() && generate === generateJson)) return;
    const project = activeProject(state);
    if (!project || project.status !== 'aktiv') return;
    const today = new Date().toISOString().slice(0, 10);
    if (state.usage.date === today && state.usage.count >= dailyLimit()) return;

    // A task still marked "läuft" here was interrupted by a restart: run it again.
    let task = project.tasks.find((t) => t.status === 'offen' || t.status === 'laeuft' || (t.status === 'fehler' && t.attempts < 2));
    if (!task) {
      // Nothing left Jarvis can do itself: review the results now and then.
      const last = Date.parse(project.lastReview || project.createdAt);
      if (Date.now() - last < REVIEW_AFTER_MS || project.tasks.some((t) => t.type === 'auswertung' && t.status === 'offen')) return;
      state = addTasks(state, project.id, [{ type: 'auswertung', title: 'Ergebnisse auswerten und nächste Schritte planen', detail: '' }]);
      setState(state);
      task = activeProject(state).tasks.at(-1);
    }

    running = true;
    const projectId = project.id;
    const taskId = task.id;
    setState(addLog(updateTask(state, projectId, taskId, { status: 'laeuft', attempts: task.attempts + 1 }), `Arbeite an: ${task.title}`));
    try {
      let gumroad = null;
      if (task.type === 'auswertung' && gumroadConfigured()) gumroad = await gumroadProducts({ fresh: true }).catch(() => null);
      const runner = runners[task.type];
      const current = getState();
      const currentProject = current.projects.find((p) => p.id === projectId);
      if (!currentProject) return; // deleted meanwhile
      const outcome = await runner(current, currentProject, { memories: getMemories(), generate, origin: origin(), gumroad }, task);
      // The user may have changed things meanwhile (switched off, ticked off a
      // task, deleted something): merge the result into the latest state.
      const latest = getState();
      let next = mergeOutcome(latest, sanitizeMoney(outcome.state), projectId);
      if (!next) return;
      next = updateTask(next, projectId, taskId, { status: 'erledigt', result: outcome.result, doneAt: new Date().toISOString() });
      next = addLog(next, `Fertig: ${task.title} – ${outcome.result}`);
      const day = new Date().toISOString().slice(0, 10);
      next = { ...next, usage: { date: day, count: (next.usage.date === day ? next.usage.count : 0) + 1 } };
      // Newly planned steps for the user are announced once.
      const before = new Set((latest.projects.find((p) => p.id === projectId)?.tasks || []).map((t) => t.id));
      const waiting = (next.projects.find((p) => p.id === projectId)?.tasks || []).filter((t) => t.status === 'wartet' && !before.has(t.id));
      setState(sanitizeMoney(next));
      if (outcome.notify) await notify(outcome.notify).catch((error) => log.warn(`Geld-Modus Telegram: ${error.message}`));
      if (outcome.product) {
        const saved = getState().products.find((p) => p.id === outcome.product.id);
        if (saved) await sendFile(saved.content, saved.filename, `📦 ${saved.title}${saved.price ? ` · Preisvorschlag ${saved.price}` : ''}`).catch((error) => log.warn(`Geld-Modus Datei: ${error.message}`));
      }
      for (const wait of waiting) {
        await notify(`🙋 Dafür brauche ich dich: ${wait.title}\n\n${wait.detail}\n\nWenn du fertig bist: im Geld-Dashboard auf „Erledigt“ tippen oder Jarvis sagen „Aufgabe erledigt“ (mit Shop-Link, falls es einen gibt).`).catch(() => {});
      }
    } catch (error) {
      log.warn(`Geld-Modus (${task.type}): ${error.message}`);
      const latest = getState();
      if (/Limit erreicht/.test(error.message)) {
        // Free tiers allow only so much per minute/day: simply try again later.
        setState(addLog(updateTask(latest, projectId, taskId, { status: 'offen', attempts: task.attempts, result: 'Wartet auf freies KI-Kontingent' }), `KI-Limit erreicht – „${task.title}“ wird später fortgesetzt`));
        return;
      }
      setState(addLog(updateTask(latest, projectId, taskId, { status: 'fehler', result: clip(error.message, 300) }), `Problem bei „${task.title}“: ${error.message}`));
    } finally {
      running = false;
    }
  }

  const timer = setInterval(() => tick().catch((error) => log.warn(`Geld-Modus: ${error.message}`)), intervalMs());
  return { tick, stop: () => clearInterval(timer) };
}
