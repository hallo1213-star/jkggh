// Renders a Jarvis website from the link's #fragment. All content is set as
// text (never as HTML) and links are checked in site-config.js.
import { decodeSite, sanitizeSite } from './site-config.js';

const site = decodeSite(location.hash) || sanitizeSite({ sections: [{ type: 'hero', heading: 'Diese Website ist leer', text: 'Der Link scheint unvollständig zu sein.' }] });
const fonts = {
  modern: { heading: 'Poppins', body: 'Poppins', query: 'family=Poppins:wght@400;600;700' },
  klassisch: { heading: 'Playfair Display', body: 'Lora', query: 'family=Playfair+Display:wght@600;700&family=Lora:wght@400;600' },
  verspielt: { heading: 'Fredoka', body: 'Nunito', query: 'family=Fredoka:wght@500;600;700&family=Nunito:wght@400;600;700' },
  technisch: { heading: 'Space Grotesk', body: 'Inter', query: 'family=Space+Grotesk:wght@500;700&family=Inter:wght@400;600' }
};
const modes = {
  hell: { bg: '#ffffff', surface: '#f5f6fa', card: '#ffffff', text: '#141824', muted: '#5b6275', border: 'rgba(20, 24, 36, 0.1)' },
  dunkel: { bg: '#0b0f19', surface: '#111727', card: '#161d30', text: '#e8ecf5', muted: '#9aa3b8', border: 'rgba(232, 236, 245, 0.1)' }
};

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined && content !== null && content !== '') node.textContent = content;
  return node;
}

// Readable text color on a colored background.
function onColor(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#111111' : '#ffffff';
}

function paragraphs(content) {
  const box = el('div', 'prose');
  for (const part of String(content).split(/\n+/)) if (part.trim()) box.append(el('p', '', part.trim()));
  return box;
}

function sectionShell(section, index) {
  const node = el('section', 'section');
  node.id = `section-${index}`;
  const wrap = el('div', 'wrap reveal');
  if (section.heading) wrap.append(el('h2', 'section-heading', section.heading));
  node.append(wrap);
  return { node, wrap };
}

function link(href, label, className) {
  const a = el('a', className, label);
  a.href = href;
  if (href.startsWith('https:')) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  return a;
}

const renderers = {
  hero(section) {
    const node = el('section', 'hero');
    const wrap = el('div', 'wrap reveal');
    wrap.append(el('div', 'hero-logo', site.logo), el('h1', '', section.heading || site.title));
    if (section.text) wrap.append(el('p', '', section.text));
    if (section.button_text) wrap.append(link(section.button_link || '#section-1', section.button_text, 'button'));
    node.append(wrap);
    return node;
  },
  text(section, index) {
    const { node, wrap } = sectionShell(section, index);
    wrap.append(paragraphs(section.text));
    return node;
  },
  features(section, index) {
    const { node, wrap } = sectionShell(section, index);
    const grid = el('div', 'grid');
    for (const item of section.items) {
      const card = el('div', 'card');
      if (item.icon) card.append(el('div', 'card-icon', item.icon));
      card.append(el('h3', '', item.title));
      if (item.text) card.append(el('p', '', item.text));
      grid.append(card);
    }
    wrap.append(grid);
    return node;
  },
  gallery(section, index) {
    const { node, wrap } = sectionShell(section, index);
    const grid = el('div', 'gallery');
    for (const item of section.items) {
      const tile = el('figure', 'tile');
      tile.append(el('div', 'tile-art', item.emoji));
      if (item.caption) tile.append(el('figcaption', '', item.caption));
      grid.append(tile);
    }
    wrap.append(grid);
    return node;
  },
  list(section, index) {
    const { node, wrap } = sectionShell(section, index);
    const list = el('ul', 'checklist');
    for (const item of section.items) list.append(el('li', '', item));
    wrap.append(list);
    return node;
  },
  pricing(section, index) {
    const { node, wrap } = sectionShell(section, index);
    const grid = el('div', 'grid');
    for (const item of section.items) {
      const card = el('div', 'card');
      card.append(el('h3', '', item.name));
      if (item.price) card.append(el('div', 'price', item.price));
      if (item.text) card.append(el('p', '', item.text));
      grid.append(card);
    }
    wrap.append(grid);
    return node;
  },
  faq(section, index) {
    const { node, wrap } = sectionShell(section, index);
    const box = el('div', 'faq');
    for (const item of section.items) {
      const details = el('details');
      details.append(el('summary', '', item.q), el('p', '', item.a));
      box.append(details);
    }
    wrap.append(box);
    return node;
  },
  quote(section, index) {
    const { node, wrap } = sectionShell(section, index);
    const quote = el('blockquote', 'quote');
    quote.append(el('p', '', section.text));
    if (section.author) quote.append(el('cite', '', `– ${section.author}`));
    wrap.append(quote);
    return node;
  },
  event(section, index) {
    const { node, wrap } = sectionShell(section, index);
    const box = el('div', 'info');
    for (const [icon, value] of [['📅', section.date], ['🕒', section.time], ['📍', section.place]]) {
      if (!value) continue;
      const row = el('div', 'info-row');
      row.append(el('span', '', icon), el('span', '', value));
      box.append(row);
    }
    if (section.text) box.append(el('p', '', section.text));
    wrap.append(box);
    return node;
  },
  contact(section, index) {
    const { node, wrap } = sectionShell(section, index);
    const box = el('div', 'info');
    if (section.text) box.append(el('p', '', section.text));
    const rows = [
      ['✉️', section.email, section.email && `mailto:${section.email}`],
      ['📞', section.phone, section.phone && `tel:${section.phone.replace(/[^0-9+]/g, '')}`],
      ['📍', section.address, null]
    ];
    for (const [icon, value, href] of rows) {
      if (!value) continue;
      const row = el('div', 'info-row');
      row.append(el('span', '', icon), href ? link(href, value) : el('span', '', value));
      box.append(row);
    }
    wrap.append(box);
    return node;
  }
};

function render() {
  const font = fonts[site.font];
  const mode = modes[site.mode];
  const vars = {
    '--primary': site.colors.primary,
    '--accent': site.colors.accent,
    '--on-primary': onColor(site.colors.primary),
    '--bg': mode.bg,
    '--surface': mode.surface,
    '--card': mode.card,
    '--text': mode.text,
    '--muted': mode.muted,
    '--border': mode.border,
    '--font-heading': `'${font.heading}', system-ui, sans-serif`,
    '--font-body': `'${font.body}', system-ui, sans-serif`
  };
  for (const [name, value] of Object.entries(vars)) document.documentElement.style.setProperty(name, value);
  const fontLink = el('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = `https://fonts.googleapis.com/css2?${font.query}&display=swap`;
  fontLink.id = 'site-font';
  document.head.append(fontLink);
  document.title = site.title;

  const root = document.getElementById('site');
  const header = el('header', 'site-header');
  const headerWrap = el('div', 'wrap');
  const brand = link('#top', '', 'brand');
  brand.append(el('span', 'brand-logo', site.logo), el('span', '', site.title));
  const nav = el('nav', 'site-nav');
  headerWrap.append(brand, nav);
  header.append(headerWrap);

  const main = el('main');
  main.id = 'top';
  site.sections.forEach((section, index) => {
    const node = renderers[section.type](section, index);
    node.id = `section-${index}`;
    main.append(node);
    if (section.heading && section.type !== 'hero') nav.append(link(`#section-${index}`, section.heading));
  });

  const footer = el('footer', 'site-footer');
  const footerWrap = el('div', 'wrap');
  footerWrap.append(el('div', '', site.footer || `© ${new Date().getFullYear()} ${site.title}`));
  footer.append(footerWrap);
  root.append(header, main, footer);

  const observer = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      }
    }, { threshold: 0.12 })
    : null;
  for (const node of document.querySelectorAll('.reveal')) {
    if (observer) observer.observe(node);
    else node.classList.add('visible');
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

// A standalone HTML file of the current site: styles inlined, no scripts.
async function download() {
  const css = await (await fetch('/site.css')).text();
  const clone = document.getElementById('site').cloneNode(true);
  for (const node of clone.querySelectorAll('.reveal')) node.classList.remove('reveal', 'visible');
  const html = `<!doctype html>
<html lang="de" style="${escapeHtml(document.documentElement.style.cssText)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(site.title)}</title>
<link rel="stylesheet" href="${escapeHtml(document.getElementById('site-font').href)}">
<style>${css.replace(/<\/style/gi, '<\\/style')}</style>
</head>
<body>
${clone.outerHTML}
</body>
</html>
`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${site.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'website'}.html`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

document.getElementById('download').addEventListener('click', () => {
  download().catch(() => alert('Herunterladen hat nicht geklappt.'));
});
document.getElementById('share').addEventListener('click', async () => {
  try {
    if (navigator.share) await navigator.share({ title: site.title, url: location.href });
    else {
      await navigator.clipboard.writeText(location.href);
      document.getElementById('share').textContent = 'Link kopiert';
    }
  } catch {
    // share sheet closed
  }
});

// A new version (e.g. Jarvis applied a change) only changes the #fragment, which
// browsers don't reload on their own.
window.addEventListener('hashchange', () => location.reload());

render();
