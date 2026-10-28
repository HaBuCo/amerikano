// Web sürümünde ödüllü video yok; mağaza bu bölümü göstermez.
export function preloadRewarded() {}

export async function showRewarded(): Promise<'earned' | 'dismissed' | 'unavailable'> {
  return 'unavailable';
}
