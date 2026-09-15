import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAuthLink } from '../src/network/auth-links.ts';

test('parses Supabase implicit recovery links', () => {
  assert.deepEqual(
    parseAuthLink('amerikano://login?flow=recovery#access_token=access&refresh_token=refresh&type=recovery'),
    {
      accessToken: 'access', refreshToken: 'refresh', code: undefined,
      type: 'recovery', flow: 'recovery', error: undefined,
    },
  );
});

test('parses PKCE callbacks and provider errors', () => {
  assert.equal(parseAuthLink('amerikano://login?code=abc123&flow=signup')?.code, 'abc123');
  assert.equal(parseAuthLink('amerikano://login#error_description=Link+expired')?.error, 'Link expired');
  assert.equal(parseAuthLink('amerikano://login'), null);
});
