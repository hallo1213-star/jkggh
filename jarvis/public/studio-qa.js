// Jarvis Website-Quality-Agent: starts the generated website in real browser
// frames (desktop 1280 px and phone 390 px), clicks through it like a tester
// and reports what is broken: console errors, dead buttons and links, pages,
// forms, cart, search/filter, mobile menu, overflow, clipped or tiny text,
// small tap targets, low contrast, broken images. It takes screenshots of
// both views and lets the vision model judge the design. Studio repairs the
// reported problems and runs the agent again.

// Runs INSIDE the website frame (serialised, no closures).
function harness(cfg) {
  var errs = [];
  var push = function (m) { m = String(m).slice(0, 200); if (errs.indexOf(m) < 0 && errs.length < 12) errs.push(m); };
  window.addEventListener('error', function (e) { if (e.message) push('JS-Fehler: ' + e.message + (e.lineno ? ' (Zeile ' + e.lineno + ')' : '')); }, true);
  window.addEventListener('unhandledrejection', function (e) { push('Promise-Fehler: ' + ((e.reason && e.reason.message) || e.reason)); });
  document.addEventListener('securitypolicyviolation', function (e) { if (!/pollinations|fonts\.g/.test(e.blockedURI)) push('Blockierte Ressource: ' + String(e.blockedURI).slice(0, 80)); });
  var origError = console.error; console.error = function () { try { push('Konsole: ' + Array.prototype.join.call(arguments, ' ')); } catch (x) { /* ignore */ } return origError.apply(console, arguments); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var label = function (el) { return ((el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || el.value || el.tagName) + '').replace(/\s+/g, ' ').trim().slice(0, 40); };
  var visible = function (el) { if (!el || !el.getBoundingClientRect) return false; var r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; var s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false; return !el.closest('[hidden],[aria-hidden="true"]'); };
  var W = window.innerWidth; var mobile = cfg.mobile;
  var out = { viewport: cfg.name, errors: errs, pages: [], dead: [], deadLinks: [], forms: [], cart: null, search: null, filter: null, menu: null, layout: [], contrast: [], tiny: 0, taps: [], images: { total: 0, broken: [] }, hero: null, screenshot: null };

  function parse(c) { var m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; var p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
  function lum(c) { return [c.r, c.g, c.b].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce(function (s, v, i) { return s + v * [0.2126, 0.7152, 0.0722][i]; }, 0); }
  function bgOf(el) { while (el && el !== document.documentElement) { var s = getComputedStyle(el); if (s.backgroundImage && s.backgroundImage !== 'none') return null; var c = parse(s.backgroundColor); if (c && c.a > 0.85) return c; el = el.parentElement; } var root = parse(getComputedStyle(document.body).backgroundColor); return root && root.a > 0.1 ? root : { r: 255, g: 255, b: 255, a: 1 }; }

  function layoutCheck(route) {
    if (document.documentElement.scrollWidth > W + 2) {
      var wide = $$('body *').filter(function (el) { if (!visible(el)) return false; var s = getComputedStyle(el); if (s.position === 'fixed') return false; var r = el.getBoundingClientRect(); return r.right > W + 2 && r.width < W * 3; }).slice(0, 3).map(function (el) { return el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''); });
      out.layout.push('Seite ' + route + ' ist auf ' + cfg.name + ' breiter als der Bildschirm (horizontales Scrollen' + (wide.length ? ', verursacht von: ' + wide.join(', ') : '') + ')');
    }
    $$('h1,h2,h3,p,a,button,li,label').forEach(function (el) {
      if (!visible(el) || !el.innerText || el.innerText.trim().length < 2) return;
      var s = getComputedStyle(el);
      if ((s.overflow === 'hidden' || s.textOverflow === 'ellipsis' || s.whiteSpace === 'nowrap') && el.scrollWidth > el.clientWidth + 3 && out.layout.length < 14) out.layout.push('Text abgeschnitten (' + cfg.name + ', ' + route + '): „' + label(el) + '“');
      var r = el.getBoundingClientRect();
      if (r.left < -2 && s.position !== 'fixed' && out.layout.length < 14) out.layout.push('Element ragt links aus dem Bild (' + cfg.name + ', ' + route + '): „' + label(el) + '“');
      if (mobile && parseFloat(s.fontSize) < 12) out.tiny += 1;
      if (/^(P|LI|A|BUTTON|H1|H2|H3|LABEL)$/.test(el.tagName) && out.contrast.length < 6) {
        var fg = parse(s.color); var bg = bgOf(el);
        if (fg && bg) { var a = lum(fg); var b = lum(bg); var ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); var big = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.5 && Number(s.fontWeight) >= 700); if (ratio < (big ? 3 : 4.5) - 0.3) out.contrast.push('Zu wenig Kontrast (' + ratio.toFixed(1) + ':1, ' + route + '): „' + label(el) + '“'); }
      }
    });
    if (mobile) $$('a,button,input,select').forEach(function (el) {
      if (!visible(el) || (el.tagName === 'A' && el.closest('p,li,h1,h2,h3,h4,h5,h6,small'))) return; var r = el.getBoundingClientRect();
      if ((r.height < 28 || r.width < 28) && out.taps.length < 5 && !/^(INPUT)$/.test(el.tagName)) out.taps.push('„' + label(el) + '“ (' + Math.round(r.width) + '×' + Math.round(r.height) + ' px, ' + route + ')');
    });
  }

  function linkCheck(pageRoutes) {
    var ids = {}; $$('[id]').forEach(function (e) { ids[e.id] = true; });
    $$('a').forEach(function (a) {
      var h = a.getAttribute('href'); var t = label(a) || 'Link';
      if (h === null || h === '' || h === '#' || /^javascript:/i.test(h)) out.deadLinks.push('„' + t + '“ (href="' + (h || '') + '")');
      else if (h.indexOf('#/') === 0) { var r = h.split('?')[0]; if (pageRoutes.indexOf(r) < 0 && !(r.indexOf('#/produkt/') === 0 && pageRoutes.indexOf('#/produkt') >= 0)) out.deadLinks.push('„' + t + '“ → ' + r + ' (Seite fehlt)'); }
      else if (h.charAt(0) === '#' && !ids[h.slice(1)]) out.deadLinks.push('„' + t + '“ → ' + h + ' (Abschnitt fehlt)');
    });
    out.deadLinks = out.deadLinks.filter(function (v, i, a) { return a.indexOf(v) === i; }).slice(0, 10);
  }

  async function clickTest(route, budget) {
    var buttons = $$('button, [role="button"]').filter(function (b) { return visible(b) && !b.disabled && !b.closest('form') && !b.closest('[data-cart-drawer]:not(.is-open)') && !(b.type === 'submit' && b.form); }).slice(0, budget);
    for (var i = 0; i < buttons.length; i += 1) {
      var b = buttons[i]; if (!b.isConnected || !visible(b)) continue;
      // only changes caused by the click count (not toasts fading out, scroll reveals or counters)
      var changed = false; var mo = new MutationObserver(function (records) { records.forEach(function (m) { var t = m.target.nodeType === 1 ? m.target : m.target.parentElement; if (!t || t.closest('.kit-toast') || (m.attributeName === 'class' && t.classList.contains('reveal')) || m.attributeName === 'data-counted' || (t.hasAttribute && t.hasAttribute('data-count-to'))) return; changed = true; }); });
      mo.observe(document.documentElement, { attributes: true, childList: true, subtree: true, characterData: true });
      var hash = location.hash; var y = window.scrollY; var store = ''; try { store = JSON.stringify(localStorage); } catch (e) { /* ignore */ }
      try { b.click(); } catch (e) { push('Klick-Fehler bei „' + label(b) + '“: ' + e.message); }
      await sleep(260);
      mo.disconnect();
      var st2 = ''; try { st2 = JSON.stringify(localStorage); } catch (e) { /* ignore */ }
      var effect = changed || location.hash !== hash || Math.abs(window.scrollY - y) > 20 || st2 !== store;
      out.clicked = out.clicked || []; if (out.clicked.length < 40) out.clicked.push(label(b) + ':' + (changed ? 'dom' : '') + (location.hash !== hash ? 'hash' : '') + (Math.abs(window.scrollY - y) > 20 ? 'scroll' : '') + (st2 !== store ? 'store' : ''));
      if (!effect) out.dead.push('„' + label(b) + '“ auf ' + route);
      // restore
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      if (location.hash !== route && route !== '#/produkt') { location.hash = route; await sleep(250); }
    }
  }

  async function formTest(route) {
    var forms = $$('form').filter(visible);
    for (var i = 0; i < forms.length; i += 1) {
      var f = forms[i]; var name = (f.getAttribute('aria-label') || (f.querySelector('button[type=submit],button') || {}).innerText || 'Formular').replace(/\s+/g, ' ').trim().slice(0, 30);
      var res = { name: name + ' (' + route + ')', validates: false, succeeds: false };
      var submit = f.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
      var fields = $$('input,textarea,select', f).filter(function (x) { return x.type !== 'hidden' && x.type !== 'submit' && !x.disabled; });
      fields.forEach(function (x) { if (x.type === 'checkbox' || x.type === 'radio') x.checked = false; else x.value = ''; });
      var before = f.innerText.length;
      if (submit) submit.click(); else f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      await sleep(250);
      var hasRequired = fields.some(function (x) { return x.required; });
      res.validates = !f.isConnected ? !hasRequired : (!!f.querySelector('.field-error,[aria-invalid="true"]') || f.innerText.length !== before || fields.some(function (x) { return x.matches(':invalid'); }));
      if (!f.isConnected) { out.forms.push(res); continue; }
      fields.forEach(function (x) {
        var min = Number(x.getAttribute('minlength')) || 0;
        if (x.type === 'email') x.value = 'test@beispiel.de'; else if (x.type === 'tel') x.value = '030 1234567'; else if (x.type === 'number') x.value = x.min || '2'; else if (x.type === 'date') x.value = '2030-05-12'; else if (x.type === 'time') x.value = '18:30';
        else if (x.type === 'checkbox' || x.type === 'radio') x.checked = true; else if (x.tagName === 'SELECT') { if (x.options.length > 1) x.selectedIndex = 1; } else if (x.type === 'url') x.value = 'https://beispiel.de';
        else if (/plz|postal|zip/i.test(x.name + x.id + (x.placeholder || ''))) x.value = '10115'; else x.value = (x.tagName === 'TEXTAREA' ? 'Hallo, das ist eine Testnachricht für die Website.' : 'Max Mustermann').padEnd(min, 'x');
        x.dispatchEvent(new Event('input', { bubbles: true }));
      });
      var submit2 = f.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
      if (submit2) submit2.click(); else f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      await sleep(350);
      res.succeeds = !f.isConnected || !!document.querySelector('.form-success') || /danke|gesendet|erfolgreich|bestätigt/i.test(f.innerText);
      out.forms.push(res);
    }
  }

  async function cartTest(routes) {
    var site = window.SITE || {}; if (!site.products || !site.products.length) return;
    var res = { add: false, open: false, plus: false, remove: false, detail: false };
    var countEl = function () { return document.querySelector('[data-cart-count]'); };
    var count = function () { var c = countEl(); return c ? Number(c.textContent.replace(/\D/g, '')) || 0 : -1; };
    var hasGrid = function (sel) { return routes.filter(function (r) { var p = document.querySelector('[data-page="' + r + '"]'); return p && p.querySelector(sel); })[0]; };
    var shopRoute = hasGrid('[data-product-grid]:not([data-static])') || hasGrid('[data-product-grid]') || '#/';
    location.hash = shopRoute; await sleep(400);
    var add = $$('[data-add-to-cart]').filter(visible)[0];
    var before = count();
    if (add) { add.click(); await sleep(300); res.add = count() === before + 1 || (before === -1 && document.querySelectorAll('.cart-line').length > 0); }
    var opener = $$('[data-cart-open]').filter(visible)[0];
    if (opener) { opener.click(); await sleep(450); } else if (routes.indexOf('#/warenkorb') >= 0) { location.hash = '#/warenkorb'; await sleep(400); }
    var lines = $$('.cart-line').filter(visible); res.open = lines.length > 0;
    var plus = lines[0] && lines[0].querySelector('[data-qty-plus]');
    if (plus) { var c1 = count(); plus.click(); await sleep(200); res.plus = count() === c1 + 1; }
    var del = $$('.cart-line [data-remove]').filter(visible)[0];
    if (del) { var holder = del.closest('[data-cart-items]') || document; var n = $$('.cart-line', holder).length; del.click(); await sleep(250); res.remove = $$('.cart-line', holder.isConnected ? holder : document).length === n - 1; }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    if (routes.indexOf('#/produkt') >= 0) { location.hash = '#/produkt/' + encodeURIComponent(site.products[0].id); await sleep(400); var d = document.querySelector('[data-product-detail]'); res.detail = !!d && visible(d) && d.innerText.indexOf(site.products[0].name) >= 0; } else res.detail = null;
    out.cart = res;
    // search + filter on the shop page
    location.hash = shopRoute; await sleep(350);
    var grid = document.querySelector('[data-page="' + shopRoute + '"] [data-product-grid]:not([data-static])');
    var items = function () { return grid ? $$(':scope > :not(template):not(.kit-empty)', grid).length : 0; };
    var search = document.querySelector('[data-page="' + shopRoute + '"] [data-search]');
    if (search && grid) { var all = items(); search.value = String(site.products[0].name).split(' ')[0]; search.dispatchEvent(new Event('input', { bubbles: true })); await sleep(250); var hit = items(); search.value = 'xyzqq'; search.dispatchEvent(new Event('input', { bubbles: true })); await sleep(200); var none = items(); search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true })); out.search = hit >= 1 && hit <= all && none === 0; }
    var fbtn = $$('[data-page="' + shopRoute + '"] .filter-btn').filter(visible)[1];
    if (fbtn && grid) { var cat = fbtn.getAttribute('data-filter'); fbtn.click(); await sleep(250); var cards = items(); var expected = site.products.filter(function (p) { return p.category === cat; }).length; out.filter = cards > 0 && cards <= expected; var reset = document.querySelector('[data-page="' + shopRoute + '"] .filter-btn'); if (reset) reset.click(); }
  }

  async function menuTest() {
    var t = $$('[data-menu-toggle]').filter(visible)[0];
    var navLinks = $$('header a[href^="#/"], nav a[href^="#/"]');
    if (!t) { var shown = navLinks.filter(visible).length; out.menu = { ok: shown >= Math.min(3, navLinks.length), note: shown ? 'Navigation direkt sichtbar' : 'Navigation auf dem Handy nicht erreichbar (kein Menü-Knopf, Links unsichtbar)' }; return; }
    t.click(); await sleep(400);
    var open = navLinks.filter(visible).length;
    t.click(); await sleep(300);
    out.menu = { ok: open >= Math.min(2, navLinks.length), note: open ? 'Menü öffnet sich' : 'Menü-Knopf öffnet kein sichtbares Menü' };
  }

  function toData(src, w, h) {
    return new Promise(function (resolve) {
      var im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = function () { try { var c = document.createElement('canvas'); var k = Math.min(1, 700 / Math.max(im.naturalWidth, 1)); c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k)); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); resolve(c.toDataURL('image/jpeg', 0.7)); } catch (e) { resolve(null); } };
      im.onerror = function () { resolve(null); };
      im.src = src; setTimeout(function () { resolve(null); }, 5000);
    });
  }
  async function snapshot() {
    var Wd = window.innerWidth; var Hd = window.innerHeight;
    var live = $$('img'); var clone = document.documentElement.cloneNode(true);
    var copies = Array.prototype.slice.call(clone.querySelectorAll('img'));
    out.screenshotNoImages = false;
    for (var i = 0; i < live.length; i += 1) {
      var r = live[i].getBoundingClientRect(); var cp = copies[i]; if (!cp) continue;
      if (r.bottom < 0 || r.top > Hd || !live[i].currentSrc) { cp.removeAttribute('src'); cp.removeAttribute('srcset'); continue; }
      var data = await toData(live[i].currentSrc); if (data) cp.setAttribute('src', data); else { cp.removeAttribute('src'); out.screenshotNoImages = true; }
      cp.removeAttribute('srcset'); cp.removeAttribute('loading');
    }
    Array.prototype.slice.call(clone.querySelectorAll('script, template, iframe, video, audio')).forEach(function (n) { n.remove(); });
    Array.prototype.slice.call(clone.querySelectorAll('*')).forEach(function (n) { if (n.style && n.style.backgroundImage && /url\(/.test(n.style.backgroundImage) && !/data:/.test(n.style.backgroundImage)) n.style.backgroundImage = 'none'; });
    var freeze = document.createElement('style'); freeze.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}.reveal{opacity:1!important;transform:none!important}.kit-toast{display:none!important}html,body{width:' + Wd + 'px;overflow:hidden}';
    (clone.querySelector('head') || clone).appendChild(freeze);
    var body = clone.querySelector('body'); if (body) body.style.margin = getComputedStyle(document.body).margin;
    var xhtml = new XMLSerializer().serializeToString(clone);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + Wd + '" height="' + Hd + '"><foreignObject x="0" y="0" width="100%" height="100%">' + xhtml + '</foreignObject></svg>';
    var img = await new Promise(function (resolve, reject) { var im = new Image(); im.onload = function () { resolve(im); }; im.onerror = function () { reject(new Error('SVG-Screenshot fehlgeschlagen')); }; im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
    var scale = mobile ? 1 : 0.6; var c = document.createElement('canvas'); c.width = Math.round(Wd * scale); c.height = Math.round(Hd * scale);
    var x = c.getContext('2d'); x.fillStyle = getComputedStyle(document.body).backgroundColor || '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.75);
  }

  window.addEventListener('load', async function () {
    await sleep(900);
    var routes = $$('[data-page]').map(function (p) { return p.getAttribute('data-page'); });
    if (!routes.length) $$('a[href^="#/"]').forEach(function (a) { var h = a.getAttribute('href'); if (routes.indexOf(h) < 0 && routes.length < 12) routes.push(h); });
    if (!routes.length) routes = ['#/'];
    var visit = routes.filter(function (r) { return r !== '#/produkt'; }).slice(0, 9);
    for (var i = 0; i < visit.length; i += 1) {
      location.hash = visit[i]; await sleep(500);
      var page = document.querySelector('[data-page="' + visit[i] + '"]') || document.getElementById('app') || document.body;
      var text = (page.innerText || '').trim().length;
      out.pages.push({ route: visit[i], text: text, visible: visible(page) });
      if (i === 0 && !mobile) { var h1 = page.querySelector('h1'); var first = page.firstElementChild; out.hero = { h1: !!h1 && visible(h1), height: first ? Math.round(first.getBoundingClientRect().height) : 0, vh: window.innerHeight }; }
      layoutCheck(visit[i]);
      if (cfg.clicks) await clickTest(visit[i], 14);
      if (cfg.clicks) await formTest(visit[i]);
    }
    if (cfg.clicks) { linkCheck(routes); await cartTest(routes); }
    if (mobile) await menuTest();
    location.hash = '#/'; window.scrollTo(0, 0); await sleep(400);
    var imgs = $$('img').filter(function (im) { return im.getAttribute('src') && !im.closest('[data-page]:not(.is-active)'); }); out.images.total = imgs.length;
    var t0 = Date.now(); while (Date.now() - t0 < 6000 && imgs.some(function (im) { return !im.complete; })) await sleep(300);
    out.images.broken = imgs.filter(function (im) { return im.complete && im.naturalWidth === 0; }).map(function (im) { return (im.alt || im.src).slice(0, 60); }).slice(0, 6);
    // screenshot of the first screen: the page is copied into an SVG
    // (foreignObject) inside this sandbox – photos inlined as data URLs.
    try { out.screenshot = await snapshot(); } catch (e) { out.screenshotError = String(e && e.message || e).slice(0, 160); }
    parent.postMessage({ jarvisQA2: true, nonce: cfg.nonce, report: out }, '*');
  });
}

function frameFor(project, buildPreview, csp, cfg) {
  const lab = document.createElement('div');
  lab.className = 'qa-lab';
  lab.style.cssText = `position:fixed;left:0;top:0;width:${cfg.w}px;height:${cfg.h}px;opacity:0.001;pointer-events:none;z-index:-1;overflow:hidden`;
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-scripts allow-forms');
  frame.style.cssText = `width:${cfg.w}px;height:${cfg.h}px;border:0`;
  const inject = `<script>(${harness.toString()})(${JSON.stringify(cfg)})</script>`;
  frame.srcdoc = buildPreview(project, { csp, inject });
  lab.append(frame);
  document.body.append(lab);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { window.removeEventListener('message', onMsg); lab.remove(); resolve(null); }, 90_000);
    function onMsg(e) { if (e.source === frame.contentWindow && e.data?.jarvisQA2 && e.data.nonce === cfg.nonce) { clearTimeout(timer); window.removeEventListener('message', onMsg); lab.remove(); resolve(e.data.report); } }
    window.addEventListener('message', onMsg);
  });
}

async function combineShots(desktop, mobile) {
  const load = (src) => new Promise((r) => { if (!src) { r(null); return; } const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
  const [d, m] = await Promise.all([load(desktop), load(mobile)]);
  if (!d && !m) return null;
  const H = 520; const dw = d ? Math.round(d.width * (H / d.height)) : 0; const mw = m ? Math.round(m.width * (H / m.height)) : 0;
  const c = document.createElement('canvas'); c.width = dw + mw + (d && m ? 24 : 0); c.height = H;
  const x = c.getContext('2d'); x.fillStyle = '#777'; x.fillRect(0, 0, c.width, H);
  if (d) x.drawImage(d, 0, 0, dw, H); if (m) x.drawImage(m, dw + (d ? 24 : 0), 0, mw, H);
  return c.toDataURL('image/jpeg', 0.75);
}

async function visionReview(image, noImages) {
  if (!image) return { available: false, note: 'Kein Screenshot möglich' };
  try {
    const question = `Du bist Senior-Designer einer Webdesign-Agentur und prüfst diesen Screenshot einer Website (links Desktop, rechts Handy, jeweils der erste Bildschirm${noImages ? '; graue/leere Flächen sind Fotos, die im Screenshot fehlen – nicht bewerten' : ''}). Ist sie gut genug, um sie einem zahlenden Kunden zu zeigen? Bewerte streng: Gesamteindruck, Hero-Wirkung, Typografie, Abstände, Ausrichtung, Farben/Kontrast, Lesbarkeit, abgeschnittene oder überlappende Elemente, generisches Aussehen, Handy-Darstellung.
Antworte GENAU in diesem Format:
PUNKTE: <Zahl von 1 bis 10>
PROBLEME:
- <konkretes sichtbares Problem mit Ort und Lösung>
(höchstens 6 Punkte, nur echte Probleme)
GUT: <ein Satz>`;
    const r = await fetch('/api/vision', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image, question }) });
    const data = await r.json();
    if (!r.ok) return { available: false, note: data.error || 'Bild-Bewertung nicht verfügbar' };
    const text = String(data.answer || '');
    const score = Number((text.match(/PUNKTE:\s*(\d+(?:[.,]\d)?)/i) || [])[1]?.replace(',', '.'));
    const problems = (text.split(/PROBLEME:/i)[1] || '').split(/GUT:/i)[0].split('\n').map((l) => l.replace(/^[-•*\d.)\s]+/, '').trim()).filter((l) => l.length > 8 && !/^keine/i.test(l)).slice(0, 6);
    const good = ((text.split(/GUT:/i)[1] || '').trim()).slice(0, 200);
    return { available: Number.isFinite(score), score: Number.isFinite(score) ? score : null, problems, good, raw: text.slice(0, 1200) };
  } catch (e) { return { available: false, note: e.message }; }
}

// Turns both viewport reports into a scored problem list.
export function evaluate(desktop, mobile, vision) {
  const problems = [];
  const add = (level, text) => { if (!problems.some((p) => p.text === text)) problems.push({ level, text }); };
  if (!desktop) add('fehler', 'Die Website hat sich im Test-Browser nicht vollständig geladen (Zeitüberschreitung oder Absturz)');
  for (const r of [desktop, mobile].filter(Boolean)) {
    r.errors.forEach((e) => add('fehler', e));
    r.pages.filter((p) => p.text < 40 || !p.visible).forEach((p) => add('fehler', `Seite ${p.route} ist leer oder wird nicht angezeigt`));
    r.layout.slice(0, 6).forEach((t) => add(/breiter als der Bildschirm|ragt/.test(t) ? 'fehler' : 'hinweis', t));
    if (r.images.broken.length) add(r.images.broken.length > 2 ? 'fehler' : 'hinweis', `${r.images.broken.length} Bild(er) laden nicht: ${r.images.broken.slice(0, 3).join(', ')}`);
  }
  if (desktop) {
    desktop.dead.slice(0, 10).forEach((b) => add('fehler', `Knopf ohne Wirkung: ${b} – er braucht eine echte Funktion (Kit-Attribut) oder muss ein Link sein`));
    desktop.deadLinks.forEach((l) => add('fehler', `Toter Link: ${l}`));
    desktop.forms.forEach((f) => { if (!f.validates) add('fehler', `Formular ${f.name}: leere Pflichtfelder werden nicht geprüft (data-validate + required)`); if (!f.succeeds) add('fehler', `Formular ${f.name}: nach korrekter Eingabe keine Erfolgsmeldung`); });
    const c = desktop.cart;
    if (c) {
      if (!c.add) add('fehler', 'Warenkorb: „In den Warenkorb“ erhöht den Zähler nicht');
      if (!c.open) add('fehler', 'Warenkorb lässt sich nicht öffnen oder zeigt keine Produkte (data-cart-open + data-cart-drawer + data-cart-items)');
      if (c.open && !c.plus) add('fehler', 'Warenkorb: Menge erhöhen funktioniert nicht');
      if (c.open && !c.remove) add('fehler', 'Warenkorb: Entfernen funktioniert nicht');
      if (c.detail === false) add('fehler', 'Produktdetailseite zeigt das Produkt nicht (data-page="#/produkt" mit data-product-detail)');
    }
    if (desktop.search === false) add('fehler', 'Suche filtert die Produkte nicht richtig');
    if (desktop.filter === false) add('fehler', 'Kategorie-Filter funktioniert nicht');
    desktop.contrast.slice(0, 4).forEach((t) => add('hinweis', t));
    if (desktop.hero && (!desktop.hero.h1 || desktop.hero.height < desktop.hero.vh * 0.55)) add('hinweis', `Hero-Bereich zu schwach (${desktop.hero.h1 ? 'zu niedrig' : 'keine sichtbare H1-Überschrift'}) – größer und eindrucksvoller gestalten`);
  }
  if (mobile) {
    if (mobile.menu && !mobile.menu.ok) add('fehler', `Handy: ${mobile.menu.note}`);
    if (mobile.tiny > 4) add('hinweis', `Handy: ${mobile.tiny} Texte kleiner als 12 px`);
    if (mobile.taps.length >= 3) add('hinweis', `Handy: zu kleine Tipp-Flächen (unter 28 px): ${mobile.taps.slice(0, 3).join(', ')}`);
    mobile.contrast.slice(0, 2).forEach((t) => add('hinweis', t));
  }
  if (vision?.available) {
    (vision.problems || []).forEach((p) => add(vision.score < 7 ? 'fehler' : 'hinweis', `Design (Screenshot-Prüfung): ${p}`));
  }
  const errors = problems.filter((p) => p.level === 'fehler').length;
  const hints = problems.length - errors;
  let score = 10 - errors * 1.2 - hints * 0.3;
  if (vision?.available) score = (score + vision.score) / 2;
  score = Math.max(1, Math.min(10, Math.round(score * 10) / 10));
  const passed = errors === 0 && (!vision?.available || vision.score >= 7);
  return { passed, score, problems, errors, hints };
}

// Full run: both viewports, screenshots, vision review, evaluation.
export async function runQualityAgent(project, { buildPreview, csp, onStatus = () => {} }) {
  onStatus('Starte Test-Browser (Desktop + Handy) …');
  const nonce = Math.random().toString(36).slice(2);
  const [desktop, mobile] = await Promise.all([
    frameFor(project, buildPreview, csp, { name: 'Desktop', w: 1280, h: 860, mobile: false, clicks: true, nonce: `${nonce}d` }),
    frameFor(project, buildPreview, csp, { name: 'Handy', w: 390, h: 844, mobile: true, clicks: false, nonce: `${nonce}m` })
  ]);
  onStatus('Prüfe Screenshots …');
  const image = await combineShots(desktop?.screenshot, mobile?.screenshot);
  const vision = await visionReview(image, desktop?.screenshotNoImages || mobile?.screenshotNoImages);
  const result = evaluate(desktop, mobile, vision);
  return { ...result, desktop, mobile, vision, image, testedAt: Date.now() };
}
