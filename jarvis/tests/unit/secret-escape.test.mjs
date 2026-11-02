import { decryptText, encryptText, makeSequence } from '../../public/fx6.js';
import { cloudTools } from '../../cloud-tools.js';
import { unwrapEffect } from '../../effects-hub.js';
const assert = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };
const msg = 'Treffpunkt: Schulhof 15 Uhr – Öl & Ümlaute 🚀';
const a = await encryptText(msg, 'Falke7');
const b = await encryptText(msg, 'Falke7');
assert(a.startsWith('JV1.') && !a.includes('Schulhof'), 'code starts with JV1. and hides the text');
assert(a !== b, 'same text gives a different code each time (random salt/iv)');
assert(await decryptText(a, 'Falke7') === msg, 'round trip with the right code word');
assert(await decryptText(`Hier: ${a} !`, 'Falke7') === msg, 'code is found inside a pasted message');
let err = ''; try { await decryptText(a, 'falke7'); } catch (e) { err = e.message; }
assert(/Falsches Codewort/.test(err), 'wrong code word is refused');
err = ''; try { await decryptText(a.slice(0, -4) + 'AAAA', 'Falke7'); } catch (e) { err = e.message; }
assert(err !== '', 'tampered code is refused');
err = ''; try { await encryptText('x', ' '); } catch (e) { err = e.message; }
assert(/Codewort/.test(err), 'empty code word is refused');
let okSeq = true;
for (let i = 0; i < 200; i += 1) { const s = makeSequence(); if (!(s.seq.length >= 5 && Number.isInteger(s.answer) && s.answer > s.seq.at(-1) && s.tip)) okSeq = false; }
assert(okSeq, 'number sequences are valid and increasing');
const ec = cloudTools.find((t) => t.name === 'effect_control');
for (const act of ['anzug_ar', 'laser', 'cyborg', 'upgrade', 'malen', 'klon', 'zeitlupe']) assert(ec.parameters.properties.action.enum.includes(act), `effect_control knows ${act}`);
const shown = [];
const ctx = { showVisual: (m) => shown.push(m) };
await cloudTools.find((t) => t.name === 'secret_code').run({ action: 'verschluesseln', text: 'Hallo' }, ctx);
await cloudTools.find((t) => t.name === 'escape_room').run({ action: 'tipp' }, ctx);
assert(shown[0].type === 'secret' && shown[0].text === 'Hallo' && !('code' in shown[0]), 'secret_code opens the window without any code word');
assert(shown[1].type === 'escape' && shown[1].action === 'tipp', 'escape_room tip reaches the browser');
assert(unwrapEffect('jarvis_show', { name: 'escape_room', args: { action: 'start' } }).name === 'escape_room', 'escape_room reachable through jarvis_show');
assert(unwrapEffect('jarvis_kamera', { name: 'effect_control', args: { action: 'laser' } }).args.action === 'laser', 'laser reachable through jarvis_kamera');
