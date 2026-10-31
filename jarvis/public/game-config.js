// Game configuration shared by the server (to build links) and the game page
// (to read them). A whole game lives in the link's #fragment, so nothing has to
// be stored and games survive server restarts. Everything is validated here
// because anyone can edit a link.
export const GAME_TYPES = ['fangen', 'ausweichen', 'springen', 'reaktion', 'memory', 'quiz'];
export const DIFFICULTIES = ['leicht', 'mittel', 'schwer'];

const defaults = {
  fangen: { title: 'Sternenfänger', player: '🧺', good: ['⭐', '🌟', '💎'], bad: ['💣'] },
  ausweichen: { title: 'Asteroiden-Alarm', player: '🚀', good: ['⭐'], bad: ['☄️', '🪨'] },
  springen: { title: 'Sprung ins Abenteuer', player: '🐸', good: ['🪙'], bad: ['🌵', '🪨'] },
  reaktion: { title: 'Blitzreflex', player: '⚡', good: ['🎯', '🎈'], bad: ['💀'] },
  memory: { title: 'Memory', player: '🧠', good: ['🍎', '🍌', '🍇', '🍓', '🍒', '🍍'], bad: ['🥝', '🥥', '🍉', '🍋'] },
  quiz: { title: 'Jarvis-Quiz', player: '❓', good: [], bad: [] }
};
const defaultColors = { bg1: '#0b1a3a', bg2: '#02070d', accent: '#38e1ff' };
const HEX = /^#[0-9a-f]{6}$/i;
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('de', { granularity: 'grapheme' }) : null;

function cleanText(value, max) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

// One visible character (an emoji may consist of several code points).
function cleanEmoji(value) {
  const text = cleanText(value, 24);
  if (!text) return '';
  if (segmenter) return segmenter.segment(text)[Symbol.iterator]().next().value?.segment ?? '';
  return Array.from(text).slice(0, 2).join('');
}

function cleanList(value, max) {
  const list = (Array.isArray(value) ? value : []).map(cleanEmoji).filter(Boolean);
  return [...new Set(list)].slice(0, max);
}

function cleanQuestions(value) {
  return (Array.isArray(value) ? value : []).slice(0, 15).map((item) => {
    const question = cleanText(item?.q ?? item?.frage, 200);
    const answers = (Array.isArray(item?.a ?? item?.antworten) ? item.a ?? item.antworten : []).map((a) => cleanText(a, 90)).filter(Boolean).slice(0, 4);
    const correct = Number(item?.c ?? item?.richtig);
    return { q: question, a: answers, c: Number.isInteger(correct) && correct >= 0 && correct < answers.length ? correct : -1 };
  }).filter((item) => item.q && item.a.length >= 2 && item.c >= 0);
}

export function sanitizeGame(input = {}) {
  const type = GAME_TYPES.includes(input.type) ? input.type : 'fangen';
  const base = defaults[type];
  const colors = input.colors && typeof input.colors === 'object' ? input.colors : {};
  const game = {
    v: 1,
    type,
    title: cleanText(input.title, 40) || base.title,
    player: cleanEmoji(input.player) || base.player,
    good: cleanList(input.good, 8),
    bad: cleanList(input.bad, 6),
    colors: {
      bg1: HEX.test(colors.bg1) ? colors.bg1 : defaultColors.bg1,
      bg2: HEX.test(colors.bg2) ? colors.bg2 : defaultColors.bg2,
      accent: HEX.test(colors.accent) ? colors.accent : defaultColors.accent
    },
    difficulty: DIFFICULTIES.includes(input.difficulty) ? input.difficulty : 'mittel'
  };
  if (!game.good.length) game.good = [...base.good];
  if (!game.bad.length) game.bad = [...base.bad];
  if (type === 'quiz') game.questions = cleanQuestions(input.questions);
  return game;
}

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function encodeGame(game) {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(sanitizeGame(game))));
}

export function decodeGame(fragment) {
  try {
    const base64 = String(fragment).replace(/^#/, '').replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return sanitizeGame(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}
