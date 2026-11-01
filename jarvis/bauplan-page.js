// The public sales page for the "Jarvis-Bauplan" (served at /bauplan and
// downloadable as a single HTML file). Seller data and Gumroad links come from
// Render's environment; while the legal notice is incomplete the page is a
// draft (banner + noindex), because a German shop needs an Impressum.

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const httpsOnly = (value) => (/^https:\/\/[^\s"'<>]+$/.test(String(value ?? '').trim()) ? String(value).trim() : '');

export function bauplanConfig(env = process.env) {
  return {
    name: env.VERKAEUFER_NAME?.trim() || '',
    address: env.VERKAEUFER_ADRESSE?.trim() || '',
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.VERKAEUFER_EMAIL?.trim() || '') ? env.VERKAEUFER_EMAIL.trim() : '',
    linkStarter: httpsOnly(env.BAUPLAN_LINK_STARTER),
    linkKomplett: httpsOnly(env.BAUPLAN_LINK_KOMPLETT),
    priceStarter: env.BAUPLAN_PREIS_STARTER?.trim() || '29 €',
    priceKomplett: env.BAUPLAN_PREIS_KOMPLETT?.trim() || '80 €'
  };
}

export function missingSettings(config) {
  const missing = [];
  if (!config.name) missing.push({ key: 'VERKAEUFER_NAME', what: 'dein vollständiger Name (für das Impressum)' });
  if (!config.address) missing.push({ key: 'VERKAEUFER_ADRESSE', what: 'deine Anschrift: Straße Nr., PLZ Ort (für das Impressum)' });
  if (!config.email) missing.push({ key: 'VERKAEUFER_EMAIL', what: 'deine Kontakt-E-Mail' });
  if (!config.linkStarter) missing.push({ key: 'BAUPLAN_LINK_STARTER', what: 'Gumroad-Link zum Starter-Paket' });
  if (!config.linkKomplett) missing.push({ key: 'BAUPLAN_LINK_KOMPLETT', what: 'Gumroad-Link zum Komplett-Paket' });
  return missing;
}

const FEATURES = [
  ['🎙️', 'Sprechen wie im Film', 'Du redest, Jarvis antwortet mit echter Stimme – auf Deutsch, auf iPhone und Laptop.'],
  ['🎩', 'Butler-Modus', '„Ich habe Sie gehört, Master. Alle Systeme sind online.“ Siezen, trockener Humor, auf Zuruf.'],
  ['🧠', 'Gedächtnis', 'Merkt sich, was du ihm erzählst, und knüpft an das letzte Gespräch an.'],
  ['💻', 'Laptop-Steuerung', 'Programme öffnen, Dateien verwalten, Software installieren – Wichtiges nur mit Bestätigung.'],
  ['🌍', '3D-Erdkugel', 'Echte Satellitenbilder: „Zeig mir Paris“ – Jarvis fliegt hin, mit Wetter und Meldungen daneben.'],
  ['📰', 'Lagebericht', '„Mach die Nachrichten an“ – Weltlage auf der drehenden Erde, dazu jede Region auf Zuruf.'],
  ['📈', 'Börse', 'DAX, Nasdaq, Öl, Gold, Bitcoin mit echten Kursen und Wochenbewegung.'],
  ['🍕', 'Essen bestellen', 'Fragt, wer was will, prüft die Speisekarte, liest vor – und ruft beim Restaurant an.'],
  ['✉️', 'Gmail', 'Liest und sucht deine Mails, schreibt Antworten – gesendet wird erst nach deinem OK.'],
  ['📲', 'Telegram', 'Schickt dir Nachrichten und Sprachnachrichten, auch wenn die App zu ist.'],
  ['📅', 'Planer', 'Morgen-Briefing, Erinnerungen, Termine, Notizen, Haushaltsbuch, Vokabeltrainer.'],
  ['💶', 'Geld-Modus', 'Arbeitet im Hintergrund an digitalen Produkten und Verkaufsseiten – mit ehrlichem Dashboard.'],
  ['🌐', 'Websites & Spiele', 'Baut auf Zuruf schöne Websites und kleine Spiele als teilbaren Link.'],
  ['🛒', 'Einkaufen', 'Produktsuche mit Preisvergleich und eine Einkaufsliste auf allen Geräten.'],
  ['🌦️', 'Wissen & Wetter', 'Echtes Wetter, Wikipedia, Tagesüberblick, Timer.'],
  ['🛡️', 'Sicher gebaut', 'Schlüssel bleiben auf dem Server, Passwörter werden nie gespeichert, wichtige Aktionen brauchen dein OK.']
];

const FAQ = [
  ['Ist das ein fertiges Programm?', 'Nein. Du bekommst einen ausführlichen <b>Bauplan</b> (Text), den du in einen KI-Coding-Assistenten wie Claude Code einfügst. Der Assistent baut dir deinen eigenen Jarvis Schritt für Schritt. So gehört der Code dir und läuft mit deinen eigenen Konten.'],
  ['Brauche ich Programmierkenntnisse?', 'Nein, aber Geduld. Der Assistent schreibt den Code, du folgst seinen Anweisungen, trägst deine Schlüssel ein und klickst ein paar Dinge in den Diensten an. Mit dem Komplett-Paket hast du dafür eine Schritt-für-Schritt-Anleitung.'],
  ['Was kostet der Betrieb?', 'Hosting (Render) und Code-Speicher (GitHub) sind kostenlos. Für Stimme und Sprachverständnis brauchst du ein Deepgram-Konto (meist mit Startguthaben, danach nach Nutzung). Für den Coding-Assistenten kann ein Abo nötig sein. Telefonanrufe (Twilio) sind optional und kostenpflichtig. Alles Weitere ist optional.'],
  ['Funktioniert es auf iPhone und Android?', 'Ja. Jarvis ist eine Web-App und läuft im Browser – auf dem iPhone kannst du ihn wie eine App auf den Home-Bildschirm legen. Die Laptop-Steuerung ist für Windows gedacht.'],
  ['Verdient der Geld-Modus automatisch Geld?', 'Nein, das verspricht dir niemand seriös. Der Geld-Modus erstellt Produkte, Texte und Verkaufsseiten und zeigt dir ehrlich, was passiert. Ob und wie viel verkauft wird, hängt von dir und dem Markt ab.'],
  ['Was ist der Unterschied zwischen Starter und Komplett?', 'Starter ist der Bauplan allein – ideal, wenn du dich auskennst. Komplett enthält zusätzlich die Einrichtungs-Anleitung für alle Konten (Deepgram, Render, Telegram, Gmail, Groq, Twilio …), eine Fehlerhilfe und kostenlose Updates.'],
  ['Bekomme ich Updates?', 'Im Komplett-Paket ja: Neue Versionen bekommst du über deinen Kauf-Link ohne Aufpreis.'],
  ['Wie bezahle ich?', 'Sicher über Gumroad (Karte, PayPal u. a.). Nach dem Kauf bekommst du die Datei sofort per Download und E-Mail.']
];

function buyButton(link, label, primary, config) {
  if (link) return `<a class="btn ${primary ? 'btn-primary' : 'btn-ghost'}" href="${esc(link)}" target="_blank" rel="noopener">${esc(label)}</a>`;
  const mail = config.email ? ` href="mailto:${esc(config.email)}?subject=${encodeURIComponent('Jarvis-Bauplan')}"` : '';
  return `<a class="btn ${primary ? 'btn-primary' : 'btn-ghost'} disabled"${mail} aria-disabled="true">${config.email ? 'Bald verfügbar – per Mail anfragen' : 'Bald verfügbar'}</a>`;
}

export function renderSalesPage(config, { draft = missingSettings(config).length > 0 } = {}) {
  const year = new Date().getFullYear();
  const features = FEATURES.map(([icon, title, text]) => `<article class="feature"><span class="icon">${icon}</span><h3>${esc(title)}</h3><p>${esc(text)}</p></article>`).join('');
  const faq = FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${a}</p></details>`).join('');
  const impressum = config.name && config.address
    ? `<p>${esc(config.name)}<br>${esc(config.address).replace(/,\s*/g, '<br>')}</p><p>E-Mail: ${config.email ? `<a href="mailto:${esc(config.email)}">${esc(config.email)}</a>` : '–'}</p>`
    : '<p class="warn">⚠️ Impressum noch unvollständig – Name, Anschrift und E-Mail müssen vor der Veröffentlichung ergänzt werden.</p>';
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Jarvis-Bauplan – bau dir deinen eigenen KI-Assistenten</title>
<meta name="description" content="Der Bauplan für deinen eigenen deutschen KI-Sprachassistenten wie im Film: Stimme, 3D-Erde, Lagebericht, Börse, Planer, Telegram, Essen bestellen und mehr – gebaut mit deinem KI-Coding-Assistenten.">
${draft ? '<meta name="robots" content="noindex, nofollow">' : ''}
<meta property="og:title" content="Jarvis-Bauplan – bau dir deinen eigenen KI-Assistenten">
<meta property="og:description" content="16 Funktionen, auf Deutsch, auf iPhone und Laptop. Dein KI-Coding-Assistent baut ihn dir Schritt für Schritt.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#03070c;--bg2:#071522;--card:rgba(10,30,46,.6);--edge:rgba(56,225,255,.2);--cyan:#38e1ff;--cyan2:#8cf3ff;--amber:#ffb547;--text:#e3f7ff;--muted:#8fb0c0;--green:#4dffb0}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:radial-gradient(ellipse at 70% -10%,#0b2a40 0%,var(--bg) 55%) fixed,var(--bg);color:var(--text);font:16px/1.6 Inter,system-ui,sans-serif;overflow-x:hidden}
a{color:var(--cyan2)}
.wrap{width:min(1120px,100% - 32px);margin:0 auto}
.draft{position:relative;z-index:30;background:var(--amber);color:#1b1200;text-align:center;font-weight:600;padding:8px 16px;font-size:14px}
nav{position:sticky;top:0;z-index:20;backdrop-filter:blur(10px);background:rgba(3,7,12,.72);border-bottom:1px solid var(--edge)}
nav .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;height:64px}
.logo{font-family:Orbitron,sans-serif;letter-spacing:.22em;font-weight:700;color:var(--cyan2);text-decoration:none;display:flex;align-items:center;gap:10px;white-space:nowrap}
.logo i{width:22px;height:22px;border-radius:50%;border:2px solid var(--cyan);box-shadow:0 0 12px var(--cyan),inset 0 0 8px var(--cyan)}
.links{display:flex;gap:22px;align-items:center}.links a{color:var(--muted);text-decoration:none;font-size:15px}.links a:hover{color:var(--text)}
@media(max-width:760px){.links a:not(.btn){display:none}}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:13px 22px;border-radius:12px;font-weight:600;text-decoration:none;transition:transform .15s,box-shadow .15s;border:1px solid transparent;cursor:pointer}
.btn-primary{background:linear-gradient(135deg,#38e1ff,#3b82f6);color:#021018;box-shadow:0 10px 30px rgba(56,225,255,.25)}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 14px 40px rgba(56,225,255,.35)}
.btn-ghost{border-color:var(--edge);color:var(--text);background:rgba(56,225,255,.05)}.btn-ghost:hover{border-color:var(--cyan)}
.btn.disabled{opacity:.6;cursor:default;transform:none}
.links .btn{padding:9px 16px}.links a.btn-primary{color:#021018}
header.hero{padding:72px 0 40px}
.hero .wrap{display:grid;grid-template-columns:1.1fr .9fr;gap:40px;align-items:center}
@media(max-width:900px){.hero .wrap{grid-template-columns:1fr}.reactor{order:-1;max-width:300px;margin:0 auto}}
.badge{display:inline-block;padding:6px 12px;border:1px solid var(--edge);border-radius:99px;color:var(--cyan2);font-size:13px;letter-spacing:.06em;background:rgba(56,225,255,.06)}
h1{font-family:Orbitron,sans-serif;font-size:clamp(34px,5.4vw,62px);line-height:1.08;margin:18px 0 18px;letter-spacing:.01em}
h1 span{background:linear-gradient(90deg,#8cf3ff,#38e1ff 40%,#7aa2ff);-webkit-background-clip:text;background-clip:text;color:transparent}
.lead{font-size:clamp(17px,2vw,20px);color:#c4e3f0;max-width:620px}
.cta{display:flex;flex-wrap:wrap;gap:12px;margin:28px 0 18px}
.trust{display:flex;flex-wrap:wrap;gap:8px 18px;color:var(--muted);font-size:14px}.trust b{color:var(--green);font-weight:600}
.reactor{position:relative;aspect-ratio:1;width:100%}
.ring{position:absolute;inset:0;border-radius:50%;border:2px solid rgba(56,225,255,.35)}
.r1{inset:4%;border-style:dashed;animation:spin 30s linear infinite}
.r2{inset:15%;border-color:rgba(56,225,255,.55);border-width:3px;border-left-color:transparent;border-right-color:transparent;animation:spin 9s linear infinite reverse}
.r3{inset:27%;border-color:rgba(140,243,255,.5);animation:spin 14s linear infinite;border-top-color:transparent}
.core{position:absolute;inset:38%;border-radius:50%;background:radial-gradient(circle,#e8fdff 0%,#38e1ff 35%,rgba(56,225,255,.15) 70%,transparent 72%);box-shadow:0 0 90px 20px rgba(56,225,255,.35);animation:pulse 3.2s ease-in-out infinite}
.chip{position:absolute;padding:8px 12px;border:1px solid var(--edge);border-radius:10px;background:rgba(3,14,22,.85);font-size:13px;color:var(--cyan2);white-space:nowrap;box-shadow:0 8px 24px rgba(0,0,0,.4);animation:float 6s ease-in-out infinite}
.c1{top:6%;left:-4%}.c2{top:46%;right:-6%;animation-delay:-2s}.c3{bottom:6%;left:6%;animation-delay:-4s}
@media(max-width:520px){.chip{display:none}}
@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{50%{transform:scale(1.08);filter:brightness(1.15)}}@keyframes float{50%{transform:translateY(-10px)}}
section{padding:72px 0}
h2{font-family:Orbitron,sans-serif;font-size:clamp(26px,3.4vw,38px);margin:0 0 12px;letter-spacing:.02em}
.sub{color:var(--muted);max-width:680px;margin:0 0 36px;font-size:17px}
.demo{display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:center}@media(max-width:900px){.demo{grid-template-columns:1fr}}
.window{border:1px solid var(--edge);border-radius:18px;background:linear-gradient(180deg,rgba(9,28,43,.92),rgba(3,10,16,.95));box-shadow:0 30px 80px rgba(0,0,0,.5),0 0 0 1px rgba(56,225,255,.05) inset;overflow:hidden}
.bar{display:flex;gap:6px;padding:12px 14px;border-bottom:1px solid var(--edge)}.bar i{width:10px;height:10px;border-radius:50%;background:#1d3b4d}
.chat{padding:18px;display:flex;flex-direction:column;gap:12px;font-size:15px}
.msg{max-width:88%;padding:10px 14px;border-radius:14px;line-height:1.45}
.me{align-self:flex-end;background:rgba(56,225,255,.14);border:1px solid rgba(56,225,255,.25)}
.ai{align-self:flex-start;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)}.ai b{display:block;font-size:11px;letter-spacing:.14em;color:var(--cyan2);font-family:Orbitron,sans-serif;margin-bottom:2px}
.note{color:var(--muted);font-size:13px;margin-top:10px}
.points{display:grid;gap:14px}.point{display:flex;gap:14px;align-items:flex-start}.point span{flex:none;width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:rgba(56,225,255,.1);border:1px solid var(--edge)}
.point h3{margin:0;font-size:17px}.point p{margin:2px 0 0;color:var(--muted);font-size:15px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
.feature{padding:20px;border:1px solid var(--edge);border-radius:16px;background:var(--card);transition:transform .2s,border-color .2s}
.feature:hover{transform:translateY(-4px);border-color:rgba(56,225,255,.5)}
.feature .icon{font-size:26px}.feature h3{margin:10px 0 6px;font-size:17px}.feature p{margin:0;color:var(--muted);font-size:14.5px}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;counter-reset:s}@media(max-width:820px){.steps{grid-template-columns:1fr}}
.step{position:relative;padding:24px;border:1px solid var(--edge);border-radius:16px;background:var(--card)}
.step::before{counter-increment:s;content:counter(s);font-family:Orbitron,sans-serif;font-size:13px;color:#021018;background:var(--cyan);width:30px;height:30px;border-radius:50%;display:grid;place-items:center;margin-bottom:12px;box-shadow:0 0 18px rgba(56,225,255,.5)}
.step h3{margin:0 0 6px}.step p{margin:0;color:var(--muted)}
.needs{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.need{padding:16px 18px;border-radius:14px;border:1px solid var(--edge);background:rgba(255,255,255,.02)}.need b{display:block}.need small{color:var(--muted);font-size:14px}
.tag{display:inline-block;font-size:11px;padding:2px 8px;border-radius:99px;margin-left:6px;vertical-align:2px;border:1px solid var(--edge);color:var(--muted)}.tag.free{color:var(--green);border-color:rgba(77,255,176,.35)}.tag.paid{color:var(--amber);border-color:rgba(255,181,71,.4)}
.pricing{display:grid;grid-template-columns:repeat(2,minmax(0,380px));gap:20px;justify-content:center}@media(max-width:760px){.pricing{grid-template-columns:1fr}}
.plan{position:relative;padding:30px 26px;border:1px solid var(--edge);border-radius:20px;background:var(--card);display:flex;flex-direction:column}
.plan.best{border-color:var(--cyan);background:linear-gradient(180deg,rgba(18,58,84,.75),rgba(6,22,34,.85));box-shadow:0 0 60px rgba(56,225,255,.18)}
.plan .ribbon{position:absolute;top:-13px;left:50%;transform:translateX(-50%);background:var(--cyan);color:#021018;font-weight:700;font-size:12px;letter-spacing:.08em;padding:5px 14px;border-radius:99px;text-transform:uppercase}
.plan h3{margin:0;font-family:Orbitron,sans-serif;letter-spacing:.06em}.plan .price{font-size:46px;font-weight:700;margin:12px 0 2px}.plan .price small{font-size:15px;color:var(--muted);font-weight:500}
.plan ul{list-style:none;padding:0;margin:18px 0 24px;display:grid;gap:9px;flex:1}.plan li{padding-left:28px;position:relative;color:#cfe8f3}.plan li::before{content:'✓';position:absolute;left:0;color:var(--green);font-weight:700}
.plan li.no{color:var(--muted)}.plan li.no::before{content:'–';color:var(--muted)}
.fine{text-align:center;color:var(--muted);font-size:13.5px;margin-top:18px}
details{border:1px solid var(--edge);border-radius:14px;padding:4px 18px;background:rgba(255,255,255,.02);margin-bottom:10px}
summary{cursor:pointer;padding:12px 0;font-weight:600;list-style:none}summary::-webkit-details-marker{display:none}summary::after{content:'+';float:right;color:var(--cyan)}details[open] summary::after{content:'–'}
details p{margin:0 0 14px;color:#c6dfea}
.final{text-align:center;padding:64px 24px;border:1px solid var(--edge);border-radius:24px;background:radial-gradient(circle at 50% 0%,rgba(56,225,255,.16),transparent 70%),var(--card)}
footer{border-top:1px solid var(--edge);padding:40px 0 60px;color:var(--muted);font-size:14px}
.legal{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}@media(max-width:820px){.legal{grid-template-columns:1fr}}
.legal h4{color:var(--text);margin:0 0 8px;font-size:15px}.legal p{margin:0 0 8px}
.warn{color:var(--amber)}
.reveal{opacity:0;transform:translateY(18px);transition:opacity .7s,transform .7s}.reveal.on{opacity:1;transform:none}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.reveal{opacity:1;transform:none}}
</style>
</head>
<body>
${draft ? '<div class="draft">Entwurf – noch nicht veröffentlichen: Impressum und Kauf-Links fehlen noch.</div>' : ''}
<nav><div class="wrap"><a class="logo" href="#top"><i></i>JARVIS-BAUPLAN</a><div class="links"><a href="#funktionen">Funktionen</a><a href="#so-gehts">So geht's</a><a href="#preise">Preise</a><a href="#faq">FAQ</a><a class="btn btn-primary" href="#preise">Jetzt holen</a></div></div></nav>

<header class="hero" id="top"><div class="wrap">
  <div>
    <span class="badge">Für Claude Code &amp; andere KI-Coding-Assistenten</span>
    <h1>Bau dir deinen <span>eigenen Jarvis.</span></h1>
    <p class="lead">Ein deutscher KI-Sprachassistent wie im Film – auf iPhone und Laptop. Mit dem Jarvis-Bauplan baut ihn dir dein KI-Coding-Assistent Schritt für Schritt. Mit deinen eigenen Konten und mit Code, der dir gehört.</p>
    <div class="cta">${buyButton(config.linkKomplett, `Komplett holen – ${config.priceKomplett}`, true, config)}<a class="btn btn-ghost" href="#funktionen">Alle 16 Funktionen ansehen</a></div>
    <div class="trust"><span><b>✓</b> 16 Funktionen</span><span><b>✓</b> Komplett auf Deutsch</span><span><b>✓</b> Läuft im Browser</span><span><b>✓</b> Sofort-Download</span></div>
  </div>
  <div class="reactor" aria-hidden="true"><div class="ring r1"></div><div class="ring r2"></div><div class="ring r3"></div><div class="core"></div>
    <div class="chip c1">🌍 Erdbeobachtung · online</div><div class="chip c2">📈 Märkte · online</div><div class="chip c3">🎙️ Spracherkennung · online</div></div>
</div></header>

<section id="demo"><div class="wrap demo">
  <div class="reveal">
    <h2>Redet mit dir. Erledigt Dinge.</h2>
    <p class="sub">Kein Chat-Fenster, in das du tippst – du sprichst einfach. Jarvis antwortet mit Stimme, zeigt dir die Welt auf einer 3D-Erde, liest deine Mails und erinnert dich an Termine.</p>
    <div class="points">
      <div class="point"><span>🎩</span><div><h3>Mit Persönlichkeit</h3><p>Locker wie ein Kumpel – oder als eleganter Butler, der dich „Master“ nennt.</p></div></div>
      <div class="point"><span>✅</span><div><h3>Ehrlich und sicher</h3><p>Nichts wird erfunden, Wichtiges passiert nur mit deinem OK.</p></div></div>
      <div class="point"><span>📱</span><div><h3>Überall dabei</h3><p>Auf dem iPhone wie eine App, dazu Nachrichten per Telegram.</p></div></div>
    </div>
  </div>
  <div class="window reveal" aria-label="Beispiel-Gespräch"><div class="bar"><i></i><i></i><i></i></div><div class="chat">
    <div class="msg ai"><b>JARVIS</b>Ich habe Sie gehört, Master. Alle Systeme sind online. Was kann ich für Sie tun?</div>
    <div class="msg me">Mach mir die Nachrichten an.</div>
    <div class="msg ai"><b>JARVIS</b>Mit Vergnügen. Die Welt liegt auf meinem Schirm – hier die drei wichtigsten Meldungen der letzten Stunden …</div>
    <div class="msg me">Bestell bei der Pizzeria um die Ecke was für uns.</div>
    <div class="msg ai"><b>JARVIS</b>Sehr gern. Was möchte jeder essen? Ich prüfe die Karte, lese alles vor – und rufe erst an, wenn Sie Ja sagen.</div>
  </div></div>
</div><div class="wrap"><p class="note">Beispiel-Dialog zur Veranschaulichung. Nachrichten, Kurse und Daten kommen bei deinem Jarvis live aus echten Quellen.</p></div></section>

<section id="funktionen"><div class="wrap">
  <h2 class="reveal">Alle 16 Funktionen im Bauplan</h2>
  <p class="sub reveal">Du entscheidest, womit du anfängst. Der Bauplan führt deinen Coding-Assistenten durch jede Funktion – eine nach der anderen, jede getestet.</p>
  <div class="grid">${features}</div>
</div></section>

<section id="so-gehts"><div class="wrap">
  <h2 class="reveal">So einfach geht's</h2>
  <p class="sub reveal">Du brauchst keine Programmierkenntnisse – nur einen KI-Coding-Assistenten und etwas Zeit.</p>
  <div class="steps">
    <div class="step reveal"><h3>Holen</h3><p>Paket kaufen und sofort herunterladen.</p></div>
    <div class="step reveal"><h3>Einfügen</h3><p>Den Bauplan in Claude Code (oder einen anderen Coding-Assistenten) einfügen und abschicken.</p></div>
    <div class="step reveal"><h3>Loslegen</h3><p>Der Assistent baut deinen Jarvis Schritt für Schritt und stellt ihn online. Du sagst: „Hallo Jarvis.“</p></div>
  </div>
</div></section>

<section id="voraussetzungen"><div class="wrap">
  <h2 class="reveal">Was du brauchst – ehrlich aufgelistet</h2>
  <p class="sub reveal">Keine versteckten Kosten. Hier steht vorher, was dazugehört.</p>
  <div class="needs">
    <div class="need reveal"><b>KI-Coding-Assistent <span class="tag paid">ggf. Abo</span></b><small>z. B. Claude Code – er schreibt den Code für dich.</small></div>
    <div class="need reveal"><b>Deepgram-Konto <span class="tag">nach Nutzung</span></b><small>Für Stimme und Sprachverständnis. Neue Konten haben meist ein Startguthaben.</small></div>
    <div class="need reveal"><b>Render &amp; GitHub <span class="tag free">kostenlos</span></b><small>Hier läuft und liegt dein Jarvis.</small></div>
    <div class="need reveal"><b>Telegram, Gmail, Groq <span class="tag free">kostenlos</span></b><small>Optional – für Nachrichten, Mails und den Geld-Modus.</small></div>
    <div class="need reveal"><b>Twilio <span class="tag paid">kostenpflichtig</span></b><small>Optional – nur für echte Telefonanrufe (Essen bestellen).</small></div>
    <div class="need reveal"><b>Ein Gerät mit Browser <span class="tag free">hast du</span></b><small>iPhone, Android, Windows oder Mac.</small></div>
  </div>
</div></section>

<section id="preise"><div class="wrap">
  <h2 class="reveal" style="text-align:center">Wähle dein Paket</h2>
  <p class="sub reveal" style="text-align:center;margin-left:auto;margin-right:auto">Einmal zahlen, für immer behalten. Sofort-Download nach dem Kauf.</p>
  <div class="pricing">
    <div class="plan reveal"><h3>Starter</h3><div class="price">${esc(config.priceStarter)} <small>einmalig</small></div><p style="color:var(--muted);margin:0">Für alle, die sich auskennen.</p>
      <ul><li>Der komplette Jarvis-Bauplan</li><li>Alle 16 Funktionen beschrieben</li><li>Feste Sicherheits- und Ehrlichkeitsregeln</li><li>Liste aller benötigten Konten</li><li class="no">Einrichtungs-Anleitung</li><li class="no">Fehlerhilfe</li><li class="no">Kostenlose Updates</li></ul>
      ${buyButton(config.linkStarter, `Starter holen – ${config.priceStarter}`, false, config)}</div>
    <div class="plan best reveal"><span class="ribbon">Empfohlen</span><h3>Komplett</h3><div class="price">${esc(config.priceKomplett)} <small>einmalig</small></div><p style="color:var(--muted);margin:0">Für alle, die es einfach haben wollen.</p>
      <ul><li>Alles aus Starter</li><li>Schritt-für-Schritt-Einrichtung für alle Konten</li><li>Deepgram, Render, Telegram, Gmail, Groq, Cesium, Twilio</li><li>Fehlerhilfe für die häufigsten Probleme</li><li>Kostenlose Updates</li></ul>
      ${buyButton(config.linkKomplett, `Komplett holen – ${config.priceKomplett}`, true, config)}</div>
  </div>
  <p class="fine">Preise inkl. MwSt. · Sichere Zahlung über Gumroad · Digitales Produkt (Text), kein fertiges Programm</p>
</div></section>

<section id="faq"><div class="wrap" style="max-width:820px">
  <h2 class="reveal">Häufige Fragen</h2>
  ${faq}
</div></section>

<section><div class="wrap"><div class="final reveal">
  <h2>Bereit für deinen eigenen Jarvis?</h2>
  <p class="sub" style="margin:0 auto 26px">Hol dir den Bauplan und sag heute Abend zum ersten Mal: „Hallo Jarvis.“</p>
  ${buyButton(config.linkKomplett, `Komplett holen – ${config.priceKomplett}`, true, config)}
</div></div></section>

<footer><div class="wrap">
  <div class="legal">
    <div id="impressum"><h4>Impressum</h4><p>Angaben gemäß § 5 DDG</p>${impressum}</div>
    <div id="widerruf"><h4>Widerrufsbelehrung (digitale Inhalte)</h4><p>Du hast grundsätzlich ein 14-tägiges Widerrufsrecht. Bei digitalen Inhalten, die nicht auf einem Datenträger geliefert werden, erlischt es, wenn du ausdrücklich zugestimmt hast, dass mit der Ausführung vor Ablauf der Widerrufsfrist begonnen wird, und deine Kenntnis davon bestätigt hast, dass du dadurch dein Widerrufsrecht verlierst. Widerruf formlos an: ${config.email ? `<a href="mailto:${esc(config.email)}">${esc(config.email)}</a>` : 'die oben genannte Adresse'}.</p></div>
    <div id="datenschutz"><h4>Datenschutz</h4><p>Diese Seite setzt keine Cookies und kein Tracking ein. Beim Aufruf verarbeitet der Hosting-Anbieter technisch notwendige Daten (z. B. IP-Adresse) in Server-Logs. Schriftarten werden von Google Fonts geladen. Die Zahlung läuft über Gumroad; dort gelten deren Datenschutzbestimmungen. Verantwortlich: siehe Impressum.</p></div>
  </div>
  <p style="margin-top:28px">© ${year} ${esc(config.name || 'Jarvis-Bauplan')} · „Jarvis“ ist hier ein frei gewählter Name für deinen Assistenten. Kein offizielles Produkt von Marvel, Disney, Deepgram, Anthropic oder anderen genannten Anbietern. Ergebnisse hängen von deinem Coding-Assistenten und den genutzten Diensten ab.</p>
</div></footer>
<script>
const io=new IntersectionObserver((es)=>es.forEach((e)=>{if(e.isIntersecting){e.target.classList.add('on');io.unobserve(e.target)}}),{threshold:.12});
document.querySelectorAll('.reveal,.feature').forEach((el,i)=>{el.classList.add('reveal');el.style.transitionDelay=(el.classList.contains('feature')?(i%4)*70:0)+'ms';io.observe(el)});
</script>
</body>
</html>`;
}
