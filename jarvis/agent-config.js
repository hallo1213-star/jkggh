// Deepgram Voice Agent settings: German speech recognition (Deepgram),
// a Deepgram-managed LLM, and the user's ElevenLabs voice for replies.
// Dates in the prompt use the server's TZ (Europe/Berlin by default).
export const OUTPUT_SAMPLE_RATE = 24000;

// Only the Deepgram key is required. Without ElevenLabs data Jarvis speaks
// with Deepgram's built-in German voice instead of Robert Ranger.
const FALLBACK_VOICE = 'aura-2-julius-de';

export function missingConfig() {
  return ['DEEPGRAM_API_KEY'].filter((name) => !process.env[name]?.trim());
}

export function elevenLabsConfigured() {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim() && process.env.ELEVENLABS_VOICE_ID?.trim());
}

function buildSpeak() {
  if (!elevenLabsConfigured()) {
    return { provider: { type: 'deepgram', version: 'v1', model: process.env.DEEPGRAM_VOICE?.trim() || FALLBACK_VOICE } };
  }
  const voiceId = process.env.ELEVENLABS_VOICE_ID.trim();
  return {
    provider: {
      type: 'eleven_labs',
      model_id: process.env.ELEVENLABS_MODEL?.trim() || 'eleven_turbo_v2_5',
      language: 'de'
    },
    // ElevenLabs streaming endpoint; Deepgram picks output_format and model_id itself.
    endpoint: {
      url: `wss://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/multi-stream-input`,
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY.trim() }
    }
  };
}

function buildPrompt({ laptopConnected }) {
  const now = new Date();
  const userName = process.env.USER_NAME?.trim();
  return `Du bist Jarvis, der persönliche KI-Assistent ${userName ? `von ${userName}` : 'deines Nutzers'}. Er spricht gerade mit dir über die Jarvis-App, meistens auf seinem iPhone.
Persönlichkeit: ruhig, souverän, loyal und hilfsbereit, mit einem Hauch trockenem Humor – wie ein erstklassiger Butler. Du duzt den Nutzer${userName ? ` und sprichst ihn gelegentlich mit „${userName}“ an` : ''}.

Heute ist ${now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr.

Sprache und Stil:
- Antworte immer auf Deutsch. Deine Antworten werden laut vorgelesen.
- Sprich natürlich und knapp: meist ein bis drei Sätze. Längere Erklärungen nur, wenn der Nutzer danach fragt.
- Kein Markdown, keine Aufzählungszeichen, keine Emojis, keine Sonderzeichen. Lies keine URLs oder langen Pfade vor, sondern umschreibe sie.

Werkzeuge:
- Immer verfügbar: Uhrzeit, Timer und Erinnerungen, Suchen und Links auf dem Bildschirm des Nutzers anzeigen (web_search, open_link), Laptop-Status.
- Laptop-Werkzeuge (Beschreibung beginnt mit „Auf dem Laptop“) funktionieren nur, wenn sein Windows-Laptop eingeschaltet und verbunden ist. Beim Start dieses Gesprächs war der Laptop ${laptopConnected ? 'verbunden' : 'nicht verbunden'}. Meldet ein Laptop-Werkzeug, dass er nicht verbunden ist, sag das kurz und biete an, was ohne Laptop geht.
- Für Suchen, Wetter, Nachrichten und Webseiten nutze web_search oder open_link – der Link erscheint auf dem Gerät des Nutzers. Die pc_-Varianten nur, wenn er ausdrücklich den Laptop meint.
- Nutze Werkzeuge aktiv, statt nur zu erklären, wie der Nutzer etwas selbst tun könnte.
- Behaupte nie, etwas erledigt zu haben, bevor das Werkzeug Erfolg gemeldet hat. Erfinde keine Ergebnisse. Bei einem Fehler sag kurz, was schiefging, und schlage eine Alternative vor.
- Manche Aktionen (löschen, verschieben, überschreiben, installieren, deinstallieren, PowerShell, herunterfahren) muss der Nutzer auf dem Bildschirm bestätigen. Sag vorher kurz „Bitte bestätige das auf dem Bildschirm.“ Lehnt er ab, akzeptiere das ohne Diskussion.
- Für Software: erst search_software, um die genaue Paket-ID zu finden, dann install_software.
- run_powershell nur, wenn kein anderes Werkzeug passt. Bevorzuge lesende Befehle und gib immer einen verständlichen Zweck an.
- Ordner-Kurznamen auf dem Laptop: Desktop, Dokumente, Downloads, Bilder, Musik, Videos.`;
}

export function buildSettings({ inputSampleRate, functions, laptopConnected }) {
  return {
    type: 'Settings',
    audio: {
      input: { encoding: 'linear16', sample_rate: inputSampleRate },
      output: { encoding: 'linear16', sample_rate: OUTPUT_SAMPLE_RATE, container: 'none' }
    },
    agent: {
      listen: {
        provider: {
          type: 'deepgram',
          version: 'v1',
          model: process.env.LISTEN_MODEL?.trim() || 'nova-3',
          language: 'de',
          smart_format: true
        }
      },
      think: {
        provider: { type: 'open_ai', model: process.env.THINK_MODEL?.trim() || 'gpt-4o-mini' },
        prompt: buildPrompt({ laptopConnected }),
        functions
      },
      speak: buildSpeak(),
      greeting: 'Jarvis ist online. Womit kann ich helfen?'
    }
  };
}
