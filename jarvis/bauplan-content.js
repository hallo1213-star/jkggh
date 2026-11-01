// The products sold on the "Jarvis-Bauplan" sales page. Everything here is the
// user's own text (no third-party prompt). Starter = the blueprint prompt;
// Komplett = blueprint + step-by-step setup guide + troubleshooting.

export const BAUPLAN_PROMPT = `# Jarvis-Bauplan – dein eigener KI-Sprachassistent

> So benutzt du diesen Bauplan: Öffne einen KI-Coding-Assistenten (z. B. Claude Code), kopiere diesen kompletten Text hinein und schicke ihn ab. Der Assistent baut dir deinen Jarvis Schritt für Schritt und fragt dich zwischendurch nach deinen Wünschen und Zugangsdaten.

---

Du bist ein erfahrener Coding-Agent. Baue mir meinen eigenen persönlichen KI-Sprachassistenten namens **Jarvis**. Er soll neu und eigenständig sein und mit **meinen eigenen** Konten und Schlüsseln laufen.

**So gehst du vor:**
1. Frag mich zuerst in **einer** Nachricht: Wie soll mich Jarvis nennen? Welches Handy und welchen Computer habe ich? Welche Funktionen aus der Liste unten will ich zuerst? Habe ich schon einen Deepgram-Schlüssel?
2. Bau zuerst den **Kern** (Punkt 1) so, dass er läuft und ich mit Jarvis sprechen kann. Zeig mir, wie ich ihn starte und online stelle.
3. Bau danach **eine Funktion nach der anderen** dazu. Teste jede, bevor du zur nächsten gehst.
4. Bevor du etwas einbaust, das ein Konto, einen Schlüssel oder **Geld** braucht, sag mir das deutlich und erkläre genau, wo ich den Schlüssel bekomme und wo ich ihn eintrage.
5. Prüfe Modellnamen, Stimmen und Parameter immer in der aktuellen Dokumentation der Anbieter, nicht aus dem Gedächtnis.

**Technik:**
- Eine **Web-App**, die auf Handy und Computer im Browser läuft, auch ohne eingeschalteten Computer.
- **Node.js-Server** (ESM) mit WebSocket.
- **Deepgram Voice Agent** über das offizielle SDK \`@deepgram/sdk\`: Er hört zu (deutsche Spracherkennung), denkt (LLM über den Voice Agent) und spricht (deutsche Deepgram-Stimme, optional ElevenLabs).
- Hosting kostenlos, z. B. bei **Render** mit automatischem Deploy aus **GitHub**.
- **Alle Schlüssel nur auf dem Server** (Umgebungsvariablen), nie im Browser und nie im Code.

## Die Funktionen

1. **Kern**
   - Passwort-Login.
   - Sprechen per Mikrofon im Browser und ein Textfeld zum Tippen.
   - Futuristische Oberfläche im Iron-Man-Stil: pulsierender Reaktor-Kreis, HUD, Protokoll der Aktionen, Start-Animation „Alle Systeme online“.
   - Wichtige Aktionen muss ich auf dem Bildschirm bestätigen.
   - Jarvis gibt nie vor, ein Mensch zu sein.
2. **Persönlichkeit**
   - Normal: wie ein guter Freund, locker, duzt, mit Humor.
   - Auf Wunsch der **Butler-Stil** wie im Film: siezt, nennt mich „Master“ (oder eine andere Anrede), trockener Sarkasmus, Begrüßung „Ich habe Sie gehört, Master. Alle Systeme sind online.“
   - Wechsel per Sprache.
3. **Gedächtnis**
   - Merkt sich dauerhaft Dinge über mich und die letzten Sätze vom vorherigen Gespräch.
   - Nie Passwörter, PINs oder Bankdaten.
   - Daten zwischen Handy und Computer abgleichen.
4. **Computer-Steuerung (Windows)**
   - Kleines Verbinder-Programm mit geheimem Token.
   - Damit: Programme und Webseiten öffnen, Dateien verwalten, Software über winget installieren, Lautstärke, herunterfahren.
   - Gefährliches nur mit Bestätigung.
5. **Wissen**
   - Echtes Wetter (Open-Meteo), Nachrichten, Wikipedia, Tagesüberblick.
   - Timer und Uhrzeit.
6. **Spiele und Websites**
   - Erstellt auf Zuruf kleine Spiele und schöne Websites als teilbaren Link.
7. **Geld verdienen (manuell)**
   - Website-Service für lokale Läden mit Kundenliste und Vorschau-Websites.
   - Angebots-Mails nur nach Einwilligung (deutsches Recht).
   - Kleinanzeigen-Texte schreiben.
8. **Einkaufen**
   - Produktsuche mit Links zu Händlern und Preisvergleich. Jarvis bestellt nicht selbst.
   - Einkaufsliste auf allen Geräten.
9. **Gmail**
   - Mails lesen und suchen, Senden nur mit Bestätigung, über ein App-Passwort.
   - Wichtige neue Mails meldet Jarvis per Telegram.
10. **Telegram**
    - Eigener Bot schickt Nachrichten und **Sprachnachrichten** in Jarvis' Stimme.
    - Eine angepinnte Nachricht dient als Datensicherung, weil kostenlose Server bei einem Neustart alles vergessen.
11. **Planer**
    - Morgen-Briefing per Telegram-Sprachnachricht.
    - Wiederkehrende Erinnerungen und Termine mit Vorwarnung.
    - Notizen bzw. Tagebuch, Haushaltsbuch, Vokabeltrainer.
    - Läuft auf dem Server, auch wenn die App zu ist. Ein Dienst wie cron-job.org hält den Server wach.
12. **Webcams**
    - Nur offiziell öffentliche Kameras, z. B. Verkehrskameras der Autobahn GmbH.
13. **Autonomer Geld-Modus mit Dashboard**
    - Auf „Verdien Geld für mich“ arbeitet Jarvis im Hintergrund:
      - analysiert Einnahmequellen,
      - plant Aufgaben,
      - erstellt digitale Produkte, Marketingtexte und Verkaufsseiten,
      - wertet aus.
    - Schritte mit Konten, Geld oder Veröffentlichung macht der Nutzer selbst, nach Anleitung.
    - Dashboard mit Schalter EIN/AUS, echten Einnahmen (eigene Einträge und Gumroad), klar markierter Schätzung, Projekten, Produkten, Fortschritt, Tool-Status und Protokoll.
    - **Keine erfundenen Einnahmen.**
    - Texte über ein kostenloses LLM, z. B. Groq.
14. **3D-Erdkugel („Erdbeobachtung“)**
    - Echte 3D-Erde mit CesiumJS, echten Satellitenbildern (Esri World Imagery), Nachtansicht (NASA Black Marble), Atmosphäre und Sternen.
    - Sprachsteuerung: „Zeig mir Paris“, „Zoom auf Neukölln“, „Dreh die Erde“, „Erde bei Nacht“, „Wo bin ich?“.
    - Links Wetter, Ortszeit und Infos, rechts aktuelle Meldungen zum Ort oder Thema.
    - Satellitenbilder immer als **Archivbilder, nicht live** kennzeichnen.
15. **Film-Modus / Lagebericht**
    - „Mach die Nachrichten an“: Weltnachrichten auf der drehenden Erde, dazu Regionen wie Deutschland oder Russland.
    - „Was macht der Aktienmarkt?“: echte Kurse (DAX, S&P 500, Nasdaq, Öl, Gold, Euro/Dollar, Bitcoin) mit Tages- und Wochenveränderung. Keine Anlageberatung.
    - „Zahlen der Woche“: nur echte Zahlen.
16. **Essen bestellen per Telefon**
    - „Bestell bei [Pizzeria] etwas für uns“:
      1. Restaurant finden (OpenStreetMap).
      2. Speisekarte von der Website lesen.
      3. Fragen, wer was isst, gegen die Karte prüfen, vorlesen und bestätigen lassen.
      4. Dann echter Anruf (Twilio plus ein zweiter Deepgram Voice Agent).
    - Am Telefon stellt sich Jarvis als KI-Assistent vor.
    - Live mitlesen und auflegen in der App.
    - **Testmodus** „Test: …“ ohne echten Anruf.

## Feste Regeln für Jarvis
- Ehrlich bleiben: keine erfundenen Ergebnisse, Nachrichten, Kurse oder Zahlen.
- Löschen, Senden, Anrufen und Ähnliches nur mit Bestätigung.
- Nie Passwörter oder Bankdaten speichern.
- Keine Werbe-Mails ohne Einwilligung.
- Nur öffentliche Kameras.
- Kein Bildschirm-Mitschauen und keine Maus- oder Tastatursteuerung.

## Konten und Schlüssel (je nach Funktion)
- **Pflicht:** Deepgram-Schlüssel (\`DEEPGRAM_API_KEY\`), ein App-Passwort, ein Sitzungs-Geheimnis, kostenlose Konten bei GitHub und Render.
- **Optional:** Laptop-Token, Gmail-App-Passwort, Telegram-Bot, Groq-Schlüssel (kostenlos), Gumroad-Token, Cesium-ion-Token.
- **Telefonanrufe:** Twilio – **kostenpflichtig**.

Sag mir bei jedem Konto, das Geld kosten kann, vorher Bescheid.
`;

export const SETUP_GUIDE = `# Einrichtungs-Anleitung – Schritt für Schritt

Diese Anleitung begleitet dich vom leeren Computer bis zum fertigen Jarvis. Mach die Schritte in dieser Reihenfolge. Plane für den Kern etwa 1–2 Stunden ein.

## 0. Was du brauchst
- Einen Computer mit Internet. Handy oder Laptop reichen zum Benutzen; zum Bauen ist ein Laptop bequemer.
- Einen KI-Coding-Assistenten, z. B. **Claude Code**. Dafür kann ein **kostenpflichtiges Abo** nötig sein.
- Etwas Geduld. Wenn etwas hakt, schau in die Fehlerhilfe am Ende.

## 1. Deepgram (Pflicht – Stimme und Sprachverständnis)
1. Konto anlegen auf **console.deepgram.com**.
2. Links „API Keys“ → „Create a New API Key“ → Namen eingeben, z. B. „jarvis“ → kopieren.
3. Den Schlüssel gut aufheben. Er kommt später als \`DEEPGRAM_API_KEY\` zu Render.
4. Neue Konten bekommen meist ein Startguthaben. Danach kostet die Nutzung Geld. Den Verbrauch siehst du in der Konsole unter „Usage“.

## 2. GitHub (Pflicht – hier liegt dein Code)
1. Konto anlegen auf **github.com**.
2. Dein Coding-Assistent erstellt das Projekt und lädt es in ein neues Repository hoch. Erlaube ihm den Zugriff, wenn er danach fragt.
3. Tipp: Stell das Repository auf **privat**, damit niemand deinen Code kopiert.

## 3. Render (Pflicht – hier läuft Jarvis im Internet)
1. Konto anlegen auf **render.com** (am einfachsten „Sign in with GitHub“).
2. „New +“ → „Web Service“ → dein Jarvis-Repository auswählen.
3. Plan **Free**. Build Command \`npm install\`, Start Command \`npm start\` (sagt dir dein Assistent).
4. Unter **Environment** die Schlüssel eintragen: \`DEEPGRAM_API_KEY\`, ein eigenes \`JARVIS_PASSWORD\` (mindestens 8 Zeichen), \`SESSION_SECRET\` (lange Zufallsfolge), \`TZ\` = \`Europe/Berlin\`.
5. Nach dem Deploy bekommst du eine Adresse wie \`https://dein-jarvis.onrender.com\`. Öffne sie, melde dich an und tippe auf Start.
6. **Auf dem iPhone:** Adresse in Safari öffnen → Teilen → „Zum Home-Bildschirm“. Dann sieht Jarvis aus wie eine App.

## 4. Server wach halten (für Erinnerungen und den Geld-Modus)
Der kostenlose Render-Server schläft nach etwa 15 Minuten ohne Besuch ein.
1. Konto auf **cron-job.org** (kostenlos).
2. Neuer Cronjob: URL \`https://dein-jarvis.onrender.com/health\`, alle **10 Minuten**.

## 5. Telegram (empfohlen – Nachrichten und Sprachnachrichten)
1. In Telegram **@BotFather** suchen → \`/newbot\` → Namen vergeben → den **Token** kopieren.
2. Bei Render \`TELEGRAM_BOT_TOKEN\` eintragen und speichern.
3. Deinem neuen Bot \`/start\` schicken. Er antwortet mit deiner **Chat-ID**. Diese als \`TELEGRAM_CHAT_ID\` bei Render eintragen.
4. Die angepinnte Nachricht „Jarvis-Daten“ im Chat **nie löschen**, sie ist deine Datensicherung.

## 6. Gmail (optional)
1. Im Google-Konto die **Bestätigung in zwei Schritten** einschalten.
2. Auf **myaccount.google.com/apppasswords** ein App-Passwort für „Jarvis“ erstellen.
3. Bei Render \`GMAIL_ADDRESS\` und \`GMAIL_APP_PASSWORD\` (ohne Leerzeichen) eintragen.

## 7. Laptop-Steuerung (optional, Windows)
1. Bei Render ein \`LAPTOP_TOKEN\` festlegen (lange Zufallsfolge).
2. Dein Assistent erstellt dir ein kleines Verbinder-Programm und eine Startdatei. Doppelklick → Jarvis meldet „Laptop verbunden“.

## 8. Geld-Modus (optional)
1. Kostenloses Konto auf **console.groq.com** → „API Keys“ → „Create API Key“ → als \`GROQ_API_KEY\` bei Render eintragen.
2. Für echte Verkaufszahlen: auf **gumroad.com** unter Settings → Advanced → Applications einen Token erzeugen → \`GUMROAD_ACCESS_TOKEN\`.

## 9. 3D-Erdkugel (läuft ohne Schlüssel)
Für schärfere Bilder und 3D-Berge: kostenloses Konto auf **ion.cesium.com** → „Access Tokens“ → Default Token → \`CESIUM_ION_TOKEN\`.

## 10. Telefonanrufe (optional, kostenpflichtig)
1. Konto auf **twilio.com**. Ein Testkonto darf nur bestätigte Nummern anrufen. Für Restaurants musst du **Guthaben aufladen**.
2. \`TWILIO_ACCOUNT_SID\` und \`TWILIO_AUTH_TOKEN\` aus der Konsole kopieren.
3. Unter „Verified Caller IDs“ deine Handynummer bestätigen → als \`TWILIO_PHONE_NUMBER\` eintragen (z. B. \`+4917612345678\`).
4. Unter Voice → Settings → **Geo permissions** „Germany“ erlauben.
5. Zuerst mit dem Testmodus ausprobieren: „Test: bestelle mir Pizza bei …“.

---

# Fehlerhilfe

**Jarvis hört mich nicht (iPhone)**
→ Safari muss das Mikrofon erlauben: Einstellungen → Safari → Mikrofon → „Fragen“ oder „Erlauben“. Die Seite muss über **https** laufen.

**Jarvis antwortet sich selbst / unterbricht sich**
→ Kopfhörer benutzen oder in der App „Mikro stumm, während Jarvis spricht“ einschalten.

**Die Seite lädt beim ersten Öffnen ewig**
→ Der kostenlose Server ist eingeschlafen und braucht bis zu einer Minute. Mit cron-job.org (Schritt 4) passiert das kaum noch.

**„Deepgram-Fehler“ oder Jarvis startet nicht**
→ \`DEEPGRAM_API_KEY\` bei Render prüfen (keine Leerzeichen) und schauen, ob noch Guthaben da ist.

**Telegram schickt nichts**
→ Hast du dem Bot \`/start\` geschickt? Stimmt die \`TELEGRAM_CHAT_ID\` (nur Ziffern)?

**Gmail: „Anmeldung abgelehnt“**
→ Es muss ein **App-Passwort** sein, nicht dein normales Passwort, und die Zwei-Schritt-Bestätigung muss an sein.

**Laptop „nicht verbunden“**
→ Läuft das Verbinder-Fenster noch? Stimmt das \`LAPTOP_TOKEN\` auf beiden Seiten genau überein?

**Geld-Modus: „KI-Modell gibt es nicht“ oder „Limit erreicht“**
→ Beim kostenlosen Kontingent ist das normal. Jarvis macht später weiter. Bei Modell-Fehlern einen eingetragenen Modellnamen bei Render löschen, damit Jarvis selbst eines wählt.

**Telefon: Twilio-Fehler**
→ Konto aufgeladen? Germany in den Geo permissions erlaubt? Absendernummer bestätigt?

**Nach einem Update ist etwas kaputt**
→ Sag deinem Coding-Assistenten genau, was passiert, und schick einen Screenshot. Er kann die letzte Änderung prüfen oder zurücknehmen.

---

## Updates
Wenn es neue Funktionen gibt, bekommst du die aktualisierte Version dieses Pakets über deinen Kauf-Link ohne Aufpreis.
`;

export function productFiles() {
  return {
    starter: { filename: 'Jarvis-Bauplan-Starter.md', title: 'Jarvis-Bauplan – Starter', content: BAUPLAN_PROMPT },
    komplett: { filename: 'Jarvis-Bauplan-Komplett.md', title: 'Jarvis-Bauplan – Komplett', content: `${BAUPLAN_PROMPT}\n\n---\n\n${SETUP_GUIDE}` }
  };
}
