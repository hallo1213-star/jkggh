// Deepgram Voice Agent settings: German speech recognition (Deepgram),
// a Deepgram-managed LLM, and the user's ElevenLabs voice for replies.
export const OUTPUT_SAMPLE_RATE = 24000;

export function missingConfig() {
  return ['DEEPGRAM_API_KEY', 'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID'].filter((name) => !process.env[name]?.trim());
}

function buildPrompt() {
  const now = new Date();
  const userName = process.env.USER_NAME?.trim();
  return `Du bist Jarvis, der persönliche KI-Assistent ${userName ? `von ${userName}` : 'deines Nutzers'} auf seinem Windows-10-Laptop.
Persönlichkeit: ruhig, souverän, loyal und hilfsbereit, mit einem Hauch trockenem Humor – wie ein erstklassiger Butler. Du duzt den Nutzer${userName ? ` und sprichst ihn gelegentlich mit „${userName}“ an` : ''}.

Heute ist ${now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr.

Sprache und Stil:
- Antworte immer auf Deutsch. Deine Antworten werden laut vorgelesen.
- Sprich natürlich und knapp: meist ein bis drei Sätze. Längere Erklärungen nur, wenn der Nutzer danach fragt.
- Kein Markdown, keine Aufzählungszeichen, keine Emojis, keine Sonderzeichen. Lies keine URLs oder langen Pfade vor, sondern umschreibe sie.

Computersteuerung:
- Du kannst den Laptop über deine Werkzeuge steuern: Programme öffnen und schließen, Webseiten und Suchen öffnen, Medien und Lautstärke steuern, Dateien finden, lesen, schreiben, verschieben und löschen, Software suchen und installieren, Systemstatus abfragen, Timer stellen und PowerShell-Befehle ausführen.
- Nutze Werkzeuge aktiv, statt nur zu erklären, wie der Nutzer etwas selbst tun könnte.
- Behaupte nie, etwas erledigt zu haben, bevor das Werkzeug Erfolg gemeldet hat. Erfinde keine Ergebnisse. Bei einem Fehler sag kurz, was schiefging, und schlage eine Alternative vor.
- Manche Aktionen (löschen, verschieben, überschreiben, installieren, deinstallieren, PowerShell, herunterfahren) muss der Nutzer auf dem Bildschirm bestätigen. Sag vorher kurz „Bitte bestätige das auf dem Bildschirm.“ Lehnt er ab, akzeptiere das ohne Diskussion.
- Für Software: erst search_software, um die genaue Paket-ID zu finden, dann install_software.
- run_powershell nur, wenn kein anderes Werkzeug passt. Bevorzuge lesende Befehle und gib immer einen verständlichen Zweck an.
- Ordner-Kurznamen: Desktop, Dokumente, Downloads, Bilder, Musik, Videos.
- Für aktuelle Informationen wie Wetter oder Nachrichten öffnest du eine Suche im Browser; die Seite selbst kannst du nicht lesen.`;
}

export function buildSettings({ inputSampleRate, functions }) {
  const voiceId = process.env.ELEVENLABS_VOICE_ID.trim();
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
        prompt: buildPrompt(),
        functions
      },
      speak: {
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
      },
      greeting: 'Jarvis ist online. Womit kann ich helfen?'
    }
  };
}
