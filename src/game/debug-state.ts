import { contractForRound, roundCountForGame } from './game-rules.ts';
import type { Card, GameAction, GameState, Suit } from './types.ts';

const suitSymbol: Record<Suit, string> = {
  hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠',
};

const phaseLabel: Record<GameState['phase'], string> = {
  draw: 'Kart çekme',
  claim: 'Açık kart kararı',
  play: 'Açma / işleme / kart atma',
  'round-over': 'El tamamlandı',
  'game-over': 'Oyun tamamlandı',
};

export function debugCard(card?: Card): string {
  if (!card) return '—';
  return card.isJoker ? 'Joker' : `${card.rank}${suitSymbol[card.suit!]}`;
}

function actionCards(state: GameState, actorId: string, cardIds: string[]): string {
  const hand = state.players.find(player => player.id === actorId)?.hand ?? [];
  return cardIds.map(id => debugCard(hand.find(card => card.id === id))).join(' ');
}

export function describeDebugAction(state: GameState, actorId: string, action: GameAction): string {
  const actor = state.players.find(player => player.id === actorId)?.name ?? actorId;
  const hand = state.players.find(player => player.id === actorId)?.hand ?? [];
  const card = (id: string) => debugCard(hand.find(item => item.id === id));
  switch (action.type) {
    case 'draw': return `${actor}: ${action.source === 'stock' ? 'desteden' : 'açık karttan'} çekti`;
    case 'discard': return `${actor}: ${card(action.cardId)} attı`;
    case 'claim': return `${actor}: açık kartı ${action.take ? 'cezalı aldı' : 'pas geçti'}`;
    case 'layoff': return `${actor}: ${card(action.cardId)} kartını ${action.meldId} grubuna işledi`;
    case 'replaceJoker': return `${actor}: ${card(action.cardId)} ile Joker aldı`;
    case 'open': return `${actor}: ${action.groups.map(group => `${group.type === 'set' ? 'küt' : 'seri'} [${actionCards(state, actorId, group.cardIds)}]`).join(' + ')} açtı`;
    case 'finish': return `${actor}: ${action.groups.map(group => `[${actionCards(state, actorId, group.cardIds)}]`).join(' + ')} açıp ${card(action.discardId)} ile bitirdi`;
    case 'next': return `${actor}: sonraki eli başlattı`;
  }
}

export function formatSingleGameDebug(state: GameState, events: string[] = []): string {
  const actingId = state.phase === 'claim' ? state.claim?.playerIds[0] : state.players[state.currentPlayerIndex].id;
  const current = state.players.find(player => player.id === actingId) ?? state.players[state.currentPlayerIndex];
  const lastDiscarder = state.players.find(player => player.id === state.lastDiscarderId);
  const penalizedPlayer = state.players.find(player => player.id === state.lastPenalty?.playerId);
  const lines = [
    `EL ${state.roundIndex + 1}/${roundCountForGame(state)} · ${contractForRound(state).title}`,
    `Tur ${state.turnCount} · Sıra: ${current.name} · Aşama: ${phaseLabel[state.phase]}`,
    `Deste: ${state.stock.length} · Açık kart: ${state.discardFaceDown ? 'Kapalı bitiş kartı' : debugCard(state.discard.at(-1))} · Son atan: ${lastDiscarder?.name ?? '—'}`,
    state.lastPenalty ? `Son ceza: ${penalizedPlayer?.name ?? state.lastPenalty.playerId} işlek kart attı · +${state.lastPenalty.points}` : 'Son ceza: —',
    '',
    'OYUNCULAR',
  ];

  for (const player of state.players) {
    const marker = player.id === current.id ? '→' : ' ';
    lines.push(`${marker} ${player.name} · ${player.hand.length} kart · ${player.score} puan · ${player.hasOpened ? 'açtı' : 'açmadı'}`);
    lines.push(`  ${player.hand.map(debugCard).join(' ') || 'El boş'}`);
  }

  lines.push('', 'MASA');
  if (!state.melds.length) lines.push('Henüz açılmış grup yok.');
  state.melds.forEach((meld, index) => {
    const owner = state.players.find(player => player.id === meld.ownerId)?.name ?? meld.ownerId;
    const rank = meld.cards.find(card => !card.isJoker)?.rank;
    const cards = meld.cards.map(card => {
      const assignment = card.isJoker && rank ? meld.jokerAssignments?.[card.id] : undefined;
      return assignment ? `Joker=${rank}${suitSymbol[assignment]}` : debugCard(card);
    });
    lines.push(`${index + 1}. ${owner} · ${meld.type === 'set' ? 'Küt' : 'Seri'} · ${cards.join(' ')}`);
  });

  lines.push('', 'SON HAREKETLER');
  lines.push(...(events.length ? events : ['Bu oturumda henüz kayıtlı hareket yok.']));
  return lines.join('\n');
}
