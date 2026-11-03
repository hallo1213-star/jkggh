// Engine logic in Node (no DOM): modules fail to draw here, the engine must
// stay alive and the event order must follow the real function results.
console.warn = () => {};
const { EV, on, state } = await import('../../public/cae/bus.js');
const { ingest, moduleFor } = await import('../../public/cae/engine.js');
const { buildSystems } = await import('../../systems-map.js');
const { cloudTools } = await import('../../cloud-tools.js');
const assert = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };
const seen = []; on('*', (e) => seen.push(e));
const types = (id) => seen.filter((e) => e.id === id).map((e) => e.type);

assert(moduleFor('studio_website') === 'website' && moduleFor('create_website') === 'website' && moduleFor('create_sales_website') === 'website', 'Website-Funktionen → Website-Animation (egal wie formuliert)');
assert(moduleFor('globe') === 'globe' && moduleFor('memory_list') === 'memories' && moduleFor('systems_overview') === 'systems', 'Globus, Erinnerungen, Systeme');
assert(moduleFor('get_weather') === 'neutral' && moduleFor('irgendwas') === 'neutral', 'ohne eigenes Modul → neutrale Animation');

ingest({ type: 'transcript', role: 'user', content: 'Mach mir eine moderne Website für meinen Friseur' });
assert(seen.at(-1).type === EV.COMMAND_RECEIVED && state.lastCommand.includes('Friseur'), 'COMMAND_RECEIVED aus echtem Transkript');
ingest({ type: 'action', id: 'a1', state: 'running', tool: 'studio_website', label: 'Website' });
assert(types('a1').join() === 'COMMAND_CLASSIFIED,ACTION_STARTED', 'Funktion gewählt → CLASSIFIED + STARTED');
ingest({ type: 'action', id: 'a1', state: 'done', tool: 'studio_website' });
assert(!types('a1').includes('ACTION_COMPLETED') && state.actions.get('a1').status === 'job', 'studio_website „done“ = nur gestartet → noch NICHT fertig');
ingest({ type: 'studio_job', id: 'j1', status: 'läuft', step: 'Konzept & Designsystem' });
ingest({ type: 'studio_job', id: 'j1', status: 'läuft', step: 'Gestaltung (CSS)' });
const prog = seen.filter((e) => e.id === 'a1' && e.type === EV.ACTION_PROGRESS).map((e) => e.progress);
assert(prog.length === 3 && prog[2] > prog[1] && prog[2] < 1, 'echter Fortschritt aus den Bau-Schritten, unter 100 %');
ingest({ type: 'studio_job', id: 'j1', status: 'fertig' });
assert(types('a1').at(-1) === 'ACTION_COMPLETED' && state.actions.get('a1').progress === 1, 'erst wenn der Bau wirklich fertig ist → COMPLETED');

ingest({ type: 'action', id: 'a2', state: 'running', tool: 'studio_website' });
ingest({ type: 'action', id: 'a2', state: 'done', tool: 'studio_website' });
ingest({ type: 'studio_job', id: 'j2', status: 'läuft', step: 'Konzept' });
ingest({ type: 'studio_job', id: 'j2', status: 'fehler', error: 'KI nicht erreichbar' });
assert(types('a2').at(-1) === 'ACTION_FAILED' && seen.at(-1).reason === 'KI nicht erreichbar' && !types('a2').includes('ACTION_COMPLETED'), 'Bau fehlgeschlagen → FAILED mit Grund, nie COMPLETED');

ingest({ type: 'action', id: 'a3', state: 'running', tool: 'get_weather' });
ingest({ type: 'action', id: 'a3', state: 'failed', tool: 'get_weather', detail: 'Ort unbekannt' });
assert(types('a3').at(-1) === 'ACTION_FAILED', 'normaler Fehler → FAILED');
ingest({ type: 'action', id: 'a4', state: 'running', tool: 'email_send' });
ingest({ type: 'action', id: 'a4', state: 'denied', tool: 'email_send' });
assert(seen.at(-1).reason === 'Nicht bestätigt', 'nicht bestätigt → FAILED (nicht fertig)');
ingest({ type: 'action', id: 'a5', state: 'running', tool: 'get_weather' });
ingest({ type: 'action', id: 'a5', state: 'done', tool: 'get_weather' });
assert(types('a5').at(-1) === 'ACTION_COMPLETED', 'normale Funktion fertig → COMPLETED');

ingest({ type: 'status', state: 'thinking' });
assert(seen.at(-1).type === EV.AGENT_STATE && seen.at(-1).phase === 'thinking' && state.phase === 'thinking', 'echtes Nachdenken → AGENT_STATE thinking');
ingest({ type: 'studio_job', id: 'j3', status: 'läuft', step: 'Konzept' });
assert(seen.some((e) => e.id === 'studio-j3' && e.type === EV.ACTION_STARTED), 'im Studio gestarteter Bau bekommt auch die Animation');
let crashed = false; try { ingest(null); ingest({ type: 'systems' }); ingest({ type: 'globe', action: 'fly', place: { name: 'Berlin', lat: 52.5, lon: 13.4 } }); } catch { crashed = true; }
assert(!crashed, 'Engine stürzt bei kaputten/fehlenden Daten nicht ab');

const sys = buildSystems({ tools: cloudTools.map((t) => t.name), laptopTools: 12, laptop: false, phone: true, telegram: false, gmail: true, twilio: false, voice: 'Deepgram Aura' });
const names = new Set(cloudTools.map((t) => t.name));
assert(sys.modules.length >= 8 && sys.modules.every((m) => m.count > 0), 'Systeme: nur Module mit echten Funktionen');
assert(sys.modules.find((m) => m.key === 'laptop').online === false && /nicht verbunden/.test(sys.modules.find((m) => m.key === 'laptop').detail), 'Laptop-Status ist echt (nicht verbunden)');
assert(/Gmail, iPhone/.test(sys.modules.find((m) => m.key === 'kommunikation').detail), 'Kommunikation zeigt nur verbundene Dienste');
const sys2 = buildSystems({ tools: ['get_weather'], laptopTools: 0, voice: 'x' });
assert(sys2.modules.find((m) => m.key === 'welt').count === 1 && !sys2.modules.some((m) => m.key === 'wissen'), 'fehlt eine Funktion, fehlt auch das Modul (nichts erfunden)');
assert([...names].includes('systems_overview'), 'Funktion systems_overview existiert');
