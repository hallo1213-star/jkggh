@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Jarvis
where node >nul 2>nul || (
  echo Node.js ist nicht installiert. Bitte die LTS-Version von https://nodejs.org installieren.
  pause
  exit /b 1
)
if not exist .env (
  copy .env.example .env >nul
  echo Bitte trage deine Schluessel in die Datei .env ein, speichere sie und schliesse den Editor.
  notepad .env
)
if not exist node_modules (
  echo Installiere Abhaengigkeiten ...
  call npm install || (pause & exit /b 1)
)
node server.js
pause
