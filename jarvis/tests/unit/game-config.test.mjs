import { sanitizeGame, encodeGame, decodeGame, GAME_TYPES } from '../../public/game-config.js';
const assert = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };
const g = sanitizeGame({ type: 'fangen', title: 'Weltraum-Jagd 🚀', player: '👨‍🚀', good: ['⭐', '🌟', '⭐', 'zuuu langer text'], bad: ['☄️'], colors: { bg1: '#112233', bg2: 'red', accent: '#ff9d2e' }, difficulty: 'schwer' });
assert(g.player === '👨‍🚀', 'ZWJ emoji kept as one character');
assert(JSON.stringify(g.good) === JSON.stringify(['⭐', '🌟', 'z']), 'duplicates removed, text cut to one grapheme');
assert(g.colors.bg2 === '#02070d' && g.colors.bg1 === '#112233' && g.colors.accent === '#ff9d2e', 'invalid color replaced by default');
assert(g.difficulty === 'schwer', 'difficulty kept');
const round = decodeGame('#' + encodeGame(g));
assert(JSON.stringify(round) === JSON.stringify(g), 'encode → decode round trip (with umlauts/emoji)');
assert(decodeGame('#kaputt!!') === null && decodeGame('') === null, 'broken links return null');
const evil = sanitizeGame({ type: '<script>', title: '<img src=x onerror=alert(1)>'.repeat(5), questions: 'nope', colors: { accent: 'url(javascript:alert(1))' } });
assert(evil.type === 'fangen' && evil.title.length <= 40 && evil.colors.accent === '#38e1ff', 'malicious type/color rejected, title length-capped (rendered as text only)');
const quiz = sanitizeGame({ type: 'quiz', questions: [
  { frage: 'Hauptstadt von Frankreich?', antworten: ['Paris', 'Lyon', 'Nizza'], richtig: 0 },
  { q: 'Kurzform', a: ['A', 'B'], c: 1 },
  { frage: 'Ohne richtige Antwort', antworten: ['x', 'y'], richtig: 5 },
  { frage: 'Nur eine Antwort', antworten: ['x'], richtig: 0 }
] });
assert(quiz.questions.length === 2 && quiz.questions[0].a[0] === 'Paris', 'quiz: German + short field names accepted, invalid questions dropped');
for (const t of GAME_TYPES) { const d = sanitizeGame({ type: t }); assert(d.title && d.player && (t === 'quiz' || (d.good.length && d.bad.length)), `defaults for ${t}`); }
const big = sanitizeGame({ type: 'quiz', questions: Array.from({ length: 10 }, (_, i) => ({ frage: `Welches Tier ist am schnellsten? Frage Nummer ${i}`, antworten: ['Gepard', 'Löwe', 'Pferd', 'Schnecke'], richtig: 0 })) });
console.log('     URL-Länge Quiz mit 10 Fragen:', encodeGame(big).length, 'Zeichen');
