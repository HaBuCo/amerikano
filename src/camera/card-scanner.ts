import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode as decodeJpeg } from 'jpeg-js';
import { loadTensorflowModel, type TfliteModel } from 'react-native-fast-tflite';

import { cardsFromDetections, decodeDetections, DETECTOR_SIZE, toModelInput } from '@/game/card-detection';
import type { CardValueKey } from '@/game/score-keeper';

export const cardScannerSupported = true;

export type ScanResult =
  | { status: 'ok'; cards: CardValueKey[] }
  | { status: 'cancelled' }
  | { status: 'error'; reason: 'permission' | 'failed' };

let modelPromise: Promise<TfliteModel> | null = null;

function model() {
  modelPromise ??= loadTensorflowModel(require('../../assets/models/card-detector.tflite'), []).catch((error) => {
    modelPromise = null;
    throw error;
  });
  return modelPromise;
}

/** Puan penceresi açılınca çağrılır ki ilk fotoğrafta modelin yüklenmesi beklenmesin. */
export function preloadCardScanner() {
  void model().catch(() => undefined);
}

function base64ToBytes(base64: string) {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < table.length; i += 1) lookup[table.charCodeAt(i)] = i;
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = lookup[clean.charCodeAt(i)], b = lookup[clean.charCodeAt(i + 1)];
    const c = lookup[clean.charCodeAt(i + 2)], d = lookup[clean.charCodeAt(i + 3)];
    bytes[p++] = (a << 2) | (b >> 4);
    if (i + 2 < clean.length) bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < clean.length) bytes[p++] = ((c & 3) << 6) | d;
  }
  return bytes.subarray(0, p);
}

async function pick(source: 'camera' | 'library') {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return 'permission' as const;
    return ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
  }
  return ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
}

/** Masadaki kartların fotoğrafını alır ve kartların değerlerini döndürür. */
export async function scanCards(source: 'camera' | 'library'): Promise<ScanResult> {
  try {
    const picked = await pick(source);
    if (picked === 'permission') return { status: 'error', reason: 'permission' };
    const asset = picked.canceled ? null : picked.assets[0];
    if (!asset) return { status: 'cancelled' };

    // Uzun kenarı modelin boyutuna indir; kalan kısım toModelInput'ta gri dolguyla tamamlanır.
    const landscape = !asset.height || asset.width >= asset.height;
    const context = ImageManipulator.manipulate(asset.uri);
    context.resize(landscape ? { width: DETECTOR_SIZE, height: null } : { width: null, height: DETECTOR_SIZE });
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.92, base64: true });
    if (!saved.base64) return { status: 'error', reason: 'failed' };
    const image = decodeJpeg(base64ToBytes(saved.base64), { useTArray: true, formatAsRGBA: false });

    const input = toModelInput(image.data, image.width, image.height, 3);
    const [output] = await (await model()).run([input.buffer as ArrayBuffer]);
    return { status: 'ok', cards: cardsFromDetections(decodeDetections(new Float32Array(output))) };
  } catch {
    return { status: 'error', reason: 'failed' };
  }
}
