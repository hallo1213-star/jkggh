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
  if (provider === 'groq' || provider === 'openrouter') return `${OPENAI_COMPATIBLE[provider].name} (${OPENAI_COMPATIBLE[provider].model()})`;
  if (provider === 'gemini') return `Gemini (${geminiModel()})`;
  return null;
}

const claudeModel = () => process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5-5';
const geminiModel = () => process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';

// Groq and OpenRouter speak the OpenAI chat format.
const OPENAI_COMPATIBLE = {
  groq: { name: 'Groq', url: 'https://api.groq.com/openai/v1/chat/completions', key: () => process.env.GROQ_API_KEY.trim(), model: () => process.env.GROQ_MODEL?.trim() || 'llama-3.3-70b-versatile', maxTokens: 8000 },
  openrouter: { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1/chat/completions', key: () => process.env.OPENROUTER_API_KEY.trim(), model: () => process.env.OPENROUTER_MODEL?.trim() || 'meta-llama/llama-3.3-70b-instruct:free', maxTokens: 8000 }
};

async function openaiCompatible(provider, system, prompt, maxTokens, fetchImpl, json) {
  const config = OPENAI_COMPATIBLE[provider];
  const response = await fetchImpl(config.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.key()}`, ...(provider === 'openrouter' ? { 'x-title': 'Jarvis' } : {}) },
    body: JSON.stringify({
      model: config.model(),
      max_tokens: Math.min(maxTokens, config.maxTokens),
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      ...(json ? { response_format: { type: 'json_object' } } : {})
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const data = await readJson(response, config.name);
  return data.choices?.[0]?.message?.content || '';
}

async function readJson(response, name) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `HTTP ${response.status}`;
    if (response.status === 401 || response.status === 403) throw new Error(`${name} lehnt den API-Schlüssel ab (${message}).`);
    if (response.status === 404 || /model.*(not found|decommissioned|does not exist)/i.test(message)) throw new Error(`${name}: Das KI-Modell gibt es nicht (mehr). Bei Render ein aktuelles Modell als ${name === "Claude" ? "ANTHROPIC" : name.toUpperCase()}_MODEL eintragen (${message}).`);
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
