import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const S = new URL('../fixtures', import.meta.url).pathname;
for (const k of ['ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'REPLICATE_API_TOKEN', 'REPLICATE_VIDEO_MODEL']) delete process.env[k];
const m = await import(ROOT + '/video.js');
let n = 0;
assert.equal(m.guessFormat('Mach ein TikTok über Hunde'), '9:16'); assert.equal(m.guessFormat('YouTube Intro'), '16:9'); n++;
assert.equal(m.guessDuration('eine 30-sekündige Werbung'), 30); assert.equal(m.guessDuration('2 Minuten'), 120); assert.equal(m.guessDuration('Video'), 20); n++;
// without AI key: template
const ad = await m.planVideo('Erstelle mir eine 30-sekündige Werbung für meinen Jarvis');
assert.equal(ad.planner, 'vorlage'); assert.deepEqual(ad.scenes.map((s) => s.type), ['city', 'hologram', 'interface', 'logo']); assert.equal(Math.round(ad.scenes.reduce((a, s) => a + s.duration, 0)), 30); n++;
const city = await m.planVideo('Realistisches Video von einer futuristischen Stadt bei Nacht', { duration: 20, format: '9:16' });
assert.equal(city.format, '9:16'); assert.ok(city.scenes.filter((s) => s.type === 'image').every((s) => s.prompt.includes('futuristischen Stadt'))); n++;
// with AI: plan is sanitized and scaled to the wanted length
process.env.GROQ_API_KEY = 'x';
const planned = await m.planVideo('Werbung', { duration: 30, generate: async ({ prompt }) => { assert.match(prompt, /Länge: 30 Sekunden/); return { title: 'Spot', music: 'hacker', accent: 'red', scenes: [{ type: 'city', duration: 10 }, { type: 'evil', duration: 10, transition: 'boom' }, { type: 'logo', duration: 40, title: 'JARVIS', voiceover: 'Hallo' }] }; } });
assert.equal(planned.music, 'epic'); assert.equal(planned.accent, '#ff7a1a'); assert.equal(planned.scenes[1].type, 'particles'); assert.equal(planned.scenes[1].transition, 'fade');
assert.ok(Math.abs(planned.scenes.reduce((a, s) => a + s.duration, 0) - 30) < 1.5); n++;
const noVoice = await m.planVideo('x', { voice: false, generate: async () => ({ scenes: [{ type: 'text', voiceover: 'Hallo', duration: 5 }] }) });
assert.equal(noVoice.scenes[0].voiceover, ''); n++;
// edit keeps ids and AI clips
const base = m.sanitizeVideo({ scenes: [{ id: 'aaaaaa1111', type: 'ai_video', clip: 'clip-abc123', duration: 5 }, { id: 'bbbbbb2222', type: 'logo', duration: 4 }] });
const edited = await m.editVideo(base, 'Logo länger', { generate: async () => ({ scenes: [{ id: 'aaaaaa1111', type: 'ai_video', duration: 5 }, { id: 'bbbbbb2222', type: 'logo', duration: 8 }] }) });
assert.equal(edited.scenes[0].clip, 'clip-abc123'); assert.equal(edited.scenes[1].duration, 8); assert.equal(edited.id, base.id); n++;
// paid AI video: never without key/model, never without confirmation
await assert.rejects(m.startAiClip({ prompt: 'x', confirmed: true }), /nicht eingerichtet/); n++;
process.env.REPLICATE_API_TOKEN = 'r'; process.env.REPLICATE_VIDEO_MODEL = 'owner/model'; process.env.REPLICATE_VIDEO_PRICE = 'ca. 0,40 € pro Clip';
assert.deepEqual(m.aiVideoConfig(), { enabled: true, model: 'owner/model', price: 'ca. 0,40 € pro Clip' }); n++;
let called = 0;
await assert.rejects(m.startAiClip({ prompt: 'x' }, { fetchImpl: async () => { called++; } }), /Bestätigung/); assert.equal(called, 0); n++;
const calls = [];
const fake = async (url, init) => { calls.push({ url, init }); if (url.includes('/models/') && url.endsWith('/predictions')) return new Response(JSON.stringify({ urls: { get: 'https://api.replicate.com/v1/predictions/p1' } })); if (url.endsWith('/p1')) return new Response(JSON.stringify({ status: 'succeeded', output: 'https://replicate.delivery/x/out.mp4' })); if (url.startsWith('https://replicate.delivery/')) return new Response(new Uint8Array([1, 2, 3])); throw new Error(url); };
const { id } = await m.startAiClip({ prompt: 'a city', format: '9:16', confirmed: true }, { fetchImpl: fake });
assert.equal(JSON.parse(calls[0].init.body).input.aspect_ratio, '9:16'); assert.equal(calls[0].init.headers.authorization, 'Bearer r');
assert.equal((await m.aiClipStatus(id, { fetchImpl: fake })).status, 'fertig'); assert.equal(m.aiClipFile(id).length, 3); n++;
// voice via Deepgram REST
process.env.DEEPGRAM_API_KEY = 'dg';
let voiceUrl = '';
const audio = await m.synthesizeVoice('Willkommen in der Zukunft.', { fetchImpl: async (url, init) => { voiceUrl = url; assert.equal(init.headers.authorization, 'Token dg'); return new Response(new Uint8Array([9, 9])); } });
assert.match(voiceUrl, /model=aura-2-julius-de&encoding=mp3/); assert.equal(audio.length, 2); n++;
// image proxy rejects non-images
await assert.rejects(m.fetchImage('city', '16:9', 1, { fetchImpl: async () => new Response('<html>', { headers: { 'content-type': 'text/html' } }) }), /Bildgenerator/); n++;
assert.match(m.videoImageUrl('a b', '9:16', 5), /width=768&height=1344&seed=5/); n++;
// MP4 conversion with ffmpeg
const mp4 = await m.convertToMp4(readFileSync(`${S}/test.webm`));
assert.equal(mp4.subarray(4, 8).toString(), 'ftyp'); n++;
console.log(`video: ${n} bestanden`);
