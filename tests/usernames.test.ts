import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeUsername, usernameError } from '../src/network/usernames.ts';

test('normalizes Turkish display text into a searchable username', () => {
  assert.equal(normalizeUsername('  Çağrı.ŞEN_34  '), 'cagri.sen_34');
  assert.equal(normalizeUsername('Ayşe!'), 'ayse');
});

test('validates username length and edge punctuation', () => {
  assert.equal(usernameError('ali'), '');
  assert.match(usernameError('ab'), /3–20/);
  assert.match(usernameError('_ali'), /başlamalı/);
  assert.match(usernameError('ali.'), /bitmeli/);
});

test('rejects usernames that could pass for staff or the game', () => {
  assert.match(usernameError('admin'), /ayrılmış/);
  assert.match(usernameError('amerikano_destek'), /ayrılmış/);
  assert.match(usernameError('destek.ekibi'), /ayrılmış/);
  assert.equal(usernameError('oyuncu_1a2b3c4d'), '');
  assert.equal(usernameError('ali_admin'), '');
});
