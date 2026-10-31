// Real phone calls by Jarvis: Twilio dials the restaurant and streams the call
// audio (8 kHz µ-law) over a WebSocket to this server, which bridges it to a
// second Deepgram Voice Agent that places the order. Jarvis always says that
// it is an AI assistant calling on behalf of the user.
// Setup (see README): TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER.
import { randomBytes } from 'node:crypto';
import { DeepgramClient } from '@deepgram/sdk';
import { describeItem, spokenPhone } from './restaurants.js';

const MAX_CALL_SECONDS = 420;
const calls = new Map(); // token → call
let activeCall = null;

export function twilioConfigured() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_AUTH_TOKEN?.trim() && process.env.TWILIO_PHONE_NUMBER?.trim());
}

function twilioAuth() {
  return `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID.trim()}:${process.env.TWILIO_AUTH_TOKEN.trim()}`).toString('base64')}`;
}

async function twilio(path, params, fetchImpl) {
  const response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(process.env.TWILIO_ACCOUNT_SID.trim())}${path}`, {
    method: 'POST',
    headers: { authorization: twilioAuth(), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(15_000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const hints = { 20003: 'TWILIO_ACCOUNT_SID oder TWILIO_AUTH_TOKEN stimmt nicht.', 21219: 'Mit einem Twilio-Testkonto darfst du nur verifizierte Nummern anrufen – Konto upgraden (Guthaben aufladen).', 21210: 'TWILIO_PHONE_NUMBER ist keine Twilio-Nummer und keine verifizierte Anrufer-ID.', 21215: 'Anrufe nach Deutschland sind in Twilio noch nicht freigeschaltet (Voice → Settings → Geo permissions → Germany).', 13227: 'Anrufe nach Deutschland sind in Twilio noch nicht freigeschaltet (Geo permissions).' };
    throw new Error(`Twilio: ${hints[data.code] || data.message || `HTTP ${response.status}`}`);
  }
  return data;
}

const xml = (value) => String(value).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

export function callPrompt(order, userName) {
  const who = userName || order.customerName;
  return `Du bist Jarvis, ein KI-Sprachassistent. Du telefonierst gerade mit ${order.restaurant.name}, um im Auftrag von ${who} eine Essensbestellung aufzugeben. Dein Gegenüber ist ein Mitarbeiter des Restaurants.

Die Bestellung (genau so, nichts anderes):
${order.items.map((item) => `- ${describeItem(item)}`).join('\n')}
${order.mode === 'lieferung' ? `Lieferung an: ${order.address}` : 'Zum Abholen.'}
Name für die Bestellung: ${order.customerName}
${order.callbackPhone ? `Rückrufnummer: ${spokenPhone(order.callbackPhone)}` : ''}
${order.payment ? `Bezahlung: ${order.payment}` : ''}
${order.time ? `Gewünschte Zeit: ${order.time}` : 'So bald wie möglich.'}
${order.notes ? `Hinweis: ${order.notes}` : ''}

So gehst du vor:
1. Sag gleich zu Beginn ehrlich, dass du ein KI-Assistent bist und für ${who} anrufst, um zu bestellen. Frag, ob das in Ordnung ist.
2. Nenne die Gerichte nacheinander, in normalem Sprechtempo, und warte auf Rückfragen. Sprich kurz und natürlich wie am Telefon, ein bis zwei Sätze auf einmal.
3. Nenne ${order.mode === 'lieferung' ? 'die Lieferadresse, ' : ''}den Namen${order.callbackPhone ? ' und auf Nachfrage die Rückrufnummer' : ''}.
4. Frag nach dem Gesamtpreis und wann das Essen ${order.mode === 'lieferung' ? 'geliefert wird' : 'abholbereit ist'}.
5. Fass die Bestellung zum Schluss kurz zusammen, bedanke dich, rufe bestellung_abschliessen auf und verabschiede dich; danach rufst du auflegen auf.

Regeln:
- Bestelle nur, was oben steht. Keine Zusatzprodukte, keine anderen Größen, keine Ersatzgerichte. Ist etwas nicht da oder fragt man dich etwas, das du nicht weißt (z. B. Ersatz, Extras), sag freundlich, dass du das nicht entscheiden darfst und dieser Teil dann weggelassen wird – oder biete an, dass ${who} zurückruft.
- Gib keine anderen persönlichen Daten heraus als die oben genannten. Keine Bank- oder Kartendaten.
- Möchte das Restaurant keine Bestellung von einer KI annehmen, entschuldige dich höflich, rufe bestellung_abschliessen mit status abgelehnt auf und lege auf.
- Hörst du eine Bandansage, Mailbox oder Warteschleifenmusik ohne Menschen, rufe bestellung_abschliessen mit status nicht_erreicht auf und lege auf.
- Sprich Preise und Uhrzeiten in Worten wie ein Mensch.`;
}

const callFunctions = [
  {
    name: 'bestellung_abschliessen',
    description: 'Meldet das Ergebnis des Anrufs an den Nutzer. Vor dem Verabschieden aufrufen.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['angenommen', 'teilweise', 'abgelehnt', 'nicht_erreicht', 'unklar'] },
        preis: { type: 'string', description: 'Gesamtpreis laut Restaurant, z. B. "34,50 €"' },
        fertig_um: { type: 'string', description: 'Wann geliefert/abholbereit, z. B. "in 40 Minuten" oder "19:15 Uhr"' },
        notiz: { type: 'string', description: 'Wichtiges, z. B. was fehlte oder geändert wurde' }
      },
      required: ['status']
    }
  },
  { name: 'auflegen', description: 'Beendet das Telefonat (erst nach der Verabschiedung).', parameters: { type: 'object', properties: {} } }
];

export function callSettings(order, userName) {
  return {
    type: 'Settings',
    audio: { input: { encoding: 'mulaw', sample_rate: 8000 }, output: { encoding: 'mulaw', sample_rate: 8000, container: 'none' } },
    agent: {
      listen: { provider: { type: 'deepgram', version: 'v1', model: process.env.LISTEN_MODEL?.trim() || 'nova-3', language: 'de', smart_format: true } },
      think: { provider: { type: 'open_ai', model: process.env.THINK_MODEL?.trim() || 'gpt-4o-mini' }, prompt: callPrompt(order, userName), functions: callFunctions },
      speak: { provider: { type: 'deepgram', version: 'v1', model: process.env.DEEPGRAM_VOICE?.trim() || 'aura-2-julius-de' } }
    }
  };
}

export function getActiveCall() {
  return activeCall ? { status: activeCall.status, restaurant: activeCall.order.restaurant.name, result: activeCall.result } : null;
}

// Starts the call. `onEvent` gets { event: 'status'|'transcript'|'result'|'ended', … }.
export async function startCall({ order, origin, userName, onEvent, fetchImpl = fetch }) {
  if (!twilioConfigured()) throw new Error('Für echte Anrufe fehlt Twilio: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN und TWILIO_PHONE_NUMBER bei Render eintragen (siehe README, Abschnitt Essen bestellen).');
  if (activeCall && !['beendet', 'fehlgeschlagen'].includes(activeCall.status)) throw new Error('Jarvis telefoniert gerade schon.');
  if (!/^https:\/\//.test(origin) && !process.env.ALLOW_HTTP_CALLBACKS) throw new Error('Anrufe gehen nur über die https-Adresse von Render.');
  const token = randomBytes(18).toString('hex');
  const call = { token, order, userName, onEvent, status: 'wählt', transcript: [], result: null, sid: null, startedAt: Date.now() };
  calls.set(token, call);
  activeCall = call;
  const wsUrl = `${origin.replace(/^http/, 'ws')}/twilio-stream`;
  const twiml = `<Response><Connect><Stream url="${xml(wsUrl)}"><Parameter name="token" value="${token}"/></Stream></Connect></Response>`;
  try {
    const data = await twilio('/Calls.json', {
      To: order.restaurant.phone,
      From: process.env.TWILIO_PHONE_NUMBER.trim(),
      Twiml: twiml,
      Timeout: '30',
      TimeLimit: String(MAX_CALL_SECONDS),
      StatusCallback: `${origin}/twilio/status?token=${token}`,
      StatusCallbackEvent: 'initiated ringing answered completed'
    }, fetchImpl);
    call.sid = data.sid;
  } catch (error) {
    call.status = 'fehlgeschlagen';
    calls.delete(token);
    throw error;
  }
  setStatus(call, 'wählt');
  // Safety net: forget the call after the maximum duration.
  setTimeout(() => finish(call, 'beendet'), (MAX_CALL_SECONDS + 60) * 1000).unref?.();
  return { sid: call.sid };
}

function setStatus(call, status) {
  call.status = status;
  call.onEvent({ event: 'status', status, restaurant: call.order.restaurant.name });
}

function finish(call, status) {
  if (!calls.has(call.token)) return;
  calls.delete(call.token);
  call.status = status;
  call.deepgram?.close?.();
  call.onEvent({ event: 'ended', status, result: call.result, restaurant: call.order.restaurant.name, transcript: call.transcript });
}

export async function hangup({ fetchImpl = fetch } = {}) {
  const call = activeCall;
  if (!call?.sid || !calls.has(call.token)) return false;
  await twilio(`/Calls/${encodeURIComponent(call.sid)}.json`, { Status: 'completed' }, fetchImpl).catch(() => {});
  return true;
}

// Twilio status callbacks (ringing, answered, busy, no-answer, completed …).
export function handleStatusCallback(token, params) {
  const call = calls.get(String(token || ''));
  if (!call) return false;
  const status = String(params.get('CallStatus') || '');
  const map = { initiated: 'wählt', ringing: 'klingelt', 'in-progress': 'verbunden', busy: 'besetzt', 'no-answer': 'niemand geht ran', failed: 'fehlgeschlagen', canceled: 'abgebrochen', completed: 'beendet' };
  if (['busy', 'no-answer', 'failed', 'canceled', 'completed'].includes(status)) {
    if (!call.result && status !== 'completed') call.result = { status: 'nicht_erreicht', notiz: map[status] };
    finish(call, map[status]);
  } else if (map[status]) setStatus(call, map[status]);
  return true;
}

// The media stream WebSocket from Twilio.
export function handleTwilioStream(ws, { client } = {}) {
  let call = null;
  let streamSid = null;
  let agent = null;
  let agentOpen = false;
  let heardSomeone = false;
  let hangupRequested = false;
  const keepAlive = setInterval(() => agentOpen && agent.sendKeepAlive?.({ type: 'KeepAlive' }), 5000);

  const toTwilio = (message) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(message));
  };

  async function onAgentMessage(message) {
    if (message instanceof Blob || Buffer.isBuffer(message) || message instanceof ArrayBuffer) {
      const audio = Buffer.isBuffer(message) ? message : Buffer.from(message instanceof Blob ? await message.arrayBuffer() : message);
      toTwilio({ event: 'media', streamSid, media: { payload: audio.toString('base64') } });
      return;
    }
    switch (message?.type) {
      case 'ConversationText':
        call.transcript.push({ role: message.role === 'assistant' ? 'Jarvis' : call.order.restaurant.name, text: message.content });
        call.onEvent({ event: 'transcript', role: message.role === 'assistant' ? 'jarvis' : 'restaurant', content: message.content });
        break;
      case 'UserStartedSpeaking':
        heardSomeone = true;
        toTwilio({ event: 'clear', streamSid }); // the restaurant interrupts: stop talking
        break;
      case 'AgentAudioDone':
        if (hangupRequested) setTimeout(() => hangup(), 1200);
        break;
      case 'FunctionCallRequest':
        for (const fn of message.functions || []) {
          let args = {};
          try {
            args = JSON.parse(fn.arguments || '{}');
          } catch {
            // ignore
          }
          if (fn.name === 'bestellung_abschliessen') {
            call.result = { status: String(args.status || 'unklar'), preis: String(args.preis || '').slice(0, 40), fertigUm: String(args.fertig_um || '').slice(0, 60), notiz: String(args.notiz || '').slice(0, 300) };
            call.onEvent({ event: 'result', result: call.result, restaurant: call.order.restaurant.name });
          } else if (fn.name === 'auflegen') {
            hangupRequested = true;
            setTimeout(() => hangup(), 6000); // in case no audio follows
          }
          agent.sendFunctionCallResponse({ type: 'FunctionCallResponse', id: fn.id, name: fn.name, content: JSON.stringify({ ok: true }) });
        }
        break;
      case 'Error':
        console.error(`Anruf – Deepgram-Fehler ${message.code}: ${message.description}`);
        break;
      default:
        break;
    }
  }

  async function connectAgent() {
    const deepgram = client || new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY?.trim() });
    agent = await deepgram.agent.v1.connect({ reconnectAttempts: 0 });
    call.deepgram = agent;
    agent.on('open', () => {
      agentOpen = true;
      agent.sendSettings(callSettings(call.order, call.userName));
      // Usually the restaurant answers first ("Pizzeria …, hallo?"). If nobody
      // says anything, Jarvis starts after a few seconds.
      setTimeout(() => {
        if (!heardSomeone && agentOpen) agent.sendInjectAgentMessage({ type: 'InjectAgentMessage', message: `Hallo, guten Tag! Hier ist Jarvis, ein KI-Assistent. Ich rufe für ${call.userName || call.order.customerName} an und würde gern etwas ${call.order.mode === 'lieferung' ? 'zum Liefern' : 'zum Abholen'} bestellen. Ist das in Ordnung?` });
      }, 4000);
    });
    let queue = Promise.resolve();
    agent.on('message', (message) => {
      queue = queue.then(() => onAgentMessage(message)).catch((error) => console.error(`Anruf: ${error.message}`));
    });
    agent.on('close', () => {
      agentOpen = false;
    });
    agent.on('error', (error) => console.error(`Anruf – Deepgram: ${error.message}`));
    agent.connect();
  }

  ws.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (message.event === 'start') {
      call = calls.get(String(message.start?.customParameters?.token || ''));
      if (!call) {
        ws.close();
        return;
      }
      streamSid = message.start.streamSid;
      setStatus(call, 'verbunden');
      connectAgent().catch((error) => {
        console.error(`Anruf: ${error.message}`);
        hangup();
      });
    } else if (message.event === 'media' && agentOpen) {
      agent.sendMedia(Buffer.from(message.media.payload, 'base64'));
    } else if (message.event === 'stop') {
      ws.close();
    }
  });
  ws.on('close', () => {
    clearInterval(keepAlive);
    agent?.close?.();
    if (call) finish(call, 'beendet');
  });
}

// Test mode ("Test: bestelle mir Pizza bei …"): the same flow, but nobody is
// called. A simulated restaurant answers, so the user sees the live window,
// the transcript and the result exactly like in a real call.
export function simulateCall({ order, userName, onEvent, speed = 1 }) {
  if (activeCall && !['beendet', 'fehlgeschlagen'].includes(activeCall.status)) throw new Error('Jarvis telefoniert gerade schon.');
  const who = userName || order.customerName;
  const restaurant = order.restaurant.name;
  const items = order.items.map((item) => describeItem(item).replace(/ – für .*$/, '')).join(', ');
  const total = order.total !== null && order.total !== undefined ? order.total : 8.5 * order.items.reduce((sum, item) => sum + item.quantity, 0);
  const price = `${total.toFixed(2).replace('.', ',')} €`;
  const eta = order.mode === 'lieferung' ? 'in etwa 40 Minuten' : 'in etwa 20 Minuten';
  const call = { token: `test-${Date.now()}`, order, status: 'wählt', result: null, test: true };
  activeCall = call;
  const say = (role, content) => ({ event: 'transcript', role, content, test: true, restaurant });
  const steps = [
    { event: 'status', status: 'wählt (Test)' },
    { event: 'status', status: 'klingelt (Test)' },
    { event: 'status', status: 'verbunden (Test)' },
    say('restaurant', `${restaurant}, hallo?`),
    say('jarvis', `Hallo, guten Tag! Hier ist Jarvis, ein KI-Assistent. Ich rufe für ${who} an und würde gern etwas ${order.mode === 'lieferung' ? 'zum Liefern' : 'zum Abholen'} bestellen. Ist das in Ordnung?`),
    say('restaurant', 'Ja klar, was darf es sein?'),
    say('jarvis', `Gerne: ${items}.`),
    say('restaurant', order.mode === 'lieferung' ? 'Alles klar. Und wohin soll es gehen?' : 'Gut. Auf welchen Namen?'),
    say('jarvis', order.mode === 'lieferung' ? `Nach ${order.address}, auf den Namen ${order.customerName}.${order.callbackPhone ? ` Rückrufnummer ${spokenPhone(order.callbackPhone)}.` : ''}` : `Auf den Namen ${order.customerName}.`),
    say('restaurant', `Okay, das macht dann ${price} und ist ${eta} ${order.mode === 'lieferung' ? 'bei Ihnen' : 'fertig'}.`),
    say('jarvis', `Super. Also noch mal kurz: ${items}, für ${price}, ${eta}. Vielen Dank und einen schönen Tag!`),
    { event: 'result', result: { status: 'angenommen', preis: price, fertigUm: eta, notiz: 'TEST – es wurde niemand angerufen.' } },
    say('restaurant', 'Danke, tschüss!')
  ];
  steps.forEach((step, index) => {
    setTimeout(() => {
      if (step.event === 'status') call.status = step.status;
      if (step.event === 'result') call.result = step.result;
      onEvent({ ...step, test: true, restaurant });
      if (index === steps.length - 1) {
        setTimeout(() => {
          call.status = 'beendet';
          onEvent({ event: 'ended', status: 'beendet', result: call.result, restaurant, test: true });
        }, 900 / speed);
      }
    }, (600 + index * 1700) / speed);
  });
  return { test: true };
}
