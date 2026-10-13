export type ConsentInfo = {
  canRequestAds: boolean;
  status: 'UNKNOWN' | 'REQUIRED' | 'NOT_REQUIRED' | 'OBTAINED';
};

export type TrackingStatus = 'granted' | 'denied' | 'undetermined';

type InitializationSteps = {
  ios: boolean;
  getTrackingStatus: () => Promise<TrackingStatus>;
  requestTrackingPermission: () => Promise<TrackingStatus>;
  gatherConsent: () => Promise<ConsentInfo>;
  getConsentInfo: () => Promise<ConsentInfo>;
  hasPersonalisedAdsConsent: () => Promise<boolean>;
  initializeSdk: () => Promise<void>;
  onError: (error: unknown, context: string) => void;
};

/** UMP explains advertising first. An iOS refusal stops ads without another prompt. */
export async function runAdsInitialization(steps: InitializationSteps): Promise<boolean> {
  try {
    const tracking = steps.ios ? await steps.getTrackingStatus() : 'granted';
    // An existing ATT refusal must not lead to a later UMP tracking message.
    if (steps.ios && tracking === 'denied') return false;
    let consent: ConsentInfo;
    try {
      consent = await steps.gatherConsent();
    } catch (error) {
      steps.onError(error, 'ads-consent');
      // UMP may still permit requests using consent from a previous session.
      consent = await steps.getConsentInfo();
    }
    if (!consent.canRequestAds) {
      return false;
    }
    if (steps.ios) {
      // UMP canRequestAds also permits limited ads after a refusal. Do not
      // interpret that as permission for personalised ads or ATT prompting.
      const personalised = consent.status === 'NOT_REQUIRED' || await steps.hasPersonalisedAdsConsent();
      if (!personalised) return false;
      const resolvedTracking = tracking === 'undetermined'
        ? await steps.requestTrackingPermission() : tracking;
      if (resolvedTracking !== 'granted') return false;
    }
    await steps.initializeSdk();
    return true;
  } catch (error) {
    steps.onError(error, 'ads-initialization');
    return false;
  }
}
