# J.A.R.V.I.S. – dein persönlicher Sprachassistent

Jarvis hört dir über dein Mikrofon zu, versteht Deutsch, antwortet mit der ElevenLabs-Stimme **Robert Ranger – Cool Storyteller** und steuert deinen Windows-Laptop: Programme öffnen, Dateien verwalten, Software installieren, Lautstärke regeln und vieles mehr. Wichtige Aktionen führt er erst aus, nachdem du sie auf dem Bildschirm bestätigt hast.

## So funktioniert es

```
Mikrofon (Browser) ──► lokaler Jarvis-Server (Node.js, nur auf deinem Laptop)
                         │   ├─ hält deine API-Schlüssel
                         │   └─ führt Computer-Aktionen aus (tools.js)
                         ▼
                 Deepgram Voice Agent
                 ├─ Spracherkennung Deutsch (nova-3)
                 ├─ KI-Antworten + Funktionsaufrufe (von Deepgram betriebenes LLM)
                 └─ Stimme: ElevenLabs (Robert Ranger)
```

Deepgram steuert das ganze Gespräch – Zuhören, Denken, Sprechen und Unterbrechen. Wenn Jarvis etwas am Computer tun soll, ruft die KI eine Funktion auf, und der lokale Server führt sie auf deinem Laptop aus. Einen eigenen OpenAI- oder Anthropic-Schlüssel brauchst du nicht.

## Voraussetzungen

- Windows 10 (oder 11) mit Chrome oder Edge
- **Node.js 20.12 oder neuer** – die LTS-Version von https://nodejs.org
- **Deepgram API Key** – https://console.deepgram.com → API Keys
- **ElevenLabs-Konto mit API Key** – https://elevenlabs.io → Profil → API Keys. Für die Nutzung von Stimmen aus der Voice Library über die API kann ein kostenpflichtiger ElevenLabs-Plan nötig sein; prüfe das in deinem Konto.
- Internetverbindung (Spracherkennung, KI und Stimme laufen online)

## Voice-ID finden

1. Öffne in ElevenLabs die **Voice Library** und suche „Robert Ranger – Cool Storyteller“.
2. Füge die Stimme zu **My Voices** hinzu (nur eigene/hinzugefügte Stimmen funktionieren über die API).
3. Öffne die Stimme unter **My Voices** und kopiere die **Voice ID** (eine Zeichenkette wie `AbC123xYz…`).

## Einrichtung

1. Lade diesen `jarvis`-Ordner auf deinen Laptop (z. B. nach `C:\Jarvis`).
2. Doppelklicke **`Jarvis-starten.bat`**.
   - Beim ersten Start wird die Datei `.env` angelegt und im Editor geöffnet.
   - Trage `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY` und `ELEVENLABS_VOICE_ID` ein, speichere und schließe den Editor.
   - Danach installiert das Skript die Abhängigkeiten und startet Jarvis.
3. Der Browser öffnet `http://localhost:3000`. Klicke **Jarvis aktivieren** und erlaube den Mikrofonzugriff.
4. Jarvis begrüßt dich – sprich einfach los.

Alternativ im Terminal: `npm install` und danach `npm start`.

## Was Jarvis kann

| Bereich | Beispiele |
|---|---|
| Programme | „Öffne Spotify“, „Starte Word“, „Schließ Chrome“ |
| Web | „Öffne YouTube“, „Such nach dem Wetter in Berlin“, „Zeig mir Pizzerien in der Nähe auf Maps“ |
| Medien | „Nächstes Lied“, „Pause“, „Lauter“, „Stell die Lautstärke auf 30 Prozent“ |
| Dateien | „Was liegt in meinen Downloads?“, „Finde meine Bewerbung“, „Lies mir die Notiz vor“, „Erstelle eine Einkaufsliste auf dem Desktop“ |
| Aufräumen* | „Lösche die Datei test.txt in Downloads“, „Verschiebe den Ordner …“ |
| Software* | „Installiere VLC“, „Deinstalliere …“ (über den Windows-Paketmanager winget) |
| System | „Wie voll ist mein Akku?“, „Sperr den Bildschirm“, „Fahr den Laptop herunter“* |
| Alltag | „Stell einen Timer auf 10 Minuten“, „Kopier mir den Text in die Zwischenablage“ |
| Alles andere* | Jarvis kann einen PowerShell-Befehl vorschlagen – du siehst ihn und entscheidest |

\* = erfordert deine Bestätigung auf dem Bildschirm.

Du kannst Jarvis auch schreiben: Das Textfeld unten rechts funktioniert wie Sprechen.

## Sicherheit

- **Bestätigung bei wichtigen Aktionen:** Löschen, Verschieben, Überschreiben, Installieren, Deinstallieren, Herunterfahren/Neustart, Energiesparmodus, das Öffnen von Programmdateien (.exe, .bat …) und jeder PowerShell-Befehl erscheinen als Dialog mit „Ausführen“ / „Abbrechen“. Ohne Antwort innerhalb von 90 Sekunden wird abgebrochen. Eine Bestätigung per Sprache gibt es bewusst nicht – so kann z. B. ein Video im Hintergrund nichts freigeben.
- **Löschen = Papierkorb:** Dateien werden nie endgültig gelöscht, sondern in den Papierkorb verschoben.
- **Geschützte Ordner:** Laufwerkswurzeln, dein Benutzerordner, Desktop/Dokumente/Downloads selbst sowie Windows- und Programmordner werden nie verschoben oder gelöscht.
- **Nur lokal erreichbar:** Der Server lauscht ausschließlich auf `127.0.0.1` und akzeptiert nur Verbindungen von seiner eigenen Oberfläche. Andere Geräte im WLAN oder fremde Webseiten können Jarvis nicht steuern.
- **Schlüssel bleiben geheim:** Die `.env` liegt nur auf deinem Laptop, wird nie an den Browser geschickt und ist per `.gitignore` vom Hochladen ausgeschlossen.
- Wenn du die Seite schließt, wird die Deepgram-Sitzung sofort beendet.

## Anpassen

- **Persönlichkeit und Regeln:** `agent-config.js` → `buildPrompt()`
- **Wie Jarvis dich nennt:** `USER_NAME=Max` in der `.env`
- **Neue Fähigkeiten:** in `tools.js` ein Objekt zur Liste `tools` hinzufügen (`name`, `description`, `parameters`, `label`, `run`, optional `confirm`). Jarvis kennt es beim nächsten Start automatisch.
- **Modelle:** `LISTEN_MODEL`, `THINK_MODEL`, `ELEVENLABS_MODEL` in der `.env`. Standard: `nova-3`, `gpt-4o-mini`, `eleven_turbo_v2_5`. Für noch natürlichere, aber etwas langsamere Sprache kannst du `eleven_multilingual_v2` probieren.

## Fehlerbehebung

| Problem | Lösung |
|---|---|
| „In der Datei .env fehlt …“ | Schlüssel in `.env` eintragen, Jarvis neu starten. |
| Fehler mit „401“ / „unauthorized“ | Deepgram-Schlüssel prüfen (ohne Leerzeichen, nicht abgelaufen). |
| Jarvis antwortet als Text, aber man hört nichts | ElevenLabs-Schlüssel und Voice-ID prüfen; ist die Stimme unter **My Voices**? Erlaubt dein ElevenLabs-Plan API-Zugriff auf diese Stimme? Der Fehler steht im Terminal. |
| Jarvis unterbricht sich selbst | Kopfhörer verwenden oder links „Mikro stumm, während Jarvis spricht“ einschalten. |
| Jarvis hört nichts | Mikrofonfreigabe im Browser (Schloss-Symbol) und Windows-Einstellungen → Datenschutz → Mikrofon prüfen. |
| „Programm nicht gefunden“ | Den Namen so sagen, wie er im Startmenü steht. |
| Installation hängt | Manche Installer fragen nach Administratorrechten – bestätige das Windows-Fenster. |
| Port 3000 belegt | In der `.env` z. B. `PORT=3001` setzen. |

Bei Fehlern von Deepgram steht im Terminal eine Zeile `Deepgram-Sitzung: <request_id>` – die ID hilft beim Support.

## Technische Notizen

- Deepgram Voice Agent über das offizielle SDK `@deepgram/sdk` v5 (`client.agent.v1.connect()`, `sendSettings`, `sendMedia`, `sendFunctionCallResponse`).
- Audio: Mikrofon als linear16 in der Abtastrate deines Browsers; Jarvis' Stimme als linear16 mit 24 kHz.
- Irreversible Funktionen sind mit `defer_until_eot` markiert: Der Agent ruft sie erst auf, wenn dein Satz wirklich zu Ende ist.
- Doku: https://developers.deepgram.com
