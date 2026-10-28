// Web sürümünde reklam yok; telefon sürümüyle aynı arayüzü boş olarak sunar.
export function subscribeAdsAllowed(_listener: (allowed: boolean) => void) {
  return () => {};
}

export function areAdsAllowed() {
  return false;
}

export async function initializeAds() {
  return false;
}

export async function isAdsPrivacyOptionsRequired() {
  return false;
}

export async function manageAdsPrivacyChoices() {
  return false;
}
