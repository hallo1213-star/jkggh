import { giftIdeas, normalizeGifts } from '../../gifts.js';
const assert = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };
let seen;
const r = await giftIdeas({ recipient: 'Mama', occasion: 'Geburtstag', budget: 30 }, { generate: async (o) => { seen = o; return { fuer: 'Mama', anlass: 'Geburtstag', ideen: [{ name: 'Fotobuch', preis: '24,90 €', warum: 'Erinnerungen', wo: 'Online', bild: 'photo book' }, { name: '' }, { name: 'Pflanze', preis: 'gratis?' }] }; } });
assert(/Mama/.test(seen.prompt) && /30 €/.test(seen.prompt), 'recipient and budget go to the AI');
assert(r.ideen.length === 2 && r.ideen[0].preis === 24.9 && r.ideen[1].preis === null, 'empty ideas dropped, prices parsed');
assert(r.ideen[0].bildUrl.startsWith('https://image.pollinations.ai/') && r.budget === 30, 'pictures and budget attached');
let threw = false; try { normalizeGifts({ ideen: [] }); } catch { threw = true; }
assert(threw, 'no ideas → honest error');
