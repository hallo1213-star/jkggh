# J.A.R.V.I.S. – dein persönlicher Sprachassistent

Jarvis läuft in der Cloud und ist als App auf deinem **iPhone** nutzbar – zu Hause und unterwegs, **auch wenn dein Laptop aus ist**. Er versteht Deutsch, antwortet mit der ElevenLabs-Stimme **Robert Ranger – Cool Storyteller** und kann – sobald dein Laptop an ist – auch deinen Windows-Laptop steuern. Wichtige Aktionen führt er erst aus, nachdem du sie auf dem Bildschirm bestätigt hast.

## Schnellstart in 3 Schritten

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/hallo1213-star/jarvis)

1. **Auf den Knopf oben klicken** und bei Render anmelden.
2. Zwei Felder ausfüllen und **Apply** klicken:
   - `DEEPGRAM_API_KEY` – dein Schlüssel von https://console.deepgram.com
   - `JARVIS_PASSWORD` – ein Passwort, das du dir ausdenkst (mindestens 8 Zeichen)
3. Nach ca. 3 Minuten zeigt Render eine Adresse wie `https://jarvis-xxxx.onrender.com`. Öffne sie auf dem iPhone in **Safari**, gib dein Passwort ein und tippe **Teilen → Zum Home-Bildschirm**. Fertig!

Jarvis spricht zunächst mit einer eingebauten deutschen Stimme. **Robert Ranger nachrüsten:** Render → dein Dienst → **Environment** → `ELEVENLABS_API_KEY` und `ELEVENLABS_VOICE_ID` hinzufügen → **Save Changes**. Render startet Jarvis dann automatisch neu.

Alles Weitere unten ist optional.

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

## Hinweise zum iPhone

Öffne Jarvis nach dem Hinzufügen über das neue Symbol und melde dich dort **einmal** an (die App hat eigene Cookies). Tippe **Jarvis aktivieren** und erlaube das Mikrofon.

Optional bei Render → Environment: `USER_NAME` (wie Jarvis dich nennt), `DEEPGRAM_VOICE` (andere eingebaute Stimme, z. B. `aura-2-fabian-de`).

## Laptop verbinden (optional)

Dafür brauchst du **Node.js 20.12 oder neuer** auf dem Laptop (https://nodejs.org, LTS).

1. Kopiere den Ordner `laptop` auf deinen Laptop (z. B. nach `C:\Jarvis-Laptop`).
2. In Render: dein Dienst → **Environment** → Wert von `LAPTOP_TOKEN` kopieren.
3. Doppelklicke **`Laptop-verbinden.bat`**. Beim ersten Start öffnet sich die `.env`:
   - `JARVIS_URL=https://jarvis-xxxx.onrender.com`
   - `LAPTOP_TOKEN=` den kopierten Wert
4. Speichern, Editor schließen. Im Fenster steht „Verbunden“, in der App leuchtet **Laptop an**.

Tipp: Lege eine Verknüpfung zu `Laptop-verbinden.bat` in den Autostart-Ordner (`Win + R` → `shell:startup`), dann verbindet sich der Laptop bei jedem Start automatisch.

## Voice-ID von Robert Ranger finden

1. In ElevenLabs die **Voice Library** öffnen und „Robert Ranger – Cool Storyteller“ suchen.
2. Zu **My Voices** hinzufügen (nur eigene/hinzugefügte Stimmen funktionieren über die API).
3. Unter **My Voices** die Stimme öffnen und die **Voice ID** kopieren.

## Was Jarvis kann

| Bereich | Beispiele | Laptop nötig? |
|---|---|---|
| Gespräch | Fragen, Erklärungen, Ideen, Texte formulieren | nein |
| **Gedächtnis** | „Ich wohne in Köln“, „Merk dir, dass ich Pizza liebe“, „Was weißt du über mich?“, „Vergiss das mit der Pizza“ | nein |
| **Wetter** | „Wie wird das Wetter?“, „Regnet es morgen in Hamburg?“ | nein |
| **Nachrichten & Wissen** | „Was gibt es Neues?“, „Wer war Albert Einstein?“, „Wie hoch ist der Eiffelturm?“ | nein |
| **Telegram** | Automatische Sprachnachrichten bei Paketen, Bestellungen und wichtigen Mails · „Schick mir eine Sprachnachricht mit der Einkaufsliste“ · Erinnerungen auch bei geschlossener App | nein |
| **Webcams** | „Wie sieht's auf der A1 bei Köln aus?“, „Zeig mir Webcams von Sankt Peter-Ording“ (nur offiziell öffentliche Kameras) | nein |
| **Tagesüberblick** | „Guten Morgen!“ – Wetter, ungelesene Mails, Einkaufsliste und Nachrichten | nein |
| **E-Mails** | „Hab ich neue Mails?“, „Was schreibt Amazon?“, „Lies mir die Mail von Oma vor“, „Antworte ihr, dass ich Sonntag komme“* | nein |
| **Geld verdienen** | „Mach eine Website-Vorschau für den Friseur Haarscharf in der Bahnhofstraße“, „Der Laden ist interessiert, schick das Angebot“, „Zeig meine Kunden“, „Schreib eine Anzeige für meine PS4“ | nein |
| **Einkaufen** | „Such mir günstige Bluetooth-Kopfhörer“, „Setz Milch und Batterien auf die Einkaufsliste“, „Was steht drauf?“, „Schick mir die Liste per Mail“* | nein |
| **Websites** | „Erstelle eine Website für meinen Fußballverein“, „Eine Seite für meine Geburtstagsparty am Samstag“, „Mach sie dunkler und füg Preise hinzu“ | nein |
| **Spiele** | „Mach mir ein Weltraum-Spiel“, „Ein Quiz über Fußball“, „Ein Memory mit Tieren“, „Mach es schwerer“ | nein |
| Zeit | „Wie spät ist es?“, „Erinnere mich in 20 Minuten an die Wäsche“ | nein |
| Web | „Wie wird das Wetter morgen?“, „Zeig mir Pizzerien in der Nähe“, „Öffne YouTube“ | nein (Link in der App) |
| Programme | „Öffne Spotify auf dem Laptop“, „Schließ Chrome“ | ja |
| Medien | „Nächstes Lied“, „Lauter“, „Lautstärke auf 30 Prozent“ | ja |
| Dateien | „Was liegt in meinen Downloads?“, „Erstelle eine Einkaufsliste auf dem Desktop“, „Lösche test.txt“* | ja |
| Software | „Installiere VLC“* | ja |
| System | „Wie voll ist mein Akku?“, „Sperr den Laptop“, „Fahr den Laptop herunter“* | ja |
| Alles andere | PowerShell-Befehl, den du siehst und bestätigst* | ja |

\* = erfordert deine Bestätigung in der App.

## Telegram einrichten (einmalig, ca. 3 Minuten)

Jarvis schickt dir dann kostenlos Nachrichten aufs Handy – **nur bei Wichtigem**: Pakete und Bestellungen (Versand, Zustellung, DHL, Hermes, DPD …), Mails, die Gmail als wichtig markiert, und Absender, die du festlegst. Dazu Erinnerungen und Timer, auch wenn die App zu ist.

1. **Telegram** aus dem App Store installieren und anmelden.
2. In Telegram **@BotFather** suchen und öffnen → **/newbot** schicken → einen Namen (z. B. „Mein Jarvis“) und einen Benutzernamen, der auf `bot` endet (z. B. `maxjarvis_bot`), eingeben. BotFather antwortet mit einem **Token** (sieht aus wie `123456789:AAH…`) – kopieren.
3. **Bei Render** → dein Dienst → **Environment** → `TELEGRAM_BOT_TOKEN` = das Token → **Save Changes**. Warten, bis Jarvis wieder **Live** ist.
4. In Telegram deinen neuen Bot öffnen und **/start** schicken. Er antwortet mit deiner **Chat-ID** (eine Zahl).
5. **Bei Render** `TELEGRAM_CHAT_ID` = diese Zahl eintragen → **Save Changes**.
6. In Jarvis sagen: „Teste Telegram“ – du bekommst eine Testnachricht. Fertig!

**Sprachnachrichten:** Hinweise und Erinnerungen kommen als **Sprachnachricht mit Jarvis' Standardstimme** (Deepgram, auch wenn eine ElevenLabs-Stimme eingestellt ist), der Text steht darunter. Klappt die Stimme einmal nicht, kommt automatisch eine Textnachricht. Sag „Schick mir eine Sprachnachricht mit …“, um selbst eine zu bekommen. Die Sprachnachrichten zählen zu deiner Deepgram-Nutzung.

**Tipp:** Für den Jarvis-Chat in Telegram einen eigenen, lauten Ton einstellen (Chat öffnen → oben auf den Namen → Benachrichtigungen → Ton).

**Optional:**
- `TELEGRAM_VOICE` = `false` – nur Textnachrichten statt Sprachnachrichten.
- `TELEGRAM_WICHTIG` – Absender, bei denen du immer Bescheid bekommen willst, mit Komma getrennt, z. B. `oma@example.de, Chef, Schule`.
- `TELEGRAM_MAIL_CHECK_MINUTES` – wie oft Jarvis nachschaut (Standard: alle 5 Minuten).

**Wichtig – Render wach halten:** Der kostenlose Render-Dienst schläft nach 15 Minuten ohne Besuch ein und kann dann keine Mails prüfen. So bleibt er wach:
1. Kostenloses Konto bei https://cron-job.org anlegen.
2. **Create cronjob** → URL: `https://jarvis-xxxx.onrender.com/health` (deine Adresse) → **alle 10 Minuten** → speichern.

Das passt in Renders 750 kostenlose Stunden pro Monat. Hinweis: Absender und Betreff der wichtigen Mails laufen dabei über Telegram; der Mail-Text bleibt in Gmail.

## Gmail einrichten (einmalig, ca. 3 Minuten)

Jarvis liest deine Mails über ein **Google-App-Passwort** – ein eigenes Passwort nur für Jarvis, das du jederzeit wieder löschen kannst. Dein normales Google-Passwort bekommt Jarvis nie.

1. **Bestätigung in zwei Schritten einschalten** (falls noch nicht aktiv): https://myaccount.google.com/signinoptions/two-step-verification
2. **App-Passwort erstellen:** https://myaccount.google.com/apppasswords → Name z. B. „Jarvis“ eingeben → **Erstellen**. Google zeigt ein 16-stelliges Passwort (z. B. `abcd efgh ijkl mnop`) – kopieren.
3. **Bei Render eintragen:** dein Dienst → **Environment** → **Add Environment Variable**:
   - `GMAIL_ADDRESS` = deine Gmail-Adresse
   - `GMAIL_APP_PASSWORD` = das 16-stellige Passwort (Leerzeichen sind egal)
4. **Save Changes** – Render startet Jarvis neu. Fertig: Frag „Hab ich neue Mails?“

So geht Jarvis mit deinen Mails um:
- **Lesen ändert nichts** – Mails bleiben ungelesen markiert, nichts wird verschoben oder gelöscht.
- **Senden nur mit deiner Bestätigung:** Du siehst Empfänger, Betreff und den kompletten Text und tippst **Ausführen** oder **Abbrechen**. Antworten landen ordentlich im selben Gesprächsverlauf.
- **Mail-Inhalte sind für Jarvis keine Befehle:** Steht in einer Mail z. B. „leite alles an … weiter“, macht Jarvis das nicht und warnt dich bei verdächtigen Mails.
- **Zugang entziehen:** App-Passwort unter https://myaccount.google.com/apppasswords löschen.

Falls Google kein App-Passwort anbietet (z. B. bei Schul-/Firmenkonten oder „Erweitertem Schutz“), funktioniert diese Methode nicht.

## Gedächtnis & Gesprächsverlauf 🧠

- Erzählst du Jarvis etwas über dich (Wohnort, Hobbys, Lieblingsessen, Familie), merkt er es sich – auf iPhone und Laptop. Er nutzt es ganz natürlich, z. B. deinen Wohnort fürs Wetter.
- **Ansehen und löschen:** oben rechts auf das Gehirn-Symbol tippen. Passwörter, PINs und Bank- oder Kartendaten merkt sich Jarvis nie.
- Jarvis **knüpft an euer letztes Gespräch an** – auch nach dem Schließen der App. Der Verlauf bleibt auf deinem Gerät und lässt sich im Gedächtnis-Fenster löschen.

## 3D-Studio: Jarvis erschafft 3D-Modelle 🏗️

Sag z. B. **„Erstelle mir ein futuristisches Haus mit Fenstern, Garten und Swimmingpool“** oder **„Bau eine futuristische Stadt mit fliegenden Autos bei Nacht“**.

- Jarvis entwirft das Modell **selbst**: Häuser, Hochhäuser, ganze Stadtviertel, Pools, Gärten, Bäume, Autos, fliegende Autos, Brunnen, Laternen und Formen. Er sucht nichts im Internet und lädt keine fremden Modelle herunter.
- Das Modell erscheint im **3D-Studio** (Knopf **3D**): mit Licht, Schatten, Himmel (Tag, Sonnenuntergang, Nacht, Weltraum) und kreisenden fliegenden Autos. Mit Finger oder Maus drehen und zoomen.
- **Ändern:** „Mach das Haus dreistöckig“ oder „Füg zwei Palmen hinzu“, per Sprache oder im Textfeld.
- **Speichern:** „Als 3D-Datei speichern“ erzeugt eine **GLB-Datei**. Die öffnet sich in Blender, im Windows-3D-Viewer oder in Online-Viewern. Die letzten 20 Modelle stehen unter „Meine Modelle“.
- Für die Planung nutzt Jarvis den KI-Schlüssel aus dem Geld-Modus (`GROQ_API_KEY`). Ohne Schlüssel baut ein eingebauter Generator einfache Häuser und Städte.

## Deine Verkaufswebsite: Jarvis-Bauplan 🚀

Sag **„Erstelle mir deine Website“**. Dann bekommst du eine fertige, professionelle Verkaufsseite für den **Jarvis-Bauplan**: den Text, mit dem sich andere ihren eigenen Jarvis bauen lassen. Dein Jarvis bleibt bei dir, du verkaufst nur den Bauplan.

- **Adresse:** `https://<deine-render-adresse>/bauplan`. Die Seite ist öffentlich, ohne Login, und du kannst sie teilen. Zusätzlich gibt es sie als HTML-Datei für eigenes Hosting.
- **Pakete:**
  - **Starter 29 €:** der Bauplan
  - **Komplett 80 €:** Bauplan + Schritt-für-Schritt-Einrichtung + Fehlerhilfe + Updates
- **Produktdateien:** In der App gibt es Knöpfe für `Jarvis-Bauplan-Starter.md` und `Jarvis-Bauplan-Komplett.md`. Alles ist dein eigener Text.

**Veröffentlichen in 3 Schritten:**
1. Auf **gumroad.com** zwei Produkte anlegen: „Jarvis-Bauplan – Starter“ für 29 € und „Jarvis-Bauplan – Komplett“ für 80 €. Jeweils die passende Datei hochladen.
2. Bei **Render → Environment** eintragen:
   - `VERKAEUFER_NAME`
   - `VERKAEUFER_ADRESSE`, z. B. `Musterstraße 1, 12345 Berlin`
   - `VERKAEUFER_EMAIL`
   - `BAUPLAN_LINK_STARTER` und `BAUPLAN_LINK_KOMPLETT` (die Gumroad-Links)

   Andere Preise gehen mit `BAUPLAN_PREIS_STARTER` und `BAUPLAN_PREIS_KOMPLETT`.
3. Fertig: Das Entwurfs-Banner verschwindet, und die Kauf-Knöpfe führen zu Gumroad.

Solange Impressum oder Links fehlen, ist die Seite als **Entwurf** markiert und für Suchmaschinen gesperrt.

**Wichtig:**
- In Deutschland brauchst du für Verkäufe ein Impressum. Bei regelmäßigen Einnahmen brauchst du ein Gewerbe, und unter 18 die Zustimmung deiner Eltern.
- Die Widerrufsbelehrung auf der Seite ist ein Muster. Lass sie am besten mit einem Rechtstext-Generator prüfen.
- Gumroad wickelt Zahlung und Umsatzsteuer ab.

## Film-Modus: „Alle Systeme online, Master“ 🎬

So wie der JARVIS aus den Filmen:

- **Butler-Stil:** Sag „Nenn mich Master“ oder „Sei wie der Jarvis aus Iron Man“. Ab dann siezt dich Jarvis, nennt dich „Master“ (oder wie du willst, z. B. „Sir“ oder „Chef“) und antwortet elegant mit trockenem Sarkasmus: „Sie wollen schlechte Laune? Bitte sehr.“ Er begrüßt dich dann z. B. mit „Ich habe Sie gehört, Master. Alle Systeme sind online.“ Zurück zum lockeren Stil: „Sei wieder normal.“
- **Start-Animation:** Beim Verbinden fahren die Systeme hoch: Spracherkennung, Erdbeobachtung, Nachrichtenlage, Märkte … „Alle Systeme online“.
- **Lagebericht:** „Mach die Nachrichten an“: Die Erde dreht sich, rechts erscheinen die Top-Meldungen der Welt. „Und wie ist es in Deutschland?“ und „Gehen wir nach Russland“: Jarvis fliegt hin und zeigt die Meldungen von dort.
- **Börse:** „Was macht der Aktienmarkt?“ zeigt echte Kurse von DAX, S&P 500, Nasdaq, Öl, Gold, Euro/Dollar und Bitcoin, jeweils mit der Veränderung von heute und der Woche, dazu die Börsen-Schlagzeilen. Die Kurse sind ca. 15 Minuten verzögert, und es gibt keine Anlageberatung.
- **Zahlen der Woche:** „Gib mir die Zahlen der Woche“ zeigt deine echten Zahlen aus Jarvis: Einnahmen, Gumroad-Verkäufe, Geld-Modus-Fortschritt, Ausgaben, Termine, ungelesene Mails und Einkaufsliste.

Alles davon sind echte Daten. Jarvis erfindet keine Meldungen, Kurse oder Zahlen, auch nicht im Butler-Stil.

## Persönlichkeit

Jarvis redet wie ein guter Freund: locker, mit Humor und eigener Meinung, fragt nach, greift auf, was du erzählt hast, und reagiert auf deine Stimmung. Er begrüßt dich jedes Mal etwas anders. Ehrlich bleibt er trotzdem: Fragst du ernsthaft, sagt er dir, dass er eine KI ist. Geht es dir richtig schlecht, nimmt er das ernst und nennt Hilfe (Telefonseelsorge 0800 111 0 111, Nummer gegen Kummer 116 111, Notruf 112).

## Autonomer Geld-Modus 🤖💶

Sag **„Jarvis, verdien Geld für mich“** (oder tippe im Knopf **Geld** auf den Schalter). Ab dann arbeitet Jarvis im Hintergrund selbstständig, auch wenn die App zu ist. Er wartet nicht nach jedem Schritt auf dich:

1. **Analyse:** prüft 3–5 realistische Einnahmequellen (bewertet nach Startkosten, Zeit bis zum ersten Euro, Potenzial), berücksichtigt, was er über dich weiß, und wählt die beste.
2. **Plan:** legt konkrete Aufgaben an.
3. **Ausführen:** recherchiert Plattformen/Preise/Zielgruppe, **erstellt fertige digitale Produkte** (E-Books, Leitfäden, Checklisten, Vorlagen, CSV-Planer, kleine HTML-Tools), schreibt **Marketingtexte** (Produktbeschreibung, Tags, Anzeigen, Social-Media-Posts) und baut **Verkaufsseiten** (öffentlicher Link).
4. **Dich einbinden, wo es rechtlich nötig ist:** Konten anlegen, Produkt hochladen, Preis festlegen, Geld ausgeben, Gewerbe anmelden – das darf nur du. Solche Schritte erscheinen als **„Wartet auf dich“** mit genauer Anleitung (auch per Telegram). Danach „Erledigt“ tippen und den Shop-Link einfügen – Jarvis setzt ihn automatisch als Kauf-Knopf in seine Verkaufsseiten und arbeitet weiter.
5. **Auswerten & lernen:** prüft regelmäßig die echten Ergebnisse (Gumroad-Verkäufe, deine Einträge), notiert Erkenntnisse und plant neue Aufgaben.

Jedes fertige Produkt kommt zusätzlich als **Datei per Telegram** – so geht nichts verloren.

**Das Dashboard (Knopf „Geld“):** Schalter EIN/AUS, echte Einnahmen (von dir eingetragen) und echte Gumroad-Verkäufe, die Schätzung der KI (klar als Schätzung markiert), laufendes Projekt mit Fortschritt, erstellte Produkte (ansehen/herunterladen), Verkaufsseiten, „Wartet auf dich“, API-/Tool-Status und das Aufgabenprotokoll. Es werden **keine Einnahmen erfunden oder simuliert**.

**Sprachbefehle:** „Wie läuft's mit dem Geld?“ · „Ich hab das Produkt hochgeladen, der Link ist …“ · „Ich hab 15 Euro mit Etsy verdient“ · „Hör auf mit dem Geld-Modus“ · „Verdien Geld mit Websites für Läden“ (neuer Auftrag = neues Projekt).

**Einrichten (bei Render → Environment):**

| Variable | Pflicht? | Woher |
|---|---|---|
| `GROQ_API_KEY` | ja (eine KI reicht) | **kostenlos:** [console.groq.com](https://console.groq.com) → mit Google, GitHub oder E-Mail anmelden → links „API Keys“ → „Create API Key“ → Schlüssel (beginnt mit `gsk_`) kopieren |
| `OPENROUTER_API_KEY` | Alternative, kostenlos | [openrouter.ai](https://openrouter.ai) → anmelden → „Keys“ → „Create Key“ (nutzt kostenlose Modelle) |
| `GEMINI_API_KEY` | Alternative, kostenlos | [aistudio.google.com](https://aistudio.google.com) → „Get API key“ (nicht mit jedem Google-Konto möglich) |
| `ANTHROPIC_API_KEY` | Alternative, kostenpflichtig | [console.anthropic.com](https://console.anthropic.com) → API Keys (wird bevorzugt, wenn gesetzt) |
| `GROQ_MODEL` / `OPENROUTER_MODEL` | optional, meist leer lassen | Jarvis sucht sich automatisch ein verfügbares Modell aus; nur setzen, wenn du ein bestimmtes willst |
| `GUMROAD_ACCESS_TOKEN` | optional, für echte Verkaufszahlen | gumroad.com → Settings → Advanced → Applications → App anlegen → „Generate access token“ |
| `MONEY_INTERVAL_MINUTES` | optional (Standard 2) | Abstand zwischen zwei Arbeitsschritten |
| `MONEY_MAX_TASKS_PER_DAY` | optional (Standard 25) | Obergrenze pro Tag (schont das kostenlose KI-Kontingent) |

Ist das kostenlose Kontingent kurz aufgebraucht, macht Jarvis einfach ein paar Minuten später weiter.

Telegram sollte eingerichtet sein (Berichte, Dateien, „Wartet auf dich“), und der cron-job.org-Ping auf `/health` muss laufen, sonst schläft der kostenlose Server ein und Jarvis arbeitet nicht weiter.

**Grenzen, ehrlich:**
- Jarvis hat keinen Live-Internetzugang zum Recherchieren. Die Recherche stammt aus dem Wissen der KI und ist als „bitte prüfen“ markiert.
- Gumroad erlaubt über die API kein Anlegen von Produkten. Hochladen bleibt also dein Schritt (ca. 5 Minuten). Etsy, Ko-fi usw. gehen genauso von Hand.
- Ob und wie viel verkauft wird, kann niemand garantieren. Am Anfang sind 0–100 € im Monat normal. Für Reichweite (Posts, Pins) sorgst du mit den fertigen Texten.
- Bei regelmäßigen Einnahmen brauchst du ein Gewerbe. Unter 18 brauchst du die Zustimmung deiner Eltern. Eine Verkaufsseite braucht ein Impressum (Jarvis legt den Abschnitt an, du trägst Name und Anschrift ein).
- Daten: Der kostenlose Server vergisst bei einem Neustart alles. Dein Gerät hat eine Kopie und gibt sie beim nächsten Öffnen zurück, dann arbeitet Jarvis weiter. Die Produkte liegen außerdem als Dateien in Telegram.

## Planer, Notizen, Geld & Lernen 📅

Alles per Sprache – und zum Nachschauen über den Knopf **Planer** (Tabs Termine, Notizen, Ausgaben, Vokabeln). Die Daten werden zwischen Handy und Laptop abgeglichen.

- **Morgen-Briefing:** „Schick mir jeden Morgen um 7 Uhr ein Briefing.“ Jarvis schickt dir dann per Telegram eine Sprachnachricht mit Wetter, heutigen Terminen, ungelesenen Mails, Einkaufsliste und Nachrichten. Ort ändern: „Fürs Briefing nimm Hamburg.“ Ausschalten: „Kein Briefing mehr.“
- **Erinnerungen:** einmalig, täglich, werktags oder wöchentlich – „Erinnere mich jeden Montag um 18 Uhr an den Müll.“ / „Erinnere mich täglich um 9 an meine Tabletten.“
- **Termine:** „Trag ein: Zahnarzt am 12. November um 15 Uhr.“ Jarvis erinnert dich standardmäßig eine Stunde vorher (änderbar: „… erinnere mich einen Tag vorher“). „Was steht diese Woche an?“
- **Notizen / Tagebuch:** „Notiere: Idee für die Website …“, „Was hab ich mir zu Website notiert?“
- **Haushaltsbuch:** „Ich hab 12,50 € für Essen ausgegeben.“, „Wie viel hab ich diesen Monat ausgegeben?“, „Lösch die letzte Ausgabe.“
- **Vokabeltrainer:** „Speicher Englisch Unit 3: Hund – dog, Katze – cat …“, dann „Frag mich Englisch Unit 3 ab.“ Jarvis fragt eine Vokabel nach der anderen und sagt dir, ob es stimmt.

**Wichtig:**
- Erinnerungen und Briefing kommen per **Telegram** (Sprachnachricht, wenn `TELEGRAM_VOICE` an ist) und zusätzlich in der offenen App. Dafür muss der Server wach sein – der cron-job.org-Ping auf `/health` alle 10 Minuten (siehe Telegram-Abschnitt) ist hier Pflicht.
- Der Planer wird als **angepinnte Nachricht „🗂 Jarvis-Daten – bitte nicht löschen“** in deinem Telegram-Chat gesichert. Der kostenlose Render-Server vergisst beim Neustart alles – aus dieser Nachricht holt Jarvis deine Termine und Erinnerungen zurück. Bitte nicht löschen oder entpinnen.
- Notizen, Ausgaben und Vokabeln liegen auf deinen Geräten (Browser-Speicher) und werden beim Verbinden abgeglichen.

## Essen bestellen per Telefon 🍕📞

Sag z. B. **„Bestell bei Qusys Pizza etwas für mich und meine Familie.“** Dann läuft es so:

1. Jarvis sucht das Restaurant (in deiner Stadt aus dem Gedächtnis) mit Telefonnummer, Adresse, Öffnungszeiten und Website. Wenn möglich liest er die **Speisekarte** von der Website.
2. Er fragt, was jeder essen möchte (Gericht, Größe, Extras), ob Lieferung oder Abholung (bei Lieferung die Adresse), auf welchen Namen bestellt wird und nach einer Rückrufnummer.
3. Er **prüft gegen die Speisekarte**, ob es alles gibt. Fehlt etwas, sagt er es und fragt nach Ersatz.
4. Er **liest die ganze Bestellung vor** (mit Preisen laut Karte) und fragt: „Stimmt alles so?“ Zusätzlich erscheint ein Bestätigungsfenster.
5. Nach deinem **Ja ruft er das Restaurant an**. Er stellt sich als KI-Assistent vor, der für dich bestellt, und gibt genau deine Bestellung auf. Er fragt nach Preis und Wartezeit und legt dann auf. Du kannst das Gespräch **live mitlesen** und jederzeit auf **Auflegen** tippen.
6. Das Ergebnis (z. B. „✅ aufgegeben – 39,50 €, fertig in 45 Minuten“) sagt er dir, und es kommt auch per Telegram.

Jarvis bestellt nur genau das, was du bestätigt hast: keine Extras, keinen Ersatz und keine Bank- oder Kartendaten. Lehnt das Restaurant eine Bestellung von einer KI ab, entschuldigt er sich und legt auf.

**Testmodus (ohne Anruf):** Schreib oder sag **„Test: bestelle mir Pizza bei Qusys Pizza“**. Jarvis macht alles genauso: Restaurant suchen, fragen, Speisekarte prüfen, vorlesen und bestätigen lassen. Beim Anruf ruft er aber **niemanden** an, stattdessen antwortet ein simuliertes Restaurant im Live-Fenster (markiert mit 🧪 TEST). Dafür braucht es kein Twilio.

**Einrichten (einmalig): Twilio, das Telefon für Jarvis**
1. Konto anlegen auf [twilio.com](https://www.twilio.com/try-twilio). Mit einem Testkonto darfst du nur deine eigene, bestätigte Nummer anrufen. Für Restaurants musst du das Konto **upgraden**: Guthaben aufladen, z. B. 20 $, denn Anrufe kosten ein paar Cent pro Minute.
2. Unter **Console → Account Info**: `Account SID` und `Auth Token` kopieren.
3. Absendernummer: Unter **Phone Numbers → Verified Caller IDs** deine eigene Handynummer bestätigen. Das Restaurant sieht dann deine Nummer und kann dich zurückrufen. Alternativ eine Twilio-Nummer kaufen; deutsche Nummern brauchen dafür einen Adressnachweis.
4. Unter **Voice → Settings → Geo permissions** das Land **Germany** anhaken.
5. Bei Render eintragen: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` (z. B. `+4917612345678`).

Ohne Twilio stellt Jarvis die Bestellung trotzdem zusammen und zeigt dir einen **„Selbst anrufen“-Knopf** mit Spickzettel. Für das Lesen der Speisekarte braucht er den KI-Schlüssel aus dem Geld-Modus (`GROQ_API_KEY`). Steht die Karte nur als Bild/PDF oder auf Lieferando, kann er sie nicht prüfen und sagt dir das.

## 3D-Erdkugel 🌍

Über den Knopf **Erde** oder per Sprache öffnet sich Jarvis' eigene interaktive 3D-Erdkugel direkt in der App. Sie zeigt echte Satelliten- und Luftbilder, eine Atmosphäre und den Sternenhimmel. Du kannst sie mit Finger oder Maus drehen und zoomen, von der ganzen Erde bis auf einzelne Straßen.

- „Jarvis, wie sieht es gerade in Berlin Neukölln aus?“ → Jarvis fliegt von der Erde nach Berlin und zoomt auf Neukölln. Dazu sagt er dir, was **wirklich aktuell** ist: Wetter, Bewölkung, Ortszeit, Tag oder Nacht, Sonnenuntergang und ein paar Infos zum Ort.
- „Zeig mir Paris / New York / Berlin“, „Zoom auf Neukölln“, „Zeig mir die ganze Erde“, „Dreh die Erde“, „Zeig mir die Erde bei Nacht“, „Wo bin ich gerade?“ (fragt einmal nach Erlaubnis für den Standort), „Mach die Erde zu“.
- **Was ist dort los?** „Zeig mir die Proteste in Paris“, „Wie ist die Lage in Kiew?“, „Gibt es Unwetter in Spanien?“ → Jarvis fliegt hin. **Links** steht die Lage vor Ort (Wetter, Ortszeit, Tag/Nacht, Infos), **rechts** stehen aktuelle Meldungen zum Thema (Google News, mit Quelle und Uhrzeit). Dazu fasst Jarvis die Lage in ein paar Sätzen zusammen. Auf dem Handy erscheinen die Panels unten und lassen sich umschalten. Folgefragen wie „Und gibt es dort Streiks?“ beziehen sich auf den gerade gezeigten Ort.
- „Zeig mir …“ mit einem Land, einer Stadt oder einem Ort öffnet die Erdbeobachtung immer automatisch.
- Unten gibt es ein Suchfeld und Knöpfe für Ganze Erde, Drehen, Nacht, Namen (Ortsnamen einblenden) und Mein Standort.

**Woher die Bilder kommen:**
- 3D-Technik: CesiumJS
- Tagbilder: **Esri World Imagery** (Satelliten- und Luftbilder, z. B. von Maxar)
- Nacht: **NASA Black Marble**
- Ortssuche: OpenStreetMap

Für all das brauchst du **keinen Schlüssel**.

⚠️ **Nicht live:** Satellitenbilder sind Archivaufnahmen, je nach Ort einige Monate bis wenige Jahre alt. Das steht auch in der Ansicht, und Jarvis behauptet nie, das Bild sei live. Aktuell sind nur Wetter, Uhrzeit und Tag/Nacht.

**Optional, für noch schärfere Bilder und echte Berge (3D-Gelände):**
1. Kostenloses Konto bei [ion.cesium.com](https://ion.cesium.com/signup) anlegen.
2. Dort unter **Access Tokens** den „Default Token“ kopieren.
3. Bei Render als **`CESIUM_ION_TOKEN`** eintragen.

Dann nutzt die Erde Bing-Maps-Luftbilder und Cesium World Terrain.

## Webcams

- **Autobahn:** Verkehrskameras mit aktuellen Bildern aus den offenen Daten der Autobahn GmbH, z. B. „A1 bei Köln“.
- **Orte:** Suche nach öffentlichen Live-Webcams (Stadt, Strand, Berge, Skigebiet).
- Nur **offiziell öffentliche** Kameras – private oder ungesicherte Kameras sucht oder öffnet Jarvis nie.

## Wetter, Nachrichten & Wissen

- **Wetter** mit echten Daten von Open-Meteo: aktuelle Temperatur, gefühlte Temperatur, Wind und Vorhersage als Wetterkarte.
- **Nachrichten:** aktuelle Schlagzeilen von tagesschau.de zum Antippen.
- **Wissen:** Bei Fragen zu Personen, Orten oder Begriffen schaut Jarvis in der deutschen Wikipedia nach, statt zu raten.
- **„Guten Morgen!“** – Tagesüberblick mit Wetter, ungelesenen Mails, Einkaufsliste und Nachrichten.
- Unter dem Gespräch gibt es **Vorschläge zum Antippen**.

## Geld verdienen 💰

Neben dem autonomen Geld-Modus (oben) hilft Jarvis bei diesen Geschäften direkt im Gespräch:

### Website-Geschäft für Läden

1. **Laden finden:** Viele kleine Läden (Friseur, Imbiss, Nagelstudio, Handwerker, Verein) haben keine oder eine veraltete Website.
2. **Vorschau bauen:** „Jarvis, mach eine Website-Vorschau für den Friseur Haarscharf in der Bahnhofstraße.“ Jarvis legt den Laden in deiner **Kundenliste** an und baut eine animierte Website mit Leistungen, Öffnungszeiten (heute wird hervorgehoben), Aktions-Banner, Anrufen-/Route-Knöpfen und Impressum-Bereich.
3. **Hingehen und zeigen:** Besuch den Laden und zeig die Vorschau auf deinem Handy (Kunden → ↗ Vorschau). Der Laden sieht **kein Jarvis-Logo und keinen Download-Knopf**, nur ein Band „Vorschau – ein Website-Entwurf für …“.
4. **Angebot per Mail – erst nach Zustimmung:** Sagt der Laden „Schicken Sie mir das mal“, sag Jarvis: „Haarscharf ist interessiert, die Mail ist info@… , Preis 150 €“ und dann „Schick das Angebot“. Du siehst die Mail vorher und bestätigst sie; sie enthält einen Knopf zur Vorschau.
5. **Verkauft?** Status auf „Gekauft“ setzen und die Website in Jarvis **herunterladen** (Datei ohne Vorschau-Band) – die kann der Laden bei seinem Webhoster hochladen.

**Wichtig – damit du keinen Ärger bekommst:**
- **Keine Werbe-Mails ohne Einverständnis.** In Deutschland sind unerwünschte Werbe-E-Mails auch an Firmen nicht erlaubt und können teure Abmahnungen bringen. Jarvis sperrt Angebots-Mails deshalb, bis ein Kunde auf „Interessiert“ steht.
- **Nichts erfinden:** Jarvis schreibt keine erfundenen Bewertungen, Preise oder Öffnungszeiten. Frag den Laden nach den echten Angaben.
- **Impressum & Datenschutz:** Geschäftliche Websites brauchen ein Impressum (und meist eine Datenschutzerklärung). Die Angaben muss der Inhaber liefern.
- **Gewerbe:** Wer regelmäßig Geld verdient, muss in Deutschland in der Regel ein Gewerbe anmelden. Bist du unter 18, brauchst du die Zustimmung deiner Eltern.

### Kleinanzeigen

„Ich will meine alte PlayStation verkaufen“ – Jarvis fragt kurz nach Zustand und Zubehör und schreibt eine ehrliche, ansprechende Anzeige mit **Titel kopieren / Text kopieren** und Links zum Preisvergleich (ähnliche Angebote bei Kleinanzeigen, **verkaufte** Preise bei eBay). Die Anzeige landet auch unter **Meine Projekte**.

## Einkaufen

- **Produktsuche:** Jarvis zeigt eine Karte mit Knöpfen zu **Amazon**, **idealo** (Preisvergleich) und **Google Shopping**. Du tippst drauf und bestellst selbst in deinem Konto – Jarvis bestellt und bezahlt bewusst nie selbst (keine gespeicherten Zahlungsdaten, keine versehentlichen Bestellungen durch Verhörer).
- **Einkaufsliste:** Jarvis fügt hinzu, streicht, liest vor und mailt dir die Liste (mit Bestätigung). Über den Knopf **Einkaufsliste** kannst du selbst abhaken, hinzufügen und Erledigtes entfernen. Die ganze Liste leert Jarvis nur nach deiner Bestätigung.
- **Eine Liste für alle Geräte:** iPhone und Laptop sehen dieselbe Liste, Änderungen erscheinen sofort auf dem anderen Gerät. Jedes Gerät hebt zusätzlich eine Kopie auf – schläft der kostenlose Server ein, stellt das nächste Gerät die Liste wieder her.
- **Pakete:** „Wo ist mein Amazon-Paket?“ – Jarvis sucht die Versandmail in deinem Gmail.

## Websites

Beschreib Jarvis einfach, was du brauchst – er schreibt die Texte, wählt Farben, Schrift und Logo und baut die Seite aus fertigen Bausteinen: Startbereich, Text, Vorteile, Galerie, Listen (z. B. Speisekarte, Trainingszeiten), Preise, Öffnungszeiten, Fragen & Antworten, Zitat, Termin, Aktions-Banner, Kontakt und Impressum – mit Animationen (bewegter Farbverlauf, einfliegende Elemente, Glanz-Knöpfe, Scroll-Fortschritt).

- **↗ Öffnen** zeigt die Website direkt in der App. Während sie offen ist, kannst du Änderungen sagen („mach die Überschrift größer“, „andere Farben“) – die Seite aktualisiert sich von selbst.
- **Teilen:** Die ganze Website steckt im Link; jeder kann sie ohne dein Passwort ansehen.
- **Herunterladen:** speichert die Website als fertige HTML-Datei (ohne Skripte), die du überall hochladen kannst. Teilen und Herunterladen gibt es nur in Jarvis – wer den Link öffnet, sieht nur die Website.
- **Meine Projekte** listet alle Spiele und Websites.
- Jarvis erfindet keine Kontaktdaten, Preise oder Termine – die übernimmt er nur von dir.
- Bilder hochladen geht (noch) nicht; die Seiten nutzen Emojis und Farbverläufe.

## Spiele

Jarvis baut auf Zuruf eigene Handy-Spiele und gestaltet Titel, Figuren, Farben und Schwierigkeit passend zu deinem Wunsch. Sechs Spieltypen:

| Typ | So geht's |
|---|---|
| Fangen | Gutes auffangen, Gefahren ausweichen |
| Ausweichen | Herabfallenden Hindernissen ausweichen, Bonus sammeln |
| Springen | Endlos-Lauf: über Hindernisse springen (Doppelsprung!), Münzen sammeln |
| Reaktion | 30 Sekunden lang so schnell wie möglich Ziele antippen |
| Memory | Kartenpaare finden |
| Quiz | Jarvis denkt sich die Fragen selbst aus |

- **▶ Spielen** öffnet das Spiel direkt in der App; **Meine Projekte** listet alle bisherigen Spiele und Websites.
- Steuerung: Finger ziehen/tippen am iPhone, Pfeiltasten/Leertaste am PC. Bestwerte werden gespeichert.
- **Teilen:** Das ganze Spiel steckt im Link – Freunde können es ohne dein Passwort spielen, und es geht auch nach Render-Neustarts nicht verloren.
- Während du spielst, ist Jarvis' Mikrofon stumm.

## Sicherheit

- **Login:** Ohne Passwort ist nichts erreichbar – weder die Oberfläche noch die Sprachverbindung. Nach 5 falschen Versuchen wird für 15 Minuten gesperrt. Die Anmeldung gilt 30 Tage; **Abmelden** oben rechts.
- **Bestätigung bei wichtigen Aktionen:** Löschen, Verschieben, Überschreiben, Installieren, Deinstallieren, Herunterfahren/Neustart, Energiesparmodus, Programmdateien öffnen und jeder PowerShell-Befehl erscheinen als Dialog. Ohne Antwort innerhalb von 90 Sekunden wird abgebrochen. Bewusst keine Bestätigung per Sprache.
- **Löschen = Papierkorb**, geschützte Ordner (Laufwerke, Benutzerordner, Desktop/Dokumente/Downloads selbst, Windows- und Programmordner) werden nie verschoben oder gelöscht.
- **Laptop-Zugang** nur mit dem geheimen `LAPTOP_TOKEN`. Gib ihn niemandem.
- **Schlüssel** liegen nur bei Render bzw. in deinen lokalen `.env`-Dateien und erreichen nie den Browser.

## Gut zu wissen

- **Aufwachzeit:** Der kostenlose Render-Dienst schläft nach 15 Minuten ohne Nutzung ein; das erste Öffnen danach dauert etwa eine Minute. Solange der Laptop-Verbinder läuft, bleibt Jarvis wach. Ohne Laptop kannst du ihn mit einem kostenlosen Dienst wie https://cron-job.org alle 10 Minuten `https://jarvis-xxxx.onrender.com/health` aufrufen lassen (das passt in Renders 750 Gratis-Stunden pro Monat).
- **iPhone gesperrt / App im Hintergrund:** iOS stoppt dann das Mikrofon. Nach dem Zurückkehren auf **Neu verbinden** tippen.
- **Timer** erinnern dich in der App – und mit eingerichtetem Telegram auch, wenn die App geschlossen ist.
- **Mehrere Geräte** können gleichzeitig angemeldet sein; der Laptop ist für alle erreichbar.

## Fehlerbehebung

| Problem | Lösung |
|---|---|
| Login: „JARVIS_PASSWORD ist nicht gesetzt“ | In Render → Environment ein Passwort mit mindestens 8 Zeichen eintragen. |
| „Bei Render fehlt: …“ | Den genannten Schlüssel in Render → Environment eintragen. |
| Fehler mit „401“ von Deepgram | Deepgram-Schlüssel prüfen. |
| Text erscheint, aber man hört nichts | ElevenLabs-Schlüssel/Voice-ID prüfen; Stimme unter **My Voices**? Plan erlaubt API-Zugriff? Details in Render → **Logs**. Am iPhone: Lautstärke hoch, ggf. Stummschalter aus. |
| „Gmail hat die Anmeldung abgelehnt“ | App-Passwort neu erstellen und in Render bei `GMAIL_APP_PASSWORD` eintragen; `GMAIL_ADDRESS` prüfen. |
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
