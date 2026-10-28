// Turns the recorded card and chip sounds into the game's sound files.
//
// Source: "Casino Audio" by Kenney (www.kenney.nl), CC0 1.0 — free for
// commercial use, no attribution required. Download the pack from
// https://kenney.nl/assets/casino-audio, unzip it and pass its Audio folder:
//
//   node scripts/import-card-sounds.mjs path/to/kenney_casino-audio/Audio
//
// Needs ffmpeg on the PATH. Every file is made mono, trimmed of leading and
// trailing silence and peak-normalised so all recordings play at one level.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.argv[2];
if (!source || !existsSync(join(source, 'card-slide-1.ogg'))) {
  console.error('Pass the Audio folder of the Kenney Casino Audio pack.');
  process.exit(1);
}
const output = fileURLToPath(new URL('../assets/sounds/', import.meta.url));
mkdirSync(output, { recursive: true });

const ffmpeg = (args) => {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `ffmpeg failed: ${args.join(' ')}`);
  return result;
};

const TRIM = 'silenceremove=start_periods=1:start_threshold=-48dB,areverse,silenceremove=start_periods=1:start_threshold=-52dB,areverse';
// Gentle compression lifts the body of a short card sound so it holds its own
// next to the notification chimes; the peak stays where render() puts it.
const BODY = 'acompressor=threshold=-32dB:ratio=3.5:attack=2:release=70:makeup=6';

/** Peak level in dBFS, from ffmpeg's volumedetect. */
function peakOf(file) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const match = /max_volume:\s*(-?[\d.]+) dB/.exec(result.stderr);
  return match ? Number(match[1]) : 0;
}

/** Mono, 44.1 kHz, 16-bit WAV, peak at `target` dBFS. */
function render(name, inputs, filter, target = -1) {
  const raw = join(output, `${name}.raw.wav`);
  ffmpeg([...inputs.flatMap(file => ['-i', join(source, `${file}.ogg`)]), '-filter_complex', filter, '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', raw]);
  const gain = target - peakOf(raw);
  ffmpeg(['-i', raw, '-af', `volume=${gain.toFixed(2)}dB`, '-c:a', 'pcm_s16le', join(output, `${name}.wav`)]);
  spawnSync(process.platform === 'win32' ? 'cmd' : 'rm', process.platform === 'win32' ? ['/c', 'del', raw.replaceAll('/', '\\')] : [raw]);
  console.log(`${name}.wav  ←  ${inputs.join(' + ')}`);
}

const single = (name, file, extra = '', target) => render(name, [file], `[0]${TRIM},${BODY}${extra ? `,${extra}` : ''}`, target);

// Several takes per action, so repeated draws and discards never sound identical.
['card-slide-1', 'card-slide-3', 'card-slide-5', 'card-slide-7'].forEach((file, index) => single(`card-draw-${index + 1}`, file, '', -3));
['card-place-1', 'card-place-2', 'card-place-3', 'card-place-4'].forEach((file, index) => single(`card-place-${index + 1}`, file, '', -2));
single('meld-1', 'card-fan-1');
single('meld-2', 'card-shove-2');
single('shuffle', 'card-shuffle', 'afade=t=out:st=1.9:d=0.4,atrim=0:2.3');

// Dealing: four quick card slides laid over one another.
render('deal', ['card-slide-2', 'card-slide-4', 'card-slide-6', 'card-slide-8'],
  `[0]${TRIM}[a];[1]${TRIM},adelay=110|110[b];[2]${TRIM},adelay=220|220[c];[3]${TRIM},adelay=330|330[d];[a][b][c][d]amix=inputs=4:normalize=0,${BODY}`, -2);
// A prize landing: a handful of chips, then two settling on the stack.
render('coins', ['chips-handle-2', 'chips-stack-2', 'chips-stack-4'],
  `[0]${TRIM}[a];[1]${TRIM},adelay=260|260[b];[2]${TRIM},adelay=470|470[c];[a][b][c]amix=inputs=3:normalize=0,${BODY}`, -2);

console.log('Imported the recorded card and chip sounds into assets/sounds.');
