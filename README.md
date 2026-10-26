# Freundschafts-Multiversum

## Lokal starten

1. Installiere Node.js 18 oder neuer.
2. Öffne ein Terminal in diesem Ordner.
3. Führe `npm install` und danach `npm start` aus.
4. Öffne `http://localhost:8787`.

Der lokale Spielmodus funktioniert auch weiterhin direkt über die HTML-Datei. Der öffentliche Modus braucht den Server.

## Öffentlicher Server mit Render

Die Datei `render.yaml` ist für Render vorbereitet. Render kann den Node-Webserver samt WebSockets und TLS hosten; der Browser verwendet dann automatisch `wss://` für Lobby und Voice-Signalisierung.

1. Lege ein GitHub-Repository für diese Projektdateien an. Es kann privat bleiben.
2. Lade `index.html`, `public.js`, `server.js`, `package.json` und `render.yaml` ins Repository.
3. Verbinde GitHub mit Render und wähle **New → Blueprint**.
4. Wähle das Repository mit `render.yaml` aus und bestätige den kostenlosen Web Service.
5. Nach dem Deploy öffnest du die Render-Adresse mit der Endung `.onrender.com` und teilst sie mit deinen Freunden.

Render bietet kostenlose Web Services für Hobbyprojekte und unterstützt WebSockets und TLS. Der kostenlose Dienst fährt nach 15 Minuten ohne eingehenden HTTP- oder WebSocket-Verkehr herunter; beim nächsten Besuch kann das Aufwachen ungefähr eine Minute dauern. Free-Instanzen sind zum Ausprobieren gedacht, nicht für ein dauerhaft verfügbares Spiel.

## Voice Chat

Voice ist freiwillig. Das Mikrofon wird erst nach einem Klick im Spiel und deiner Browserfreigabe aktiviert. Du kannst dein Mikro und einzelne Mitspieler stummschalten oder die Runde verlassen. Gespräche werden nicht aufgezeichnet. Die Stimme läuft direkt zwischen den Browsern; bei manchen Netzwerken kann ein zusätzlicher TURN-Relay nötig sein.
