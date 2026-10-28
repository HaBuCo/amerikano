import { actingPlayerId, createDeck, createGame, dealRound, jokersForGame, orderMeldCards } from './engine.ts';
import { meldStyleForGame } from './game-rules.ts';
import type { Card, GameAction, GameRules, GameState, GameVariant, Meld, MeldType, Rank, Suit } from './types.ts';

/**
 * Training hands: short scripted deals that teach one rule each. Cards are
 * written as codes ('7h', '10s', 'Kd', 'JK'); the first player is always you.
 */
type Code = string;
type GroupCodes = { type: MeldType; cards: Code[] };

export type LessonExpect =
  | { type: 'info' }
  | { type: 'draw'; source: 'stock' | 'discard' }
  | { type: 'claim'; take: boolean }
  | { type: 'open' | 'finish'; groups: GroupCodes[] }
  | { type: 'discard'; card: Code }
  /** `onto` is any card of the target meld. */
  | { type: 'layoff'; card: Code; onto: Code }
  | { type: 'replaceJoker'; card: Code; onto: Code };

export type LessonStep = { coach: string; expect: LessonExpect; hint?: string };

/** What a scripted opponent does on its turns, in order. */
type BotMove = { type: 'draw'; source: 'stock' | 'discard' } | { type: 'discard'; card: Code } | { type: 'claim'; take: boolean };

type Setup = {
  variant: GameVariant;
  round: number;
  players: string[];
  hands: Code[][];
  /** Stock cards in the order they will be drawn. */
  draws: Code[];
  discard?: Code[];
  melds?: { owner: number; type: MeldType; cards: Code[] }[];
  /** Seats that went down before the lesson starts. */
  opened?: number[];
  current?: number;
  phase?: 'draw' | 'play';
};

export type Lesson = {
  id: string;
  variant: GameVariant;
  title: string;
  summary: string;
  setup: Setup;
  steps: LessonStep[];
  bot: BotMove[];
  done: string;
};

const SUIT_CODES: Record<string, Suit> = { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' };
export const YOU = 'player-1';

export function cardCode(card: Card): Code {
  return card.isJoker ? 'JK' : `${card.rank}${card.suit![0]}`;
}

function matchesCode(card: Card, code: Code) {
  if (code === 'JK') return card.isJoker;
  const rank = code.slice(0, -1) as Rank;
  return !card.isJoker && card.rank === rank && card.suit === SUIT_CODES[code.slice(-1)];
}

// Lessons keep the default rules but switch off whatever would distract from the one rule taught.
const LESSON_RULES: Record<GameVariant, Partial<GameRules>> = {
  amerikano: { variant: 'amerikano', claimsEnabled: true, playableDiscardPenalty: true, undoEnabled: false, roundIntro: 'off' },
  rummy: { variant: 'rummy', claimsEnabled: true, openingMinPoints: 40, playableDiscardPenalty: false, undoEnabled: false, roundIntro: 'off' },
  contract: { variant: 'contract', claimsEnabled: true, cutBonus: false, playableDiscardPenalty: false, undoEnabled: false, roundIntro: 'off' },
};

export function buildLesson(lesson: Lesson): GameState {
  const { setup } = lesson;
  const base = createGame(setup.players, () => 0, LESSON_RULES[setup.variant]);
  const dealt = dealRound(base.players, setup.round, 0, () => 0, base.rules);
  const pool = createDeck(jokersForGame(setup.variant, setup.players.length));
  const take = (code: Code) => {
    const index = pool.findIndex(card => matchesCode(card, code));
    if (index < 0) throw new Error(`Lesson ${lesson.id}: no card left for ${code}`);
    return pool.splice(index, 1)[0];
  };
  const hands = setup.hands.map(codes => codes.map(take));
  const style = meldStyleForGame(dealt);
  const opened = new Set([...(setup.opened ?? []), ...(setup.melds ?? []).map(meld => meld.owner)]);
  const melds: Meld[] = (setup.melds ?? []).map((meld, index) => ({
    id: `lesson-meld-${index + 1}`, type: meld.type, ownerId: dealt.players[meld.owner].id, style,
    cards: orderMeldCards(meld.cards.map(take), meld.type, style),
  }));
  const discard = (setup.discard ?? []).map(take);
  const draws = setup.draws.map(take);
  // The rest of the deck sits under the scripted draws, so a longer lesson never runs dry.
  const stock = [...pool, ...draws.reverse()];
  const turnCount = opened.size ? 4 : 0;
  return {
    ...dealt,
    players: dealt.players.map((player, seat) => ({
      ...player, hand: hands[seat] ?? [], hasOpened: opened.has(seat),
      ...(opened.has(seat) ? { openedTurn: 0 } : {}),
    })),
    stock, discard, melds, turnCount,
    currentPlayerIndex: setup.current ?? 0,
    phase: setup.phase ?? 'draw',
    botControlledPlayerIds: dealt.players.slice(1).map(player => player.id),
  };
}

const handOf = (state: GameState, playerId = YOU) => state.players.find(player => player.id === playerId)!.hand;
const findIn = (cards: Card[], code: Code) => cards.find(card => matchesCode(card, code));
const meldWith = (state: GameState, code: Code) => state.melds.find(meld => meld.cards.some(card => matchesCode(card, code)));
const sameGroup = (cards: Card[], codes: Code[]) => {
  const left = [...codes];
  return cards.length === codes.length && cards.every(card => {
    const index = left.findIndex(code => matchesCode(card, code));
    return index >= 0 && left.splice(index, 1).length === 1;
  });
};

/** Whether `action` is the move the step asks for. */
export function matchesStep(state: GameState, action: GameAction, expect: LessonExpect): boolean {
  const hand = handOf(state);
  const card = (id: string) => hand.find(item => item.id === id);
  switch (expect.type) {
    case 'info': return false;
    case 'draw': return action.type === 'draw' && action.source === expect.source;
    case 'claim': return action.type === 'claim' && action.take === expect.take;
    case 'discard': {
      if (action.type !== 'discard') return false;
      const discarded = card(action.cardId);
      return Boolean(discarded && matchesCode(discarded, expect.card));
    }
    case 'open':
    case 'finish': {
      if (action.type !== expect.type || action.groups.length !== expect.groups.length) return false;
      const left = [...expect.groups];
      return action.groups.every(group => {
        const cards = group.cardIds.map(card);
        if (cards.some(item => !item)) return false;
        const index = left.findIndex(wanted => wanted.type === group.type && sameGroup(cards as Card[], wanted.cards));
        return index >= 0 && left.splice(index, 1).length === 1;
      });
    }
    case 'layoff':
    case 'replaceJoker': {
      if (action.type !== expect.type) return false;
      const played = card(action.cardId);
      return Boolean(played && matchesCode(played, expect.card) && meldWith(state, expect.onto)?.id === action.meldId);
    }
  }
}

/** The move a step asks for, built from the current state; used by tests and the "show me" button. */
export function actionFor(state: GameState, expect: LessonExpect): GameAction | null {
  const hand = handOf(state);
  switch (expect.type) {
    case 'info': return null;
    case 'draw': return { type: 'draw', source: expect.source };
    case 'claim': return { type: 'claim', take: expect.take };
    case 'discard': {
      const card = findIn(hand, expect.card);
      return card ? { type: 'discard', cardId: card.id } : null;
    }
    case 'open':
    case 'finish': {
      const used = new Set<string>();
      const groups = expect.groups.map(group => ({
        type: group.type,
        cardIds: group.cards.map(code => {
          const card = hand.find(item => !used.has(item.id) && matchesCode(item, code))!;
          used.add(card.id);
          return card.id;
        }),
      }));
      return { type: expect.type, groups };
    }
    case 'layoff': {
      const card = findIn(hand, expect.card);
      const meld = meldWith(state, expect.onto);
      return card && meld ? { type: 'layoff', meldId: meld.id, cardId: card.id } : null;
    }
    case 'replaceJoker': {
      const card = findIn(hand, expect.card);
      const meld = meldWith(state, expect.onto);
      const joker = meld?.cards.find(item => item.isJoker);
      return card && meld && joker ? { type: 'replaceJoker', meldId: meld.id, jokerId: joker.id, cardId: card.id } : null;
    }
  }
}

/** Your cards the step is about, so the table can light them up. */
export function highlightFor(state: GameState, expect: LessonExpect | undefined): string[] {
  if (!expect) return [];
  const hand = handOf(state);
  const codes = expect.type === 'open' || expect.type === 'finish' ? expect.groups.flatMap(group => group.cards)
    : expect.type === 'discard' || expect.type === 'layoff' || expect.type === 'replaceJoker' ? [expect.card] : [];
  const used = new Set<string>();
  return codes.flatMap(code => {
    const card = hand.find(item => !used.has(item.id) && matchesCode(item, code));
    if (!card) return [];
    used.add(card.id);
    return [card.id];
  });
}

/** The scripted opponent's next move; a bot asked about a discard it has no script for passes. */
export function nextBotMove(state: GameState, script: BotMove[], cursor: number): { action: GameAction; cursor: number } | null {
  const actor = actingPlayerId(state);
  if (actor === YOU) return null;
  const move = script[cursor];
  if (state.phase === 'claim') {
    return move?.type === 'claim' ? { action: move, cursor: cursor + 1 } : { action: { type: 'claim', take: false }, cursor };
  }
  if (!move || move.type === 'claim') return null;
  if (move.type === 'draw') return { action: move, cursor: cursor + 1 };
  const card = findIn(handOf(state, actor), move.card);
  return card ? { action: { type: 'discard', cardId: card.id }, cursor: cursor + 1 } : null;
}

const set = (...cards: Code[]): GroupCodes => ({ type: 'set', cards });
const run = (...cards: Code[]): GroupCodes => ({ type: 'run', cards });
const info = (coach: string): LessonStep => ({ coach, expect: { type: 'info' } });
const TWO = ['Sen', 'Deniz'];
const THREE = ['Sen', 'Deniz', 'Ada'];

export const LESSONS: Lesson[] = [
  {
    id: 'amerikano-open', variant: 'amerikano', title: 'Çek, görevini aç, at',
    summary: 'Her elin bir görevi var. İlk elde bir üçlü küt açacaksın.',
    setup: { variant: 'amerikano', round: 0, players: TWO, hands: [['7s', '7h', '4d', '9c', 'Ks', '2h'], ['3c', '8d', 'Jh', '5s', '6c', '10d']], draws: ['5c', 'Qd'], discard: ['7d'] },
    bot: [],
    steps: [
      info('Amerikano 12 elden oluşur ve her elin bir görevi vardır. Bu elin görevi bir üçlü küt: aynı sayıdan, farklı renkte üç kart.'),
      { coach: 'Sıran gelince önce bir kart çekersin. Yerdeki 7♦ tam ihtiyacın olan kart: açık karta dokunup al.', expect: { type: 'draw', source: 'discard' }, hint: 'Bu sefer kapalı desteden değil, yerdeki 7♦\'den çek.' },
      { coach: 'Parlayan üç 7\'yi seç ve "Masaya aç"a bas. Görevini açtın mı, artık masaya kart işleyebilirsin.', expect: { type: 'open', groups: [set('7s', '7h', '7d')] }, hint: 'Üç 7\'yi birlikte seçip masaya aç.' },
      { coach: 'Sıranı bir kart atarak bitirirsin. Elde kalan kartlar ceza puanı yazar; en yüksek puanlı K♠\'yi at.', expect: { type: 'discard', card: 'Ks' }, hint: 'K♠ 10 puan: elde kalırsa en çok o yazar. Onu at.' },
    ],
    done: 'Görevini açtın. El, biri bütün kartlarını bitirince sona erer; elinde kalanların puanı ceza yazar. En az puanı toplayan kazanır.',
  },
  {
    id: 'amerikano-layoff', variant: 'amerikano', title: 'Seri aç, masaya işle, bitir',
    summary: 'Seri kur, rakibin kütüne ve kendi serine kart işle, son kartla eli bitir.',
    setup: {
      variant: 'amerikano', round: 1, players: TWO,
      hands: [['4h', '5h', '6h', 'Qc', '3s'], ['2c', 'Kd', '8s', '10c']],
      draws: ['9s', '6c', '7h'], melds: [{ owner: 1, type: 'set', cards: ['9c', '9d', '9h'] }],
    },
    bot: [{ type: 'draw', source: 'stock' }, { type: 'discard', card: '2c' }],
    steps: [
      info('Bu elin görevi bir üçlü seri: aynı renkten sıralı üç kart. As hem başta (A-2-3) hem sonda (Q-K-A) olabilir.'),
      { coach: 'Kapalı desteden bir kart çek.', expect: { type: 'draw', source: 'stock' } },
      { coach: '4♥ 5♥ 6♥ bir seri. Üçünü seçip masaya aç.', expect: { type: 'open', groups: [run('4h', '5h', '6h')] } },
      { coach: 'Açtığın turda işleme yapılmaz; bir kart at. 9♠\'yi atma: masadaki 9\'lara uyuyor ve işlenebilir kart atana 25 ceza yazılır. Q♣\'yi at.', expect: { type: 'discard', card: 'Qc' }, hint: 'İşlenebilir kart atmak 25 ceza. Q♣\'yi at.' },
      { coach: 'Desteden çek.', expect: { type: 'draw', source: 'stock' } },
      { coach: '9♠\'yi Deniz\'in 9\'larına işle: kartı o gruba sürükle ya da kartı seçip gruba dokun.', expect: { type: 'layoff', card: '9s', onto: '9c' }, hint: '9♠ masadaki 9\'ların yanına gider.' },
      { coach: 'Çektiğin 7♥ de kendi serine uyuyor: 4-5-6♥\'nın sonuna işle.', expect: { type: 'layoff', card: '7h', onto: '4h' }, hint: '7♥\'yi kendi 4-5-6♥ serine işle.' },
      { coach: 'Elinde tek kart kaldı. Onu at: el biter ve bu eli sen kazanırsın.', expect: { type: 'discard', card: '3s' } },
    ],
    done: 'Eli bitirdin. Görevini açtıktan sonra her tur yeni grup açabilir, kendi grubuna ya da rakibinkine kart işleyebilirsin.',
  },
  {
    id: 'amerikano-joker', variant: 'amerikano', title: 'Joker',
    summary: 'Jokerle seri aç, rakibin serisindeki jokeri al ve kullan.',
    setup: {
      variant: 'amerikano', round: 6, players: TWO,
      hands: [['5s', '6s', 'JK', '8s', '5d', 'Kh'], ['2h', 'Jc', '9d', '4c']],
      draws: ['10c', '3c', '9s'], melds: [{ owner: 1, type: 'run', cards: ['3d', '4d', 'JK', '6d'] }],
    },
    bot: [{ type: 'draw', source: 'stock' }, { type: 'discard', card: '3c' }],
    steps: [
      info('Joker her kartın yerine geçer ama elde kalırsa 25 ceza yazar. İlk beş elde açılışta kullanılamaz; bu el 7. el, kullanabilirsin.'),
      { coach: 'Desteden çek.', expect: { type: 'draw', source: 'stock' } },
      { coach: 'Görev dörtlü seri. 5♠ 6♠ 8♠ ve jokeri seç: joker 7♠ olur. Masaya aç.', expect: { type: 'open', groups: [run('5s', '6s', 'JK', '8s')] }, hint: '5♠ 6♠ joker 8♠: dördünü birlikte aç.' },
      { coach: 'K♥\'yi at.', expect: { type: 'discard', card: 'Kh' } },
      { coach: 'Desteden çek.', expect: { type: 'draw', source: 'stock' } },
      { coach: 'Deniz\'in serisindeki joker 5♦\'nin yerinde. 5♦\'yi o jokerin üstüne bırak: joker senin olur.', expect: { type: 'replaceJoker', card: '5d', onto: '3d' }, hint: 'Elindeki 5♦ ile Deniz\'in serisindeki jokeri değiştir.' },
      { coach: '9♠\'yi kendi serinin sonuna işle.', expect: { type: 'layoff', card: '9s', onto: '5s' } },
      { coach: 'Aldığın jokeri elde tutma, 25 ceza yazar. Onu da serine işle.', expect: { type: 'layoff', card: 'JK', onto: '5s' } },
      { coach: 'Son kartını at ve eli bitir.', expect: { type: 'discard', card: '10c' } },
    ],
    done: 'Jokeri hem kullandın hem geri kazandın. Unutma: küt içindeki joker değiştirilemez, sadece serideki joker alınır.',
  },
  {
    id: 'amerikano-claim', variant: 'amerikano', title: 'Açık kart teklifi',
    summary: 'Sıra sende değilken yerdeki kartı ceza kartıyla birlikte al.',
    setup: {
      variant: 'amerikano', round: 0, players: THREE,
      hands: [['7s', '7h', '4c', '10d', '2s'], ['Qs', '5d', '9h', 'Ac'], ['7d', 'Jc', '3h', '8c']],
      draws: ['6h', 'Kc', '2d', 'Jd'], current: 2, phase: 'play',
    },
    bot: [{ type: 'discard', card: '7d' }, { type: 'draw', source: 'stock' }, { type: 'discard', card: 'Qs' }],
    steps: [
      info('Biri kapalı desteden çekerse, yerdeki kartı başka bir oyuncu alabilir. Alan, yanında bir kapalı ceza kartı da çeker.'),
      { coach: 'Ada 7♦ attı, Deniz desteden çekiyor. 7♦ senin kütünü tamamlar: "Al"a bas.', expect: { type: 'claim', take: true }, hint: 'Bu sefer kartı al: üçüncü 7 lazım.' },
      { coach: 'Sıra sende. Desteden çek.', expect: { type: 'draw', source: 'stock' } },
      { coach: 'Üç 7\'yi masaya aç.', expect: { type: 'open', groups: [set('7s', '7h', '7d')] } },
      { coach: 'Bir kart at. 10♦ yüksek puanlı: onu at.', expect: { type: 'discard', card: '10d' } },
    ],
    done: 'Kartı aldın ama elin bir ceza kartıyla büyüdü. Teklifi ancak kart işine gerçekten yarıyorsa kabul et.',
  },
  {
    id: 'rummy-open', variant: 'rummy', title: '40 puanla aç',
    summary: 'Görev yok: ilk açılışın en az 40 puan olmalı.',
    setup: { variant: 'rummy', round: 0, players: TWO, hands: [['Ks', 'Kh', 'Kd', '9c', '10c', 'Jc', '3d', '5h'], ['2s', '8h', '4d', 'Qc', '6s', 'Ah']], draws: ['2c', 'Qh'] },
    bot: [],
    steps: [
      info('Klasik Rummy\'de görev yok. Küt ve serilerden istediğini açarsın ama ilk açılışın toplamı en az 40 puan olmalı. J, Q, K 10; As 11 puan (A-2-3\'te 1).'),
      { coach: 'Desteden çek.', expect: { type: 'draw', source: 'stock' } },
      { coach: 'Üç K tek başına 30 puan, yetmez. 9-10-J♣ serisiyle birlikte aç: 59 puan.', expect: { type: 'open', groups: [set('Ks', 'Kh', 'Kd'), run('9c', '10c', 'Jc')] }, hint: 'İki grubu birlikte hazırla, sonra masaya aç: toplam 40\'ı geçmeli.' },
      { coach: 'En yüksek kartın 5♥: onu at.', expect: { type: 'discard', card: '5h' } },
    ],
    done: 'İlk açılışı yaptın. Bundan sonra her tur 40 puan sınırı olmadan yeni grup açabilir ve kart işleyebilirsin.',
  },
  {
    id: 'rummy-layoff', variant: 'rummy', title: 'İşle ve bitir',
    summary: 'Açtıktan sonra kartlarını masaya işleyip elini bitir.',
    setup: {
      variant: 'rummy', round: 0, players: TWO,
      hands: [['7h', 'Qh', '8s'], ['2c', '9d', '5s', '4c']],
      draws: ['3h'], opened: [0],
      melds: [{ owner: 0, type: 'run', cards: ['4h', '5h', '6h'] }, { owner: 1, type: 'set', cards: ['Qc', 'Qd', 'Qs'] }],
    },
    bot: [],
    steps: [
      { coach: 'Elini daha önce açtın. Desteden çek.', expect: { type: 'draw', source: 'stock' } },
      { coach: '3♥ serinin başına uyuyor: 4-5-6♥\'ya işle.', expect: { type: 'layoff', card: '3h', onto: '4h' } },
      { coach: '7♥\'yi de aynı serinin sonuna işle.', expect: { type: 'layoff', card: '7h', onto: '4h' } },
      { coach: 'Q♥ Deniz\'in Q\'larına uyuyor. Rakibin grubuna da işleyebilirsin.', expect: { type: 'layoff', card: 'Qh', onto: 'Qc' } },
      { coach: 'Son kartını at: el biter.', expect: { type: 'discard', card: '8s' } },
    ],
    done: 'Eli bitirdin. Rakiplerin elinde kalan kartların puanı ceza yazar.',
  },
  {
    id: 'rummy-out', variant: 'rummy', title: 'Rummy!',
    summary: 'Hiç açmadan tek turda bütün elini bitir: cezalar ikiye katlanır.',
    setup: { variant: 'rummy', round: 0, players: TWO, hands: [['5d', '6d', '7d', '8d', 'Js', 'Jh', 'Jc'], ['Ks', '3h', '9c', '4s', '10h', '2d', 'Qd']], draws: ['2c'] },
    bot: [],
    steps: [
      info('Elini hiç açmadan bekleyip tek turda bütün kartlarını bitirirsen buna "Rummy!" denir: rakiplerin cezası ikiye katlanır.'),
      { coach: 'Desteden çek.', expect: { type: 'draw', source: 'stock' } },
      { coach: '5-6-7-8♦ ve üç J\'yi birlikte aç: 56 puan. Elinde tek kart kalacak.', expect: { type: 'open', groups: [run('5d', '6d', '7d', '8d'), set('Js', 'Jh', 'Jc')] }, hint: 'İki grubu birlikte aç.' },
      { coach: 'Son kartın 2♣\'yi at: Rummy!', expect: { type: 'discard', card: '2c' } },
    ],
    done: 'Rummy! Deniz\'in elindeki her puan iki kat yazıldı. Bazen erken açmak yerine beklemek daha çok kazandırır.',
  },
  {
    id: 'rummy-discard', variant: 'rummy', title: 'Atılan kartı al',
    summary: 'Rakibin attığı kart işine yarıyorsa kendi sıranda yerden al.',
    setup: {
      variant: 'rummy', round: 0, players: TWO,
      hands: [['Ks', 'Kh', '10c', 'Jc', 'Qc', '4d'], ['Kd', '3s', '8h', '6c']],
      draws: ['7s', '3d'], current: 1, phase: 'play',
    },
    bot: [{ type: 'discard', card: 'Kd' }],
    steps: [
      info('Sıran gelince kapalı desteden ya da yerdeki son atılan karttan çekebilirsin. Yerdeki kart herkesin gözü önünde: işine yarıyorsa al.'),
      { coach: "Deniz K♦ attı: üçüncü K'n. Kapalı desteye değil, yerdeki K♦'ye dokunup al.", expect: { type: 'draw', source: 'discard' }, hint: "Bu sefer yerdeki K♦'yi al." },
      { coach: 'Üç K (30) ve 10-J-Q♣ (30) birlikte 60 puan: ikisini de aç.', expect: { type: 'open', groups: [set('Ks', 'Kh', 'Kd'), run('10c', 'Jc', 'Qc')] } },
      { coach: 'Bir kart at.', expect: { type: 'discard', card: '4d' } },
    ],
    done: 'Yerdeki kartı alıp açtın. Rakibin de senin attıklarını gördüğünü unutma: ona yarayacak kartı atma.',
  },
  {
    id: 'contract-open', variant: 'contract', title: 'Kontratı tam aç',
    summary: 'İlk açılışta kontrat ne istiyorsa tam o kadar: fazlası sonra işlenir.',
    setup: {
      variant: 'contract', round: 0, players: TWO,
      hands: [['8s', '8h', '8d', '8c', '4c', '4d', '4h', 'Kc', '2d'], ['Js', '3h', '9c', '6d', 'Qh', '5s']],
      draws: ['Jh', '7c', '2h'],
    },
    bot: [{ type: 'draw', source: 'stock' }, { type: 'discard', card: '7c' }],
    steps: [
      info('Contract Rummy 7 elden oluşur, her elin bir kontratı var. Küt aynı sayıdan üç kart (renk farkı gerekmez); seri aynı renkten sıralı dört kart.'),
      { coach: 'Desteden çek.', expect: { type: 'draw', source: 'stock' } },
      { coach: 'Bu elin kontratı iki üçlü küt. İlk açılışta tam istenen kadar açarsın: dört 8\'in üçünü ve üç 4\'ü aç.', expect: { type: 'open', groups: [set('8s', '8h', '8d'), set('4c', '4d', '4h')] }, hint: 'Her kütte tam üç kart olsun; dördüncü 8\'i sonra işlersin.' },
      { coach: 'K♣\'yi at.', expect: { type: 'discard', card: 'Kc' } },
      { coach: 'Desteden çek.', expect: { type: 'draw', source: 'stock' } },
      { coach: 'Açtığın turdan sonra kart işleyebilirsin: dördüncü 8\'i 8\'lerine işle.', expect: { type: 'layoff', card: '8c', onto: '8s' } },
      { coach: 'J♥\'yi at.', expect: { type: 'discard', card: 'Jh' } },
    ],
    done: 'Kontratı tam açtın, fazlasını sonra işledin. Her elin kontratı bir öncekinden zor.',
  },
  {
    id: 'contract-layoff', variant: 'contract', title: 'Açtıktan sonra sadece işle',
    summary: 'Elini açtıktan sonra yeni grup açamazsın; yalnızca masaya kart işlersin.',
    setup: {
      variant: 'contract', round: 0, players: TWO,
      hands: [['5s', '6s', '7s', 'Kd'], ['2c', '9h', 'Jd', '4s']],
      draws: ['Qh', '10c', '3c'], opened: [0, 1],
      melds: [{ owner: 0, type: 'set', cards: ['3h', '3d', '3s'] }, { owner: 0, type: 'set', cards: ['Ac', 'Ad', 'Ah'] }, { owner: 1, type: 'set', cards: ['Qc', 'Qd', 'Qs'] }],
    },
    bot: [{ type: 'draw', source: 'stock' }, { type: 'discard', card: '2c' }],
    steps: [
      info('Elinde 5-6-7♠ var ama Contract Rummy\'de elini açtıktan sonra yeni grup açılmaz. Kartlarından ancak masadaki gruplara işleyebildiğin işe yarar.'),
      { coach: 'Desteden çek.', expect: { type: 'draw', source: 'stock' } },
      { coach: 'Q♥ Deniz\'in Q\'larına uyuyor: işle.', expect: { type: 'layoff', card: 'Qh', onto: 'Qc' } },
      { coach: 'Hiçbir yere işlenemeyen en yüksek kartı at: K♦.', expect: { type: 'discard', card: 'Kd' } },
      { coach: 'Desteden çek.', expect: { type: 'draw', source: 'stock' } },
      { coach: '3♣ senin 3\'lerine uyuyor: işle.', expect: { type: 'layoff', card: '3c', onto: '3h' } },
      { coach: '7♠\'yi at.', expect: { type: 'discard', card: '7s' } },
    ],
    done: 'Açtıktan sonra amaç elini masaya işleyerek bitirmek. Hiçbir yere gitmeyecek yüksek kartları önce at.',
  },
  {
    id: 'contract-claim', variant: 'contract', title: 'May I? ve ceza kartı',
    summary: 'Sıra dışı kart al; yanında bir ceza kartı gelir.',
    setup: {
      variant: 'contract', round: 0, players: THREE,
      hands: [['9s', '9h', '3c', '3d', '3h', 'Kc', '6d'], ['Qh', '5c', '10s', '4d'], ['9d', 'Js', '2h', '8c']],
      draws: ['Ah', '7c', 'Jd', '2s'], current: 2, phase: 'play',
    },
    bot: [{ type: 'discard', card: '9d' }, { type: 'draw', source: 'stock' }, { type: 'discard', card: 'Qh' }],
    steps: [
      info('Contract Rummy\'de "May I?" sınırsızdır: biri desteden çekerse yerdeki kartı isteyebilirsin ama yanında bir kapalı ceza kartı da alırsın.'),
      { coach: 'Ada 9♦ attı, Deniz desteden çekiyor. 9♦ ikinci kütünü tamamlar: "Al"a bas.', expect: { type: 'claim', take: true } },
      { coach: 'Sıra sende. Desteden çek.', expect: { type: 'draw', source: 'stock' } },
      { coach: 'Kontrat iki üçlü küt: üç 9 ve üç 3\'ü aç.', expect: { type: 'open', groups: [set('9s', '9h', '9d'), set('3c', '3d', '3h')] } },
      { coach: 'K♣\'yi at.', expect: { type: 'discard', card: 'Kc' } },
    ],
    done: 'Kontratı açtın. Ceza kartı elini büyütür; açtıktan sonra açık kart istemek genelde işe yaramaz.',
  },
  {
    id: 'contract-final', variant: 'contract', title: 'Final: elden bit',
    summary: 'Son elde üç dörtlü seriyle bütün elini bir kerede aç; kart atılmaz.',
    setup: {
      variant: 'contract', round: 6, players: TWO,
      hands: [['As', '2s', '3s', '4s', '7h', '8h', '9h', '10h', 'Jd', 'Qd', 'Kd'], ['2c', '5h', '9s', 'Kc', '6d', '3h', 'Qs', '8c', '4d', '10s', 'Jh', '7s']],
      draws: ['Ad'],
    },
    bot: [],
    steps: [
      info('Son elin kontratı üç dörtlü seri. Bütün elini tek seferde serilere dizip bitirmelisin; bu elde kart atılmaz.'),
      { coach: 'Desteden çek: eksik kartın gelsin.', expect: { type: 'draw', source: 'stock' } },
      { coach: 'As iki yerde de olur: A-2-3-4♠\'de başta, J-Q-K-A♦\'de sonda. K-A-2 ise olmaz. Üç seriyi dizip "Elden bit"e bas.', expect: { type: 'finish', groups: [run('As', '2s', '3s', '4s'), run('7h', '8h', '9h', '10h'), run('Jd', 'Qd', 'Kd', 'Ad')] }, hint: 'Üç seriyi ayrı ayrı hazırla, hepsi birlikte açılmalı.' },
    ],
    done: 'Finali elden bitirdin. Contract Rummy\'de 7 elin toplamında en az puanı alan kazanır.',
  },
];

export const LESSON_VARIANTS: GameVariant[] = ['amerikano', 'rummy', 'contract'];
export const lessonsFor = (variant: GameVariant) => LESSONS.filter(lesson => lesson.variant === variant);
export const lessonById = (id: unknown) => LESSONS.find(lesson => lesson.id === id) ?? null;
