// Website configuration shared by the server (to build links) and the site
// page (to render them). Sites are assembled from fixed section types and
// rendered as plain text, so a link can never inject code. Everything is
// validated here because anyone can edit a link.
import { decodeJson, encodeJson } from './link-codec.js';

export const SECTION_TYPES = ['hero', 'text', 'features', 'gallery', 'list', 'pricing', 'hours', 'faq', 'quote', 'event', 'cta', 'contact', 'impressum'];
export const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const FONTS = ['modern', 'klassisch', 'verspielt', 'technisch'];
export const MODES = ['hell', 'dunkel'];

const HEX = /^#[0-9a-f]{6}$/i;
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('de', { granularity: 'grapheme' }) : null;

function text(value, max) {
  return String(value ?? '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

// One visible character (an emoji may consist of several code points).
function emoji(value) {
  const clean = text(value, 24).replace(/\n/g, '');
  if (!clean) return '';
  if (segmenter) return segmenter.segment(clean)[Symbol.iterator]().next().value?.segment ?? '';
  return Array.from(clean).slice(0, 2).join('');
}

// Only in-page anchors, https, mailto and tel links are allowed.
export function safeLink(value) {
  const link = text(value, 300).replace(/\s/g, '');
  if (/^#section-\d{1,2}$/.test(link)) return link;
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(link)) return link;
  if (/^tel:\+?[0-9()\/ -]{3,20}$/i.test(link)) return link;
  try {
    const url = new URL(link);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function items(value, max, mapItem) {
  return (Array.isArray(value) ? value : []).slice(0, max).map(mapItem).filter(Boolean);
}

const sectionCleaners = {
  hero: (s) => ({ badge: text(s.badge, 40), heading: text(s.heading, 90), text: text(s.text, 400), button_text: text(s.button_text, 40), button_link: safeLink(s.button_link) }),
  text: (s) => ({ heading: text(s.heading, 90), text: text(s.text, 2500) }),
  features: (s) => ({ heading: text(s.heading, 90), items: items(s.items, 8, (i) => (text(i?.title, 60) ? { icon: emoji(i.icon), title: text(i.title, 60), text: text(i.text, 300) } : null)) }),
  gallery: (s) => ({ heading: text(s.heading, 90), items: items(s.items, 12, (i) => (emoji(i?.emoji) ? { emoji: emoji(i.emoji), caption: text(i.caption, 60) } : null)) }),
  list: (s) => ({ heading: text(s.heading, 90), items: items(s.items, 20, (i) => text(typeof i === 'string' ? i : i?.text, 160) || null) }),
  pricing: (s) => ({ heading: text(s.heading, 90), items: items(s.items, 6, (i) => (text(i?.name, 50) ? { name: text(i.name, 50), price: text(i.price, 30), text: text(i.text, 300) } : null)) }),
  faq: (s) => ({ heading: text(s.heading, 90), items: items(s.items, 10, (i) => (text(i?.q, 200) && text(i?.a, 600) ? { q: text(i.q, 200), a: text(i.a, 600) } : null)) }),
  quote: (s) => ({ text: text(s.text, 400), author: text(s.author, 60) }),
  event: (s) => ({ heading: text(s.heading, 90), date: text(s.date, 40), time: text(s.time, 40), place: text(s.place, 120), text: text(s.text, 600) }),
  // Opening hours: one row per day or day range ("Mo–Fr"), "Geschlossen" allowed.
  hours: (s) => ({ heading: text(s.heading, 90), text: text(s.text, 200), items: items(s.items, 10, (i) => (text(i?.day, 30) ? { day: text(i.day, 30), time: text(i.time, 40) || 'Geschlossen' } : null)) }),
  cta: (s) => ({ heading: text(s.heading, 90), text: text(s.text, 300), button_text: text(s.button_text, 40), button_link: safeLink(s.button_link) }),
  impressum: (s) => ({ heading: text(s.heading, 60) || 'Impressum', text: text(s.text, 1500) }),
  contact: (s) => ({
    heading: text(s.heading, 90),
    text: text(s.text, 400),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(s.email, 120)) ? text(s.email, 120) : '',
    phone: /^\+?[0-9()\/ -]{3,25}$/.test(text(s.phone, 30)) ? text(s.phone, 30) : '',
    address: text(s.address, 200)
  })
};

function hasContent(section) {
  return Object.entries(section).some(([key, value]) => key !== 'type' && (Array.isArray(value) ? value.length : Boolean(value)));
}

export function sanitizeSite(input = {}) {
  const colors = input.colors && typeof input.colors === 'object' ? input.colors : {};
  const sections = (Array.isArray(input.sections) ? input.sections : []).slice(0, 12).map((section) => {
    const type = SECTION_TYPES.includes(section?.type) ? section.type : null;
    return type ? { type, ...sectionCleaners[type](section) } : null;
  }).filter((section) => section && hasContent(section));
  return {
    v: 1,
    title: text(input.title, 60) || 'Meine Website',
    logo: emoji(input.logo) || '✨',
    font: FONTS.includes(input.font) ? input.font : 'modern',
    mode: MODES.includes(input.mode) ? input.mode : 'hell',
    colors: {
      primary: HEX.test(colors.primary) ? colors.primary : '#4f46e5',
      accent: HEX.test(colors.accent) ? colors.accent : '#f59e0b'
    },
    sections,
    footer: text(input.footer, 160),
    // Preview for a shop: no Jarvis branding or download for visitors, plus a "Vorschau" ribbon.
    pitch: input.pitch === true
  };
}

export function encodeSite(site) {
  return encodeJson(sanitizeSite(site));
}

export function decodeSite(fragment) {
  const value = decodeJson(fragment);
  return value ? sanitizeSite(value) : null;
}
