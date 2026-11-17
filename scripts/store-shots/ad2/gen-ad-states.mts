// Finds the two real single-player moments the ad films, by letting bots play every seat of seeded games:
//   open   your turn to draw in deal 5, and after the draw your hand holds the contract (a set and a run)
//   final  your turn in deal 12, and you go out with the whole hand at once
// Usage: node gen-ad-states.mts <out.json>
import { writeFileSync } from 'node:fs';

const SRC = new URL('../../../src/game/', import.meta.url).href;
const { createGame, applyAction, actingPlayerId, RULESET_ID } = await import(SRC + 'engine.ts');
const { botAction, resolveBotClaimChain } = await import(SRC + 'bot.ts');
const { rulesFromSingleOptions, SINGLE_GAME_PROFILES } = await import(SRC + 'single-game-options.ts');
const { suggestContractGroups, suggestFinalGroups } = await import(SRC + 'auto-arrange.ts');
const { contractForRound, openingJokerRestricted, meldStyleForGame } = await import(SRC + 'game-rules.ts');

function seeded(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = ['Sen', 'Kerem', 'Ekin', 'Bora'];
const SUIT_TR: Record<string, string> = { hearts: 'Kupa', diamonds: 'Karo', clubs: 'Sinek', spades: 'Maça' };
const label = (card: any) => card.isJoker ? 'Joker' : `${SUIT_TR[card.suit]} ${card.rank}`;
const rules = rulesFromSingleOptions(SINGLE_GAME_PROFILES.classic);
const HUMAN = 'player-1';

// What the app does after you draw from the stock: the bots answer the discard offer first.
function afterHumanDraw(state: any, random: () => number) {
  let next = applyAction(state, HUMAN, { type: 'draw', source: 'stock' }, random);
  if (next.phase === 'claim') next = resolveBotClaimChain(next, HUMAN);
  return next;
}

function playUntil(seed: number, wanted: (state: any, random: () => number) => any, maxSteps = 30000) {
  const random = seeded(seed);
  let state = createGame(NAMES, () => 0, rules);
  for (let step = 0; step < maxSteps; step += 1) {
    if (state.phase === 'game-over') return null;
    if (state.phase === 'round-over') { state = applyAction(state, HUMAN, { type: 'next' }, random); continue; }
    const found = wanted(state, random);
    if (found) return found;
    const action = botAction(state);
    if (!action) return null;
    const next = applyAction(state, actingPlayerId(state), action, random);
    if (next === state) return null;
    state = next;
  }
  return null;
}

const out: Record<string, unknown> = {};
// Fast bots keep the opponents' turns short on film; it changes timing only, not play.
const asSave = (state: any) => ({ ruleset: RULESET_ID, savedAt: Date.now(), game: { ...state, rules: { ...state.rules, botSpeed: 'fast' }, botControlledPlayerIds: state.players.slice(1).map((p: any) => p.id), turnDeadline: undefined } });
// The groups the table's "Masaya aç" button finds, exactly as game-table.tsx asks for them.
const tableGroups = (state: any) => suggestContractGroups(state.players[0].hand, contractForRound(state), !openingJokerRestricted(state), meldStyleForGame(state));

// 1. Opening a contract of a set and a run, right after a draw.
for (let seed = 1; seed < 400 && !out.open; seed += 1) {
  const found = playUntil(seed, (state, random) => {
    if (state.roundIndex !== 4 || state.currentPlayerIndex !== 0 || state.phase !== 'draw' || state.players[0].hasOpened) return null;
    const drawn = afterHumanDraw(state, random);
    if (drawn.phase !== 'play' || drawn.currentPlayerIndex !== 0) return null;
    const groups = tableGroups(drawn);
    if (!groups) return null;
    const opened = applyAction(drawn, HUMAN, { type: 'open', groups }, random);
    const next = opened !== drawn ? botAction(opened) : null;
    return next?.type === 'discard' ? { state, groups, discard: opened.players[0].hand.find((card: any) => card.id === next.cardId) } : null;
  });
  if (found) {
    out.open = { ...asSave(found.state), seed, groups: found.groups.length, discardLabel: label(found.discard) };
    console.log('open: seed', seed, 'deal', found.state.roundIndex + 1, 'hand', found.state.players[0].hand.length, 'groups', found.groups.length, 'then discard', label(found.discard));
  }
}

// 2. Going out in the final deal, with you ahead on points so the game ends in your win.
for (let seed = 1; seed < 400 && !out.final; seed += 1) {
  const found = playUntil(seed, (state, random) => {
    if (state.roundIndex !== 11 || state.currentPlayerIndex !== 0 || state.players[0].hasOpened) return null;
    if (state.phase === 'play') {
      const action = botAction(state);
      return action?.type === 'finish' ? { state, finish: action, draw: false } : null;
    }
    if (state.phase !== 'draw') return null;
    const drawn = afterHumanDraw(state, random);
    const action = drawn.phase === 'play' && drawn.currentPlayerIndex === 0 ? botAction(drawn) : null;
    return action?.type === 'finish' ? { state, finish: action, draw: true, hand: drawn.players[0].hand } : null;
  });
  if (found) {
    const state = structuredClone(found.state);
    const others = state.players.slice(1).map((p: any) => p.score);
    state.players[0].score = Math.max(0, Math.min(84, Math.min(...others) - 30));
    const hand = found.hand ?? state.players[0].hand;
    const discard = hand.find((card: any) => card.id === found.finish.discardId);
    // Dropping that card on the discard pile makes the table look for the same finish.
    if (!discard || !suggestFinalGroups(hand, discard.id, meldStyleForGame(state))) continue;
    out.final = { ...asSave(state), seed, draw: found.draw, discardLabel: discard ? label(discard) : null, groups: found.finish.groups.length };
    console.log('final: seed', seed, 'draw', found.draw, 'discard', discard && label(discard), 'groups', found.finish.groups.length, 'scores', state.players.map((p: any) => p.score).join('/'));
  }
}

if (!out.open || !out.final) throw new Error(`missing: ${['open', 'final'].filter(k => !out[k]).join(', ')}`);
writeFileSync(process.argv[2] ?? 'states-ad.json', JSON.stringify(out));
