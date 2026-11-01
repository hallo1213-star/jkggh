import { parseMessage, normalizeRecipients, describeEmail, gmailConfigured, listEmails } from '../../gmail.js';
const assert = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };
const plain = 'From: =?UTF-8?Q?J=C3=BCrgen_M=C3=BCller?= <juergen@example.de>\r\nTo: ich@gmail.com\r\nSubject: =?UTF-8?Q?Gr=C3=BC=C3=9Fe_aus_K=C3=B6ln?=\r\nMessage-ID: <abc@example.de>\r\nDate: Thu, 30 Oct 2026 10:00:00 +0100\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nHallo, sch=C3=B6ne Gr=C3=BC=C3=9Fe!\r\n';
const p = await parseMessage(Buffer.from(plain));
assert(p.von === 'Jürgen Müller <juergen@example.de>' && p.betreff === 'Grüße aus Köln' && p.text === 'Hallo, schöne Grüße!', 'UTF-8/quoted-printable decoded (Umlaute)');
assert(p.messageId === '<abc@example.de>', 'Message-ID for replies');
const html = 'From: shop@example.com\r\nSubject: Bestellung\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<html><body><h1>Danke!</h1><p>Deine Bestellung <b>#123</b> ist unterwegs.</p><script>evil()</script></body></html>';
const h = await parseMessage(Buffer.from(html));
assert(/danke/i.test(h.text) && !/evil/.test(h.text) && /#123/.test(h.text) && !/<b>/.test(h.text), 'HTML-only mail converted to plain text');
const att = 'From: a@b.de\r\nSubject: Rechnung\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=X\r\n\r\n--X\r\nContent-Type: text/plain\r\n\r\nSiehe Anhang.\r\n--X\r\nContent-Type: application/pdf; name=rechnung.pdf\r\nContent-Disposition: attachment; filename=rechnung.pdf\r\nContent-Transfer-Encoding: base64\r\n\r\nJVBERi0=\r\n--X--\r\n';
const a = await parseMessage(Buffer.from(att));
assert(a.text === 'Siehe Anhang.' && a.anhaenge[0] === 'rechnung.pdf', 'attachment names listed, content not read');
const long = await parseMessage(Buffer.from('Subject: lang\r\n\r\n' + 'x'.repeat(10000)));
assert(long.text.length < 6100 && long.text.endsWith('(gekürzt)'), 'long mails truncated');
assert(normalizeRecipients('a@b.de, c@d.com').length === 2, 'two recipients');
for (const bad of ['', 'kein-at', 'x@y', 'Evil <a@b.de>, "x;y"@z.de', 'a@b.de,c@d.de,e@f.de,g@h.de,i@j.de,k@l.de']) {
  try { normalizeRecipients(bad); assert(false, `reject "${bad}"`); } catch { assert(true, `rejects "${bad.slice(0, 30)}"`); }
}
const d = await describeEmail({ to: 'oma@example.de', subject: 'Hallo', body: 'Wie geht es dir?' });
assert(d.title === 'E-Mail senden?' && d.detail.startsWith('An: oma@example.de\nBetreff: Hallo\n\nWie geht es dir?'), 'confirmation shows recipient, subject and full text');
delete process.env.GMAIL_ADDRESS;
assert(!gmailConfigured(), 'not configured without env');
try { await listEmails(); assert(false, 'should throw'); } catch (e) { assert(/nicht eingerichtet/.test(e.message), 'clear message when Gmail is not set up'); }
