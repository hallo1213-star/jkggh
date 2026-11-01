// Text generation for the autonomous money mode (the voice conversation keeps
// using Deepgram). The provider is chosen by which key is set at Render:
//   ANTHROPIC_API_KEY   → Claude (paid, best quality)
//   GROQ_API_KEY        → Groq (free tier, console.groq.com)
//   OPENROUTER_API_KEY  → OpenRouter (free models, openrouter.ai)
//   GEMINI_API_KEY      → Google Gemini (free tier from aistudio.google.com)
// The key stays on the server.
const TIMEOUT_MS = 120_000;

export const MISSING_KEY = 'Für den Geld-Modus fehlt noch ein KI-Schlüssel bei Render: GROQ_API_KEY (kostenlos bei console.groq.com) – oder OPENROUTER_API_KEY, GEMINI_API_KEY bzw. ANTHROPIC_API_KEY. Anleitung im README, Abschnitt Geld-Modus.';

export function llmProvider() {
  if (process.env.ANTHROPIC_API_KEY?.trim()) return 'claude';
  if (process.env.GROQ_API_KEY?.trim()) return 'groq';
  if (process.env.OPENROUTER_API_KEY?.trim()) return 'openrouter';
  if (process.env.GEMINI_API_KEY?.trim()) return 'gemini';
  return null;
}

export function llmLabel() {
  const provider = llmProvider();
  if (provider === 'claude') return `Claude (${claudeModel()})`;
  if (provider === 'groq' || provider === 'openrouter') return `${OPENAI_COMPATIBLE[provider].name} (${OPENAI_COMPATIBLE[provider].configured() || chosenModel[provider] || 'Modell wird automatisch gewählt'})`;
  if (provider === 'gemini') return `Gemini (${geminiModel()})`;
  return null;
}

const claudeModel = () => process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5-5';
const geminiModel = () => process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';

// Groq and OpenRouter speak the OpenAI chat format. Which models an account
// may use changes over time, so unless GROQ_MODEL/OPENROUTER_MODEL is set,
// Jarvis asks the provider for its model list and picks the best available one.
const OPENAI_COMPATIBLE = {
  groq: {
    name: 'Groq',
    base: 'https://api.groq.com/openai/v1',
    key: () => process.env.GROQ_API_KEY.trim(),
    configured: () => process.env.GROQ_MODEL?.trim(),
    preferred: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'moonshotai/kimi-k2-instruct-0905', 'moonshotai/kimi-k2-instruct', 'qwen/qwen3-32b', 'meta-llama/llama-4-maverick-17b-128e-instruct', 'openai/gpt-oss-20b', 'meta-llama/llama-4-scout-17b-16e-instruct', 'llama-3.1-8b-instant'],
    usable: (m) => m.active !== false && !/whisper|guard|tts|playai|orpheus|prompt-guard|distil|compound|safeguard/i.test(m.id),
    maxTokens: 8000
  },
  openrouter: {
    name: 'OpenRouter',
    base: 'https://openrouter.ai/api/v1',
    key: () => process.env.OPENROUTER_API_KEY.trim(),
    configured: () => process.env.OPENROUTER_MODEL?.trim(),
    preferred: ['openai/gpt-oss-120b:free', 'meta-llama/llama-3.3-70b-instruct:free', 'deepseek/deepseek-chat-v3-0324:free', 'qwen/qwen3-235b-a22b:free', 'google/gemma-3-27b-it:free', 'mistralai/mistral-small-3.2-24b-instruct:free'],
    usable: (m) => m.id.endsWith(':free') && !/vision|vl\b|image|audio/i.test(m.id),
    maxTokens: 8000
  }
};
const chosenModel = {};
const badModels = new Set();

async function pickModel(provider, fetchImpl) {
  const config = OPENAI_COMPATIBLE[provider];
  if (config.configured()) return config.configured();
  if (chosenModel[provider]) return chosenModel[provider];
  const response = await fetchImpl(`${config.base}/models`, { headers: { authorization: `Bearer ${config.key()}` }, signal: AbortSignal.timeout(20_000) });
  const data = await readJson(response, config.name);
  const available = (data.data || []).filter((m) => typeof m?.id === 'string' && config.usable(m) && !badModels.has(m.id));
  const ids = new Set(available.map((m) => m.id));
  const model = config.preferred.find((id) => ids.has(id))
    || available.sort((a, b) => (Number(b.context_window || b.context_length) || 0) - (Number(a.context_window || a.context_length) || 0))[0]?.id;
  if (!model) throw new Error(`${config.name}: Für deinen Schlüssel ist gerade kein passendes Text-Modell freigeschaltet.`);
  chosenModel[provider] = model;
  console.log(`Geld-Modus: nutze ${config.name}-Modell ${model}`);
  return model;
}

async function openaiCompatible(provider, system, prompt, maxTokens, fetchImpl, json, retried = false) {
  const config = OPENAI_COMPATIBLE[provider];
  const model = await pickModel(provider, fetchImpl);
  const response = await fetchImpl(`${config.base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.key()}`, ...(provider === 'openrouter' ? { 'x-title': 'Jarvis' } : {}) },
    body: JSON.stringify({
      model,
      max_tokens: Math.min(maxTokens, config.maxTokens),
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      ...(json ? { response_format: { type: 'json_object' } } : {})
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  try {
    const data = await readJson(response, config.name);
    return data.choices?.[0]?.message?.content || '';
  } catch (error) {
    // The chosen model vanished or is locked: pick another one once.
    if (/KI-Modell gibt es nicht/.test(error.message) && !config.configured() && !retried) {
      badModels.add(model);
      delete chosenModel[provider];
      return openaiCompatible(provider, system, prompt, maxTokens, fetchImpl, json, true);
    }
    throw error;
  }
}

async function readJson(response, name) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `HTTP ${response.status}`;
    if (response.status === 401 || response.status === 403) throw new Error(`${name} lehnt den API-Schlüssel ab (${message}).`);
    if (response.status === 404 || /model.*(not found|decommissioned|does not exist|not available|no access|do not have access)/i.test(message)) throw new Error(`${name}: Das KI-Modell gibt es nicht (mehr) (${message}). Falls ${name === 'Claude' ? 'ANTHROPIC' : name.toUpperCase()}_MODEL bei Render gesetzt ist, diesen Eintrag löschen oder ändern.`);
    if (response.status === 429 || response.status === 413) throw new Error(`${name}: Limit erreicht, später erneut (${message}).`);
    throw new Error(`${name}: ${message}`);
  }
  return data;
}

async function claude(system, prompt, maxTokens, fetchImpl) {
  const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY.trim(), 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: claudeModel(), max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const data = await readJson(response, 'Claude');
  return (data.content || []).filter((part) => part.type === 'text').map((part) => part.text).join('');
}

async function gemini(system, prompt, maxTokens, fetchImpl, json) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel())}:generateContent`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY.trim() },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, ...(json ? { responseMimeType: 'application/json' } : {}) }
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const data = await readJson(response, 'Gemini');
  return (data.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('');
}

export async function generateText({ system, prompt, maxTokens = 4000, json = false, fetchImpl = fetch }) {
  const provider = llmProvider();
  if (!provider) throw new Error(MISSING_KEY);
  const text = provider === 'claude' ? await claude(system, prompt, maxTokens, fetchImpl)
    : provider === 'gemini' ? await gemini(system, prompt, maxTokens, fetchImpl, json)
      : await openaiCompatible(provider, system, prompt, maxTokens, fetchImpl, json);
  if (!text.trim()) throw new Error('Die KI hat eine leere Antwort geliefert.');
  return text;
}

// Pulls the first JSON object out of a reply (models sometimes add ``` fences).
export function parseJsonReply(text) {
  const clean = String(text).replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '');
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Die KI-Antwort enthielt kein JSON.');
  return JSON.parse(clean.slice(start, end + 1));
}

export async function generateJson(options) {
  const text = await generateText({ ...options, json: true });
  try {
    return parseJsonReply(text);
  } catch {
    // One retry with a stricter reminder.
    return parseJsonReply(await generateText({ ...options, json: true, prompt: `${options.prompt}\n\nAntworte AUSSCHLIESSLICH mit gültigem JSON, ohne weiteren Text.` }));
  }
}

// --- Understanding images (photos and screenshots the user sends) ----------------

const VISION_PREFERRED = {
  groq: ['qwen/qwen3.8-27b', 'qwen/qwen3.6-27b', 'meta-llama/llama-4-maverick-17b-128e-instruct', 'meta-llama/llama-4-scout-17b-16e-instruct'],
  openrouter: ['qwen/qwen3.6-27b:free', 'google/gemma-3-27b-it:free', 'meta-llama/llama-4-maverick:free', 'meta-llama/llama-4-scout:free', 'qwen/qwen2.5-vl-72b-instruct:free']
};
// Names that usually mean "understands pictures"; providers rename models often.
const VISION_HINT = /qwen-?3\.\d|qwen.*vl|-vl\b|vl-|vision|llama-4|gemma-?[34]|pixtral|llava|kimi-k2\.[5-9]|omni|multimodal|image/i;
const visionChoice = {};
const noVision = new Set();

// Candidates in order: known vision models, likely ones by name, then the
// remaining chat models (Groq lists no "vision" flag, so we simply try).
async function visionCandidates(provider, fetchImpl) {
  const config = OPENAI_COMPATIBLE[provider];
  const response = await fetchImpl(`${config.base}/models`, { headers: { authorization: `Bearer ${config.key()}` }, signal: AbortSignal.timeout(20_000) });
  const data = await readJson(response, config.name);
  const ids = (data.data || [])
    .filter((m) => typeof m?.id === 'string' && m.active !== false && !/whisper|guard|tts|playai|orpheus|distil|compound|safeguard|embed/i.test(m.id))
    .filter((m) => provider !== 'openrouter' || m.id.endsWith(':free'))
    .map((m) => m.id)
    .filter((id) => !noVision.has(`${provider}:${id}`));
  const set = new Set(ids);
  const ordered = [...VISION_PREFERRED[provider].filter((id) => set.has(id)), ...ids.filter((id) => VISION_HINT.test(id)), ...(provider === 'groq' ? ids : [])];
  return [...new Set(ordered)].slice(0, 8);
}

const stripThinking = (text) => String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

async function openaiVision(provider, system, ask, dataUrl, fetchImpl) {
  const config = OPENAI_COMPATIBLE[provider];
  const configured = process.env[`${provider.toUpperCase()}_VISION_MODEL`]?.trim();
  const candidates = configured ? [configured] : visionChoice[provider] ? [visionChoice[provider]] : await visionCandidates(provider, fetchImpl);
  let lastError = null;
  for (const model of candidates) {
    const response = await fetchImpl(`${config.base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.key()}` },
      body: JSON.stringify({ model, max_tokens: 1500, messages: [{ role: 'system', content: system }, { role: 'user', content: [{ type: 'text', text: ask }, { type: 'image_url', image_url: { url: dataUrl } }] }] }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (response.status === 429 || response.status === 401 || response.status === 403) await readJson(response, config.name); // throws: limit / key
    if (!response.ok) {
      // This model cannot see pictures (or is gone): remember and try the next.
      const data = await response.json().catch(() => ({}));
      lastError = data?.error?.message || `HTTP ${response.status}`;
      noVision.add(`${provider}:${model}`);
      if (visionChoice[provider] === model) delete visionChoice[provider];
      continue;
    }
    const data = await response.json();
    const answer = stripThinking(data.choices?.[0]?.message?.content);
    if (!answer) throw new Error('Die Bildanalyse hat keine Antwort geliefert.');
    if (visionChoice[provider] !== model) console.log(`Bildanalyse: nutze ${config.name}-Modell ${model}`);
    visionChoice[provider] = model;
    return answer;
  }
  throw new Error(`${config.name}: Für deinen Schlüssel ist gerade kein Bild-Modell freigeschaltet${lastError ? ` (${lastError.slice(0, 120)})` : ''}.`);
}

export async function describeImage({ dataUrl, question, fetchImpl = fetch }) {
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!match) throw new Error('Das Bild konnte nicht gelesen werden (nur JPG, PNG, WebP).');
  if (match[2].length > 6_000_000) throw new Error('Das Bild ist zu groß.');
  const providers = visionProviders();
  if (!providers.length) throw new Error(MISSING_KEY);
  const system = 'Du bist die Bildanalyse von Jarvis. Antworte auf Deutsch, klar und gut verständlich. Beschreibe, was zu sehen ist: Objekte und wo sie sich befinden, die Szene, Farben, Stimmung, und lies sichtbaren Text vor. Bei Screenshots mit Fehlermeldungen: Erkläre den Fehler und den wahrscheinlichsten Lösungsweg in einfachen Schritten. Identifiziere keine echten Personen anhand ihres Gesichts – beschreibe Menschen nur allgemein. Erfinde nichts, was nicht zu sehen ist.';
  const ask = String(question || '').trim().slice(0, 500) || 'Beschreibe mir alles, was du auf diesem Bild erkennst.';
  const errors = [];
  for (const provider of providers) {
    try {
      return await visionWith(provider, { system, ask, match, dataUrl, fetchImpl });
    } catch (error) {
      // A rate limit or missing vision model at one provider: try the next key, if any.
      errors.push(error.message);
    }
  }
  throw new Error(errors.join(' · '));
}

// Every configured provider, the main one first (Claude, Gemini and most
// Groq/OpenRouter accounts can read pictures).
function visionProviders() {
  const main = llmProvider();
  const all = [['claude', 'ANTHROPIC_API_KEY'], ['groq', 'GROQ_API_KEY'], ['gemini', 'GEMINI_API_KEY'], ['openrouter', 'OPENROUTER_API_KEY']]
    .filter(([, key]) => process.env[key]?.trim()).map(([name]) => name);
  return main ? [main, ...all.filter((p) => p !== main)] : all;
}

async function visionWith(provider, { system, ask, match, dataUrl, fetchImpl }) {
  if (provider === 'claude') {
    const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY.trim(), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: claudeModel(), max_tokens: 1500, system, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } }, { type: 'text', text: ask }] }] }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    const data = await readJson(response, 'Claude');
    return (data.content || []).filter((p) => p.type === 'text').map((p) => p.text).join('').trim();
  }
  if (provider === 'gemini') {
    const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel())}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY.trim() },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ inline_data: { mime_type: match[1], data: match[2] } }, { text: ask }] }] }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    const data = await readJson(response, 'Gemini');
    return (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  }
  return openaiVision(provider, system, ask, dataUrl, fetchImpl);
}

// --- Conversations with tools (Telegram assistant) ------------------------------
// OpenAI-style function calling for Groq/OpenRouter. Returns the assistant
// message ({ content, tool_calls }). Other providers answer without tools.
export async function chatWithTools({ messages, tools = [], maxTokens = 1500, fetchImpl = fetch }) {
  const provider = llmProvider();
  if (!provider) throw new Error(MISSING_KEY);
  if (provider !== 'groq' && provider !== 'openrouter') {
    const system = messages.find((m) => m.role === 'system')?.content || '';
    const convo = messages.filter((m) => m.role !== 'system' && typeof m.content === 'string').map((m) => `${m.role === 'user' ? 'Nutzer' : 'Jarvis'}: ${m.content}`).join('\n');
    return { role: 'assistant', content: await generateText({ system, prompt: convo, maxTokens, fetchImpl }) };
  }
  const config = OPENAI_COMPATIBLE[provider];
  const model = await pickModel(provider, fetchImpl);
  const response = await fetchImpl(`${config.base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.key()}` },
    body: JSON.stringify({ model, max_tokens: Math.min(maxTokens, config.maxTokens), messages, ...(tools.length ? { tools, tool_choice: 'auto' } : {}) }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const data = await readJson(response, config.name);
  return data.choices?.[0]?.message || { role: 'assistant', content: '' };
}
