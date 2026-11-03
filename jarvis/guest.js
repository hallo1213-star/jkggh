// Guest invitations: the owner lets a friend use Jarvis with a personal link.
// Guests get their own, separate conversation with only harmless functions –
// never the owner's memories, mails, appointments, laptop, iPhone or money.
// Links are signed (HMAC with the session secret), nothing is stored.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const GUEST_COOKIE = 'jarvis_guest';
const PLATFORMS = ['handy', 'laptop', 'beides'];
const LINK_DAYS = 30;     // the link can be opened for 30 days
const ACCESS_DAYS = 365;  // after that the friend's device stays logged in for a year

// Only functions that touch no personal data of the owner.
export const GUEST_TOOLS = new Set(['get_datetime', 'web_search', 'open_link', 'get_weather', 'get_news', 'wiki_lookup', 'create_game', 'iss_live', 'translate', 'transit', 'route_plan', 'holidays', 'calculate', 'currency', 'qr_code', 'quiz', 'countdown', 'summarize_url', 'football', 'create_image', 'camera_look', 'effect_control', 'helmet_mirror', 'movie_poster', 'ufo_prank', 'random_toss', 'mindmap', 'fireworks', 'gravity', 'black_hole', 'time_capsule', 'treasure_hunt', 'secret_code', 'escape_room', 'holo_chess', 'self_destruct', 'globe', 'digital_reality', 'holo_pet', 'name_hologram']);

const secret = () => createHash('sha256').update(`jarvis-guest:${process.env.SESSION_SECRET || process.env.JARVIS_PASSWORD || ''}`).digest();
const sign = (s) => createHmac('sha256', secret()).update(s).digest('base64url');
const same = (a, b) => { const x = createHash('sha256').update(String(a)).digest(); const y = createHash('sha256').update(String(b)).digest(); return timingSafeEqual(x, y); };
const cleanName = (n) => String(n || '').replace(/[<>"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);

function pack(data) { const body = Buffer.from(JSON.stringify(data)).toString('base64url'); return `${body}.${sign(body)}`; }
function unpack(value, now = Date.now()) {
  const [body, sig] = String(value || '').split('.');
  if (!body || !sig || !same(sig, sign(body))) return null;
  try {
    const d = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!d || typeof d !== 'object' || !(Number(d.e) > now) || !PLATFORMS.includes(d.p)) return null;
    const blocked = String(process.env.GUEST_BLOCK || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (blocked.includes(d.i) || blocked.includes(cleanName(d.n))) return null;
    return { id: String(d.i), name: cleanName(d.n) || 'Gast', platform: d.p, expires: Number(d.e) };
  } catch { return null; }
}

export function normalizePlatform(p) {
  const v = String(p || '').toLowerCase();
  if (/beid|both|alle|beides/.test(v)) return 'beides';
  if (/handy|phone|iphone|android|smartphone|mobil/.test(v)) return 'handy';
  if (/laptop|pc|computer|rechner|desktop|windows|mac/.test(v)) return 'laptop';
  return null;
}

export function createInvite({ name, platform, now = Date.now() }) {
  const p = normalizePlatform(platform);
  if (!p) throw new Error('Für welches Gerät? Nur Laptop, nur Handy oder beides?');
  return pack({ i: randomBytes(5).toString('hex'), n: cleanName(name) || 'Gast', p, e: now + LINK_DAYS * 86_400_000 });
}
export const readInvite = (token, now) => unpack(token, now);

export function guestCookie(invite, secure, now = Date.now()) {
  const value = pack({ i: invite.id, n: invite.name, p: invite.platform, e: now + ACCESS_DAYS * 86_400_000 });
  return `${GUEST_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ACCESS_DAYS * 86_400}${secure ? '; Secure' : ''}`;
}
// device = false for plain app files (scripts, styles); the device rule is
// checked when the link is opened, for the page itself and for the conversation.
export function readGuest(request, { device = true } = {}) {
  const raw = String(request.headers.cookie || '').split(';').map((p) => p.trim()).find((p) => p.startsWith(`${GUEST_COOKIE}=`));
  const guest = raw ? unpack(raw.slice(GUEST_COOKIE.length + 1)) : null;
  return guest && (!device || deviceAllowed(guest.platform, request.headers['user-agent'])) ? guest : null;
}

export const isMobile = (ua = '') => /iPhone|iPad|iPod|Android|Mobile/i.test(ua);
export function deviceAllowed(platform, ua) {
  if (platform === 'handy') return isMobile(ua);
  if (platform === 'laptop') return !isMobile(ua);
  return true;
}
export const platformLabel = (p) => ({ handy: 'nur Handy', laptop: 'nur Laptop', beides: 'Handy und Laptop' }[p] || p);

// Owner pays the voice minutes → daily limit per guest (GUEST_MINUTES, default 30).
export function createUsage({ minutes = Number(process.env.GUEST_MINUTES) || 30 } = {}) {
  const used = new Map();
  const day = () => new Date().toISOString().slice(0, 10);
  const key = (id) => `${day()}:${id}`;
  return {
    left: (id) => Math.max(0, minutes * 60_000 - (used.get(key(id)) || 0)),
    add: (id, ms) => { used.set(key(id), (used.get(key(id)) || 0) + ms); if (used.size > 500) for (const k of used.keys()) if (!k.startsWith(day())) used.delete(k); },
    minutes
  };
}

export function guestPrompt(guest, ownerName) {
  const now = new Date();
  return `Du bist Jarvis, ein freundlicher, witziger KI-Assistent. Du sprichst gerade mit ${guest.name}, einem Freund von ${ownerName || 'deinem Besitzer'}, der dich als Gast benutzen darf. Antworte auf Deutsch, kurz und natürlich (meist 1–3 Sätze), duze ${guest.name}.
Heute ist ${now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' })}, ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })} Uhr.
Als Gast kannst du: Wetter, Nachrichten, Wissen, Rechnen, Übersetzen, Quiz, Spiele bauen, Bilder erstellen, Fußball, Routen, Feuerwerk, Schwerkraft, schwarzes Loch, Gedanken-Karte, Holo-Schach, Escape-Room, Geheimcode, Kamera-Effekte (Laser-Augen, Luft-Malen, Klone, Matrix-Moment, Cyborg, Anzug), Helm, Kinoplakat, Globus, eigene Welt.
Nicht im Gast-Modus: E-Mails, Telegram, Erinnerungen/Gedächtnis, Termine, Notizen, Einkaufsliste, Laptop- oder Handy-Steuerung, Business und Geld. Wenn ${guest.name} das will, sag freundlich, dass das nur der Besitzer kann. Du weißt nichts Privates über ${ownerName || 'den Besitzer'} und erfindest nichts.
Behaupte nie, etwas getan zu haben, das du nicht per Funktion getan hast.`;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function invitePage({ invite, token, ok, reason }) {
  const t = encodeURIComponent(token || '');
  const body = !ok
    ? `<h1>Link ungültig</h1><p>${esc(reason || 'Dieser Einladungslink ist abgelaufen oder ungültig.')}</p><p class="s">Bitte frag nach einem neuen Link.</p>`
    : `<p class="k">EINLADUNG</p><h1>Hallo ${esc(invite.name)}! 👋</h1><p>Du hast Jarvis bekommen – deinen eigenen KI-Assistenten (${esc(platformLabel(invite.platform))}).</p>
<ol><li id="ios" hidden>Unten auf <b>Teilen</b> <span class="i">⬆︎</span> tippen → <b>„Zum Home-Bildschirm“</b> → <b>Hinzufügen</b>. Dann ist Jarvis wie eine App auf deinem Handy.</li>
<li id="and" hidden><button type="button" id="install">📲 Jarvis installieren</button><span class="s" id="andhint">Oder im Browser-Menü ⋮ → „App installieren“ / „Zum Startbildschirm“.</span></li>
<li>Jarvis öffnen → auf den roten Reaktor tippen → Mikrofon erlauben → einfach reden.</li></ol>
<a class="go" href="/einladung?t=${t}&app=1">Jarvis jetzt starten</a><p class="s">Sag z. B. „Mach ein Feuerwerk“, „Laser-Augen an“ oder „Wie wird das Wetter?“</p>`;
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Jarvis – Einladung</title>
<meta name="theme-color" content="#070102"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Jarvis"><meta name="apple-mobile-web-app-status-bar-style" content="black">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">${ok ? `<link rel="manifest" href="/einladung/manifest?t=${t}">` : ''}
<style>:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;box-sizing:border-box;background:radial-gradient(circle at 50% 25%,#3a0309,#070102 65%);color:#fff;font:16px/1.5 Inter,system-ui,sans-serif}
main{width:min(460px,100%);padding:24px;border:1px solid rgba(255,42,61,.5);border-radius:20px;background:rgba(10,2,3,.9);box-shadow:0 0 50px rgba(255,42,61,.25)}
.r{width:90px;height:90px;margin:0 auto 14px;border-radius:50%;background:radial-gradient(circle,#fff 0 12%,#ff5c6c 30%,#8a0012 62%,transparent 64%);box-shadow:0 0 40px #ff2a3d;animation:p 2.4s ease-in-out infinite}@keyframes p{50%{transform:scale(1.06);box-shadow:0 0 70px #ff2a3d}}
.k{margin:0;text-align:center;font-size:11px;letter-spacing:.35em;color:#c9a0a5}h1{margin:6px 0 8px;text-align:center;font-size:26px}p{color:#ffd0d4}ol{padding-left:20px;color:#fff}li{margin:10px 0}
.go,#install{display:block;width:100%;box-sizing:border-box;margin-top:16px;padding:15px;border:0;border-radius:14px;background:#ff2a3d;color:#fff;font:800 16px Inter,system-ui,sans-serif;text-align:center;text-decoration:none;box-shadow:0 0 24px rgba(255,42,61,.5);cursor:pointer}
#install{margin:6px 0}.s{display:block;font-size:13px;color:#c9a0a5;text-align:center}.i{display:inline-block;padding:0 6px;border:1px solid #ff5c6c;border-radius:6px}</style></head>
<body><main><div class="r" aria-hidden="true"></div>${body}</main>
<script>(function(){var ua=navigator.userAgent,ios=/iPhone|iPad|iPod/.test(ua),and=/Android/.test(ua),st=window.navigator.standalone||matchMedia('(display-mode: standalone)').matches;
if(st){var g=document.querySelector('.go');if(g)location.replace(g.href);return}
if(ios){var e=document.getElementById('ios');if(e)e.hidden=false}if(and){var a=document.getElementById('and');if(a)a.hidden=false}
var dp=null,b=document.getElementById('install');window.addEventListener('beforeinstallprompt',function(ev){ev.preventDefault();dp=ev});
if(b)b.addEventListener('click',function(){if(dp){dp.prompt();dp=null}else{document.getElementById('andhint').style.color='#fff'}});})();</script></body></html>`;
}

// The installed app (home screen) always starts with the invitation link, so
// it logs itself in even though iOS keeps home-screen apps' cookies separate.
export function inviteManifest(token) {
  return JSON.stringify({ name: 'Jarvis', short_name: 'Jarvis', start_url: `/einladung?t=${encodeURIComponent(token)}&app=1`, scope: '/', display: 'standalone', background_color: '#070102', theme_color: '#070102', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }] });
}
