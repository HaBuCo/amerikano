// Captures the 1.2 store screens from the web dev server, Turkish and English.
// Usage (from a folder with playwright-core installed):
//   node capture-v12.mjs <outDir> <phone|ipad> lang=<tr|en> [base=http://localhost:8095] [only=name]
// Needs states.json from gen-states.mts and the temporary /preview-victory route (see README).
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';

const OUT = process.argv[2];
const GROUP = process.argv[3];
const arg = (name, fallback) => process.argv.find(a => a.startsWith(name + '='))?.slice(name.length + 1) ?? fallback;
const LANG = arg('lang', 'en');
const BASE = arg('base', 'http://localhost:8095');
const only = arg('only', null);
const STATES = JSON.parse(readFileSync(arg('states', new URL('./states.json', import.meta.url)), 'utf8'));
const PROJECT_REF = 'mzpqzajnmxecwkykdcju';
const SAVE_KEY = `amerikano:single:${Object.values(STATES)[0].ruleset}`;
const USER_ID = '00000000-0000-4000-8000-000000000001';

const DEVICES = {
  phone: { viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  // An 11-inch tablet layout scaled up to the 13-inch size: the same 2064 x 2752 pixels, larger and readable UI.
  ipad: { viewport: { width: 826, height: 1101 }, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true },
};

// A signed-in account on the screens (never sent anywhere: Supabase is answered locally).
function fakeSession() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
  const user = {
    id: USER_ID, aud: 'authenticated', role: 'authenticated', is_anonymous: false, email: `${USERNAME}@example.com`,
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { full_name: DISPLAY_NAME }, identities: [],
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
  };
  return {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, role: 'authenticated', exp, is_anonymous: false })}.c2lnbmF0dXJl`,
    token_type: 'bearer', expires_in: 31536000, expires_at: exp, refresh_token: 'local-screenshot', user,
  };
}

async function interFontCss() {
  const css = await (await fetch('https://fonts.googleapis.com/css2?family=Inter:wght@300..900&display=block', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' },
  })).text();
  return css.replaceAll("font-family: 'Inter'", "font-family: 'BlinkMacSystemFont'");
}

const ago = minutes => new Date(Date.now() - minutes * 60_000).toISOString();
const USERNAME = LANG === 'tr' ? 'harun' : 'alex';
const DISPLAY_NAME = LANG === 'tr' ? 'Harun' : 'Alex';
const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
// Everything the screens ask Supabase for, answered locally.
async function answer(route) {
  const request = route.request();
  const url = request.url();
  const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  if (url.includes('/rest/v1/coin_wallets')) return json({ user_id: USER_ID, balance: 12_400, daily_claimed_on: YESTERDAY, daily_streak: 3, rescue_claimed_on: null });
  if (url.includes('/rest/v1/profiles')) return json({ user_id: USER_ID, username: USERNAME, display_name: USERNAME, avatar_key: 'character-lara', friend_code: 'AMK42', experience: 2400, games_played: 64, wins: 29, table_badge: 'royal' });
  if (url.includes('/rest/v1/player_items')) return json([{ item_id: 'felt-royal-throne' }, { item_id: 'back-emerald' }]);
  if (url.includes('/functions/v1/room')) {
    const body = JSON.parse(request.postData() || '{}');
    if (body.type === 'activity') return json({
      activity: [{ entry_fee: 250, waiting_players: 2, closest_table_players: 3 }, { entry_fee: 1000, waiting_players: 1, closest_table_players: 2 }],
      highlights: {
        playing: [{ entryFee: 2500, players: 6 }, { entryFee: 5000, players: 4 }],
        bigWins: [
          { username: LANG === 'tr' ? 'deniz' : 'olivia', entryFee: 5000, payout: 15_000, wonAt: ago(3) },
          { username: LANG === 'tr' ? 'mert_k' : 'jake_r', entryFee: 2500, payout: 7_500, wonAt: ago(41) },
          { username: LANG === 'tr' ? 'selin' : 'mia', entryFee: 5000, payout: 11_250, wonAt: ago(95) },
        ],
      },
    });
    return json({ roomId: null, room: null });
  }
  if (url.includes('/functions/v1/social')) return json({ onlineCount: 1_284 });
  if (url.includes('/functions/v1/store')) return json({ items: ['felt-royal-throne', 'back-emerald'], rewardedToday: 1 });
  return route.abort();
}

// `steps` run after the page settles: they tap through to the moment worth showing.
const SHOTS = [
  { name: '01-home', path: '/' },
  { name: '02-table', path: '/game', save: 'melds', steps: async page => { await page.getByRole('button').first().click(); await page.waitForTimeout(3500); } },
  {
    name: '03-lesson', path: '/lesson?id=amerikano-layoff', steps: async (page, t) => {
      await page.getByText(t.start, { exact: true }).click(); await page.waitForTimeout(700);
      await page.getByText(t.showMe, { exact: true }).click(); await page.waitForTimeout(1800);
    },
  },
  { name: '04-online', path: '/online?quick=1', steps: async page => { await page.mouse.wheel(0, GROUP === 'phone' ? 330 : 0); await page.waitForTimeout(900); } },
  { name: '05-victory', path: '/preview-victory', wait: 700 },
  { name: '06-store', path: '/store', steps: async page => { await page.mouse.wheel(0, GROUP === 'phone' ? 520 : 300); await page.waitForTimeout(900); } },
];
const LABELS = { tr: { start: 'Başla', showMe: 'Benim yerime yap' }, en: { start: 'Start', showMe: 'Do it for me' } }[LANG];

mkdirSync(OUT, { recursive: true });
const fontCss = await interFontCss();
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
for (const shot of SHOTS) {
  if (only && !shot.name.includes(only)) continue;
  const context = await browser.newContext({ ...DEVICES[GROUP], locale: LANG === 'tr' ? 'tr-TR' : 'en-US', timezoneId: 'Europe/Istanbul' });
  await context.route(/supabase\.co/, answer);
  const storage = {
    'amerikano:game-settings:v1': JSON.stringify({ language: LANG, variant: 'amerikano' }),
    'amerikano:first-game-tutorial:v2': 'seen',
    'amerikano:training-offered:v1': 'yes',
    'amerikano:lessons-done:v1': JSON.stringify(['amerikano-open']),
    'amerikano:review-asked-at:v1': String(Date.now()),
    [`sb-${PROJECT_REF}-auth-token`]: JSON.stringify(fakeSession()),
    'amerikano-player-profile-v1': JSON.stringify({ userId: USER_ID, displayName: USERNAME, username: USERNAME, avatarKey: 'character-lara', friendCode: 'AMK42', experience: 2400, gamesPlayed: 64, wins: 29, tableBadge: 'royal' }),
    [SAVE_KEY]: shot.save ? JSON.stringify(STATES[shot.save]) : null,
  };
  await context.addInitScript((entries) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    for (const [key, value] of Object.entries(entries)) {
      if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
    }
    // The web dev overlay's nested-button warning would sit over the captures.
    const original = console.error;
    console.error = (...args) => { if (String(args[0]).includes('cannot contain a nested')) return; original(...args); };
  }, storage);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(shot.name, 'pageerror', e.message));
  await page.goto(BASE + shot.path, { waitUntil: 'networkidle', timeout: 240_000 });
  await page.addStyleTag({ content: fontCss + ' *:focus, *:focus-visible { outline: none !important; }' });
  await page.evaluate(() => document.fonts.ready);
  // Let the opening animation play out.
  await page.waitForTimeout(3800);
  if (shot.steps) await shot.steps(page, LABELS);
  await page.waitForTimeout(shot.wait ?? 600);
  await page.screenshot({ path: `${OUT}/${shot.name}.png` });
  console.log('shot', shot.name);
  await context.close();
}
await browser.close();
