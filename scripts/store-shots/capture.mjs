// Captures English app screens from the local web build for the store images.
// Usage: node capture.mjs <outDir> [phone|ipad ...] [only=name]
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = 'http://localhost:8085';
const OUT = process.argv[2];
const groups = process.argv.slice(3).filter(a => !a.startsWith('only='));
const only = process.argv.find(a => a.startsWith('only='))?.slice(5);
const STATES = JSON.parse(readFileSync(new URL('./states.json', import.meta.url), 'utf8'));
const PROJECT_REF = 'mzpqzajnmxecwkykdcju';
const SAVE_KEY = `amerikano:single:${Object.values(STATES)[0].ruleset}`;

const DEVICES = {
  phone: { viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  ipad: { viewport: { width: 1032, height: 1376 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

// A local-only guest session so the menu renders without touching Supabase.
function fakeGuestSession() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
  const user = {
    id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated',
    is_anonymous: true, app_metadata: { provider: 'anonymous', providers: ['anonymous'] },
    user_metadata: {}, identities: [], created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
  };
  return {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, role: 'authenticated', exp, is_anonymous: true })}.c2lnbmF0dXJl`,
    token_type: 'bearer', expires_in: 31536000, expires_at: exp, refresh_token: 'local-screenshot', user,
  };
}

async function interFontCss() {
  const css = await (await fetch('https://fonts.googleapis.com/css2?family=Inter:wght@300..900&display=block', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' },
  })).text();
  // RN Web's system stack starts with BlinkMacSystemFont after -apple-system; alias it to Inter (closest to SF).
  return css.replaceAll("font-family: 'Inter'", "font-family: 'BlinkMacSystemFont'");
}

const SHOTS = {
  phone: [
    { name: 'p01-home', path: '/', guest: true },
    { name: 'p02-setup', path: '/single-setup', guest: true },
    { name: 'p03-round-intro', path: '/single-setup', guest: true, start: true, wait: 1000 },
    { name: 'p04-table', path: '/game', guest: true, save: 'fresh', resume: true, wait: 4200 },
    { name: 'p05-melds', path: '/game', guest: true, save: 'melds', resume: true, wait: 4200 },
    { name: 'p06-score', path: '/game', guest: true, save: 'score', resume: true, wait: 4200 },
  ],
  ipad: [
    { name: 'i01-score', path: '/game', guest: true, save: 'score', resume: true, wait: 4200 },
    { name: 'i02-home', path: '/', guest: true },
    { name: 'i03-setup', path: '/single-setup', guest: true },
    { name: 'i04-table', path: '/game', guest: true, save: 'melds', resume: true, wait: 4200 },
    { name: 'i05-tutorial', path: '/game', guest: true, save: 'fresh', resume: true, tutorial: true, wait: 1500 },
    { name: 'i06-rules', path: '/rules', guest: true },
    { name: 'i07-settings', path: '/settings', guest: true },
  ],
};

mkdirSync(OUT, { recursive: true });
const fontCss = await interFontCss();
const browser = await chromium.launch({ channel: 'chrome' });
for (const group of groups) {
  for (const shot of SHOTS[group]) {
    if (only && !shot.name.includes(only)) continue;
    const context = await browser.newContext({ ...DEVICES[group], locale: 'en-US', timezoneId: 'Europe/Istanbul' });
    await context.route(/supabase\.co/, (route) => route.abort());
    const storage = {
      'amerikano:game-settings:v1': JSON.stringify({ language: 'en' }),
      'amerikano:first-game-tutorial:v2': shot.tutorial ? null : 'seen',
      'amerikano:review-asked-at:v1': String(Date.now()),
      [`sb-${PROJECT_REF}-auth-token`]: shot.guest ? JSON.stringify(fakeGuestSession()) : null,
      [SAVE_KEY]: shot.save ? JSON.stringify(STATES[shot.save]) : null,
    };
    await context.addInitScript((entries) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      for (const [key, value] of Object.entries(entries)) {
        if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
      }
    }, storage);
    const page = await context.newPage();
    // Evening greeting on the home screen.
    if (!shot.start && !shot.resume) await page.clock.setFixedTime(new Date('2026-10-08T20:30:00+03:00'));
    page.on('pageerror', (e) => { if (!/#418|#423|#425/.test(e.message)) console.log(shot.name, 'pageerror', e.message); });
    await page.goto(BASE + shot.path, { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: fontCss });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(900);
    if (shot.resume) {
      await page.getByRole('button').first().click();
    }
    if (shot.start) {
      await page.getByText('Set up table', { exact: true }).click();
    }
    await page.waitForTimeout(shot.wait ?? 600);
    await page.screenshot({ path: `${OUT}/${shot.name}.png` });
    console.log('shot', shot.name);
    await context.close();
  }
}
await browser.close();
