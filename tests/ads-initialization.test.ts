import assert from 'node:assert/strict';
import test from 'node:test';
import { runAdsInitialization } from '../src/ads/initialization-flow.ts';

function fixture() {
  const calls: string[] = [];
  return {
    calls,
    steps: {
      requestTrackingPermission: async () => { calls.push('att'); },
      gatherConsent: async () => { calls.push('consent'); return { canRequestAds: true }; },
      getConsentInfo: async () => { calls.push('cached-consent'); return { canRequestAds: true }; },
      initializeSdk: async () => { calls.push('sdk'); },
      onError: (_error: unknown, context: string) => { calls.push(context); },
    },
  };
}

test('ATT completes before consent networking and ad SDK initialization', async () => {
  const { calls, steps } = fixture();
  assert.equal(await runAdsInitialization(steps), true);
  assert.deepEqual(calls, ['att', 'consent', 'sdk']);
});

test('consent network failure does not skip ATT and permits eligible cached consent', async () => {
  const { calls, steps } = fixture();
  steps.gatherConsent = async () => { calls.push('consent'); throw new Error('Network unavailable'); };
  assert.equal(await runAdsInitialization(steps), true);
  assert.deepEqual(calls, ['att', 'consent', 'ads-consent', 'cached-consent', 'sdk']);
});

test('ad SDK stays stopped when fresh or cached consent does not allow requests', async () => {
  for (const networkFailure of [false, true]) {
    const { calls, steps } = fixture();
    steps.gatherConsent = async () => {
      if (networkFailure) throw new Error('Network unavailable');
      return { canRequestAds: false };
    };
    steps.getConsentInfo = async () => ({ canRequestAds: false });
    assert.equal(await runAdsInitialization(steps), false);
    assert.equal(calls.includes('sdk'), false);
  }
});

test('unresolved ATT prevents consent networking and SDK startup', async () => {
  const { calls, steps } = fixture();
  steps.requestTrackingPermission = async () => { calls.push('att'); throw new Error('ATT unresolved'); };
  assert.equal(await runAdsInitialization(steps), false);
  assert.deepEqual(calls, ['att', 'ads-initialization']);
});
