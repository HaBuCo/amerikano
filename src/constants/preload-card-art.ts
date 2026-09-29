import { Asset } from 'expo-asset';
import { cardArt } from '@/constants/card-art';

let started = false;

/** Kart görsellerini önceden indirip önbelleğe alır; masaya ulaşana kadar her kart zaten hazır olur. */
export function preloadCardArt() {
  if (started) return;
  started = true;
  void Asset.loadAsync(Object.values(cardArt)).catch(() => {});
}
