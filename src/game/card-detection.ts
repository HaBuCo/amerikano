import { CARD_VALUES, type CardValueKey } from './score-keeper.ts';

// Kart köşesi modelinin (ml/card-detector) çıktısını kart listesine çevirir.
// Ön/son işleme ml/card-detector/check_tflite.py ile birebir aynıdır; birini
// değiştirirsen diğerini de değiştir.

export const DETECTOR_SIZE = 640;
/** Model sınıf sırası; CARD_VALUES sırasıyla aynıdır. */
export const DETECTOR_CLASSES: CardValueKey[] = CARD_VALUES.map((value) => value.key);

const CONFIDENCE = 0.4;
const IOU = 0.5;
// Bir kartın sol üst ve (180° dönük) sağ alt değer kutularının merkezleri arası
// mesafe, kutunun uzun kenarının yaklaşık 5,5 katıdır. Perspektif payıyla bu
// aralıktaki aynı değerli iki köşe tek kart sayılır.
const PAIR_MIN = 3.8;
const PAIR_MAX = 7.5;
const PAIR_IDEAL = 5.5;
const JOKER_CLUSTER_MAX = 11;

export type Detection = { value: CardValueKey; score: number; cx: number; cy: number; w: number; h: number };

export type Letterbox = { scale: number; dx: number; dy: number; width: number; height: number };

export function letterboxFor(width: number, height: number): Letterbox {
  const scale = DETECTOR_SIZE / Math.max(width, height);
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  return { scale, dx: Math.floor((DETECTOR_SIZE - w) / 2), dy: Math.floor((DETECTOR_SIZE - h) / 2), width: w, height: h };
}

/**
 * RGB(A) pikselleri modelin girişine (640x640x3, 0-1 float, gri dolgulu) yerleştirir.
 * Görüntü önceden uzun kenarı 640 olacak şekilde küçültülmüş olmalı.
 */
export function toModelInput(pixels: Uint8Array, width: number, height: number, channels: 3 | 4): Float32Array {
  const box = letterboxFor(width, height);
  const input = new Float32Array(DETECTOR_SIZE * DETECTOR_SIZE * 3).fill(114 / 255);
  const w = Math.min(width, box.width);
  const h = Math.min(height, box.height);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const src = (y * width + x) * channels;
      const dst = ((y + box.dy) * DETECTOR_SIZE + x + box.dx) * 3;
      input[dst] = pixels[src] / 255;
      input[dst + 1] = pixels[src + 1] / 255;
      input[dst + 2] = pixels[src + 2] / 255;
    }
  }
  return input;
}

/** Ham çıktı: (4 + sınıf) x 8400, kanal öncelikli; kutular giriş pikseli cinsinden. */
export function decodeDetections(raw: Float32Array, anchors = raw.length / (4 + DETECTOR_CLASSES.length)): Detection[] {
  const classes = DETECTOR_CLASSES.length;
  let maxCoord = 0;
  for (let i = 0; i < anchors * 4; i += 1) maxCoord = Math.max(maxCoord, raw[i]);
  // Bazı dönüştürmeler kutuları 0-1 aralığına indirir.
  const unit = maxCoord <= 2 ? DETECTOR_SIZE : 1;
  const candidates: Detection[] = [];
  for (let a = 0; a < anchors; a += 1) {
    let best = 0;
    let bestScore = raw[4 * anchors + a];
    for (let c = 1; c < classes; c += 1) {
      const score = raw[(4 + c) * anchors + a];
      if (score > bestScore) { best = c; bestScore = score; }
    }
    if (bestScore < CONFIDENCE) continue;
    candidates.push({
      value: DETECTOR_CLASSES[best],
      score: bestScore,
      cx: raw[a] * unit,
      cy: raw[anchors + a] * unit,
      w: raw[2 * anchors + a] * unit,
      h: raw[3 * anchors + a] * unit,
    });
  }
  candidates.sort((x, y) => y.score - x.score);
  const kept: Detection[] = [];
  for (const candidate of candidates) {
    if (kept.every((other) => other.value !== candidate.value || iou(other, candidate) < IOU)) kept.push(candidate);
  }
  return kept;
}

function iou(a: Detection, b: Detection) {
  const ix = Math.max(0, Math.min(a.cx + a.w / 2, b.cx + b.w / 2) - Math.max(a.cx - a.w / 2, b.cx - b.w / 2));
  const iy = Math.max(0, Math.min(a.cy + a.h / 2, b.cy + b.h / 2) - Math.max(a.cy - a.h / 2, b.cy - b.h / 2));
  const inter = ix * iy;
  return inter / (a.w * a.h + b.w * b.h - inter + 1e-9);
}

/**
 * Köşeleri kartlara çevirir: aynı değerli iki köşe kart köşegeni kadar uzaktaysa
 * aynı kartın iki ucu sayılır. En iyi uyan çiftler önce eşleşir.
 */
export function cardsFromDetections(detections: Detection[]): CardValueKey[] {
  const jokers = detections.filter((d) => d.value === 'joker');
  const others = detections.filter((d) => d.value !== 'joker');
  return [...Array(jokerCount(jokers)).fill('joker' as const), ...pairCorners(others)];
}

/**
 * Joker köşeleri destelere göre çok değişir (dört köşede yıldız, dikey "JOKER"
 * yazısı...). Birbirine bir kart boyu kadar yakın Joker köşeleri tek kart sayılır.
 */
function jokerCount(jokers: Detection[]) {
  const parent = jokers.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  for (let i = 0; i < jokers.length; i += 1) {
    for (let j = i + 1; j < jokers.length; j += 1) {
      if (ratio(jokers[i], jokers[j]) <= JOKER_CLUSTER_MAX) parent[root(i)] = root(j);
    }
  }
  return new Set(jokers.map((_, i) => root(i))).size;
}

function ratio(a: Detection, b: Detection) {
  const size = (Math.max(a.w, a.h) + Math.max(b.w, b.h)) / 2;
  return Math.hypot(a.cx - b.cx, a.cy - b.cy) / size;
}

function pairCorners(detections: Detection[]): CardValueKey[] {
  const pairs: { i: number; j: number; error: number }[] = [];
  for (let i = 0; i < detections.length; i += 1) {
    for (let j = i + 1; j < detections.length; j += 1) {
      if (detections[i].value !== detections[j].value) continue;
      const r = ratio(detections[i], detections[j]);
      if (r >= PAIR_MIN && r <= PAIR_MAX) pairs.push({ i, j, error: Math.abs(r - PAIR_IDEAL) });
    }
  }
  pairs.sort((x, y) => x.error - y.error);
  const used = new Set<number>();
  const cards: CardValueKey[] = [];
  for (const { i, j } of pairs) {
    if (used.has(i) || used.has(j)) continue;
    used.add(i);
    used.add(j);
    cards.push(detections[i].value);
  }
  detections.forEach((detection, index) => { if (!used.has(index)) cards.push(detection.value); });
  // Kart değerine göre (puan tablosundaki sırayla) sırala ki liste okunaklı olsun.
  return cards.sort((x, y) => DETECTOR_CLASSES.indexOf(x) - DETECTOR_CLASSES.indexOf(y));
}
