import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAuthLink } from '../src/network/auth-links.ts';

test('ignores raw session tokens so a crafted link cannot swap accounts', () => {
  assert.equal(parseAuthLink('amerikano://login#access_token=access&refresh_token=refresh'), null);
  assert.deepEqual(
    parseAuthLink('amerikano://login?flow=recovery#access_token=access&refresh_token=refresh&type=recovery'),
    { code: undefined, flowId: undefined, type: 'recovery', flow: 'recovery', error: undefined },
  );
});

test('parses PKCE recovery links with a flow id', () => {
  assert.deepEqual(
    parseAuthLink('amerikano://login?flow=recovery&code=abc123&sb_flow_id=f1'),
    { code: 'abc123', flowId: 'f1', type: undefined, flow: 'recovery', error: undefined },
  );
});

test('parses PKCE callbacks and provider errors', () => {
  assert.equal(parseAuthLink('amerikano://login?code=abc123&flow=signup')?.code, 'abc123');
  assert.equal(parseAuthLink('amerikano://login#error_description=Link+expired')?.error, 'Link expired');
  assert.equal(parseAuthLink('amerikano://login'), null);
});

test('recognises provider accounts that are already registered', async () => {
  const { isExistingAccountError } = await import('../src/network/auth-links.ts');
  assert.equal(isExistingAccountError({ code: 'email_exists', message: 'x' }), true);
  assert.equal(isExistingAccountError(new Error('A user with this email address has already been registered')), true);
  assert.equal(isExistingAccountError('Identity is already linked to another user'), true);
  assert.equal(isExistingAccountError(new Error('Network request failed')), false);
  assert.equal(isExistingAccountError(undefined), false);
});
