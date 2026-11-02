import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NARRATION_SCRIPTS, buildNarrationFilter, narrateVideo } from '../../video-narration.js';
import { ffmpegPath } from '../../video.js';

let n = 0;
// script: sorted, inside 45 s, each line fits before the next one
const lines = NARRATION_SCRIPTS['jarvis-werbung'].lines;
lines.forEach((l, i) => { if (i) assert.ok(l.at >= lines[i - 1].at + lines[i - 1].max - 0.01, `Zeile ${i} überlappt`); assert.ok(l.at + l.max <= 44.5); });
n++;
const filter = buildNarrationFilter([{ at: 2.4, max: 1, duration: 2, file: 'a' }, { at: 5, max: 3, duration: 1, file: 'b' }], { length: 10 });
assert.match(filter, /\[1:a\]aresample=44100,atempo=1\.350,adelay=2400\|2400/); // too long → sped up (max 1.35×)
assert.match(filter, /\[2:a\]aresample=44100,adelay=5000\|5000/); // fits → unchanged
assert.match(filter, /apad=whole_dur=10/); assert.match(filter, /sidechaincompress/); n++;
await assert.rejects(narrateVideo(Buffer.from('x'), 'gibt-es-nicht'), /Unbekanntes/); n++;

const ff = ffmpegPath();
if (ff) {
  const dir = mkdtempSync(join(tmpdir(), 'narr-test-'));
  const video = join(dir, 'v.mp4');
  execFileSync(ff, ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=320x568:r=30:d=45', '-f', 'lavfi', '-i', 'sine=frequency=110:duration=45', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', video]);
  const said = [];
  const synth = async (text) => { said.push(text); const f = join(dir, `t${said.length}.mp3`); execFileSync(ff, ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=880:duration=${(text.length / 13).toFixed(2)}`, f]); return readFileSync(f); };
  const r = await narrateVideo(readFileSync(video), 'jarvis-werbung', { synth, log: {} });
  assert.equal(r.lines, lines.length); assert.equal(said[0], lines[0].text); n++;
  const out = join(dir, 'out.mp4');
  (await import('node:fs')).writeFileSync(out, r.video);
  const stderr = (args) => String(spawnSync(ff, args, { encoding: 'utf8' }).stderr);
  const info = stderr(['-hide_banner', '-i', out]);
  assert.match(info, /Duration: 00:00:4[45]/); assert.match(info, /Video: h264/); assert.match(info, /Audio: aac/); n++;
  // the voice (880 Hz) is there while a sentence is spoken and not in the pause after it
  const level = (from, to) => Number(/mean_volume: (-?[\d.]+)/.exec(stderr(['-hide_banner', '-ss', String(from), '-to', String(to), '-i', out, '-af', 'bandpass=f=880:width_type=q:w=30,volumedetect', '-vn', '-f', 'null', '-']))?.[1] ?? -99);
  assert.ok(level(2.6, 4.6) > level(6, 8) + 20, 'Stimme an der richtigen Stelle'); n++;
}
console.log(`video-narration: ${n} bestanden`);
