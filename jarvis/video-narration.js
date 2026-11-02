// Narration for finished videos: Jarvis speaks the on-screen texts with his
// own voice (Deepgram, the server's DEEPGRAM_API_KEY) exactly when they
// appear, and mixes them into the video with ffmpeg. The music is ducked
// while he speaks; the picture is copied unchanged.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegPath, synthesizeVoice } from './video.js';

// at = second in the video, max = time until the next text (longer clips are
// sped up slightly, at most 1.35×).
export const NARRATION_SCRIPTS = {
  'jarvis-werbung': {
    title: 'Jarvis-Werbung mit Aktion (TikTok, 46,5 s)',
    lines: [
      { at: 2.4, max: 3.0, text: 'Die Zukunft der künstlichen Intelligenz beginnt jetzt.' },
      { at: 8.4, max: 0.95, text: 'Meet Jarvis.' },
      { at: 9.35, max: 1.95, text: 'Your personal AI assistant.' },
      { at: 11.65, max: 1.8, text: 'Sprachsteuerung.' },
      { at: 13.75, max: 1.8, text: 'Telegram.' },
      { at: 15.85, max: 1.8, text: 'Gedächtnis.' },
      { at: 17.95, max: 1.8, text: 'Websites.' },
      { at: 20.05, max: 1.8, text: 'Spiele und Apps.' },
      { at: 22.15, max: 1.8, text: '3D-Welten.' },
      { at: 24.25, max: 1.8, text: 'Im Hintergrund.' },
      { at: 26.35, max: 1.8, text: 'Video Studio.' },
      { at: 28.45, max: 1.1, text: 'Analysiere Code.' },
      { at: 29.65, max: 1.5, text: 'Fehler erkannt.' },
      { at: 31.35, max: 1.0, text: 'Repariert.' },
      { at: 32.45, max: 1.4, text: 'Bug fixed.' },
      { at: 34.4, max: 1.15, text: 'More than an assistant.' },
      { at: 35.65, max: 2.2, text: 'An AI that keeps growing.' },
      { at: 39.5, max: 1.8, text: 'Willst du Jarvis auch haben?' },
      { at: 41.4, max: 2.4, text: 'Die ersten drei bekommen Jarvis kostenlos!' },
      { at: 43.9, max: 1.3, text: 'Schreib mir privat.' },
      { at: 45.3, max: 1.0, text: 'DM me.' }
    ]
  }
};

function run(binary, args) {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { timeout: 5 * 60_000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(String(stderr).split('\n').filter(Boolean).slice(-2).join(' ') || error.message));
      else resolve(String(stderr));
    });
  });
}

// Duration of a media file in seconds (from ffmpeg's own output, no ffprobe needed).
export async function mediaInfo(binary, file) {
  const out = await new Promise((resolve) => execFile(binary, ['-hide_banner', '-i', file], (error, stdout, stderr) => resolve(String(stderr))));
  const m = out.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  return { duration: m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0, hasAudio: /Stream #[^\n]*Audio:/.test(out), hasVideo: /Stream #[^\n]*Video:/.test(out) };
}
export const mediaDuration = async (binary, file) => (await mediaInfo(binary, file)).duration;

export function buildNarrationFilter(clips, { musicInput = 0, length = 0 } = {}) {
  const parts = clips.map((c, i) => {
    const tempo = c.duration > c.max ? Math.min(1.35, c.duration / c.max) : 1;
    const ms = Math.round(c.at * 1000);
    return `[${i + 1}:a]aresample=44100,${tempo > 1.001 ? `atempo=${tempo.toFixed(3)},` : ''}adelay=${ms}|${ms},volume=1.7[v${i}]`;
  });
  const voices = clips.map((_, i) => `[v${i}]`).join('');
  return [
    ...parts,
    `${voices}amix=inputs=${clips.length}:normalize=0:dropout_transition=0[voice]`,
    `[voice]apad${length ? `=whole_dur=${length}` : ''}[vpad]`,
    '[vpad]asplit=2[vmix][vkey]',
    `[${musicInput}:a]aresample=44100[music]`,
    '[music][vkey]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=350:makeup=1[ducked]',
    '[ducked][vmix]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[aout]'
  ].join(';');
}

export async function narrateVideo(video, scriptName, { synth = synthesizeVoice, log = console } = {}) {
  const script = NARRATION_SCRIPTS[scriptName];
  if (!script) throw new Error('Unbekanntes Sprecher-Skript.');
  const binary = ffmpegPath();
  if (!binary) throw new Error('Auf dem Server ist kein ffmpeg verfügbar.');
  if (!video?.length) throw new Error('Kein Video empfangen.');
  const dir = await mkdtemp(join(tmpdir(), 'jarvis-narration-'));
  try {
    const input = join(dir, 'in.mp4');
    await writeFile(input, video);
    const info = await mediaInfo(binary, input);
    const length = info.duration;
    if (!length || !info.hasVideo) throw new Error('Die Datei ist kein lesbares Video.');
    const clips = [];
    for (const [i, line] of script.lines.entries()) {
      if (line.at >= length) continue;
      const file = join(dir, `voice-${i}.mp3`);
      await writeFile(file, await synth(line.text));
      clips.push({ ...line, file, duration: await mediaDuration(binary, file) });
    }
    if (!clips.length) throw new Error('Das Video ist zu kurz für das Skript.');
    const output = join(dir, 'out.mp4');
    // Videos without sound get a silent track to mix into.
    const silence = info.hasAudio ? [] : ['-f', 'lavfi', '-t', String(length), '-i', 'anullsrc=r=44100:cl=stereo'];
    const musicInput = info.hasAudio ? 0 : clips.length + 1;
    await run(binary, ['-y', '-i', input, ...clips.flatMap((c) => ['-i', c.file]), ...silence, '-filter_complex', buildNarrationFilter(clips, { musicInput, length }), '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '44100', '-movflags', '+faststart', '-t', String(length), output]);
    log.log?.(`Vertonung: ${clips.length} Sätze gesprochen.`);
    return { video: await readFile(output), lines: clips.length, characters: clips.reduce((n, c) => n + c.text.length, 0) };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
