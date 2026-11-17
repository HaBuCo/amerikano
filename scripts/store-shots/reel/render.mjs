// Draws reel.html frame by frame with the installed Chrome.
//   node render.mjs stills out-dir 0.5 2.5 ...   a few full-size stills
//   node render.mjs cues out.json                the sound cues written next to the motion
//   node render.mjs frames out-dir [subframes]   every frame, across parallel browsers
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = process.env.REPO ?? resolve(here, '../../..');
const ASSETS = pathToFileURL(resolve(REPO, 'assets')).href;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const page_url = extra => `${pathToFileURL(resolve(here, 'reel.html')).href}?assets=${encodeURIComponent(ASSETS)}${extra}`;

const FPS = 30, SECONDS = 15, SHUTTER = 0.5;

async function open(extra = '') {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--allow-file-access-from-files', '--force-device-scale-factor=1', '--font-render-hinting=none', '--disable-lcd-text', '--hide-scrollbars'],
  });
  const page = await (await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 })).newPage();
  page.on('pageerror', e => { console.error('PAGE ERROR', e.message); process.exitCode = 1; });
  await page.goto(page_url(extra));
  await page.evaluate(() => window.ready);
  return { browser, page };
}

const [mode, out, ...rest] = process.argv.slice(2);

if (mode === 'cues') {
  const { browser, page } = await open();
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(out, JSON.stringify(await page.evaluate(() => window.CUES), null, 1));
  await browser.close();
} else if (mode === 'stills') {
  mkdirSync(out, { recursive: true });
  const { browser, page } = await open(process.env.SAFE ? '&safe=1' : '');
  for (const t of rest.map(Number)) {
    await page.evaluate(v => window.renderAt(v), t);
    await page.screenshot({ path: `${out}/t${t.toFixed(2).padStart(5, '0')}.png` });
  }
  await browser.close();
} else if (mode === 'frames') {
  mkdirSync(out, { recursive: true });
  const sub = Number(rest[0] ?? 4);
  const WORKERS = Number(rest[1] ?? 8);
  const total = FPS * SECONDS * sub;
  const started = Date.now();
  let done = 0;
  // Each output frame keeps its shutter open for half the frame time, sampled `sub` times.
  const timeOf = index => (Math.floor(index / sub) + (index % sub) / sub * SHUTTER) / FPS;
  await Promise.all(Array.from({ length: WORKERS }, async (_, worker) => {
    const { browser, page } = await open();
    for (let i = worker; i < total; i += WORKERS) {
      const path = `${out}/f${String(i).padStart(5, '0')}.jpg`;
      if (!existsSync(path)) {
        await page.evaluate(v => window.renderAt(v), timeOf(i));
        await page.screenshot({ path, type: 'jpeg', quality: 97 });
      }
      if (++done % 200 === 0) console.log(`${done}/${total} ${((Date.now() - started) / 1000).toFixed(0)}s`);
    }
    await browser.close();
  }));
  console.log(`done ${total} frames in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}
