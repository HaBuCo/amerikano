type ConsentInfo = { canRequestAds: boolean };

type InitializationSteps = {
  requestTrackingPermission: () => Promise<void>;
  gatherConsent: () => Promise<ConsentInfo>;
  getConsentInfo: () => Promise<ConsentInfo>;
  initializeSdk: () => Promise<void>;
  onError: (error: unknown, context: string) => void;
};

// ATT must finish independently of UMP's network request, before starting ads.
export async function runAdsInitialization(steps: InitializationSteps): Promise<boolean> {
  try {
    await steps.requestTrackingPermission();
    let consent: ConsentInfo;
    try {
      consent = await steps.gatherConsent();
    } catch (error) {
      steps.onError(error, 'ads-consent');
      // UMP may still permit requests using consent from a previous session.
      consent = await steps.getConsentInfo();
    }
    if (!consent.canRequestAds) {
      steps.onError(new Error('UMP canRequestAds=false; ad requests are blocked by consent eligibility.'), 'ads-consent-blocked');
      return false;
    }
    await steps.initializeSdk();
    return true;
  } catch (error) {
    steps.onError(error, 'ads-initialization');
    return false;
  }
}
