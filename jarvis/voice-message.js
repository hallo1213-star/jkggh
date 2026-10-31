// Spoken Telegram messages in Jarvis' built-in Deepgram voice (not ElevenLabs).
// Falls back to a plain text message if the voice cannot be generated.
import { DeepgramClient } from '@deepgram/sdk';
import { sendTelegram, sendTelegramVoice } from './telegram.js';

const DEFAULT_VOICE = 'aura-2-julius-de';
const MAX_SPOKEN_CHARS = 1800;

export function voiceMessagesEnabled() {
  return process.env.TELEGRAM_VOICE?.trim().toLowerCase() !== 'false';
}

export async function synthesize(text, { client } = {}) {
  const deepgram = client || new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY?.trim() });
  const audio = await deepgram.speak.v1.audio.generate({
    text: String(text).slice(0, MAX_SPOKEN_CHARS),
    model: process.env.DEEPGRAM_VOICE?.trim() || DEFAULT_VOICE,
    encoding: 'opus',
    container: 'ogg'
  });
  return new Uint8Array(await audio.arrayBuffer());
}

// `spoken` is what Jarvis says; `caption` is shown under the voice message.
export async function sendVoiceNote(spoken, caption = spoken, { client, fetchImpl, log = console } = {}) {
  try {
    const audio = await synthesize(spoken, { client });
    return await sendTelegramVoice(audio, caption, { fetchImpl });
  } catch (error) {
    log.warn(`Sprachnachricht nicht möglich (${error.message}) – sende Text.`);
    return { ...(await sendTelegram(caption, { fetchImpl })), sprachnachricht: false };
  }
}
