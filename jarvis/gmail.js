// Gmail access over IMAP (reading) and SMTP (sending) with a Google app
// password. Reading never changes anything in the mailbox (BODY.PEEK), and
// sending always goes through an on-screen confirmation in server.js.
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';

const TIMEOUT_MS = 25_000;
const MAX_BODY_CHARS = 6000;
const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;
const folderUse = { inbox: null, all: '\\All', sent: '\\Sent' };

export function gmailConfigured() {
  return Boolean(process.env.GMAIL_ADDRESS?.trim() && process.env.GMAIL_APP_PASSWORD?.trim());
}

function credentials() {
  if (!gmailConfigured()) {
    throw new Error('Gmail ist noch nicht eingerichtet. Bei Render unter Environment müssen GMAIL_ADDRESS und GMAIL_APP_PASSWORD eingetragen werden (siehe README).');
  }
  // Google shows app passwords in groups of four ("abcd efgh ijkl mnop").
  return { user: process.env.GMAIL_ADDRESS.trim(), pass: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, '') };
}

function withTimeout(promise, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} hat zu lange gedauert.`)), TIMEOUT_MS);
    })
  ]).finally(() => clearTimeout(timer));
}

function friendlyError(error) {
  const text = String(error?.responseText || error?.message || error);
  if (/AUTHENTICATIONFAILED|Invalid credentials|Username and Password not accepted|535/i.test(text)) {
    return new Error('Gmail hat die Anmeldung abgelehnt. Bitte GMAIL_ADDRESS und das App-Passwort bei Render prüfen.');
  }
  return error instanceof Error ? error : new Error(text);
}

// Opens a short-lived IMAP connection, runs `work` inside the mailbox, then logs out.
async function withMailbox(folder, work) {
  const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: credentials(), logger: false });
  try {
    await withTimeout(client.connect(), 'Die Verbindung zu Gmail');
    let path = 'INBOX';
    const use = folderUse[folder];
    if (use) {
      const boxes = await client.list();
      path = boxes.find((box) => box.specialUse === use)?.path;
      if (!path) throw new Error('Diesen Gmail-Ordner habe ich nicht gefunden.');
    }
    const lock = await client.getMailboxLock(path);
    try {
      return await withTimeout(work(client), 'Gmail');
    } finally {
      lock.release();
    }
  } catch (error) {
    throw friendlyError(error);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

function formatAddress(address) {
  if (!address) return '';
  return address.name ? `${address.name} <${address.address}>` : address.address || '';
}

function makeId(folder, uid) {
  return `${folder}:${uid}`;
}

function parseId(id) {
  const match = /^(inbox|all|sent):(\d+)$/.exec(String(id ?? ''));
  if (!match) throw new Error('Unbekannte E-Mail-ID. Bitte zuerst die E-Mails auflisten.');
  return { folder: match[1], uid: Number(match[2]) };
}

export async function listEmails({ folder = 'inbox', unreadOnly = false, query = '', limit = 8 } = {}) {
  const box = folderUse[folder] !== undefined ? folder : 'inbox';
  const count = Math.min(Math.max(Number(limit) || 8, 1), 15);
  return withMailbox(box, async (client) => {
    const search = {};
    if (unreadOnly) search.seen = false;
    if (String(query).trim()) search.gmraw = String(query).trim().slice(0, 200);
    if (!Object.keys(search).length) search.all = true;
    const uids = (await client.search(search, { uid: true })) || [];
    const newest = uids.slice(-count);
    const emails = [];
    if (newest.length) {
      for await (const message of client.fetch(newest, { envelope: true, flags: true, internalDate: true }, { uid: true })) {
        emails.push({
          id: makeId(box, message.uid),
          von: formatAddress(message.envelope?.from?.[0]),
          betreff: message.envelope?.subject || '(kein Betreff)',
          datum: (message.internalDate || message.envelope?.date)?.toISOString?.(),
          ungelesen: !message.flags?.has('\\Seen')
        });
      }
    }
    emails.sort((a, b) => String(b.datum).localeCompare(String(a.datum)));
    return { ordner: box, treffer: uids.length, angezeigt: emails.length, emails };
  });
}

export async function parseMessage(source) {
  const mail = await simpleParser(source);
  const text = (mail.text || '').replace(/\n{3,}/g, '\n\n').trim();
  return {
    von: formatAddress(mail.from?.value?.[0]) || mail.from?.text || '',
    an: mail.to?.text || '',
    betreff: mail.subject || '(kein Betreff)',
    datum: mail.date?.toISOString(),
    messageId: mail.messageId,
    references: [].concat(mail.references || []),
    anhaenge: mail.attachments.map((a) => a.filename).filter(Boolean),
    text: text.length > MAX_BODY_CHARS ? `${text.slice(0, MAX_BODY_CHARS)}\n… (gekürzt)` : text
  };
}

export async function readEmail({ id }) {
  const { folder, uid } = parseId(id);
  return withMailbox(folder, async (client) => {
    const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
    if (!message?.source) throw new Error('Diese E-Mail gibt es nicht mehr.');
    const { messageId, references, ...mail } = await parseMessage(message.source);
    return { id, ...mail };
  });
}

// Returns In-Reply-To/References/Subject for a reply, so Gmail threads it.
async function replyHeaders(id) {
  const { folder, uid } = parseId(id);
  return withMailbox(folder, async (client) => {
    const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
    if (!message?.source) throw new Error('Die E-Mail, auf die geantwortet werden soll, gibt es nicht mehr.');
    const original = await parseMessage(message.source);
    return {
      inReplyTo: original.messageId,
      references: [...original.references, original.messageId].filter(Boolean),
      subject: /^re:/i.test(original.betreff) ? original.betreff : `Re: ${original.betreff}`
    };
  });
}

export function normalizeRecipients(to) {
  const list = (Array.isArray(to) ? to : String(to ?? '').split(/[,;]/)).map((value) => String(value).trim()).filter(Boolean);
  if (!list.length) throw new Error('Kein Empfänger angegeben.');
  if (list.length > 5) throw new Error('Höchstens 5 Empfänger auf einmal.');
  const invalid = list.filter((address) => !EMAIL.test(address));
  if (invalid.length) throw new Error(`Ungültige E-Mail-Adresse: ${invalid.join(', ')}`);
  return list;
}

// Text for the on-screen confirmation: exactly what will be sent.
export async function describeEmail({ to, subject, body, replyToId }) {
  const recipients = normalizeRecipients(to);
  const shownSubject = subject || (replyToId ? (await replyHeaders(replyToId)).subject : '(kein Betreff)');
  return {
    title: replyToId ? 'Antwort senden?' : 'E-Mail senden?',
    detail: `An: ${recipients.join(', ')}\nBetreff: ${String(shownSubject).slice(0, 200)}\n\n${String(body ?? '').slice(0, 3000)}`
  };
}

// `html` is an optional formatted version of the same text (e.g. with a button link).
export async function sendEmail({ to, subject, body, replyToId, html }) {
  const recipients = normalizeRecipients(to);
  const text = String(body ?? '').trim();
  if (!text) throw new Error('Die E-Mail hat keinen Text.');
  const auth = credentials();
  const reply = replyToId ? await replyHeaders(replyToId) : null;
  const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth });
  const name = process.env.USER_NAME?.trim();
  try {
    const info = await withTimeout(transport.sendMail({
      from: name ? { name, address: auth.user } : auth.user,
      to: recipients,
      subject: String(subject || reply?.subject || '(kein Betreff)').slice(0, 200),
      text: text.slice(0, 20000),
      ...(html ? { html } : {}),
      ...(reply?.inReplyTo ? { inReplyTo: reply.inReplyTo, references: reply.references } : {})
    }), 'Das Senden');
    return { gesendet: true, an: recipients, messageId: info.messageId };
  } catch (error) {
    throw friendlyError(error);
  } finally {
    transport.close();
  }
}
