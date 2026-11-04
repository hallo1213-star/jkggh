import { planAiFilm, sanitizeVideo } from '../../video.js';
import { cloudTools } from '../../cloud-tools.js';
const assert = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };
const tool = cloudTools.find((t) => t.name === 'ai_video');
const gen = async () => ({ title: 'Mars-Mission', music: 'cinematic', scenes: [{ prompt: 'astronaut walking on mars, photorealistic', caption: 'Ankunft', voiceover: 'Der erste Schritt.' }, { prompt: 'aerial shot of a red canyon', caption: 'Weite', voiceover: '' }, { prompt: 'x', caption: 'zu viel' }, { prompt: 'y' }, { prompt: 'z' }] });
process.env.GROQ_API_KEY = 'x';
const plan = await planAiFilm('Ein Astronaut auf dem Mars', { generate: gen });
assert(plan.scenes.length === 4 && plan.scenes.every((s) => s.duration === 5) && plan.music === 'epic', 'Plan: max. 4 Einstellungen à 5 s, Musik gültig');
assert((await planAiFilm('Weltraum', { clips: 2, generate: gen, voice: false })).scenes.every((s, i, a) => a.length === 2 && !s.voiceover), 'gewünschte Anzahl, ohne Sprecher');
let err = ''; try { await planAiFilm(' ', { generate: gen }); } catch (e) { err = e.message; } assert(/Was für ein Video/.test(err), 'leerer Wunsch wird abgelehnt');

// without Replicate: no confirmation, free version (photo-real stills) and honest note
delete process.env.REPLICATE_API_TOKEN; delete process.env.REPLICATE_VIDEO_MODEL;
assert(await tool.confirm({ description: 'Menschen am Strand' }, {}) === null, 'ohne Replicate: keine Kosten, keine Bestätigung nötig');

// with Replicate: confirmation shows clips and price, run starts clips after "yes"
process.env.REPLICATE_API_TOKEN = 'r8_test'; process.env.REPLICATE_VIDEO_MODEL = 'kwaivgi/kling-v2.1'; process.env.REPLICATE_VIDEO_PRICE = 'ca. 0,30 $';
const realFetch = globalThis.fetch; const calls = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.includes('api.groq.com') && url.includes('/models')) return new Response(JSON.stringify({ data: [{ id: 'llama-3.3-70b-versatile' }] }), { headers: { 'content-type': 'application/json' } });
  if (url.includes('api.groq.com')) return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ title: 'Strand', music: 'chill', scenes: [{ prompt: 'people laughing on a beach at sunset, photorealistic', caption: 'Sonnenuntergang', voiceover: 'Sommer.' }, { prompt: 'waves crashing in slow motion', caption: 'Wellen' }] }) } }] }), { headers: { 'content-type': 'application/json' } });
  if (url.includes('api.replicate.com')) { calls.push(JSON.parse(init.body)); return new Response(JSON.stringify({ urls: { get: 'https://api.replicate.com/v1/predictions/p1' } }), { headers: { 'content-type': 'application/json' } }); }
  return realFetch(url, init);
};
const ctx = { videoMemory: {}, showVisual: (m) => (ctx.shown = m) };
const args = { description: 'Menschen am Strand', format: '9:16' };
const req = await tool.confirm(args, ctx);
assert(/2 echte KI-Videoclips/.test(req.title) && /0,30 \$ pro Clip × 2/.test(req.detail) && /kling/.test(req.detail), 'Bestätigung zeigt Anzahl, Modell und Kosten');
assert(calls.length === 0, 'vor dem „Ja“ wird NICHTS bei Replicate gestartet');
const res = await tool.run(args, ctx);
assert(calls.length === 2 && calls[0].input.prompt.includes('beach') && calls[0].input.aspect_ratio === '9:16', 'nach dem „Ja“: 2 Clips mit englischem Prompt und Format gestartet');
assert(res.gestartet === 2 && ctx.shown.fetchClips && ctx.shown.project.scenes.every((s) => s.type === 'ai_video' && s.clip), 'Video Studio bekommt die Clips zum Einsetzen');
globalThis.fetch = realFetch;
assert(sanitizeVideo({ scenes: [{ type: 'ai_video', clip: 'clip-abc123' }] }).scenes[0].clip === 'clip-abc123', 'Clip-Szenen bleiben erhalten');
