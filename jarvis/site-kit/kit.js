/* Jarvis Site-Kit – tested building blocks for every Jarvis website.
   The page markup only uses data attributes; the kit makes them work:
   pages/router, navigation, mobile menu, products (grid, filter, search,
   sort, detail page), cart (drawer/page, quantity, remove, total, storage),
   form validation, tabs, sliders, counters, scroll reveal, toast.
   No external requests. Works offline and in the exported ZIP. */
(function () {
  'use strict';
  var SITE = window.SITE || {};
  var products = Array.isArray(SITE.products) ? SITE.products : [];
  var KEY = 'site-cart-' + String(SITE.name || 'shop').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var money = function (v) { return new Intl.NumberFormat('de-DE', { style: 'currency', currency: SITE.currency || 'EUR' }).format(Number(v) || 0); };
  var byId = function (id) { return products.filter(function (p) { return String(p.id) === String(id); })[0]; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  /* ---------- base styles for functional states (designs override them) ---------- */
  var base = document.createElement('style');
  base.id = 'kit-base';
  base.textContent = '[data-page]:not(.is-active){display:none!important}' +
    '.reveal{opacity:0;transform:translateY(24px);transition:opacity .7s ease,transform .7s ease}.reveal.is-visible{opacity:1;transform:none}' +
    '[data-cart-drawer]{position:fixed;top:0;right:0;height:100%;width:min(420px,100%);transform:translateX(105%);transition:transform .35s ease;z-index:1000;overflow:auto}[data-cart-drawer].is-open{transform:none}' +
    '.kit-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);opacity:0;pointer-events:none;transition:opacity .3s;z-index:999}.kit-backdrop.is-open{opacity:1;pointer-events:auto}' +
    '.field-error{display:block;margin-top:6px;font-size:.85em;color:#c62828}[aria-invalid="true"]{outline:2px solid #c62828;outline-offset:1px}' +
    '.form-success{padding:16px 18px;border-radius:12px;background:rgba(46,125,50,.12);color:inherit;border:1px solid rgba(46,125,50,.4)}' +
    '.kit-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(20px);opacity:0;transition:all .3s;z-index:2000;padding:12px 18px;border-radius:999px;background:#111;color:#fff;font:600 14px/1.3 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25);max-width:calc(100% - 32px)}.kit-toast.is-visible{opacity:1;transform:translateX(-50%)}' +
    '.page-enter{animation:kitPage .45s ease both}@keyframes kitPage{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}' +
    '.kit-empty{padding:32px 0;text-align:center;opacity:.75}[data-slider]{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;scrollbar-width:none}[data-slider]>*{scroll-snap-align:start;flex:0 0 auto}[data-slider]::-webkit-scrollbar{display:none}' +
    '@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important}.reveal{opacity:1;transform:none}}';
  document.head.appendChild(base);

  /* ---------- toast ---------- */
  var toastEl = null; var toastTimer = 0;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'kit-toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('is-visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove('is-visible'); }, 2600);
  }

  /* ---------- cart ---------- */
  var cart = [];
  try { cart = JSON.parse(localStorage.getItem(KEY) || '[]').filter(function (l) { return byId(l.id) && l.qty > 0; }); } catch (e) { cart = []; }
  function saveCart() { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) { /* private mode */ } renderCart(); }
  function addToCart(id, qty) {
    var p = byId(id); if (!p) return;
    qty = Math.max(1, Number(qty) || 1);
    var line = cart.filter(function (l) { return String(l.id) === String(id); })[0];
    if (line) line.qty += qty; else cart.push({ id: p.id, qty: qty });
    saveCart(); toast('„' + p.name + '“ liegt im Warenkorb');
    $$('[data-cart-count]').forEach(function (b) { b.classList.remove('kit-bump'); void b.offsetWidth; b.classList.add('kit-bump'); });
  }
  function setQty(id, qty) { cart = cart.map(function (l) { return String(l.id) === String(id) ? { id: l.id, qty: qty } : l; }).filter(function (l) { return l.qty > 0; }); saveCart(); }
  function total() { return cart.reduce(function (s, l) { var p = byId(l.id); return s + (p ? p.price * l.qty : 0); }, 0); }
  function count() { return cart.reduce(function (s, l) { return s + l.qty; }, 0); }
  function renderCart() {
    $$('[data-cart-count]').forEach(function (el) { el.textContent = String(count()); el.hidden = false; el.setAttribute('aria-label', count() + ' Artikel im Warenkorb'); });
    $$('[data-cart-total]').forEach(function (el) { el.textContent = money(total()); });
    $$('[data-cart-empty]').forEach(function (el) { el.hidden = cart.length > 0; });
    $$('[data-cart-filled]').forEach(function (el) { el.hidden = cart.length === 0; });
    $$('[data-checkout]').forEach(function (el) { el.disabled = cart.length === 0; });
    $$('[data-cart-items]').forEach(function (box) {
      box.innerHTML = cart.map(function (l) {
        var p = byId(l.id);
        return '<div class="cart-line" data-line="' + esc(p.id) + '">' + (p.image ? '<img class="cart-line__img" src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy">' : '') +
          '<div class="cart-line__info"><p class="cart-line__name">' + esc(p.name) + '</p><p class="cart-line__price">' + money(p.price) + '</p>' +
          '<div class="cart-line__qty"><button type="button" class="qty-btn" data-qty-minus="' + esc(p.id) + '" aria-label="Menge verringern">−</button><span aria-live="polite">' + l.qty + '</span><button type="button" class="qty-btn" data-qty-plus="' + esc(p.id) + '" aria-label="Menge erhöhen">+</button></div></div>' +
          '<button type="button" class="cart-line__remove" data-remove="' + esc(p.id) + '" aria-label="' + esc(p.name) + ' entfernen">Entfernen</button></div>';
      }).join('');
    });
  }
  var backdrop = null;
  function openCart(open) {
    var d = $('[data-cart-drawer]');
    if (!d) { if (open) go('#/warenkorb', true); return; }
    if (!backdrop) { backdrop = document.createElement('div'); backdrop.className = 'kit-backdrop'; backdrop.addEventListener('click', function () { openCart(false); }); document.body.appendChild(backdrop); }
    d.classList.toggle('is-open', open); backdrop.classList.toggle('is-open', open); d.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) { var f = $('button, a, input', d); if (f) setTimeout(function () { f.focus(); }, 50); }
  }

  /* ---------- products: grids, filter, search, sort ---------- */
  var filterState = { category: 'alle', q: '', sort: '' };
  function fill(node, p) {
    $$('[data-field]', node).concat(node.matches && node.matches('[data-field]') ? [node] : []).forEach(function (el) {
      var f = el.getAttribute('data-field');
      if (f === 'image' && el.tagName === 'IMG') { el.src = p.image || ''; el.alt = el.alt || p.name; el.loading = 'lazy'; }
      else if (f === 'price') el.textContent = money(p.price);
      else if (f === 'old-price') el.textContent = p.oldPrice ? money(p.oldPrice) : '';
      else if (p[f] != null) el.textContent = String(p[f]);
    });
    $$('[data-product-link]', node).forEach(function (a) { a.setAttribute('href', '#/produkt/' + encodeURIComponent(p.id)); });
    $$('[data-add-to-cart]', node).forEach(function (b) { b.setAttribute('data-add-to-cart', p.id); if (!b.getAttribute('type')) b.setAttribute('type', 'button'); });
    return node;
  }
  function defaultCard(p) {
    var d = document.createElement('article'); d.className = 'product-card reveal';
    d.innerHTML = '<a class="product-card__media" data-product-link><img data-field="image" alt=""></a><div class="product-card__body"><p class="product-card__cat" data-field="category"></p><h3 class="product-card__name"><a data-product-link data-field="name"></a></h3><p class="product-card__price" data-field="price"></p><button type="button" class="btn product-card__btn" data-add-to-cart>In den Warenkorb</button></div>';
    return fill(d, p);
  }
  function renderGrids() {
    $$('[data-product-grid]').forEach(function (grid) {
      var tpl = grid.querySelector('template[data-product-template]') || $('template[data-product-template]');
      var list = products.slice();
      var fixedCat = grid.getAttribute('data-category');
      if (fixedCat) list = list.filter(function (p) { return p.category === fixedCat; });
      if (!grid.hasAttribute('data-static')) {
        if (filterState.category !== 'alle') list = list.filter(function (p) { return p.category === filterState.category; });
        if (filterState.q) { var q = filterState.q.toLowerCase(); list = list.filter(function (p) { return (p.name + ' ' + (p.description || '') + ' ' + (p.category || '')).toLowerCase().indexOf(q) >= 0; }); }
        if (filterState.sort === 'price-asc') list.sort(function (a, b) { return a.price - b.price; });
        if (filterState.sort === 'price-desc') list.sort(function (a, b) { return b.price - a.price; });
        if (filterState.sort === 'name') list.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'de'); });
      }
      var limit = Number(grid.getAttribute('data-limit')) || 0; if (limit) list = list.slice(0, limit);
      $$(':scope > :not(template)', grid).forEach(function (c) { c.remove(); });
      if (!list.length) { var e = document.createElement('p'); e.className = 'kit-empty'; e.textContent = 'Keine passenden Produkte gefunden.'; grid.appendChild(e); }
      list.forEach(function (p) {
        var node = tpl ? fill(tpl.content.firstElementChild.cloneNode(true), p) : defaultCard(p);
        grid.appendChild(node);
      });
      observeReveal(grid);
    });
    $$('[data-result-count]').forEach(function (el) { var g = $('[data-product-grid]:not([data-static])'); el.textContent = g ? $$(':scope > :not(template):not(.kit-empty)', g).length + ' Produkte' : ''; });
  }
  function renderFilterBars() {
    var cats = ['alle'].concat(products.map(function (p) { return p.category; }).filter(function (c, i, a) { return c && a.indexOf(c) === i; }));
    $$('[data-filter-bar]').forEach(function (bar) {
      bar.innerHTML = cats.map(function (c) { return '<button type="button" class="filter-btn' + (c === filterState.category ? ' is-active' : '') + '" data-filter="' + esc(c) + '" aria-pressed="' + (c === filterState.category) + '">' + esc(c === 'alle' ? 'Alle' : c) + '</button>'; }).join('');
    });
  }
  function renderDetail(id) {
    var p = byId(id);
    $$('[data-product-detail]').forEach(function (box) {
      if (!p) { box.innerHTML = '<p class="kit-empty">Dieses Produkt gibt es nicht. <a href="#/">Zur Startseite</a></p>'; return; }
      fill(box, p);
      $$('[data-add-to-cart]', box).forEach(function (b) { b.setAttribute('data-add-to-cart', p.id); });
    });
    $$('[data-related-grid]').forEach(function (grid) {
      grid.innerHTML = ''; products.filter(function (x) { return p && x.id !== p.id && x.category === p.category; }).concat(products.filter(function (x) { return p && x.id !== p.id && x.category !== p.category; })).slice(0, Number(grid.getAttribute('data-limit')) || 3).forEach(function (x) { grid.appendChild(defaultCard(x)); });
    });
  }

  /* ---------- router ---------- */
  var pages = [];
  function routeOf(hash) { var h = hash || '#/'; if (h === '#' || h === '') h = '#/'; return h; }
  function findPage(h) {
    var exact = pages.filter(function (p) { return p.getAttribute('data-page') === h; })[0];
    if (exact) return { page: exact };
    if (/^#\/produkt\//.test(h)) { var d = pages.filter(function (p) { return p.getAttribute('data-page') === '#/produkt'; })[0]; if (d) return { page: d, product: decodeURIComponent(h.split('/')[2] || '') }; }
    return null;
  }
  function go(hash, push) { if (push && location.hash !== hash) location.hash = hash; else show(); }
  function show() {
    var h = routeOf(location.hash);
    if (!/^#\//.test(h)) { // plain anchor (#kontakt): scroll inside the current page
      var t = document.getElementById(h.slice(1)); if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } return;
    }
    var hit = findPage(h) || findPage('#/') || { page: pages[0] };
    if (!hit.page) return;
    pages.forEach(function (p) { var on = p === hit.page; p.classList.toggle('is-active', on); p.setAttribute('aria-hidden', on ? 'false' : 'true'); });
    hit.page.classList.remove('page-enter'); void hit.page.offsetWidth; hit.page.classList.add('page-enter');
    if (hit.product !== undefined) renderDetail(hit.product);
    var base = hit.page.getAttribute('data-page');
    $$('a[href^="#/"]').forEach(function (a) { var on = a.getAttribute('href') === base || (base !== '#/' && a.getAttribute('href').indexOf(base + '/') === 0); a.classList.toggle('is-active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    var title = hit.page.getAttribute('data-title'); if (title) document.title = title + (SITE.name ? ' – ' + SITE.name : '');
    document.body.classList.remove('menu-open'); $$('[data-menu]').forEach(function (m) { m.classList.remove('is-open'); }); $$('[data-menu-toggle]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
    openCart(false);
    window.scrollTo(0, 0);
    observeReveal(hit.page);
  }

  /* ---------- forms ---------- */
  var MSG = { required: 'Bitte ausfüllen.', email: 'Bitte eine gültige E-Mail-Adresse eingeben.', tel: 'Bitte eine gültige Telefonnummer eingeben.', min: 'Bitte mindestens %n Zeichen eingeben.', pattern: 'Bitte das richtige Format verwenden.', check: 'Bitte bestätigen.' };
  function fieldError(input) {
    var v = (input.type === 'checkbox' || input.type === 'radio') ? (input.checked ? 'x' : '') : String(input.value || '').trim();
    if (input.required && !v) return input.type === 'checkbox' ? MSG.check : MSG.required;
    if (!v) return '';
    if (input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return MSG.email;
    if (input.type === 'tel' && !/^[+()\d\s/-]{6,}$/.test(v)) return MSG.tel;
    var min = Number(input.getAttribute('minlength')); if (min && v.length < min) return MSG.min.replace('%n', min);
    var pat = input.getAttribute('pattern'); if (pat) { try { if (!new RegExp('^(?:' + pat + ')$').test(v)) return input.getAttribute('data-error') || MSG.pattern; } catch (e) { /* bad pattern */ } }
    return '';
  }
  function showError(input, msg) {
    var id = input.id || (input.id = 'f' + Math.random().toString(36).slice(2, 8));
    var holder = input.closest('label, .field, .form-field') || input.parentNode;
    var err = holder.querySelector('.field-error[data-for="' + id + '"]');
    if (msg) {
      if (!err) { err = document.createElement('span'); err.className = 'field-error'; err.setAttribute('data-for', id); err.id = id + '-err'; holder.appendChild(err); }
      err.textContent = msg; input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', err.id);
    } else { if (err) err.remove(); input.removeAttribute('aria-invalid'); }
  }
  function submitForm(form, e) {
    e.preventDefault();
    var inputs = $$('input, select, textarea', form).filter(function (i) { return !i.disabled && i.type !== 'hidden' && i.type !== 'submit' && i.type !== 'button'; });
    var bad = null;
    inputs.forEach(function (i) { var m = fieldError(i); showError(i, m); if (m && !bad) bad = i; });
    if (bad) { bad.focus(); toast('Bitte prüfe die markierten Felder.'); return; }
    var msg = form.getAttribute('data-success') || 'Danke! Deine Nachricht ist angekommen. (Demo – es wurde nichts versendet.)';
    var isCheckout = form.hasAttribute('data-checkout-form');
    if (isCheckout) { msg = form.getAttribute('data-success') || 'Danke für deine Bestellung! (Demo – es wurde nichts bezahlt.)'; cart = []; saveCart(); }
    var box = document.createElement('div'); box.className = 'form-success'; box.setAttribute('role', 'status'); box.textContent = msg;
    form.replaceWith(box); toast(isCheckout ? 'Bestellung aufgegeben (Demo)' : 'Gesendet (Demo)');
  }

  /* ---------- reveal, counters ---------- */
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { if (en.isIntersecting) { var el = en.target; var d = Number(el.getAttribute('data-delay')) || 0; setTimeout(function () { el.classList.add('is-visible'); if (el.hasAttribute('data-count-to')) countUp(el); }, d); io.unobserve(el); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }) : null;
  function observeReveal(root) { $$('.reveal:not(.is-visible), [data-count-to]', root || document).forEach(function (el) { if (io) io.observe(el); else { el.classList.add('is-visible'); if (el.hasAttribute('data-count-to')) countUp(el); } }); }
  function countUp(el) { if (el.dataset.counted) return; el.dataset.counted = '1'; var to = Number(el.getAttribute('data-count-to')) || 0; var suffix = el.getAttribute('data-suffix') || ''; var t0 = performance.now(); (function step(t) { var k = Math.min(1, (t - t0) / 1400); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))).toLocaleString('de-DE') + suffix; if (k < 1) requestAnimationFrame(step); })(t0); }

  /* ---------- one click handler for everything ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-add-to-cart],[data-qty-plus],[data-qty-minus],[data-remove],[data-cart-open],[data-cart-close],[data-cart-clear],[data-checkout],[data-filter],[data-menu-toggle],[data-tab],[data-slider-prev],[data-slider-next],[data-scroll-top],a[href]');
    if (!t) return;
    if (t.hasAttribute('data-add-to-cart')) { e.preventDefault(); var box = t.closest('[data-product-detail]'); var q = box && $('[data-qty]', box); addToCart(t.getAttribute('data-add-to-cart'), q ? q.value : 1); return; }
    if (t.hasAttribute('data-qty-plus')) { var l1 = cart.filter(function (l) { return String(l.id) === t.getAttribute('data-qty-plus'); })[0]; if (l1) setQty(l1.id, l1.qty + 1); return; }
    if (t.hasAttribute('data-qty-minus')) { var l2 = cart.filter(function (l) { return String(l.id) === t.getAttribute('data-qty-minus'); })[0]; if (l2) setQty(l2.id, l2.qty - 1); return; }
    if (t.hasAttribute('data-remove')) { var p = byId(t.getAttribute('data-remove')); setQty(t.getAttribute('data-remove'), 0); if (p) toast('„' + p.name + '“ entfernt'); return; }
    if (t.hasAttribute('data-cart-open')) { e.preventDefault(); openCart(true); return; }
    if (t.hasAttribute('data-cart-close')) { openCart(false); return; }
    if (t.hasAttribute('data-cart-clear')) { cart = []; saveCart(); toast('Warenkorb geleert'); return; }
    if (t.hasAttribute('data-checkout')) { e.preventDefault(); if (!cart.length) return; openCart(false); if (findPage('#/kasse')) go('#/kasse', true); else { var cf = $('form[data-checkout-form]'); if (cf) cf.scrollIntoView({ behavior: 'smooth' }); else toast('Kasse ist in dieser Demo nicht aktiv.'); } return; }
    if (t.hasAttribute('data-filter')) { filterState.category = t.getAttribute('data-filter'); renderFilterBars(); renderGrids(); return; }
    if (t.hasAttribute('data-menu-toggle')) { var open = !document.body.classList.contains('menu-open'); document.body.classList.toggle('menu-open', open); $$('[data-menu]').forEach(function (m) { m.classList.toggle('is-open', open); }); t.setAttribute('aria-expanded', String(open)); return; }
    if (t.hasAttribute('data-tab')) { var group = t.closest('[data-tabs]') || document; var id = t.getAttribute('data-tab'); $$('[data-tab]', group).forEach(function (b) { var on = b.getAttribute('data-tab') === id; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); }); $$('[data-tab-panel]', group).forEach(function (pn) { pn.hidden = pn.getAttribute('data-tab-panel') !== id; }); return; }
    if (t.hasAttribute('data-slider-prev') || t.hasAttribute('data-slider-next')) { var sl = $(t.getAttribute('data-target') || '[data-slider]', t.closest('section') || document) || $('[data-slider]'); if (sl) sl.scrollBy({ left: (t.hasAttribute('data-slider-next') ? 1 : -1) * sl.clientWidth * 0.8, behavior: 'smooth' }); return; }
    if (t.hasAttribute('data-scroll-top')) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    var href = t.getAttribute('href');
    if (href && href.charAt(0) === '#' && href.charAt(1) !== '/' && href.length > 1) { var target = document.getElementById(href.slice(1)); if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); document.body.classList.remove('menu-open'); } }
  });
  document.addEventListener('input', function (e) {
    if (e.target.matches('[data-search]')) { filterState.q = e.target.value.trim(); renderGrids(); return; }
    if (e.target.matches('form[data-validate] input, form[data-validate] textarea') && e.target.getAttribute('aria-invalid') === 'true') showError(e.target, fieldError(e.target));
  });
  document.addEventListener('change', function (e) {
    if (e.target.matches('[data-sort]')) { filterState.sort = e.target.value; renderGrids(); }
    if (e.target.matches('[data-filter-select]')) { filterState.category = e.target.value || 'alle'; renderGrids(); }
  });
  document.addEventListener('submit', function (e) { var f = e.target; if (f.matches('form[data-validate], form[data-checkout-form]')) submitForm(f, e); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { openCart(false); document.body.classList.remove('menu-open'); $$('[data-menu]').forEach(function (m) { m.classList.remove('is-open'); }); } });
  window.addEventListener('hashchange', show);
  window.addEventListener('scroll', function () { document.body.classList.toggle('is-scrolled', window.scrollY > 24); }, { passive: true });

  function init() {
    pages = $$('[data-page]');
    $$('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
    $$('[data-tabs]').forEach(function (g) { var first = $('[data-tab]', g); if (first && !$('[data-tab].is-active', g)) first.click(); });
    $$('[data-cart-drawer]').forEach(function (d) { d.setAttribute('aria-hidden', 'true'); d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Warenkorb'); });
    $$('form[data-validate] input, form[data-validate] textarea, form[data-validate] select, form[data-checkout-form] input').forEach(function (i) { i.setAttribute('novalidate', ''); });
    $$('form[data-validate], form[data-checkout-form]').forEach(function (f) { f.setAttribute('novalidate', ''); });
    renderFilterBars(); renderGrids(); renderCart(); show(); observeReveal(document);
  }
  window.Kit = { toast: toast, addToCart: addToCart, cart: function () { return cart.slice(); }, products: products, go: function (h) { go(h, true); }, money: money };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
