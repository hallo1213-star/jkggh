process.env.GEMINI_API_KEY = 'g-key'; delete process.env.ANTHROPIC_API_KEY;
const L = await import('../../llm.js');
const M = await import('../../money-state.js');
const A = await import('../../money-agent.js');
const { findCloudTool } = await import('../../cloud-tools.js');
const assert = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };

// Gemini request format
let seen;
const gfetch = async (url, init) => { seen = { url, init }; return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] }) }; };
const out = await L.generateJson({ system: 'S', prompt: 'P', fetchImpl: gfetch });
const gbody = JSON.parse(seen.init.body);
assert(out.a === 1 && seen.url.includes('gemini-2.5-flash:generateContent') && seen.init.headers['x-goog-api-key'] === 'g-key' && !seen.url.includes('g-key'), 'Gemini: model, key in header');
assert(gbody.systemInstruction.parts[0].text === 'S' && gbody.generationConfig.responseMimeType === 'application/json', 'Gemini: system + JSON mode');
const bad = async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'quota' } }) });
try { await L.generateText({ system: '', prompt: '', fetchImpl: bad }); assert(false, 'limit'); } catch (e) { assert(/Limit erreicht/.test(e.message), 'Gemini 429 explained'); }
assert(L.parseJsonReply('Hier:\n```json\n{"x":[1]}\n```').x[0] === 1, 'JSON from fenced reply');
delete process.env.GEMINI_API_KEY;
try { await L.generateText({ system: '', prompt: '' }); assert(false, 'no key'); } catch (e) { assert(/GEMINI_API_KEY/.test(e.message), 'missing key explained'); }

// State
let s = M.sanitizeMoney({ projects: [{ title: 'x', tasks: [{ type: 'hack', title: 'y' }, { type: 'produkt', title: 'p', status: 'quatsch' }] }], income: [{ amount: 'abc' }, { amount: '9,99', source: 'Etsy' }], pages: [{ title: 't', path: 'javascript:alert(1)' }], products: [{ title: 'h', content: 'c', format: 'exe', filename: '../../etc/passwd.sh' }] });
assert(s.projects[0].tasks.length === 1 && s.projects[0].tasks[0].status === 'offen', 'invalid tasks/statuses dropped');
assert(s.income.length === 1 && s.income[0].amount === 9.99, 'income: comma, invalid dropped');
assert(s.pages.length === 0, 'unsafe page path dropped');
assert(s.products[0].format === 'markdown' && s.products[0].filename === 'etc-passwd.md', 'product format/filename sanitized');
s = M.startMoney(M.sanitizeMoney(), 'Vorlagen');
const first = M.activeProject(s);
assert(s.enabled && s.goal === 'Vorlagen' && first.tasks[0].type === 'analyse', 'start creates analysis project');
s = M.startMoney(s, '');
assert(s.projects.length === 1, 'restart without new goal continues');
s = M.startMoney(s, 'Websites');
assert(s.projects.length === 2 && s.projects[0].status === 'pausiert', 'new goal → new project, old paused');
s = M.stopMoney(s);
assert(!s.enabled, 'stop');
s = M.addTasks(s, s.activeProjectId, [{ type: 'nutzer', title: 'Konto anlegen' }]);
const hit = M.findTaskByTitle(s, '');
assert(hit && hit.task.status === 'wartet', 'user task waits, found when only one');
const done = M.completeUserTask(s, hit.task.id, { link: 'http://unsicher.de' });
assert(!done.buyLink && M.activeProject(done.state).tasks.find((t) => t.id === hit.task.id).status === 'erledigt', 'non-https link ignored');
try { M.addIncome(s, { amount: 0 }); assert(false, 'zero'); } catch { assert(true, 'zero income refused'); }

// mergeOutcome keeps user changes
const base = M.addTasks(M.startMoney(M.sanitizeMoney(), 'a'), null, []);
const pid = base.activeProjectId;
let withTasks = M.addTasks(base, pid, [{ type: 'produkt', title: 'P' }, { type: 'nutzer', title: 'U' }]);
const worker = { ...M.updateProject(withTasks, pid, { title: 'Neu' }), products: [{ id: 'abcdef1234', projectId: pid, title: 'X', content: 'Inhalt', kind: 'produkt' }] };
const userTask = M.activeProject(withTasks).tasks.find((t) => t.type === 'nutzer');
const userLatest = M.updateTask({ ...withTasks, enabled: false }, pid, userTask.id, { status: 'erledigt' });
const merged = A.mergeOutcome(userLatest, M.sanitizeMoney(worker), pid);
assert(merged.projects[0].title === 'Neu' && merged.projects[0].tasks.find((t) => t.id === userTask.id).status === 'erledigt' && !merged.enabled && merged.products.length === 1, 'merge: worker result + user changes kept');
assert(A.mergeOutcome({ ...userLatest, projects: [] }, M.sanitizeMoney(worker), pid) === null, 'merge: deleted project discarded');

// Worker with fake model: rules prompt, daily limit, error handling
let state = M.startMoney(M.sanitizeMoney(), 'Test');
const sent = [];
const prompts = [];
const agent = A.startMoneyAgent({
  getState: () => state, setState: (v) => { state = M.sanitizeMoney(v); }, notify: async (t) => sent.push(t), sendFile: async (c, f) => sent.push('FILE ' + f),
  getMemories: () => ['Ist 16 Jahre alt'], origin: () => 'https://x.onrender.com',
  generate: async ({ system, prompt }) => { prompts.push({ system, prompt }); throw new Error('KI kaputt'); }, log: { warn: () => {} }
});
agent.stop();
await agent.tick();
assert(M.activeProject(state).tasks[0].status === 'fehler' && /KI kaputt/.test(state.log.at(-1).text), 'failed task marked, logged');
assert(/Fake-Bewertungen/.test(prompts[0].system) && /kein Geld ausgeben/.test(prompts[0].system) && prompts[0].prompt.includes('Ist 16 Jahre alt'), 'rules + memories in prompt');
await agent.tick(); await agent.tick();
assert(prompts.length === 2, 'retries once, then stops');
state = { ...state, usage: { date: new Date().toISOString().slice(0, 10), count: 25 } };
state = M.updateTask(state, state.activeProjectId, M.activeProject(state).tasks[0].id, { status: 'offen', attempts: 0 });
await agent.tick();
assert(prompts.length === 2, 'daily limit respected');

// Voice tools
let cmds = [];
const ctx = { moneyCommand: (c) => { cmds.push(c); return c.action === 'task_done' ? { task: 'Konto anlegen', buyLink: null } : c.action === 'income_add' ? { income: { amount: 12.5, source: 'Etsy' } } : { message: 'ok' }; }, showMoney: () => cmds.push({ shown: true }), getMoney: () => ({ state: s, waitingForDevice: false }) };
try { await findCloudTool('money_mode').run({ action: 'start' }, ctx); assert(false, 'needs key'); } catch (e) { assert(/GEMINI_API_KEY/.test(e.message), 'money_mode start without key explains setup'); }
process.env.GEMINI_API_KEY = 'g';
const r1 = await findCloudTool('money_mode').run({ action: 'start', goal: 'Etsy' }, ctx);
assert(cmds[0].action === 'start' && cmds[0].goal === 'Etsy' && cmds[1].shown && /verspricht keine Einnahmen/.test(r1.hinweis), 'money_mode start');
const st = await findCloudTool('money_status').run({}, ctx);
assert(st.modus === 'aus' && Array.isArray(st.aufgaben.wartenAufDich), 'money_status summary');
const inc = await findCloudTool('money_income_add').run({ amount: 12.5, source: 'Etsy' }, ctx);
assert(inc.eingetragen === '12,50 €', 'money_income_add');
const td = await findCloudTool('money_task_done').run({ task: 'konto' }, ctx);
assert(td.erledigt === 'Konto anlegen', 'money_task_done by title');
try { await findCloudTool('money_task_done').run({ task: 'gibtsnicht' }, ctx); assert(false, 'x'); } catch (e) { assert(/Welche Aufgabe/.test(e.message), 'unknown task lists waiting tasks'); }
const tools = A.moneyToolStatus({ telegram: false, gmail: true, laptop: false });
assert(tools.length === 6 && tools[0].ok && tools[0].detail.startsWith('Gemini'), 'tool status');
