// Computer-control functions Jarvis may call. Each tool is exposed to the
// Voice Agent as a client-side function and runs here on the laptop.
// Tools with `confirm` only run after the user approves them on screen.
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const isWindows = process.platform === 'win32';
const home = os.homedir();
const MAX_OUTPUT = 4000;

function truncate(text, max = MAX_OUTPUT) {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max)}\n… (gekürzt)` : value;
}

function run(command, args, { timeout = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(truncate((stderr || stdout || error.message).trim(), 1500)));
      else resolve(stdout.trim());
    });
  });
}

// Values are embedded as single-quoted PowerShell literals and the script is
// passed base64-encoded, so user input can never break out into code.
function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function powershell(script, options) {
  if (!isWindows) return Promise.reject(new Error('Diese Aktion funktioniert nur unter Windows.'));
  const full = `$ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[Text.Encoding]::UTF8; ${script}`;
  const encoded = Buffer.from(full, 'utf16le').toString('base64');
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], options);
}

function requireWindows() {
  if (!isWindows) throw new Error('Diese Aktion funktioniert nur unter Windows.');
}

// --- Paths -----------------------------------------------------------------

const folderAliases = {
  desktop: 'Desktop', schreibtisch: 'Desktop',
  dokumente: 'MyDocuments', documents: 'MyDocuments', dokument: 'MyDocuments',
  downloads: 'Downloads',
  bilder: 'MyPictures', pictures: 'MyPictures', fotos: 'MyPictures',
  musik: 'MyMusic', music: 'MyMusic',
  videos: 'MyVideos'
};
let knownFolders;

// Desktop/Documents may be redirected to OneDrive, so ask Windows where they are.
async function getKnownFolders() {
  if (knownFolders) return knownFolders;
  const fallback = {
    Desktop: path.join(home, 'Desktop'), MyDocuments: path.join(home, 'Documents'),
    Downloads: path.join(home, 'Downloads'), MyPictures: path.join(home, 'Pictures'),
    MyMusic: path.join(home, 'Music'), MyVideos: path.join(home, 'Videos')
  };
  knownFolders = fallback;
  if (isWindows) {
    try {
      const json = await powershell("@{Desktop=[Environment]::GetFolderPath('Desktop');MyDocuments=[Environment]::GetFolderPath('MyDocuments');MyPictures=[Environment]::GetFolderPath('MyPictures');MyMusic=[Environment]::GetFolderPath('MyMusic');MyVideos=[Environment]::GetFolderPath('MyVideos')} | ConvertTo-Json -Compress");
      knownFolders = { ...fallback, ...JSON.parse(json) };
    } catch {
      // keep fallback
    }
  }
  return knownFolders;
}

async function resolvePath(input) {
  const raw = String(input ?? '').trim().replace(/^["']|["']$/g, '');
  if (!raw) throw new Error('Kein Pfad angegeben.');
  const [first, ...rest] = raw.split(/[\\/]+/);
  const alias = folderAliases[first.toLowerCase()];
  if (alias) return path.join((await getKnownFolders())[alias], ...rest);
  if (path.isAbsolute(raw) || /^[a-zA-Z]:[\\/]/.test(raw)) return path.normalize(raw);
  return path.join(home, raw);
}

// Drive roots, the user folder, the known folders themselves and system
// directories are never moved or deleted.
async function isProtectedPath(target) {
  const norm = (p) => path.resolve(p).toLowerCase().replace(/[\\/]+$/, '');
  const value = norm(target);
  const exact = [path.parse(path.resolve(target)).root, home, ...Object.values(await getKnownFolders())].map(norm);
  const systemDirs = [process.env.SystemRoot || 'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)', 'C:\\ProgramData'].map(norm);
  return exact.includes(value) || systemDirs.some((dir) => value === dir || value.startsWith(dir + path.sep));
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

const executableExtensions = new Set(['.exe', '.bat', '.cmd', '.com', '.ps1', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.msi', '.msix', '.jar', '.lnk', '.scr', '.reg', '.hta', '.cpl']);

// --- Apps ------------------------------------------------------------------

const knownApps = {
  editor: 'notepad.exe', notepad: 'notepad.exe', texteditor: 'notepad.exe',
  rechner: 'calc.exe', taschenrechner: 'calc.exe', calculator: 'calc.exe',
  explorer: 'explorer.exe', dateiexplorer: 'explorer.exe', dateien: 'explorer.exe',
  chrome: 'chrome.exe', googlechrome: 'chrome.exe',
  edge: 'msedge.exe', microsoftedge: 'msedge.exe',
  firefox: 'firefox.exe',
  spotify: 'spotify:',
  word: 'winword.exe', excel: 'excel.exe', powerpoint: 'powerpnt.exe', outlook: 'outlook.exe',
  paint: 'mspaint.exe',
  taskmanager: 'taskmgr.exe',
  einstellungen: 'ms-settings:', settings: 'ms-settings:', systemsteuerung: 'control.exe',
  terminal: 'wt.exe', eingabeaufforderung: 'cmd.exe', powershell: 'powershell.exe',
  whatsapp: 'whatsapp:', teams: 'msteams:', steam: 'steam://open/main',
  kamera: 'microsoft.windows.camera:', uhr: 'ms-clock:', wecker: 'ms-clock:',
  kalender: 'outlookcal:', mail: 'outlookmail:', store: 'ms-windows-store:',
  snippingtool: 'ms-screenclip:', bildschirmausschnitt: 'ms-screenclip:',
  vscode: 'code', visualstudiocode: 'code'
};

const appProcesses = {
  editor: ['notepad'], notepad: ['notepad'], texteditor: ['notepad'],
  rechner: ['CalculatorApp', 'Calculator'], taschenrechner: ['CalculatorApp', 'Calculator'], calculator: ['CalculatorApp', 'Calculator'],
  chrome: ['chrome'], googlechrome: ['chrome'], edge: ['msedge'], microsoftedge: ['msedge'], firefox: ['firefox'],
  spotify: ['Spotify'], word: ['WINWORD'], excel: ['EXCEL'], powerpoint: ['POWERPNT'], outlook: ['OUTLOOK'],
  paint: ['mspaint'], taskmanager: ['Taskmgr'], teams: ['Teams', 'ms-teams'], whatsapp: ['WhatsApp'], steam: ['steam'],
  vscode: ['Code'], visualstudiocode: ['Code'], discord: ['Discord']
};

function appKey(name) {
  return String(name ?? '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
}

// --- Tool definitions ------------------------------------------------------

const searchUrls = {
  google: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  youtube: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
  maps: (q) => `https://www.google.com/maps/search/${encodeURIComponent(q)}`,
  wikipedia: (q) => `https://de.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}`
};

const mediaKeys = { mute: 173, volume_down: 174, volume_up: 175, next: 176, previous: 177, play_pause: 179 };

function normalizeUrl(input) {
  let value = String(input ?? '').trim();
  if (!value) throw new Error('Keine Adresse angegeben.');
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = `https://${value}`;
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Nur http- und https-Adressen sind erlaubt.');
  return url.href;
}

export const tools = [
  {
    name: 'get_datetime',
    description: 'Liefert aktuelles Datum, Uhrzeit und Wochentag.',
    parameters: { type: 'object', properties: {} },
    label: () => 'Uhrzeit abgefragt',
    run: async () => {
      const now = new Date();
      return {
        datum: now.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }),
        wochentag: now.toLocaleDateString('de-DE', { weekday: 'long' }),
        uhrzeit: now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
      };
    }
  },
  {
    name: 'open_website',
    description: 'Öffnet eine Webseite im Standardbrowser.',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string', description: 'Adresse, z. B. "youtube.com" oder "https://wetter.de"' } },
      required: ['url']
    },
    label: (a) => `Webseite öffnen: ${a.url}`,
    run: async ({ url }) => {
      const href = normalizeUrl(url);
      await powershell(`Start-Process ${psQuote(href)}`);
      return { geoeffnet: href };
    }
  },
  {
    name: 'web_search',
    description: 'Sucht im Browser bei Google, YouTube, Google Maps oder Wikipedia und zeigt die Ergebnisse an. Nutze das für aktuelle Informationen, Wetter, Nachrichten, Videos oder Orte.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Suchbegriff' },
        platform: { type: 'string', enum: Object.keys(searchUrls), description: 'Wo gesucht wird. Standard: google' }
      },
      required: ['query']
    },
    label: (a) => `Suche (${a.platform || 'google'}): ${a.query}`,
    run: async ({ query, platform = 'google' }) => {
      const href = (searchUrls[platform] || searchUrls.google)(String(query ?? ''));
      await powershell(`Start-Process ${psQuote(href)}`);
      return { geoeffnet: href, hinweis: 'Die Ergebnisse werden im Browser angezeigt; du kannst sie nicht selbst lesen.' };
    }
  },
  {
    name: 'open_app',
    description: 'Startet ein installiertes Programm oder eine App, z. B. Spotify, Chrome, Word, Rechner, Editor, Einstellungen, Explorer, Discord.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Name des Programms' } },
      required: ['name']
    },
    label: (a) => `Programm starten: ${a.name}`,
    run: async ({ name }) => {
      requireWindows();
      const target = knownApps[appKey(name)];
      if (target) {
        try {
          await powershell(`Start-Process ${psQuote(target)}`);
          return { gestartet: name };
        } catch {
          // fall through to the Start menu search
        }
      }
      // Only apps listed in the Start menu can be launched this way, never arbitrary files.
      const found = await powershell(
        `$n = ${psQuote(String(name ?? '').trim())}; $app = Get-StartApps | Where-Object { $_.Name -like "*$n*" } | Select-Object -First 1; if ($app) { Start-Process ('shell:AppsFolder\\' + $app.AppID); $app.Name }`
      );
      if (!found) throw new Error(`Ich habe kein Programm namens „${name}“ im Startmenü gefunden.`);
      return { gestartet: found };
    }
  },
  {
    name: 'close_app',
    description: 'Schließt ein Programm sauber (wie mit dem X-Knopf; ungespeicherte Arbeit fragt das Programm selbst ab).',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Name des Programms, z. B. Spotify, Chrome, Word' } },
      required: ['name']
    },
    label: (a) => `Programm schließen: ${a.name}`,
    run: async ({ name }) => {
      const names = appProcesses[appKey(name)] || [String(name ?? '').trim()];
      const list = names.map(psQuote).join(',');
      const count = await powershell(
        `$p = Get-Process -Name ${list} -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }; $p | ForEach-Object { [void]$_.CloseMainWindow() }; @($p).Count`
      );
      if (Number(count) === 0) throw new Error(`„${name}“ scheint nicht geöffnet zu sein.`);
      return { geschlosseneFenster: Number(count) };
    }
  },
  {
    name: 'media_control',
    description: 'Steuert Medienwiedergabe und Lautstärke: Wiedergabe/Pause, nächster/vorheriger Titel, lauter, leiser, stumm.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: Object.keys(mediaKeys) },
        steps: { type: 'integer', description: 'Für lauter/leiser: Anzahl Schritte à 2 %. Standard 5.' }
      },
      required: ['action']
    },
    label: (a) => `Medien: ${a.action}`,
    run: async ({ action, steps }) => {
      const key = mediaKeys[action];
      if (!key) throw new Error('Unbekannte Medienaktion.');
      const repeat = action.startsWith('volume') ? Math.min(Math.max(Number(steps) || 5, 1), 50) : 1;
      await powershell(`$w = New-Object -ComObject WScript.Shell; 1..${repeat} | ForEach-Object { $w.SendKeys([char]${key}) }`);
      return { ausgefuehrt: action };
    }
  },
  {
    name: 'set_volume',
    description: 'Stellt die Systemlautstärke auf einen Prozentwert (0–100).',
    parameters: {
      type: 'object',
      properties: { level: { type: 'integer', description: 'Lautstärke in Prozent' } },
      required: ['level']
    },
    label: (a) => `Lautstärke auf ${a.level} %`,
    run: async ({ level }) => {
      const target = Math.min(Math.max(Math.round(Number(level) || 0), 0), 100);
      await powershell(`$w = New-Object -ComObject WScript.Shell; 1..50 | ForEach-Object { $w.SendKeys([char]174) }; ${Math.round(target / 2) > 0 ? `1..${Math.round(target / 2)} | ForEach-Object { $w.SendKeys([char]175) }` : ''}`);
      return { lautstaerke: target };
    }
  },
  {
    name: 'system_info',
    description: 'Liefert Akkustand, CPU- und RAM-Auslastung, freien Speicherplatz auf C: und Betriebszeit.',
    parameters: { type: 'object', properties: {} },
    label: () => 'Systemstatus abgefragt',
    run: async () => JSON.parse(await powershell(
      "$os = Get-CimInstance Win32_OperatingSystem; $cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average; " +
      "$bat = Get-CimInstance Win32_Battery | Select-Object -First 1; $disk = Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='C:'\"; " +
      '[pscustomobject]@{ cpuAuslastungProzent=$cpu; ramGesamtGB=[math]::Round($os.TotalVisibleMemorySize/1MB,1); ramFreiGB=[math]::Round($os.FreePhysicalMemory/1MB,1); ' +
      'akkuProzent=$(if ($bat) { $bat.EstimatedChargeRemaining } else { $null }); netzteilAngeschlossen=$(if ($bat) { $bat.BatteryStatus -eq 2 } else { $null }); ' +
      'laufwerkCFreiGB=[math]::Round($disk.FreeSpace/1GB,1); laufwerkCGesamtGB=[math]::Round($disk.Size/1GB,1); betriebszeitStunden=[math]::Round(((Get-Date)-$os.LastBootUpTime).TotalHours,1) } | ConvertTo-Json -Compress'
    ))
  },
  {
    name: 'list_files',
    description: 'Listet Dateien und Ordner in einem Verzeichnis auf. Ordner-Kurznamen: Desktop, Dokumente, Downloads, Bilder, Musik, Videos (auch mit Unterordner, z. B. "Dokumente/Rechnungen").',
    parameters: {
      type: 'object',
      properties: { folder: { type: 'string', description: 'Ordner, z. B. "Downloads" oder "C:\\Projekte"' } },
      required: ['folder']
    },
    label: (a) => `Ordner anzeigen: ${a.folder}`,
    run: async ({ folder }) => {
      const dir = await resolvePath(folder);
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const items = await Promise.all(entries.slice(0, 200).map(async (entry) => {
        const stat = await fs.stat(path.join(dir, entry.name)).catch(() => null);
        return { name: entry.name, typ: entry.isDirectory() ? 'Ordner' : 'Datei', groesseKB: entry.isFile() && stat ? Math.round(stat.size / 1024) : undefined, geaendert: stat?.mtime.toISOString().slice(0, 10) };
      }));
      items.sort((a, b) => (b.geaendert || '').localeCompare(a.geaendert || ''));
      return { ordner: dir, anzahl: entries.length, eintraege: items.slice(0, 60) };
    }
  },
  {
    name: 'find_files',
    description: 'Sucht Dateien oder Ordner, deren Name den Suchbegriff enthält (rekursiv, standardmäßig im Benutzerordner).',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Teil des Dateinamens' },
        folder: { type: 'string', description: 'Wo gesucht wird. Standard: Benutzerordner' }
      },
      required: ['query']
    },
    label: (a) => `Dateisuche: ${a.query}`,
    run: async ({ query, folder }) => {
      const needle = String(query ?? '').toLowerCase();
      if (!needle) throw new Error('Kein Suchbegriff angegeben.');
      const start = folder ? await resolvePath(folder) : home;
      const results = [];
      const skip = new Set(['node_modules', 'appdata', '$recycle.bin', 'windows', '.git']);
      let visited = 0;
      async function walk(dir, depth) {
        if (depth > 6 || results.length >= 30 || visited > 20000) return;
        const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
          visited += 1;
          if (results.length >= 30) return;
          const full = path.join(dir, entry.name);
          if (entry.name.toLowerCase().includes(needle)) results.push(full);
          if (entry.isDirectory() && !entry.name.startsWith('.') && !skip.has(entry.name.toLowerCase())) await walk(full, depth + 1);
        }
      }
      await walk(start, 0);
      return { gesuchtIn: start, treffer: results };
    }
  },
  {
    name: 'open_path',
    description: 'Öffnet eine Datei mit dem passenden Programm oder einen Ordner im Explorer.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Pfad oder Kurzname wie "Downloads"' } },
      required: ['path']
    },
    label: (a) => `Öffnen: ${a.path}`,
    confirm: async ({ path: p }) => {
      const target = await resolvePath(p);
      return executableExtensions.has(path.extname(target).toLowerCase())
        ? { title: 'Programmdatei ausführen?', detail: target }
        : null;
    },
    run: async ({ path: p }) => {
      const target = await resolvePath(p);
      if (!(await exists(target))) throw new Error(`Nicht gefunden: ${target}`);
      await powershell(`Start-Process -FilePath ${psQuote(target)}`);
      return { geoeffnet: target };
    }
  },
  {
    name: 'read_text_file',
    description: 'Liest den Inhalt einer Textdatei (z. B. .txt, .md, .csv, .json, Quellcode), um ihn zusammenzufassen oder Fragen dazu zu beantworten.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path']
    },
    label: (a) => `Datei lesen: ${a.path}`,
    run: async ({ path: p }) => {
      const target = await resolvePath(p);
      const buffer = await fs.readFile(target);
      if (buffer.subarray(0, 8000).includes(0)) throw new Error('Das ist keine Textdatei.');
      return { datei: target, inhalt: truncate(buffer.toString('utf8'), 12000) };
    }
  },
  {
    name: 'write_text_file',
    description: 'Erstellt eine Textdatei (z. B. Notiz, Liste, Entwurf). Ohne Ordnerangabe landet sie in Dokumente/Jarvis. Bestehende Dateien werden nur nach Bestätigung überschrieben.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Dateiname oder Pfad, z. B. "Einkaufsliste.txt" oder "Desktop/Notiz.txt"' },
        content: { type: 'string', description: 'Inhalt der Datei' }
      },
      required: ['path', 'content']
    },
    label: (a) => `Datei schreiben: ${a.path}`,
    confirm: async (args) => {
      const target = await writeTarget(args.path);
      return (await exists(target)) ? { title: 'Bestehende Datei überschreiben?', detail: target } : null;
    },
    run: async ({ path: p, content }) => {
      const target = await writeTarget(p);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, String(content ?? ''), 'utf8');
      return { gespeichert: target };
    }
  },
  {
    name: 'create_folder',
    description: 'Legt einen neuen Ordner an.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'z. B. "Desktop/Projekte"' } },
      required: ['path']
    },
    label: (a) => `Ordner anlegen: ${a.path}`,
    run: async ({ path: p }) => {
      const target = await resolvePath(p);
      await fs.mkdir(target, { recursive: true });
      return { angelegt: target };
    }
  },
  {
    name: 'move_path',
    description: 'Verschiebt oder benennt eine Datei bzw. einen Ordner um. Benötigt Bestätigung.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Quelle' },
        to: { type: 'string', description: 'Ziel (neuer Pfad inklusive Name)' }
      },
      required: ['from', 'to']
    },
    label: (a) => `Verschieben: ${a.from} → ${a.to}`,
    confirm: async ({ from, to }) => ({ title: 'Verschieben / umbenennen?', detail: `${await resolvePath(from)}\n→ ${await resolvePath(to)}` }),
    run: async ({ from, to }) => {
      const source = await resolvePath(from);
      const target = await resolvePath(to);
      if (await isProtectedPath(source)) throw new Error('Dieser Ordner ist geschützt.');
      if (await exists(target)) throw new Error(`Am Ziel existiert bereits etwas: ${target}`);
      await fs.mkdir(path.dirname(target), { recursive: true });
      try {
        await fs.rename(source, target);
      } catch (error) {
        if (error.code !== 'EXDEV') throw error;
        await fs.cp(source, target, { recursive: true, errorOnExist: true });
        await fs.rm(source, { recursive: true });
      }
      return { verschoben: target };
    }
  },
  {
    name: 'delete_path',
    description: 'Löscht eine Datei oder einen Ordner, indem er in den Papierkorb verschoben wird. Benötigt immer Bestätigung.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path']
    },
    label: (a) => `Löschen: ${a.path}`,
    confirm: async ({ path: p }) => ({ title: 'In den Papierkorb verschieben?', detail: await resolvePath(p) }),
    run: async ({ path: p }) => {
      requireWindows();
      const target = await resolvePath(p);
      if (await isProtectedPath(target)) throw new Error('Dieser Ordner ist geschützt und wird nicht gelöscht.');
      if (!(await exists(target))) throw new Error(`Nicht gefunden: ${target}`);
      const quoted = psQuote(target);
      await powershell(
        `Add-Type -AssemblyName Microsoft.VisualBasic; if (Test-Path -LiteralPath ${quoted} -PathType Container) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory(${quoted}, 'OnlyErrorDialogs', 'SendToRecycleBin') } else { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(${quoted}, 'OnlyErrorDialogs', 'SendToRecycleBin') }`
      );
      return { imPapierkorb: target };
    }
  },
  {
    name: 'clipboard',
    description: 'Liest die Zwischenablage oder kopiert Text hinein (z. B. damit der Nutzer einen Text einfügen kann).',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['read', 'write'] },
        text: { type: 'string', description: 'Nur bei write: Text für die Zwischenablage' }
      },
      required: ['action']
    },
    label: (a) => (a.action === 'write' ? 'In Zwischenablage kopiert' : 'Zwischenablage gelesen'),
    run: async ({ action, text }) => {
      if (action === 'write') {
        await powershell(`Set-Clipboard -Value ${psQuote(text ?? '')}`);
        return { kopiert: true };
      }
      return { inhalt: truncate(await powershell('Get-Clipboard -Raw')) };
    }
  },
  {
    name: 'search_software',
    description: 'Sucht Programme im Windows-Paketmanager winget. Nutze das vor install_software, um die genaue Paket-ID zu finden.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query']
    },
    label: (a) => `Software suchen: ${a.query}`,
    run: async ({ query }) => {
      requireWindows();
      const output = await run('winget', ['search', '--query', String(query ?? ''), '--accept-source-agreements', '--disable-interactivity'], { timeout: 60000 });
      return { ergebnis: truncate(output.replace(/^[\s\S]*?(?=Name\s)/, ''), 3000) };
    }
  },
  {
    name: 'install_software',
    description: 'Installiert ein Programm über winget anhand der genauen Paket-ID. Benötigt immer Bestätigung.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Exakte winget-Paket-ID, z. B. "VideoLAN.VLC"' },
        name: { type: 'string', description: 'Anzeigename des Programms' }
      },
      required: ['id']
    },
    label: (a) => `Installieren: ${a.name || a.id}`,
    confirm: async ({ id, name }) => ({ title: 'Software installieren?', detail: `${name ? `${name}\n` : ''}winget install --id ${id}` }),
    run: async ({ id }) => {
      requireWindows();
      const output = await run('winget', ['install', '--id', String(id), '--exact', '--silent', '--accept-source-agreements', '--accept-package-agreements', '--disable-interactivity'], { timeout: 15 * 60 * 1000 });
      return { ergebnis: truncate(output.split(/\r?\n/).slice(-6).join('\n'), 1500) };
    }
  },
  {
    name: 'uninstall_software',
    description: 'Deinstalliert ein Programm über winget. Benötigt immer Bestätigung.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Exakte winget-Paket-ID oder exakter Name' },
        name: { type: 'string' }
      },
      required: ['id']
    },
    label: (a) => `Deinstallieren: ${a.name || a.id}`,
    confirm: async ({ id, name }) => ({ title: 'Software deinstallieren?', detail: `${name ? `${name}\n` : ''}winget uninstall --id ${id}` }),
    run: async ({ id }) => {
      requireWindows();
      const output = await run('winget', ['uninstall', '--id', String(id), '--exact', '--silent', '--disable-interactivity'], { timeout: 15 * 60 * 1000 });
      return { ergebnis: truncate(output.split(/\r?\n/).slice(-6).join('\n'), 1500) };
    }
  },
  {
    name: 'power_action',
    description: 'Sperrt den Bildschirm, versetzt den Laptop in den Energiesparmodus, fährt ihn herunter oder startet ihn neu (jeweils mit 60 Sekunden Vorlauf) oder bricht ein geplantes Herunterfahren ab.',
    parameters: {
      type: 'object',
      properties: { action: { type: 'string', enum: ['lock', 'sleep', 'shutdown', 'restart', 'cancel_shutdown'] } },
      required: ['action']
    },
    label: (a) => `Energie: ${a.action}`,
    confirm: async ({ action }) => ({
      sleep: { title: 'Energiesparmodus?', detail: 'Der Laptop wechselt sofort in den Energiesparmodus.' },
      shutdown: { title: 'Herunterfahren?', detail: 'Der Laptop fährt in 60 Sekunden herunter. Ungespeicherte Arbeit geht verloren.' },
      restart: { title: 'Neu starten?', detail: 'Der Laptop startet in 60 Sekunden neu. Ungespeicherte Arbeit geht verloren.' }
    })[action] || null,
    run: async ({ action }) => {
      requireWindows();
      if (action === 'lock') await run('rundll32.exe', ['user32.dll,LockWorkStation']);
      else if (action === 'shutdown') await run('shutdown.exe', ['/s', '/t', '60']);
      else if (action === 'restart') await run('shutdown.exe', ['/r', '/t', '60']);
      else if (action === 'cancel_shutdown') await run('shutdown.exe', ['/a']);
      else if (action === 'sleep') await powershell("Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false)");
      else throw new Error('Unbekannte Aktion.');
      return { ausgefuehrt: action };
    }
  },
  {
    name: 'set_timer',
    description: 'Stellt einen Timer oder eine Erinnerung. Jarvis meldet sich nach Ablauf (solange die Oberfläche geöffnet ist).',
    parameters: {
      type: 'object',
      properties: {
        minutes: { type: 'number', description: 'Dauer in Minuten (Dezimalzahlen erlaubt, z. B. 0.5 für 30 Sekunden)' },
        message: { type: 'string', description: 'Woran erinnert werden soll' }
      },
      required: ['minutes']
    },
    label: (a) => `Timer: ${a.minutes} min${a.message ? ` – ${a.message}` : ''}`,
    run: async ({ minutes, message }, context) => {
      const ms = Math.round(Number(minutes) * 60000);
      if (!(ms > 0) || ms > 24 * 3600000) throw new Error('Die Dauer muss zwischen ein paar Sekunden und 24 Stunden liegen.');
      context.schedule(ms, String(message || 'Dein Timer ist abgelaufen.'));
      const due = new Date(Date.now() + ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      return { gestellt: true, faelligUm: due };
    }
  },
  {
    name: 'run_powershell',
    description: 'Führt einen PowerShell-Befehl aus, wenn kein anderes Werkzeug passt (z. B. WLAN-Info, Prozesse, Netzwerk, Dateien zählen, Einstellungen abfragen). Der Nutzer sieht den Befehl und muss ihn bestätigen. Bevorzuge lesende Befehle.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Der PowerShell-Befehl' },
        purpose: { type: 'string', description: 'Kurze Erklärung auf Deutsch, was der Befehl tut' }
      },
      required: ['command', 'purpose']
    },
    label: (a) => `PowerShell: ${a.purpose || a.command}`,
    confirm: async ({ command, purpose }) => ({ title: purpose ? `PowerShell: ${purpose}` : 'PowerShell-Befehl ausführen?', detail: String(command ?? ''), code: true }),
    run: async ({ command }) => ({ ausgabe: truncate(await powershell(`${command} | Out-String -Width 200`, { timeout: 60000 })) || '(keine Ausgabe)' })
  }
];

async function writeTarget(p) {
  const raw = String(p ?? '').trim();
  if (!raw) throw new Error('Kein Dateiname angegeben.');
  const hasFolder = /[\\/]/.test(raw) || path.isAbsolute(raw);
  return hasFolder ? resolvePath(raw) : path.join((await getKnownFolders()).MyDocuments, 'Jarvis', raw);
}

export function findTool(name) {
  return tools.find((tool) => tool.name === name);
}

// Function definitions in the shape the Voice Agent `think.functions` setting expects.
// No `endpoint` means the agent hands the call to us (client-side). Actions that need
// confirmation wait until the user's turn is confirmed before they are dispatched.
export const functionDefinitions = tools.map(({ name, description, parameters, confirm }) => ({
  name,
  description,
  parameters,
  ...(confirm ? { defer_until_eot: true } : {})
}));
