# J.A.R.V.I.S. – dein persönlicher Sprachassistent

Jarvis läuft in der Cloud und ist als App auf deinem **iPhone** nutzbar – zu Hause und unterwegs, **auch wenn dein Laptop aus ist**. Er versteht Deutsch, antwortet mit der ElevenLabs-Stimme **Robert Ranger – Cool Storyteller** und kann – sobald dein Laptop an ist – auch deinen Windows-Laptop steuern. Wichtige Aktionen führt er erst aus, nachdem du sie auf dem Bildschirm bestätigt hast.

## So funktioniert es

```
iPhone / Browser ──► Jarvis in der Cloud (Render)  ◄── Laptop-Verbinder (nur wenn der Laptop an ist)
   (Login)            ├─ hält deine API-Schlüssel          └─ führt PC-Aktionen aus
                      ├─ Uhrzeit, Timer, Suchen, Links
                      ▼
              Deepgram Voice Agent
              ├─ Spracherkennung Deutsch (nova-3)
              ├─ KI-Antworten + Funktionsaufrufe
              └─ Stimme: ElevenLabs (Robert Ranger)
```

- **Immer verfügbar:** Gespräch, Uhrzeit, Timer/Erinnerungen, Websuchen und Links (erscheinen zum Antippen in der App).
- **Nur wenn der Laptop an ist:** Programme, Dateien, Lautstärke, Software installieren, PowerShell usw. Der Laptop verbindet sich von selbst nach außen zu Jarvis – am Router musst du nichts einstellen.

## Was du brauchst (alles kostenlos, außer der Nutzung bei Deepgram/ElevenLabs nach deinem Tarif)

- **GitHub-Konto** mit einem neuen Repository, z. B. `jarvis` (darf privat sein)
- **Render-Konto** (https://render.com) – dein Konto vom Spiel reicht
- **Deepgram API Key** und **ElevenLabs API Key + Voice-ID** (wie bisher)
- Für die Laptop-Steuerung: **Node.js 20.12 oder neuer** auf dem Laptop (https://nodejs.org, LTS)

## Einrichtung

### 1. Code zu GitHub hochladen

1. Lege auf GitHub ein neues Repository `jarvis` an.
2. Lade den **Inhalt** dieses Ordners hoch (`server.js`, `render.yaml`, `public/`, `laptop/` usw. – **ohne** `node_modules` und ohne `.env`), z. B. über **Add file → Upload files**.

### 2. Bei Render veröffentlichen

1. In Render: **New → Blueprint** und das Repository `jarvis` wählen.
2. Render fragt nach diesen Werten:
   - `DEEPGRAM_API_KEY` – dein Deepgram-Schlüssel
   - `ELEVENLABS_API_KEY` – dein ElevenLabs-Schlüssel
   - `ELEVENLABS_VOICE_ID` – die Voice-ID von Robert Ranger (siehe unten)
   - `JARVIS_PASSWORD` – **dein Passwort für die App**. Mindestens 8 Zeichen, besser ein langer Satz. Jarvis kann deinen Laptop steuern – wähle es sorgfältig.
   - `USER_NAME` – wie Jarvis dich nennen soll (darf leer bleiben)
   - `LAPTOP_TOKEN` und `SESSION_SECRET` erzeugt Render automatisch.
3. **Apply** klicken und warten, bis der Dienst **Live** ist. Deine Adresse sieht so aus: `https://jarvis-xxxx.onrender.com`.

### 3. Auf dem iPhone installieren

1. Öffne deine Render-Adresse in **Safari** und melde dich mit deinem Passwort an.
2. Tippe auf **Teilen** → **Zum Home-Bildschirm**.
3. Öffne Jarvis über das neue Symbol, melde dich dort **einmal** an (die App hat eigene Cookies) und tippe **Jarvis aktivieren**. Erlaube das Mikrofon.

### 4. Laptop verbinden (optional)

1. Kopiere den Ordner `laptop` auf deinen Laptop (z. B. nach `C:\Jarvis-Laptop`).
2. In Render: dein Dienst → **Environment** → Wert von `LAPTOP_TOKEN` kopieren.
3. Doppelklicke **`Laptop-verbinden.bat`**. Beim ersten Start öffnet sich die `.env`:
   - `JARVIS_URL=https://jarvis-xxxx.onrender.com`
   - `LAPTOP_TOKEN=` den kopierten Wert
4. Speichern, Editor schließen. Im Fenster steht „Verbunden“, in der App leuchtet **Laptop an**.

Tipp: Lege eine Verknüpfung zu `Laptop-verbinden.bat` in den Autostart-Ordner (`Win + R` → `shell:startup`), dann verbindet sich der Laptop bei jedem Start automatisch.

## Voice-ID finden

1. In ElevenLabs die **Voice Library** öffnen und „Robert Ranger – Cool Storyteller“ suchen.
2. Zu **My Voices** hinzufügen (nur eigene/hinzugefügte Stimmen funktionieren über die API).
3. Unter **My Voices** die Stimme öffnen und die **Voice ID** kopieren.

## Was Jarvis kann

| Bereich | Beispiele | Laptop nötig? |
|---|---|---|
| Gespräch | Fragen, Erklärungen, Ideen, Texte formulieren | nein |
| Zeit | „Wie spät ist es?“, „Erinnere mich in 20 Minuten an die Wäsche“ | nein |
| Web | „Wie wird das Wetter morgen?“, „Zeig mir Pizzerien in der Nähe“, „Öffne YouTube“ | nein (Link in der App) |
| Programme | „Öffne Spotify auf dem Laptop“, „Schließ Chrome“ | ja |
| Medien | „Nächstes Lied“, „Lauter“, „Lautstärke auf 30 Prozent“ | ja |
| Dateien | „Was liegt in meinen Downloads?“, „Erstelle eine Einkaufsliste auf dem Desktop“, „Lösche test.txt“* | ja |
| Software | „Installiere VLC“* | ja |
| System | „Wie voll ist mein Akku?“, „Sperr den Laptop“, „Fahr den Laptop herunter“* | ja |
| Alles andere | PowerShell-Befehl, den du siehst und bestätigst* | ja |

\* = erfordert deine Bestätigung in der App.

## Sicherheit

- **Login:** Ohne Passwort ist nichts erreichbar – weder die Oberfläche noch die Sprachverbindung. Nach 5 falschen Versuchen wird für 15 Minuten gesperrt. Die Anmeldung gilt 30 Tage; **Abmelden** oben rechts.
- **Bestätigung bei wichtigen Aktionen:** Löschen, Verschieben, Überschreiben, Installieren, Deinstallieren, Herunterfahren/Neustart, Energiesparmodus, Programmdateien öffnen und jeder PowerShell-Befehl erscheinen als Dialog. Ohne Antwort innerhalb von 90 Sekunden wird abgebrochen. Bewusst keine Bestätigung per Sprache.
- **Löschen = Papierkorb**, geschützte Ordner (Laufwerke, Benutzerordner, Desktop/Dokumente/Downloads selbst, Windows- und Programmordner) werden nie verschoben oder gelöscht.
- **Laptop-Zugang** nur mit dem geheimen `LAPTOP_TOKEN`. Gib ihn niemandem.
- **Schlüssel** liegen nur bei Render bzw. in deinen lokalen `.env`-Dateien und erreichen nie den Browser.

## Gut zu wissen

- **Aufwachzeit:** Der kostenlose Render-Dienst schläft nach 15 Minuten ohne Nutzung ein; das erste Öffnen danach dauert etwa eine Minute. Solange der Laptop-Verbinder läuft, bleibt Jarvis wach. Ohne Laptop kannst du ihn mit einem kostenlosen Dienst wie https://cron-job.org alle 10 Minuten `https://jarvis-xxxx.onrender.com/health` aufrufen lassen (das passt in Renders 750 Gratis-Stunden pro Monat).
- **iPhone gesperrt / App im Hintergrund:** iOS stoppt dann das Mikrofon. Nach dem Zurückkehren auf **Neu verbinden** tippen.
- **Timer** erinnern dich nur, solange die App geöffnet ist (Benachrichtigungen kommen in einem späteren Schritt).
- **Mehrere Geräte** können gleichzeitig angemeldet sein; der Laptop ist für alle erreichbar.

## Fehlerbehebung

| Problem | Lösung |
|---|---|
| Login: „JARVIS_PASSWORD ist nicht gesetzt“ | In Render → Environment ein Passwort mit mindestens 8 Zeichen eintragen. |
| „Bei Render fehlt: …“ | Den genannten Schlüssel in Render → Environment eintragen. |
| Fehler mit „401“ von Deepgram | Deepgram-Schlüssel prüfen. |
| Text erscheint, aber man hört nichts | ElevenLabs-Schlüssel/Voice-ID prüfen; Stimme unter **My Voices**? Plan erlaubt API-Zugriff? Details in Render → **Logs**. Am iPhone: Lautstärke hoch, ggf. Stummschalter aus. |
| Jarvis unterbricht sich selbst | Kopfhörer verwenden oder „Mikro stumm, während Jarvis spricht“ einschalten. |
| Laptop-Fenster: „LAPTOP_TOKEN stimmt nicht“ | Wert erneut aus Render kopieren (ohne Leerzeichen). |
| Laptop-Fenster: „Status 502/503“ | Render wacht gerade auf – der Verbinder versucht es automatisch erneut. |
| „Laptop aus“, obwohl er an ist | `Laptop-verbinden.bat` starten bzw. Fenster offen lassen. |

## Lokal testen (optional)

`.env.example` nach `.env` kopieren, Werte eintragen, `npm install` und `npm start` → `http://localhost:3000`. Für den Laptop-Verbinder dann `JARVIS_URL=http://localhost:3000`.

## Technische Notizen

- Deepgram Voice Agent über das offizielle SDK `@deepgram/sdk` v5 (`client.agent.v1.connect()`, `sendSettings`, `sendMedia`, `sendFunctionCallResponse`).
- Cloud-Funktionen: `cloud-tools.js`. Laptop-Funktionen: `laptop/tools.js` (die Cloud liest nur deren Beschreibungen, ausgeführt wird auf dem Laptop durch `laptop/connector.js`).
- Irreversible Funktionen sind mit `defer_until_eot` markiert: Der Agent ruft sie erst auf, wenn dein Satz wirklich zu Ende ist.
- Doku: https://developers.deepgram.com
