// Builds real single-player game states for store screenshots by letting bots
// play every seat of a seeded game. Output: states.json next to this file.
import { writeFileSync } from 'node:fs';

const REPO = new URL('../../src/game/', import.meta.url).href;
const { createGame, applyAction, actingPlayerId, RULESET_ID } = await import(REPO + 'engine.ts');
const { botAction } = await import(REPO + 'bot.ts');
const { rulesFromSingleOptions, SINGLE_GAME_PROFILES } = await import(REPO + 'single-game-options.ts');

function seeded(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = ['Sen', 'Kerem', 'Ekin', 'Bora'];
const rules = rulesFromSingleOptions(SINGLE_GAME_PROFILES.classic);

function asSingle(state: any) {
  // Seat 0 is the human; the rest are bots, exactly as the app creates them.
  return { ...state, botControlledPlayerIds: state.players.slice(1).map((p: any) => p.id), turnDeadline: undefined, claim: state.claim };
}

function simulate(seed: number, stop: (s: any) => boolean, maxSteps = 4000) {
  const random = seeded(seed);
  let state = createGame(NAMES, () => 0, rules);
  for (let step = 0; step < maxSteps; step += 1) {
    if (stop(state)) return state;
    if (state.phase === 'round-over' || state.phase === 'game-over') return null;
    const actor = actingPlayerId(state);
    const action = botAction(state);
    if (!action) return null;
    const next = applyAction(state, actor, action, random);
    if (next === state) return null;
    state = next;
  }
  return null;
}

const human = (s: any) => s.players[0];
const found: Record<string, any> = {};

// Fresh table: round 1, your turn to draw.
found.fresh = createGame(NAMES, () => 0, rules);

// Mid-round: several melds on the table, you have opened, your turn to draw.
for (let seed = 1; seed < 500 && !found.melds; seed += 1) {
  found.melds = simulate(seed, s =>
    s.phase === 'draw' && s.currentPlayerIndex === 0 && human(s).hasOpened &&
    s.melds.length >= 4 && new Set(s.melds.map((m: any) => m.ownerId)).size >= 3 &&
    human(s).hand.length >= 6 && s.discard.length > 0);
}

// Round over with varied penalties so the score sheet reads well.
for (let seed = 1; seed < 500 && !found.score; seed += 1) {
  found.score = simulate(seed, s =>
    s.phase === 'round-over' && s.roundResult?.winnerId &&
    new Set(s.roundResult.entries.map((e: any) => e.penalty)).size >= 3);
}

const out: Record<string, unknown> = {};
for (const [key, state] of Object.entries(found)) {
  if (!state) throw new Error(`No state found for ${key}`);
  out[key] = { ruleset: RULESET_ID, savedAt: Date.now(), game: asSingle(state) };
  console.log(key, 'round', state.roundIndex + 1, 'phase', state.phase, 'melds', state.melds.length, 'hand', state.players[0].hand.length);
}
writeFileSync(new URL('./states.json', import.meta.url), JSON.stringify(out));
