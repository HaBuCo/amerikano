import assert from 'node:assert/strict';
import test from 'node:test';
import { RESCUE_BELOW, ROOM_ENTRY_FEES, TABLE_BADGES } from '../src/game/coin-economy.ts';
import { coinPackForGap, COIN_PACKS, cosmetic, PREMIUM_ITEM_IDS } from '../src/store/catalog.ts';

test('the pack offered for a coin gap is the smallest one that covers it', () => {
  assert.equal(coinPackForGap(1).productId, 'coins_small');
  assert.equal(coinPackForGap(2_000).productId, 'coins_small');
  assert.equal(coinPackForGap(2_001).productId, 'coins_medium');
  assert.equal(coinPackForGap(4_900).productId, 'coins_medium');
  assert.equal(coinPackForGap(1_000_000).productId, COIN_PACKS[COIN_PACKS.length - 1].productId);
});

test('big-table felts are won, never sold or bundled', () => {
  for (const { itemId } of Object.values(TABLE_BADGES)) {
    const item = cosmetic(itemId);
    assert.ok(item, itemId);
    assert.equal(typeof item.price, 'string');
    assert.notEqual(item.price, 'premium');
    assert.ok(!PREMIUM_ITEM_IDS.includes(itemId));
  }
});

test('the rescue is for players who cannot afford the smallest table', () => {
  assert.equal(RESCUE_BELOW, Math.min(...ROOM_ENTRY_FEES));
});
