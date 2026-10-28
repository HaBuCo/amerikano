// Generates the store artwork (card backs and coin pack icons) as PNGs.
// Designs are SVG built here and rasterised with the installed Chrome, so the
// art is reproducible: `node scripts/generate-store-art.mjs`.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const OUT = resolve('assets/store');
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find(existsSync);
if (!CHROME) throw new Error('Chrome or Edge is required to rasterise the artwork.');

const W = 450, H = 630, CX = W / 2, CY = H / 2;
const n = (value) => +value.toFixed(2);

function random(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const METALS = {
  gold: ['#6f5019', '#f8e6a6', '#b98a32', '#fff4c9', '#c7973c', '#7a5a1f'],
  silver: ['#5d6782', '#f1f5ff', '#97a3c2', '#ffffff', '#8792b0', '#4e5770'],
  rose: ['#7a3b2b', '#ffd9c2', '#c47a5c', '#fff0e4', '#b86d50', '#6b2f22'],
};

function metal(id, name) {
  const stops = METALS[name];
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${stops.map((color, index) =>
    `<stop offset="${index / (stops.length - 1)}" stop-color="${color}"/>`).join('')}</linearGradient>`;
}

function base(id, inner, outer) {
  return `<radialGradient id="${id}" cx="50%" cy="46%" r="75%"><stop offset="0" stop-color="${inner}"/><stop offset="1" stop-color="${outer}"/></radialGradient>`;
}

/** Interwoven wavy rings, the engraved look of banknote guilloché. */
function guillocheBand(cx, cy, radius, amplitude, lobes, layers, stroke, width = 0.8, opacity = 1) {
  let paths = '';
  for (let layer = 0; layer < layers; layer += 1) {
    const phase = (layer / layers) * (Math.PI * 2 / lobes);
    let d = '';
    for (let step = 0; step <= 720; step += 1) {
      const theta = (step / 720) * Math.PI * 2;
      const r = radius + amplitude * Math.sin(lobes * theta + phase * lobes);
      d += `${step ? 'L' : 'M'}${n(cx + r * Math.cos(theta))} ${n(cy + r * Math.sin(theta))}`;
    }
    paths += `<path d="${d}Z"/>`;
  }
  return `<g fill="none" stroke="${stroke}" stroke-width="${width}" opacity="${opacity}">${paths}</g>`;
}

function petals(cx, cy, count, length, widthRatio, stroke, width = 1, fill = 'none') {
  let out = '';
  for (let index = 0; index < count; index += 1) {
    out += `<ellipse cx="${n(cx + length / 2)}" cy="${cy}" rx="${n(length / 2)}" ry="${n(length * widthRatio)}" transform="rotate(${n((360 / count) * index)} ${cx} ${cy})"/>`;
  }
  return `<g fill="${fill}" stroke="${stroke}" stroke-width="${width}">${out}</g>`;
}

function beads(cx, cy, radius, count, size, fill) {
  let out = '';
  for (let index = 0; index < count; index += 1) {
    const theta = (index / count) * Math.PI * 2;
    out += `<circle cx="${n(cx + radius * Math.cos(theta))}" cy="${n(cy + radius * Math.sin(theta))}" r="${size}"/>`;
  }
  return `<g fill="${fill}">${out}</g>`;
}

function lattice(spacing, stroke, width, opacity, dots) {
  let out = '';
  for (let offset = -H; offset < W + H; offset += spacing) {
    out += `<line x1="${offset}" y1="0" x2="${offset + H}" y2="${H}"/><line x1="${offset}" y1="0" x2="${offset - H}" y2="${H}"/>`;
  }
  let dotMarks = '';
  if (dots) for (let y = 0; y <= H; y += spacing / 2) for (let x = ((y / (spacing / 2)) % 2) * (spacing / 2); x <= W; x += spacing) {
    dotMarks += `<circle cx="${x}" cy="${y}" r="${dots}"/>`;
  }
  return `<g stroke="${stroke}" stroke-width="${width}" opacity="${opacity}">${out}</g><g fill="${stroke}" opacity="${opacity * 1.6}">${dotMarks}</g>`;
}

const suit = {
  heart: (s) => `M0 ${35 * s}C${-72 * s} ${-12 * s} ${-44 * s} ${-64 * s} 0 ${-26 * s}C${44 * s} ${-64 * s} ${72 * s} ${-12 * s} 0 ${35 * s}Z`,
  spade: (s) => `M0 ${-42 * s}C${-72 * s} ${6 * s} ${-46 * s} ${56 * s} ${-4 * s} ${26 * s}L${-18 * s} ${48 * s}L${18 * s} ${48 * s}L${4 * s} ${26 * s}C${46 * s} ${56 * s} ${72 * s} ${6 * s} 0 ${-42 * s}Z`,
  club: (s) => `M${-4 * s} ${8 * s}A${20 * s} ${20 * s} 0 1 1 ${-8 * s} ${-14 * s}A${20 * s} ${20 * s} 0 1 1 ${8 * s} ${-14 * s}A${20 * s} ${20 * s} 0 1 1 ${4 * s} ${8 * s}L${16 * s} ${46 * s}L${-16 * s} ${46 * s}Z`,
  star: (s) => `M0 ${-50 * s}C${6 * s} ${-12 * s} ${12 * s} ${-6 * s} ${50 * s} 0C${12 * s} ${6 * s} ${6 * s} ${12 * s} 0 ${50 * s}C${-6 * s} ${12 * s} ${-12 * s} ${6 * s} ${-50 * s} 0C${-12 * s} ${-6 * s} ${-6 * s} ${-12 * s} 0 ${-50 * s}Z`,
  crown: (s) => `M${-60 * s} ${26 * s}L${-68 * s} ${-28 * s}L${-32 * s} ${2 * s}L0 ${-46 * s}L${32 * s} ${2 * s}L${68 * s} ${-28 * s}L${60 * s} ${26 * s}Z M${-60 * s} ${32 * s}H${60 * s}V${46 * s}H${-60 * s}Z`,
};

/** Double frame with rounded corners and an ornament at each corner. */
function frame(stroke, ornament, inset = 20) {
  const outer = `<rect x="${inset}" y="${inset}" width="${W - inset * 2}" height="${H - inset * 2}" rx="16" fill="none" stroke="${stroke}" stroke-width="4"/>`;
  const inner = `<rect x="${inset + 10}" y="${inset + 10}" width="${W - (inset + 10) * 2}" height="${H - (inset + 10) * 2}" rx="9" fill="none" stroke="${stroke}" stroke-width="1.4"/>`;
  const corners = [[inset + 34, inset + 34], [W - inset - 34, inset + 34], [inset + 34, H - inset - 34], [W - inset - 34, H - inset - 34]]
    .map(([x, y]) => ornament(x, y)).join('');
  return outer + inner + corners;
}

const clipPanel = (inset) => `<clipPath id="panel"><rect x="${inset}" y="${inset}" width="${W - inset * 2}" height="${H - inset * 2}" rx="9"/></clipPath>`;

function svg(defs, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>${body}</svg>`;
}

const cardBacks = {
  'back-emerald': () => svg(
    base('bg', '#1d8461', '#062a1d') + metal('gold', 'gold') + clipPanel(30),
    `<rect width="${W}" height="${H}" fill="url(#bg)"/>
    <g clip-path="url(#panel)">${lattice(26, '#e9cf86', 1, 0.28, 1.6)}</g>
    <circle cx="${CX}" cy="${CY}" r="132" fill="#073222" stroke="url(#gold)" stroke-width="3"/>
    ${guillocheBand(CX, CY, 112, 14, 18, 7, '#e9cf86', 0.7, 0.9)}
    <circle cx="${CX}" cy="${CY}" r="88" fill="#0b4a33" stroke="url(#gold)" stroke-width="1.6"/>
    ${petals(CX, CY, 32, 86, 0.14, '#d9b866', 0.6)}
    ${guillocheBand(CX, CY, 62, 6, 12, 5, '#d9b866', 0.5, 0.7)}
    <circle cx="${CX}" cy="${CY}" r="40" fill="#073222" stroke="url(#gold)" stroke-width="2"/>
    <path d="${suit.club(0.62)}" transform="translate(${CX} ${CY - 3})" fill="url(#gold)"/>
    ${beads(CX, CY, 124, 48, 1.8, '#f3dc97')}
    ${frame('url(#gold)', (x, y) => `<circle cx="${x}" cy="${y}" r="17" fill="#073222" stroke="url(#gold)" stroke-width="1.5"/>${petals(x, y, 12, 14, 0.2, '#e9cf86', 0.8)}`)}`,
  ),

  'back-crimson': () => {
    let rays = '';
    for (let index = 0; index < 96; index += 1) {
      const a1 = (index / 96) * Math.PI * 2, a2 = ((index + 0.5) / 96) * Math.PI * 2;
      rays += `<path d="M${CX} ${CY}L${n(CX + 700 * Math.cos(a1))} ${n(CY + 700 * Math.sin(a1))}L${n(CX + 700 * Math.cos(a2))} ${n(CY + 700 * Math.sin(a2))}Z"/>`;
    }
    let chevrons = '';
    for (let x = 30; x < W - 30; x += 22) chevrons += `<path d="M${x} 62l11 -10l11 10M${x} ${H - 62}l11 10l11 -10"/>`;
    const diamond = (r) => `M${CX} ${CY - r}L${CX + r * 0.74} ${CY}L${CX} ${CY + r}L${CX - r * 0.74} ${CY}Z`;
    return svg(
      base('bg', '#b3283a', '#3d0710') + metal('gold', 'gold') + clipPanel(30),
      `<rect width="${W}" height="${H}" fill="url(#bg)"/>
      <g clip-path="url(#panel)"><g fill="#ffd7a0" opacity="0.09">${rays}</g>
      <g fill="none" stroke="#efc77a" stroke-width="1.2" opacity="0.55">${chevrons}</g></g>
      <path d="${diamond(170)}" fill="none" stroke="url(#gold)" stroke-width="1.2" opacity="0.7"/>
      <path d="${diamond(150)}" fill="#5c0c18" stroke="url(#gold)" stroke-width="3.5"/>
      <path d="${diamond(136)}" fill="none" stroke="#efc77a" stroke-width="0.9"/>
      <g clip-path="url(#diamondClip)">${guillocheBand(CX, CY, 92, 10, 16, 6, '#efc77a', 0.6, 0.75)}</g>
      <clipPath id="diamondClip"><path d="${diamond(134)}"/></clipPath>
      <circle cx="${CX}" cy="${CY}" r="56" fill="#7a1222" stroke="url(#gold)" stroke-width="2"/>
      <path d="${suit.heart(0.78)}" transform="translate(${CX} ${CY + 2})" fill="url(#gold)"/>
      ${frame('url(#gold)', (x, y) => `<path d="M${x} ${y - 15}L${x + 11} ${y}L${x} ${y + 15}L${x - 11} ${y}Z" fill="#5c0c18" stroke="url(#gold)" stroke-width="1.6"/><circle cx="${x}" cy="${y}" r="3" fill="#f3d58f"/>`)}`,
    );
  },

  'back-midnight': () => {
    const rand = random(7);
    let stars = '';
    for (let index = 0; index < 220; index += 1) {
      stars += `<circle cx="${n(rand() * W)}" cy="${n(rand() * H)}" r="${n(0.4 + rand() * 1.3)}" opacity="${n(0.3 + rand() * 0.7)}"/>`;
    }
    let sparkles = '';
    for (const [x, y, s] of [[96, 140, 0.16], [352, 118, 0.12], [110, 500, 0.12], [338, 470, 0.17], [300, 210, 0.08], [150, 400, 0.08]]) {
      sparkles += `<path d="${suit.star(s)}" transform="translate(${x} ${y})"/>`;
    }
    let orbits = '';
    for (const r of [190, 165, 140]) orbits += `<circle cx="${CX}" cy="${CY}" r="${r}"/>`;
    return svg(
      base('bg', '#22336e', '#04071a') + metal('silver', 'silver') + clipPanel(30),
      `<rect width="${W}" height="${H}" fill="url(#bg)"/>
      <g clip-path="url(#panel)"><g fill="#dfe7ff">${stars}</g><g fill="url(#silver)">${sparkles}</g>
      <g fill="none" stroke="#b9c6ec" stroke-width="0.9" opacity="0.45" stroke-dasharray="2 5">${orbits}</g></g>
      ${beads(CX, CY, 165, 3, 4, '#eef3ff')}
      <circle cx="${CX}" cy="${CY}" r="112" fill="#0a1233" stroke="url(#silver)" stroke-width="3"/>
      ${guillocheBand(CX, CY, 96, 9, 24, 6, '#c9d4f0', 0.6, 0.85)}
      <circle cx="${CX}" cy="${CY}" r="74" fill="#101a45" stroke="url(#silver)" stroke-width="1.4"/>
      <path d="M${CX + 30} ${CY - 52}A60 60 0 1 0 ${CX + 30} ${CY + 52}A48 48 0 1 1 ${CX + 30} ${CY - 52}Z" fill="#c9d4f0" opacity="0.18"/>
      <path d="${suit.spade(0.72)}" transform="translate(${CX} ${CY - 2})" fill="url(#silver)"/>
      ${frame('url(#silver)', (x, y) => `<path d="${suit.star(0.3)}" transform="translate(${x} ${y})" fill="url(#silver)"/>`)}`,
    );
  },

  'back-royal': () => {
    let damask = '';
    const motif = (x, y) => `<g transform="translate(${x} ${y})"><path d="M0 -22C10 -12 10 -4 0 0C-10 -4 -10 -12 0 -22Z M0 22C10 12 10 4 0 0C-10 4 -10 12 0 22Z M-22 0C-12 10 -4 10 0 0C-4 -10 -12 -10 -22 0Z M22 0C12 10 4 10 0 0C4 -10 12 -10 22 0Z"/><circle r="2.5"/></g>`;
    for (let row = 0, y = 20; y < H; y += 46, row += 1) for (let x = row % 2 ? 23 : 0; x < W + 46; x += 46) damask += motif(x, y);
    return svg(
      base('bg', '#6a3596', '#16061f') + metal('gold', 'gold') + clipPanel(30),
      `<rect width="${W}" height="${H}" fill="url(#bg)"/>
      <g clip-path="url(#panel)" fill="#e8c86f" opacity="0.16">${damask}</g>
      <rect x="44" y="44" width="${W - 88}" height="${H - 88}" rx="6" fill="none" stroke="#e8c86f" stroke-width="0.8" opacity="0.6" stroke-dasharray="1 4"/>
      <circle cx="${CX}" cy="${CY}" r="140" fill="#2a0e3c" stroke="url(#gold)" stroke-width="4"/>
      ${beads(CX, CY, 130, 60, 2, '#f6dc8f')}
      ${guillocheBand(CX, CY, 108, 13, 20, 8, '#e8c86f', 0.65, 0.85)}
      <circle cx="${CX}" cy="${CY}" r="84" fill="#3b1554" stroke="url(#gold)" stroke-width="2"/>
      ${petals(CX, CY, 24, 80, 0.1, '#e8c86f', 0.6)}
      <circle cx="${CX}" cy="${CY}" r="56" fill="#2a0e3c" stroke="url(#gold)" stroke-width="2"/>
      <path d="${suit.crown(0.62)}" transform="translate(${CX} ${CY + 2})" fill="url(#gold)"/>
      <g fill="#fff3c8"><circle cx="${CX - 42}" cy="${CY - 15}" r="4.5"/><circle cx="${CX}" cy="${CY - 27}" r="5"/><circle cx="${CX + 42}" cy="${CY - 15}" r="4.5"/></g>
      ${frame('url(#gold)', (x, y) => `<circle cx="${x}" cy="${y}" r="18" fill="#2a0e3c" stroke="url(#gold)" stroke-width="2"/><path d="${suit.crown(0.2)}" transform="translate(${x} ${y + 1})" fill="url(#gold)"/>`)}
      <rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="16" fill="none" stroke="url(#gold)" stroke-width="7"/>`,
    );
  },

  'back-gold': () => {
    let fans = '';
    for (const [cy, flip] of [[H - 30, 1], [30, -1]]) {
      for (let r = 40; r <= 220; r += 18) fans += `<path d="M${CX - r} ${cy}A${r} ${r} 0 0 ${flip > 0 ? 1 : 0} ${CX + r} ${cy}"/>`;
      for (let index = 1; index < 12; index += 1) {
        const a = Math.PI * (index / 12);
        fans += `<line x1="${CX}" y1="${cy}" x2="${n(CX + 220 * Math.cos(a))}" y2="${n(cy - flip * 220 * Math.sin(a))}"/>`;
      }
    }
    const diamond = (r, ratio = 0.68) => `M${CX} ${CY - r}L${CX + r * ratio} ${CY}L${CX} ${CY + r}L${CX - r * ratio} ${CY}Z`;
    return svg(
      base('bg', '#2a241a', '#050403') + metal('gold', 'gold') + clipPanel(30),
      `<rect width="${W}" height="${H}" fill="url(#bg)"/>
      <g clip-path="url(#panel)"><g fill="none" stroke="url(#gold)" stroke-width="1.1" opacity="0.6">${fans}</g>
      ${lattice(34, '#c99d45', 0.6, 0.18, 0)}</g>
      <path d="${diamond(200)}" fill="none" stroke="url(#gold)" stroke-width="1" opacity="0.8"/>
      <path d="${diamond(178)}" fill="#0b0906" stroke="url(#gold)" stroke-width="5"/>
      <path d="${diamond(162)}" fill="none" stroke="url(#gold)" stroke-width="1.2"/>
      <clipPath id="goldClip"><path d="${diamond(160)}"/></clipPath>
      <g clip-path="url(#goldClip)">${guillocheBand(CX, CY, 100, 16, 14, 9, '#d8b25f', 0.6, 0.8)}</g>
      <circle cx="${CX}" cy="${CY}" r="62" fill="url(#gold)"/>
      <circle cx="${CX}" cy="${CY}" r="55" fill="#0b0906"/>
      <path d="${suit.star(0.82)}" transform="translate(${CX} ${CY})" fill="url(#gold)"/>
      <rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="16" fill="none" stroke="url(#gold)" stroke-width="9"/>
      <rect x="36" y="36" width="${W - 72}" height="${H - 72}" rx="8" fill="none" stroke="url(#gold)" stroke-width="1.4"/>
      ${[[54, 54], [W - 54, 54], [54, H - 54], [W - 54, H - 54]].map(([x, y]) => `<path d="${suit.star(0.22)}" transform="translate(${x} ${y})" fill="url(#gold)"/>`).join('')}`,
    );
  },
};

/** Coin piles that grow with the pack size. */
function coinArt(stacks, sparkle) {
  const size = 240;
  const coin = (x, y) => `<g transform="translate(${x} ${y})">
    <path d="M-30 0v9a30 11 0 0 0 60 0v-9" fill="#9c6f22" stroke="#6d4c14" stroke-width="1"/>
    <ellipse rx="30" ry="11" fill="url(#coin)" stroke="#7a5a1f" stroke-width="1.2"/>
    <ellipse rx="21" ry="7.3" fill="none" stroke="#fff3c4" stroke-width="1.2" opacity="0.8"/>
    <path d="${suit.star(0.12)}" transform="scale(1 0.38)" fill="#8a6420"/></g>`;
  let body = '';
  for (const [x, height] of stacks) for (let index = 0; index < height; index += 1) body += coin(x, 190 - index * 11);
  const glint = sparkle.map(([x, y, s]) => `<path d="${suit.star(s)}" transform="translate(${x} ${y})" fill="#fff8de"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><defs>${metal('coin', 'gold')}
    <radialGradient id="glow"><stop offset="0" stop-color="#ffd46b" stop-opacity="0.45"/><stop offset="1" stop-color="#ffd46b" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="120" cy="150" rx="110" ry="90" fill="url(#glow)"/>${body}${glint}</svg>`;
}

const coinPacks = {
  'coins-small': coinArt([[120, 5]], [[160, 120, 0.2]]),
  'coins-medium': coinArt([[96, 6], [146, 4]], [[176, 112, 0.22], [70, 104, 0.14]]),
  'coins-large': coinArt([[70, 5], [120, 9], [170, 6]], [[196, 100, 0.22], [52, 112, 0.14], [138, 60, 0.12]]),
  'coins-huge': coinArt([[56, 7], [96, 10], [144, 12], [186, 8]], [[208, 92, 0.25], [40, 96, 0.16], [120, 40, 0.18], [168, 52, 0.12]]),
};

mkdirSync(OUT, { recursive: true });
const work = mkdtempSync(join(tmpdir(), 'store-art-'));
function render(name, source, width, height) {
  const file = join(work, `${name}.svg`);
  writeFileSync(file, source);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000',
    `--window-size=${width},${height}`, `--screenshot=${join(OUT, `${name}.png`)}`, pathToFileURL(file).href], { stdio: 'ignore' });
  console.log(`assets/store/${name}.png`);
}
for (const [name, build] of Object.entries(cardBacks)) render(name, build(), W, H);
for (const [name, source] of Object.entries(coinPacks)) render(name, source, 240, 240);
