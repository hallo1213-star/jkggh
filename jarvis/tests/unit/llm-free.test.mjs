for (const k of ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'GROQ_MODEL']) delete process.env[k];
process.env.GROQ_API_KEY = 'gsk_test';
const L = await import('../../llm.js');
const M = await import('../../money-state.js');
const A = await import('../../money-agent.js');
const assert = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };
const calls = [];
let groqModels = ['whisper-large-v3', 'llama-guard-4-12b', 'openai/gpt-oss-120b', 'qwen/qwen3-32b'];
let locked = new Set();
const f = async (url, init = {}) => {
  calls.push({ url, body: init.body ? JSON.parse(init.body) : null, auth: init.headers?.authorization });
  if (url.endsWith('/models')) {
    if (url.includes('groq')) return { ok: true, status: 200, json: async () => ({ object: 'list', data: groqModels.map((id) => ({ id, active: true, context_window: 131072 })) }) };
    return { ok: true, status: 200, json: async () => ({ data: [{ id: 'some/vision-model:free' }, { id: 'paid/model' }, { id: 'meta-llama/llama-3.3-70b-instruct:free', context_length: 65536 }] }) };
  }
  const model = JSON.parse(init.body).model;
  if (locked.has(model)) return { ok: false, status: 404, json: async () => ({ error: { message: `The model \`${model}\` does not exist or you do not have access to it.` } }) };
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }) };
};
assert(L.llmProvider() === 'groq' && /automatisch/.test(L.llmLabel()), 'Groq chosen, model picked automatically');
const r = await L.generateJson({ system: 'SYS', prompt: 'P', maxTokens: 12000, fetchImpl: f });
const chat = calls.find((c) => c.url.endsWith('/chat/completions'));
assert(r.ok && calls[0].url === 'https://api.groq.com/openai/v1/models' && calls[0].auth === 'Bearer gsk_test', 'asks Groq for its models');
assert(chat.body.model === 'openai/gpt-oss-120b' && chat.body.max_tokens === 8000 && chat.body.response_format.type === 'json_object', 'picks best text model (not whisper/guard), caps tokens');
assert(L.llmLabel() === 'Groq (openai/gpt-oss-120b)', 'label shows chosen model');
calls.length = 0; locked = new Set(['openai/gpt-oss-120b']);
await L.generateText({ system: 'S', prompt: 'P', fetchImpl: f });
const models = calls.filter((c) => c.body).map((c) => c.body.model);
assert(models.join() === 'openai/gpt-oss-120b,qwen/qwen3-32b', 'locked model → switches automatically to next one');
process.env.GROQ_MODEL = 'eigenes/modell';
calls.length = 0;
await L.generateText({ system: 'S', prompt: 'P', fetchImpl: f });
assert(calls.length === 1 && calls[0].body.model === 'eigenes/modell', 'GROQ_MODEL override, no model list');
locked = new Set(['eigenes/modell']);
try { await L.generateText({ system: '', prompt: '', fetchImpl: f }); assert(false, 'x'); } catch (e) { assert(/GROQ_MODEL bei Render gesetzt/.test(e.message), 'bad own model explained'); }
delete process.env.GROQ_MODEL;
const err = (status, message) => async (url) => (url.endsWith('/models') ? f(url) : { ok: false, status, json: async () => ({ error: { message } }) });
try { await L.generateText({ system: '', prompt: '', fetchImpl: err(429, 'Rate limit reached') }); } catch (e) { assert(/Limit erreicht/.test(e.message), 'rate limit explained'); }
try { await L.generateText({ system: '', prompt: '', fetchImpl: err(401, 'Invalid API Key') }); } catch (e) { assert(/lehnt den API-Schlüssel ab/.test(e.message), 'bad key explained'); }
groqModels = ['whisper-large-v3'];
delete process.env.GROQ_API_KEY; process.env.OPENROUTER_API_KEY = 'sk-or';
calls.length = 0;
await L.generateText({ system: 'S', prompt: 'P', fetchImpl: f });
assert(L.llmProvider() === 'openrouter' && calls[1].url === 'https://openrouter.ai/api/v1/chat/completions' && calls[1].body.model === 'meta-llama/llama-3.3-70b-instruct:free', 'OpenRouter picks a free text model');
delete process.env.OPENROUTER_API_KEY;
assert(/GROQ_API_KEY/.test(L.MISSING_KEY) && L.llmProvider() === null, 'missing key names Groq');
let state = M.startMoney(M.sanitizeMoney(), 'x');
const agent = A.startMoneyAgent({ getState: () => state, setState: (v) => { state = M.sanitizeMoney(v); }, notify: async () => {}, sendFile: async () => {}, getMemories: () => [], origin: () => '', generate: async () => { throw new Error('Groq: Limit erreicht, später erneut (x).'); }, log: { warn: () => {} } });
agent.stop();
for (let i = 0; i < 4; i++) await agent.tick();
const t = M.activeProject(state).tasks[0];
assert(t.status === 'offen' && t.attempts === 0, 'rate limit: task stays open, retried later');
