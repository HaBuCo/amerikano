// Draws film.html frame by frame with the installed Chrome, in any of the four formats.
//   node render.mjs stills <fmt> <out-dir> 0.5 2.5 ...      a few full-size stills (SAFE=1 overlays the platform UI zones)
//   node render.mjs cues <out.json>                         the sound cues written next to the motion
//   node render.mjs frames <fmt> <out-dir> [subframes] [workers]   every frame from 0 to 20 s (CUT=bumper: the 6 s bumper)
// Environment: REPO (this repository), FOOTAGE (folder holding home/, open/ and final/ from capture-play.mjs),
// FONTS (inter.css next to its woff2 files; Inter is the app's own typeface).
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = process.env.REPO ?? resolve(here, '../../..');
const url = path => pathToFileURL(resolve(path)).href;
const PARAMS = `assets=${encodeURIComponent(url(resolve(REPO, 'assets')))}&footage=${encodeURIComponent(url(process.env.FOOTAGE ?? 'footage'))}`
  + (process.env.FONTS ? `&fonts=${encodeURIComponent(url(process.env.FONTS))}` : '');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SIZES = { '16x9': [1920, 1080], '1x1': [1080, 1080], '4x5': [1080, 1350], '9x16': [1080, 1920] };
// CUT=bumper renders the 6 s bumper (film.html?cut=bumper) instead of the 20 s film.
const CUT = process.env.CUT === 'bumper' ? '&cut=bumper' : '';
const FPS = 30, SECONDS = CUT ? 6 : 20, SHUTTER = 0.5;

async function open(fmt, extra = '') {
  const [width, height] = SIZES[fmt];
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--allow-file-access-from-files', '--force-device-scale-factor=1', '--font-render-hinting=none', '--disable-lcd-text', '--hide-scrollbars'],
  });
  const page = await (await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })).newPage();
  page.on('pageerror', e => { console.error('PAGE ERROR', e.message); process.exitCode = 1; });
  await page.goto(`${url(resolve(here, 'film.html'))}?${PARAMS}&fmt=${fmt}${CUT}${extra}`);
  await page.evaluate(() => window.ready);
  return { browser, page };
}

const [mode, ...args] = process.argv.slice(2);
const checkFormat = fmt => { if (!SIZES[fmt]) throw new Error(`format must be one of ${Object.keys(SIZES).join(', ')}`); return fmt; };

if (mode === 'cues') {
  const [out] = args;
  const { browser, page } = await open('9x16');
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(out, JSON.stringify(await page.evaluate(() => window.CUES), null, 1));
  await browser.close();
} else if (mode === 'stills') {
  const [fmt, out, ...times] = args;
  checkFormat(fmt);
  mkdirSync(out, { recursive: true });
  const { browser, page } = await open(fmt, process.env.SAFE ? '&safe=1' : '');
  for (const t of times.map(Number)) {
    await page.evaluate(v => window.renderAt(v), t);
    await page.screenshot({ path: `${out}/${fmt}-t${t.toFixed(2).padStart(5, '0')}.png` });
  }
  await browser.close();
} else if (mode === 'frames') {
  const [fmt, out, subArg, workerArg] = args;
  checkFormat(fmt);
  mkdirSync(out, { recursive: true });
  const sub = Number(subArg ?? 8);
  const WORKERS = Number(workerArg ?? 8);
  const total = FPS * SECONDS * sub;
  const started = Date.now();
  let done = 0;
  // Each output frame keeps its shutter open for half the frame time, sampled `sub` times.
  const timeOf = index => (Math.floor(index / sub) + (index % sub) / sub * SHUTTER) / FPS;
  await Promise.all(Array.from({ length: WORKERS }, async (_, worker) => {
    const { browser, page } = await open(fmt);
    for (let i = worker; i < total; i += WORKERS) {
      const path = `${out}/f${String(i).padStart(5, '0')}.jpg`;
      if (!existsSync(path)) {
        await page.evaluate(v => window.renderAt(v), timeOf(i));
        await page.screenshot({ path, type: 'jpeg', quality: 97 });
      }
      if (++done % 400 === 0) console.log(`${fmt} ${done}/${total} ${((Date.now() - started) / 1000).toFixed(0)}s`);
    }
    await browser.close();
  }));
  console.log(`${fmt}: ${total} frames in ${((Date.now() - started) / 1000).toFixed(0)}s`);
} else {
  console.error('usage: node render.mjs stills|cues|frames ...');
  process.exitCode = 2;
}
