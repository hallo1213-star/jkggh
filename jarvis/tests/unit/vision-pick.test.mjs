import assert from 'node:assert/strict';
const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const dir = ROOT;
const img = 'data:image/jpeg;base64,' + Buffer.from('fake').toString('base64');
const ok = (text) => new Response(JSON.stringify({ choices: [{ message: { content: text } }] }));
const bad = (msg, status = 400) => new Response(JSON.stringify({ error: { message: msg } }), { status });
let n = 0;
for (const k of ['ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'GROQ_VISION_MODEL']) delete process.env[k];
process.env.GROQ_API_KEY = 'g';
// 1) current Groq list: Scout gone, Qwen 3.6 there
{ const m = await import(`${dir}/llm.js?a`); const used = [];
  const f = async (url, init) => { if (url.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'openai/gpt-oss-120b' }, { id: 'qwen/qwen3.6-27b' }, { id: 'whisper-large-v3' }] }));
    const model = JSON.parse(init.body).model; used.push(model); return model === 'qwen/qwen3.6-27b' ? ok('<think>hmm</think>Eine Tasse Kaffee.') : bad('content must be a string'); };
  assert.equal(await m.describeImage({ dataUrl: img, fetchImpl: f }), 'Eine Tasse Kaffee.'); assert.deepEqual(used, ['qwen/qwen3.6-27b']); n++;
  await m.describeImage({ dataUrl: img, fetchImpl: f }); assert.equal(used.length, 2); n++; // remembered, no model list again
}
// 2) unknown new names: tries until one accepts images
{ const m = await import(`${dir}/llm.js?b`); const used = [];
  const f = async (url, init) => { if (url.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'text-only-1' }, { id: 'brand-new-model' }, { id: 'llama-guard-4' }] }));
    const model = JSON.parse(init.body).model; used.push(model); return model === 'brand-new-model' ? ok('Ein Hund.') : bad('model does not support image input'); };
  assert.equal(await m.describeImage({ dataUrl: img, fetchImpl: f }), 'Ein Hund.'); assert.deepEqual(used, ['text-only-1', 'brand-new-model']); n++;
}
// 3) rate limit → clear message, no endless trying
{ const m = await import(`${dir}/llm.js?c`); let calls = 0;
  const f = async (url) => { if (url.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'qwen/qwen3.6-27b' }, { id: 'x' }] })); calls++; return bad('Rate limit reached', 429); };
  await assert.rejects(m.describeImage({ dataUrl: img, fetchImpl: f }), /Limit erreicht/); assert.equal(calls, 1); n++;
}
// 4) Groq cannot see at all, Gemini key also there → Gemini answers
{ process.env.GEMINI_API_KEY = 'gm'; const m = await import(`${dir}/llm.js?d`);
  const f = async (url) => { if (url.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'text-only' }] }));
    if (url.includes('generativelanguage')) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Ein Baum.' }] } }] }));
    return bad('content must be a string'); };
  assert.equal(await m.describeImage({ dataUrl: img, fetchImpl: f }), 'Ein Baum.'); n++;
  delete process.env.GEMINI_API_KEY;
}
// 5) nothing works → understandable German message
{ const m = await import(`${dir}/llm.js?e`);
  const f = async (url) => (url.endsWith('/models') ? new Response(JSON.stringify({ data: [{ id: 'text-only' }] })) : bad('content must be a string'));
  await assert.rejects(m.describeImage({ dataUrl: img, fetchImpl: f }), /kein Bild-Modell freigeschaltet/); n++;
}
console.log(`vision-pick: ${n} bestanden`);
