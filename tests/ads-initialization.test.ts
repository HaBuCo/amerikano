import assert from 'node:assert/strict';
import test from 'node:test';
import { runAdsInitialization } from '../src/ads/initialization-flow.ts';

function fixture() {
  const calls: string[] = [];
  const steps: Parameters<typeof runAdsInitialization>[0] = {
    ios: true,
    getTrackingStatus: async () => { calls.push('att-status'); return 'undetermined'; },
    requestTrackingPermission: async () => { calls.push('att-request'); return 'granted'; },
    gatherConsent: async () => { calls.push('consent'); return { canRequestAds: true, status: 'OBTAINED' }; },
    getConsentInfo: async () => { calls.push('cached-consent'); return { canRequestAds: true, status: 'OBTAINED' }; },
    hasPersonalisedAdsConsent: async () => { calls.push('consent-choices'); return true; },
    initializeSdk: async () => { calls.push('sdk'); },
    onError: (_error: unknown, context: string) => { calls.push(context); },
  };
  return {
    calls,
    steps,
  };
}

test('GDPR consent precedes ATT and ad SDK initialization', async () => {
  const { calls, steps } = fixture();
  assert.equal(await runAdsInitialization(steps), true);
  assert.deepEqual(calls, ['att-status', 'consent', 'consent-choices', 'att-request', 'sdk']);
});

test('consent network failure uses eligible cached consent before ATT', async () => {
  const { calls, steps } = fixture();
  steps.gatherConsent = async () => { calls.push('consent'); throw new Error('Network unavailable'); };
  assert.equal(await runAdsInitialization(steps), true);
  assert.deepEqual(calls, ['att-status', 'consent', 'ads-consent', 'cached-consent', 'consent-choices', 'att-request', 'sdk']);
});

test('ad SDK and ATT stay stopped when fresh or cached consent does not allow requests', async () => {
  for (const networkFailure of [false, true]) {
    const { calls, steps } = fixture();
    steps.gatherConsent = async () => {
      if (networkFailure) throw new Error('Network unavailable');
      return { canRequestAds: false, status: 'REQUIRED' as const };
    };
    steps.getConsentInfo = async () => ({ canRequestAds: false, status: 'REQUIRED' as const });
    assert.equal(await runAdsInitialization(steps), false);
    assert.equal(calls.includes('sdk'), false);
    assert.equal(calls.includes('att-request'), false);
  }
});

test('an earlier ATT refusal skips UMP and ad SDK entirely', async () => {
  const { calls, steps } = fixture();
  steps.getTrackingStatus = async () => { calls.push('att-status'); return 'denied'; };
  assert.equal(await runAdsInitialization(steps), false);
  assert.deepEqual(calls, ['att-status']);
});

test('UMP refusal allowing limited ads does not trigger ATT or the iOS ad SDK', async () => {
  const { calls, steps } = fixture();
  steps.hasPersonalisedAdsConsent = async () => { calls.push('consent-choices'); return false; };
  assert.equal(await runAdsInitialization(steps), false);
  assert.deepEqual(calls, ['att-status', 'consent', 'consent-choices']);
});

test('a fresh ATT refusal stops ad SDK initialization', async () => {
  const { calls, steps } = fixture();
  steps.requestTrackingPermission = async () => { calls.push('att-request'); return 'denied'; };
  assert.equal(await runAdsInitialization(steps), false);
  assert.deepEqual(calls, ['att-status', 'consent', 'consent-choices', 'att-request']);
});

test('without a regional form ATT still resolves before the iOS ad SDK starts', async () => {
  const { calls, steps } = fixture();
  steps.gatherConsent = async () => { calls.push('consent'); return { canRequestAds: true, status: 'NOT_REQUIRED' }; };
  assert.equal(await runAdsInitialization(steps), true);
  assert.deepEqual(calls, ['att-status', 'consent', 'att-request', 'sdk']);
});

test('Android continues to use UMP without asking for iOS ATT', async () => {
  const { calls, steps } = fixture();
  steps.ios = false;
  assert.equal(await runAdsInitialization(steps), true);
  assert.deepEqual(calls, ['consent', 'sdk']);
});
