import { test } from 'node:test';
import assert from 'node:assert/strict';
import { english } from '../src/i18n/en.ts';
import { translate, translateMessage, validLanguage } from '../src/i18n/translate.ts';
import { ROUND_CONTRACTS } from '../src/game/contracts.ts';
import { REACTIONS } from '../src/game/reactions.ts';

test('old and invalid settings keep Turkish, English is an explicit supported choice', () => {
  for (const value of [undefined, null, 'de', {}, 1, 'tr']) assert.equal(validLanguage(value), 'tr');
  assert.equal(validLanguage('en'), 'en');
});

test('translation interpolates values without changing names or room codes', () => {
  assert.equal(translate('en', '{0} oynuyor…', ['İpek']), 'İpek is playing…');
  assert.equal(translate('tr', '{0} oynuyor…', ['İpek']), 'İpek oynuyor…');
  assert.equal(translate('en', 'Amerikano masama katıl! Oda kodu: {0}', ['ABC123']), 'Join my Amerikano table! Room code: ABC123');
  assert.equal(translate('en', 'unknown'), 'unknown');
});

test('all contracts and phrase reactions have English translations and preserve shared data', () => {
  for (const contract of ROUND_CONTRACTS) {
    assert.ok(english[contract.title]);
    assert.ok(english[contract.shortTitle]);
    assert.equal(translate('tr', contract.title), contract.title);
  }
  for (const reaction of REACTIONS.filter(item => item.kind === 'phrase')) assert.ok(english[reaction.text]);
  assert.equal(ROUND_CONTRACTS[0].title, 'Bir üçlü küt');
  assert.equal(REACTIONS.find(item => item.id === 'good-game')?.text, 'İyi oyundu!');
});

test('every translated template keeps exactly the same interpolation slots', () => {
  const slots = (value: string) => (value.match(/\{\d+\}/g) ?? []).sort();
  for (const [key, value] of Object.entries(english)) assert.deepEqual(slots(value), slots(key), key);
});

test('local and server errors translate at display time, including contract requirements', () => {
  assert.equal(translateMessage('en', 'Sıra sende değil.'), 'It is not your turn.');
  assert.equal(translateMessage('en', 'Bu elin açılış görevi: Bir üçlü küt.'), 'This round’s opening contract: One set of 3.');
  assert.equal(translateMessage('en', 'Sen arkadaş listenden kaldırılacak.'), 'Sen will be removed from your friends.');
  assert.equal(translateMessage('en', 'ÇEVRİM İÇİ · ABC123'), 'ONLINE · ABC123');
  assert.equal(translateMessage('tr', 'Your opening is complete. You can only discard this turn.'), 'Açılış tamamlandı. Bu tur yalnızca bir kart atabilirsin.');
  assert.equal(translateMessage('tr', 'This round’s opening contract: One set of 3.'), 'Bu elin açılış görevi: Bir üçlü küt.');
  assert.equal(translateMessage('tr', 'Bu elin açılış görevi: Bir üçlü küt.'), 'Bu elin açılış görevi: Bir üçlü küt.');
});

test('first launch follows the device: Turkish language or region, English elsewhere', async () => {
  const { languageForLocale } = await import('../src/i18n/translate.ts');
  for (const locale of ['tr', 'tr-TR', 'tr_TR', 'en-TR', 'de-TR', undefined, '']) assert.equal(languageForLocale(locale), 'tr', String(locale));
  for (const locale of ['en', 'en-US', 'en-GB', 'de-DE', 'ar-SA']) assert.equal(languageForLocale(locale), 'en', locale);
});
