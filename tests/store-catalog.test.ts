import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ALL_PRODUCT_IDS, CARD_BACKS, catalogProductId, COIN_PACKS, cosmetic, DEFAULT_CARD_BACK, DEFAULT_FELT, FELTS, ownsCosmetic,
  PREMIUM_COLLECTION, PREMIUM_ITEM_IDS, productGrants, STARTER_PACK,
} from '../src/store/catalog.ts';
import { english } from '../src/i18n/en.ts';

test('every sold product grants something and unknown products grant nothing', () => {
  for (const id of ALL_PRODUCT_IDS) {
    const grants = productGrants(id);
    assert.ok(grants && (grants.coins > 0 || grants.items.length > 0), id);
  }
  assert.equal(productGrants('no_ads'), null);
  assert.equal(productGrants(''), null);
  assert.deepEqual(productGrants(STARTER_PACK.productId), { coins: STARTER_PACK.coins, items: [] });
});

test('larger coin packs come first in value order', () => {
  const coins = COIN_PACKS.map(pack => pack.coins);
  assert.deepEqual(coins, [...coins].sort((a, b) => a - b));
  assert.equal(new Set(ALL_PRODUCT_IDS).size, ALL_PRODUCT_IDS.length);
});

test('premium collection unlocks exactly the premium cosmetics', () => {
  assert.deepEqual(productGrants(PREMIUM_COLLECTION.productId)?.items, PREMIUM_ITEM_IDS);
  assert.ok(PREMIUM_ITEM_IDS.length > 0);
  for (const id of PREMIUM_ITEM_IDS) assert.equal(cosmetic(id)?.price, 'premium');
});

test('free defaults are owned without a purchase; paid items need ownership', () => {
  assert.ok(ownsCosmetic(DEFAULT_CARD_BACK, []));
  assert.ok(ownsCosmetic(DEFAULT_FELT, []));
  assert.equal(ownsCosmetic('back-emerald', []), false);
  assert.ok(ownsCosmetic('back-emerald', ['back-emerald']));
  assert.equal(ownsCosmetic('unknown', ['unknown']), false);
});

test('cosmetic IDs are unique, fit the database and have English names', () => {
  const items = [...CARD_BACKS, ...FELTS];
  assert.equal(new Set(items.map(item => item.id)).size, items.length);
  for (const item of items) {
    assert.ok(item.id.length <= 60, item.id);
    assert.ok(english[item.name], item.name);
    if (typeof item.price === 'number' && item.price > 0) assert.ok(Number.isInteger(item.price));
  }
});

test('coin pack badges are translated', () => {
  for (const pack of COIN_PACKS) if (pack.badge) assert.ok(english[pack.badge], pack.badge);
});

test('iOS product IDs carry a prefix but grant the same as Android', () => {
  assert.equal(catalogProductId('amerikano_coins_small'), 'coins_small');
  assert.equal(catalogProductId('coins_small'), 'coins_small');
  assert.deepEqual(productGrants('amerikano_coins_medium'), productGrants('coins_medium'));
  assert.deepEqual(productGrants('amerikano_premium_collection')?.items, PREMIUM_ITEM_IDS);
  assert.equal(productGrants('amerikano_remove_ads'), null);
});
