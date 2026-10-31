// Looks at one camera photo with Google Gemini (free tier with a Google AI
// Studio key in GEMINI_API_KEY). The photo is only sent for this one answer
// and never stored by Jarvis.
const API = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 30_000;
// Model names change over time; if one is unknown, the next one is tried.
const FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash'];
const MAX_IMAGE_BASE64 = 2_000_000;

export function visionConfigured() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function models() {
  return [...new Set([process.env.GEMINI_MODEL?.trim(), ...FALLBACK_MODELS].filter(Boolean))];
}

const INSTRUCTIONS = `Du bist Jarvis, ein freundlicher persönlicher Assistent, und siehst gerade ein Foto, das der Nutzer mit seiner Handykamera für dich gemacht hat.
Antworte auf Deutsch in zwei bis vier natürlichen, gesprochenen Sätzen (ohne Aufzählungen, Markdown oder Emojis), direkt an ihn gerichtet.
Beschreibe ehrlich, was du siehst. Wenn er nach deiner Meinung fragt (z. B. zu Frisur oder Outfit), sei ehrlich, freundlich und konkret, nenne Positives und höchstens einen netten Tipp.
Erkenne oder benenne keine Personen anhand ihres Gesichts, und äußere dich nicht zu Gewicht, Alter, Herkunft oder Gesundheit.
Wenn auf dem Bild etwas schwer zu erkennen ist, sag das.`;

export async function describeImage({ imageBase64, question }, { fetchImpl = fetch } = {}) {
  if (!visionConfigured()) throw new Error('Die Kamera-Funktion ist noch nicht eingerichtet. Bei Render muss GEMINI_API_KEY eingetragen werden (siehe README).');
  const data = String(imageBase64 ?? '');
  if (!data || data.length > MAX_IMAGE_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(data)) throw new Error('Das Foto ist ungültig oder zu groß.');
  const body = {
    contents: [{
      role: 'user',
      parts: [
        { text: `${INSTRUCTIONS}\n\nFrage des Nutzers: ${String(question || 'Was siehst du?').slice(0, 300)}` },
        { inline_data: { mime_type: 'image/jpeg', data } }
      ]
    }],
    generationConfig: { temperature: 0.6, maxOutputTokens: 400 }
  };
  let lastError;
  for (const model of models()) {
    const response = await fetchImpl(`${API}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY.trim() },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 404) {
      lastError = new Error(`Das Gemini-Modell „${model}“ gibt es nicht (mehr).`);
      continue;
    }
    if (!response.ok) {
      const message = result.error?.message || `Status ${response.status}`;
      if (response.status === 400 && /api key/i.test(message)) throw new Error('Google lehnt den Gemini-Schlüssel ab. Bitte GEMINI_API_KEY bei Render prüfen.');
      if (response.status === 403) throw new Error('Der Gemini-Schlüssel hat keinen Zugriff. Bitte in Google AI Studio einen neuen Schlüssel erstellen.');
      if (response.status === 429) throw new Error('Das kostenlose Tageslimit der Bild-KI ist erreicht. Morgen geht es wieder.');
      throw new Error(`Die Bild-KI meldet einen Fehler: ${message}`);
    }
    if (result.promptFeedback?.blockReason || result.candidates?.[0]?.finishReason === 'SAFETY') {
      return { antwort: 'Dazu möchte die Bild-KI leider nichts sagen.', modell: model };
    }
    const text = (result.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join(' ').replace(/\s+/g, ' ').trim();
    if (!text) throw new Error('Die Bild-KI hat keine Antwort geliefert.');
    return { antwort: text.slice(0, 1200), modell: model };
  }
  throw new Error(`${lastError?.message || 'Kein Gemini-Modell erreichbar.'} Trag bei Render unter GEMINI_MODEL ein aktuelles Modell ein (z. B. aus Google AI Studio).`);
}
