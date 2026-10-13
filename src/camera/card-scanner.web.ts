import type { CardValueKey } from '@/game/score-keeper';

// Model yalnızca telefonda çalışır; web sürümünde kamera düğmesi gösterilmez.
export const cardScannerSupported = false;

export type ScanResult =
  | { status: 'ok'; cards: CardValueKey[] }
  | { status: 'cancelled' }
  | { status: 'error'; reason: 'permission' | 'failed' };

export function preloadCardScanner() {}

export async function scanCards(_source: 'camera' | 'library'): Promise<ScanResult> {
  return { status: 'error', reason: 'failed' };
}
