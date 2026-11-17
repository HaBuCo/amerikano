// Films real gameplay from the web dev server (npx expo start --web --port 8095), frame by frame.
// The page's clocks, timers and animation frames are replaced before the app loads, so every animation
// plays at exactly 30 fps however long each 1080x2340 screenshot takes. Supabase is answered locally.
//   node capture-play.mjs <states-ad.json> <out-dir> <open|final|home|probe-open|probe-final> [base=http://localhost:8095]
// Writes <out-dir>/f00000.jpg ... and <out-dir>/marks.json (frame numbers of the moments the ad cuts to).
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const [STATES_PATH, OUT, SCENE] = process.argv.slice(2);
const arg = (name, fallback) => process.argv.find(a => a.startsWith(name + '='))?.slice(name.length + 1) ?? fallback;
const BASE = arg('base', 'http://localhost:8095');
const FPS = 30;
const STATES = JSON.parse(readFileSync(STATES_PATH, 'utf8'));
const PROJECT_REF = 'mzpqzajnmxecwkykdcju';
const USER_ID = '00000000-0000-4000-8000-000000000001';
const USERNAME = 'harun';
const DEVICE = { viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

// Runs in the page before any app code.
function virtualClock() {
  const realTimeout = window.setTimeout.bind(window);
  const RealDate = window.Date;
  const epoch = RealDate.now();
  let now = 0, seq = 1;
  const timers = new Map();
  let frames = new Map();
  class VirtualDate extends RealDate {
    constructor(...args) { if (args.length) super(...args); else super(epoch + now); }
    static now() { return epoch + now; }
  }
  window.Date = VirtualDate;
  Object.defineProperty(performance, 'now', { configurable: true, value: () => now });
  const add = (fn, ms, args, repeat) => {
    const id = seq++;
    const delay = Math.max(0, Number(ms) || 0);
    timers.set(id, { id, fn, args, at: now + delay, every: repeat ? Math.max(1, delay) : 0 });
    return id;
  };
  window.setTimeout = (fn, ms, ...args) => typeof fn === 'function' ? add(fn, ms, args, false) : 0;
  window.setInterval = (fn, ms, ...args) => typeof fn === 'function' ? add(fn, ms, args, true) : 0;
  window.clearTimeout = window.clearInterval = id => { timers.delete(id); };
  window.requestAnimationFrame = fn => { const id = seq++; frames.set(id, fn); return id; };
  window.cancelAnimationFrame = id => { frames.delete(id); };
  window.requestIdleCallback = fn => add(() => fn({ didTimeout: false, timeRemaining: () => 16 }), 1, [], false);
  window.cancelIdleCallback = id => { timers.delete(id); };
  const breathe = () => new Promise(resolve => realTimeout(resolve, 0));
  window.__clock = {
    now: () => now,
    // Fires due timers in order, then one animation frame, every `frame` ms of virtual time.
    async advance(ms, frame = 1000 / 60) {
      const end = now + ms;
      while (now < end - 1e-6) {
        const frameEnd = Math.min(end, now + frame);
        for (let guard = 0; guard < 500; guard += 1) {
          let due = null;
          for (const t of timers.values()) if (t.at <= frameEnd && (!due || t.at < due.at || (t.at === due.at && t.id < due.id))) due = t;
          if (!due) break;
          now = Math.max(now, due.at);
          if (due.every) due.at += due.every; else timers.delete(due.id);
          try { due.fn(...due.args); } catch (error) { console.error(error); }
          await Promise.resolve();
        }
        now = frameEnd;
        await breathe();
        const run = frames; frames = new Map();
        for (const fn of run.values()) { try { fn(now); } catch (error) { console.error(error); } }
        await breathe();
      }
    },
  };
}

function fakeSession() {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
  const user = {
    id: USER_ID, aud: 'authenticated', role: 'authenticated', is_anonymous: false, email: `${USERNAME}@example.com`,
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { full_name: 'Harun' }, identities: [],
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
  };
  return {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, role: 'authenticated', exp, is_anonymous: false })}.c2lnbmF0dXJl`,
    token_type: 'bearer', expires_in: 31536000, expires_at: exp, refresh_token: 'local-capture', user,
  };
}

async function interFontCss() {
  const css = await (await fetch('https://fonts.googleapis.com/css2?family=Inter:wght@300..900&display=block', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' },
  })).text();
  return css.replaceAll("font-family: 'Inter'", "font-family: 'BlinkMacSystemFont'");
}

const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
async function answer(route) {
  const url = route.request().url();
  const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  if (url.includes('/rest/v1/coin_wallets')) return json({ user_id: USER_ID, balance: 2_500, daily_claimed_on: YESTERDAY, daily_streak: 3, rescue_claimed_on: null });
  if (url.includes('/rest/v1/profiles')) return json({ user_id: USER_ID, username: USERNAME, display_name: USERNAME, avatar_key: 'character-lara', friend_code: 'AMK42', experience: 2400, games_played: 64, wins: 29, table_badge: null });
  if (url.includes('/rest/v1/player_items')) return json([]);
  if (url.includes('/functions/v1/room')) return json({ roomId: null, room: null, activity: [], highlights: { playing: [], bigWins: [] } });
  if (url.includes('/functions/v1/social')) return json({ onlineCount: 1_284 });
  if (url.includes('/functions/v1/store')) return json({ items: [], rewardedToday: 0 });
  return route.abort();
}

const SCENES = {
  open: { path: '/game', save: 'open' },
  final: { path: '/game', save: 'final' },
  home: { path: '/' },
};
const scene = SCENES[SCENE.replace('probe-', '')];
const probe = SCENE.startsWith('probe-');
const save = scene.save ? STATES[scene.save] : null;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const context = await browser.newContext({ ...DEVICE, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
await context.route(/supabase\.co/, answer);
await context.addInitScript(virtualClock);
await context.addInitScript(entries => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  for (const [key, value] of Object.entries(entries)) {
    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
  }
  const original = console.error;
  console.error = (...args) => { if (String(args[0]).includes('cannot contain a nested')) return; original(...args); };
}, {
  'amerikano:game-settings:v1': JSON.stringify({ language: 'tr', variant: 'amerikano' }),
  'amerikano:first-game-tutorial:v2': 'seen',
  'amerikano:training-offered:v1': 'yes',
  'amerikano:lessons-done:v1': JSON.stringify(['amerikano-open']),
  'amerikano:review-asked-at:v1': String(Date.now()),
  [`sb-${PROJECT_REF}-auth-token`]: JSON.stringify(fakeSession()),
  'amerikano-player-profile-v1': JSON.stringify({ userId: USER_ID, displayName: USERNAME, username: USERNAME, avatarKey: 'character-lara', friendCode: 'AMK42', experience: 2400, gamesPlayed: 64, wins: 29, tableBadge: null }),
  [`amerikano:single:${save?.ruleset ?? 'amerikano-12-v5'}`]: save ? JSON.stringify(save) : null,
});
const page = await context.newPage();
page.on('pageerror', error => console.log('pageerror', error.message));
await page.goto(BASE + scene.path, { waitUntil: 'load', timeout: 240_000 });
// A mouse drag would select the page; a finger on a phone never does.
await page.addStyleTag({ content: await interFontCss() + ' *:focus, *:focus-visible { outline: none !important; } * { -webkit-user-select: none !important; user-select: none !important; } ::selection { background: transparent !important; }' });

const advance = ms => page.evaluate(v => window.__clock.advance(v), ms);
async function until(check, what, maxMs = 30_000) {
  for (let t = 0; t <= maxMs; t += 100) {
    if (await check().catch(() => false)) return;
    await advance(100);
    await page.waitForTimeout(15);
  }
  throw new Error(`timed out waiting for ${what}`);
}
const visible = (text, exact = true) => () => page.getByText(text, { exact }).first().isVisible();

let frameNo = 0;
const marks = { taps: {} };
const mark = name => { marks[name] = frameNo; console.log(`  ${name} @ frame ${frameNo}`); };
// Where each tap and drag lands, in CSS pixels of the 360x780 screen, so the ad can show a finger there.
const note = (name, at) => { marks.taps[name] = { frame: frameNo, ...at }; };
async function shoot() {
  await page.screenshot({ path: `${OUT}/f${String(frameNo).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 94 });
  frameNo += 1;
}
// Records n frames; `during(i)` may move the mouse before each one.
// When a bot draws, the table offers you its discard; pass, as a player in a hurry would.
const offer = page.getByText('Pas geç', { exact: true });
async function rec(n, during) {
  for (let i = 0; i < n; i += 1) {
    if (during) await during(i);
    else if (await offer.isVisible().catch(() => false)) await tap(offer);
    await advance(1000 / FPS);
    await page.waitForTimeout(6);
    await shoot();
  }
}
async function box(locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('no box');
  return { ...b, cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
}
const tap = async (locator, name) => { const b = await box(locator); if (name) note(name, { x: Math.round(b.cx), y: Math.round(b.cy) }); await page.mouse.click(b.cx, b.cy); };
// The card in your hand is the lowest one on screen with that label.
async function handCard(label) {
  const all = page.locator(`[aria-label="${label}"]`);
  let best = null;
  for (let i = 0; i < await all.count(); i += 1) {
    const b = await all.nth(i).boundingBox();
    if (b && (!best || b.y > best.y)) best = { ...b, cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
  }
  if (!best) throw new Error(`no card ${label}`);
  return best;
}
async function stockBox() { return box(page.locator('[aria-label="Kapalı kart"]').last()); }
// Drags with an ease-in-out path over n recorded frames, the way a finger would.
async function drag(from, to, n, name) {
  if (name) note(name, { x: Math.round(from.cx), y: Math.round(from.cy), toX: Math.round(to.cx), toY: Math.round(to.cy), frames: n });
  await page.mouse.move(from.cx, from.cy);
  await page.mouse.down();
  await rec(n, async i => {
    const u = (i + 1) / n, e = u < .5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
    await page.mouse.move(from.cx + (to.cx - from.cx) * e, from.cy + (to.cy - from.cy) * e - Math.sin(u * Math.PI) * 40);
  });
  await page.mouse.up();
}
async function dump(name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const labels = await page.evaluate(() => [...document.querySelectorAll('[aria-label]')].map(e => {
    const r = e.getBoundingClientRect();
    return r.width && r.height ? `${e.getAttribute('aria-label')} @ ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}` : null;
  }).filter(Boolean));
  writeFileSync(`${OUT}/${name}.txt`, labels.join('\n'));
  console.log('dumped', name, labels.length, 'labels');
}

// The app opens with its logo splash, a full-screen "Geç" (skip) layer; let it play out.
const splashGone = async () => !(await page.locator('[aria-label="Geç"]').count());
if (scene.save) {
  await until(visible('Oyuna devam et'), 'the resume button', 60_000);
  await until(splashGone, 'the splash to finish');
  if (probe) await dump('0-resume');
  await tap(page.getByText('Oyuna devam et', { exact: true }));
}

if (probe) {
  for (const [i, ms] of [[1, 600], [2, 1400], [3, 2500], [4, 3000]]) { await advance(ms); await page.waitForTimeout(100); await dump(`${i}-after-${ms}ms`); }
} else if (SCENE === 'open') {
  mark('intro');
  await rec(Math.round(FPS * 3.2));                       // the deal's intro card and the table settling
  mark('draw');
  await tap(page.locator('[aria-label="Kapalı kart"]').last(), 'draw');
  await rec(Math.round(FPS * 1.4));                       // the drawn card arrives in the hand
  mark('arrange');
  await tap(page.getByText('Akıllı diz', { exact: true }), 'arrange');
  await rec(Math.round(FPS * 1.3));
  mark('open');
  await tap(page.getByText('Masaya aç', { exact: true }), 'open');
  await rec(Math.round(FPS * 1.6));                       // the set and the run fly to the table
  mark('discard');
  const card = await handCard(save.discardLabel);
  const pile = await stockBox();
  await drag(card, { cx: pile.cx + pile.width * 1.35, cy: pile.cy }, 8, 'discard');
  await rec(Math.round(FPS * 4));                         // the bots take their turns
} else if (SCENE === 'final') {
  mark('intro');
  await rec(Math.round(FPS * 3.2));
  mark('arrange');
  await tap(page.getByText('Akıllı diz', { exact: true }), 'arrange');
  await rec(Math.round(FPS * 1.3));
  mark('discard');
  const card = await handCard(save.discardLabel);
  const pile = await stockBox();
  await drag(card, { cx: pile.cx + pile.width * 1.35, cy: pile.cy }, 8, 'discard');
  mark('finish');
  await rec(Math.round(FPS * 7));                         // the whole hand goes down, the game ends, the trophy
} else if (SCENE === 'home') {
  // From the app's own logo splash (2.6 s hold, 0.45 s fade) into the home screen, then through the three games.
  await until(async () => (await page.locator('[aria-label="Geç"]').count()) > 0, 'the splash', 60_000);
  mark('splash');
  await rec(Math.round(FPS * 3.4));
  mark('home');
  await rec(Math.round(FPS * 1.2));
  // The game switcher sits above the big game title, so take the topmost match.
  const topmost = async text => {
    const all = page.getByText(text, { exact: true });
    let best = null;
    for (let i = 0; i < await all.count(); i += 1) {
      const b = await all.nth(i).boundingBox();
      if (b && b.width && (!best || b.y < best.y)) best = { ...b, cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
    }
    return best;
  };
  for (const tab of ['Rummy', 'Contract', 'Amerikano']) {
    mark(tab.toLowerCase());
    const b = await topmost(tab);
    note(tab.toLowerCase(), { x: Math.round(b.cx), y: Math.round(b.cy) });
    await page.mouse.click(b.cx, b.cy);
    await rec(Math.round(FPS * 1.1));
  }
}
writeFileSync(`${OUT}/marks.json`, JSON.stringify({ fps: FPS, frames: frameNo, ...marks }, null, 1));
await browser.close();
