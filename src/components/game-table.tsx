import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { palette as p } from '@/constants/palette';
import { CARD_HEIGHT, CARD_WIDTH, PlayingCard } from './playing-card';
import { PrivateGameView } from '@/game/view';
import { Card, GameAction, MeldType } from '@/game/types';
import { ROUND_CONTRACTS } from '@/game/contracts';
import { isValidMeld } from '@/game/engine';
import { GameSound, useGameSounds } from '@/audio/game-sounds';
import { arrangeHand, loadHandOrder, moveCardToIndex, reconcileHandOrder, saveHandOrder } from '@/game/hand-order';
import { autoArrangeHand } from '@/game/auto-arrange';

type Props = {
  game: PrivateGameView; viewerId: string; modeLabel: string; blocked?: boolean;
  canAdvance?: boolean; canRematch?: boolean; error?: string;
  playerMeta?: Record<string, { avatarColor: string; avatarSymbol: string; level: number; connected: boolean; missedTurns: number; botControlled: boolean }>;
  botControlled?: boolean; onReclaim?: () => void;
  onAction: (a: GameAction) => void; onRematch?: () => void; onExit: () => void;
};
type Pending = { type: MeldType | null; cardIds: string[] };
type DropRect = { x: number; y: number; width: number; height: number };
type DropPoint = { x: number; y: number; dx: number; dy: number };
type DropSlot = { type: MeldType | null; length?: number; label: string };
type Measurable = { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void };

function DragSurface({ active, children, onDragStart, onDrop, style }: {
  active: boolean; children: ReactNode; onDragStart: () => void; onDrop: (point: DropPoint) => void; style?: object;
}) {
  const [movement] = useState(() => new Animated.ValueXY());
  const [dragging, setDragging] = useState(false);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => active,
    onMoveShouldSetPanResponder: (_, gesture) => active && Math.abs(gesture.dx) + Math.abs(gesture.dy) > 7,
    onPanResponderGrant: () => { movement.setValue({ x: 0, y: 0 }); setDragging(true); onDragStart(); },
    onPanResponderMove: Animated.event([null, { dx: movement.x, dy: movement.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_, gesture) => {
      onDrop({ x: gesture.moveX || gesture.x0 + gesture.dx, y: gesture.moveY || gesture.y0 + gesture.dy, dx: gesture.dx, dy: gesture.dy });
      movement.setValue({ x: 0, y: 0 }); setDragging(false);
    },
    onPanResponderTerminate: () => {
      onDrop({ x: Number.NaN, y: Number.NaN, dx: 0, dy: 0 });
      movement.setValue({ x: 0, y: 0 }); setDragging(false);
    },
    onPanResponderTerminationRequest: () => false,
  }), [active, movement, onDragStart, onDrop]);
  return <Animated.View {...responder.panHandlers} style={[style, {
    zIndex: dragging ? 999 : 1,
    opacity: dragging ? 0.9 : 1,
    transform: [...movement.getTranslateTransform(), { scale: dragging ? 1.06 : 1 }],
  }]}>{children}</Animated.View>;
}

type DraggableCardProps = {
  card: Card; index: number; step: number; cardsPerRow: number;
  arranging: boolean; gameplayEnabled: boolean; onDragStart: () => void;
  onReorder: (cardId: string, targetIndex: number) => void;
  onGameplayDrop: (cardId: string, point: DropPoint) => void;
};

function DraggableHandCard({ card, index, step, cardsPerRow, arranging, gameplayEnabled, onDragStart, onReorder, onGameplayDrop }: DraggableCardProps) {
  return <DragSurface active={arranging || gameplayEnabled} onDragStart={onDragStart} onDrop={(point) => {
    if (arranging) {
      const columnMove = Math.round(point.dx / step);
      const rowMove = Math.round(point.dy / (CARD_HEIGHT + 8));
      onReorder(card.id, index + columnMove + rowMove * cardsPerRow);
    } else onGameplayDrop(card.id, point);
  }} style={{ marginLeft: index % cardsPerRow ? step - CARD_WIDTH : 0, zIndex: index % cardsPerRow }}>
    <PlayingCard card={card} />
  </DragSurface>;
}

function TurnCountdown({ deadline }: { deadline?: number }) {
  const [seconds, setSeconds] = useState(() => deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : 0);
  useEffect(() => {
    if (!deadline) return;
    const update = () => setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [deadline]);
  if (!deadline) return null;
  return <View accessibilityLabel={`Sıra süresi ${seconds} saniye`} style={[s.timer, seconds <= 10 && s.timerUrgent]}><Text style={s.timerText}>{seconds}</Text></View>;
}

function FlowStep({ number, label, state }: { number: number; label: string; state: 'done' | 'active' | 'ready' | 'waiting' }) {
  return <View style={[s.flowStep, state === 'done' && s.flowDone, state === 'active' && s.flowActive, state === 'ready' && s.flowReady]}>
    <Text style={[s.flowNumber, (state === 'active' || state === 'done') && s.flowStrong]}>{state === 'done' ? '✓' : number}</Text>
    <Text style={[s.flowLabel, (state === 'active' || state === 'done') && s.flowStrong]}>{label}</Text>
  </View>;
}

export function GameTable({ game, viewerId, modeLabel, blocked, canAdvance = true, canRematch = false, error, playerMeta, botControlled = false, onReclaim, onAction, onRematch, onExit }: Props) {
  const [pendingState, setPendingState] = useState<{ key: string; groups: Pending[] }>({ key: '', groups: [] });
  const [notice, setNotice] = useState('');
  const [exitOpen, setExitOpen] = useState(false);
  const [scoresOpen, setScoresOpen] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [activeDrag, setActiveDrag] = useState<'hand' | 'stock' | 'discard' | 'staged' | 'arranging' | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const dropNodes = useRef<Record<string, Measurable | null>>({});
  const dropRects = useRef<Record<string, DropRect>>({});
  const { enabled: soundEnabled, toggle: toggleSound, play: playSound } = useGameSounds();
  const previousPhase = useRef(game.phase);
  const { width } = useWindowDimensions();
  const me = game.players.find(player => player.id === viewerId)!;
  const myMissedTurns = playerMeta?.[viewerId]?.missedTurns ?? 0;
  const orderKey = `${modeLabel}:${game.roundIndex}:${viewerId}`;
  const handSignature = me.hand.map((card) => card.id).join('|');
  const [handOrder, setHandOrder] = useState(() => me.hand.map((card) => card.id));
  const loadedOrderKey = useRef('');
  const current = game.players[game.currentPlayerIndex];
  const pendingKey = `${game.roundIndex}:${game.turnCount}:${current.id}:${game.phase}`;
  const pending = pendingState.key === pendingKey ? pendingState.groups : [];
  const myTurn = current.id === viewerId && !blocked && !botControlled;
  const playing = myTurn && game.phase === 'play';
  const drawing = myTurn && game.phase === 'draw';
  const claiming = game.phase === 'claim' && game.claim?.playerIds[0] === viewerId && !blocked && !botControlled;
  const claimPlayer = game.players.find(pl => pl.id === game.claim?.playerIds[0]);
  const openedThisTurn = me.openedTurn === game.turnCount;
  const stagedIds = new Set(pending.flatMap(g => g.cardIds));
  const arrangedHand = arrangeHand(me.hand, handOrder);
  const cards = arrangedHand.filter(c => !stagedIds.has(c.id));
  const activeCard = activeCardId ? me.hand.find((card) => card.id === activeCardId) : undefined;
  const contract = ROUND_CONTRACTS[game.roundIndex];
  const dropSlots: DropSlot[] = me.hasOpened
    ? [{ type: 'set', length: 3, label: 'Yeni küt' }, { type: 'run', length: 3, label: 'Yeni seri' }]
    : contract.final
      ? Array.from({ length: Math.max(4, Math.ceil((me.hand.length - 1) / 3)) }, (_, index) => ({ type: null, label: `Grup ${index + 1}` }))
      : contract.parts.flatMap(part => Array.from({ length: part.count }, (_, index) => ({
          type: part.type, length: part.length,
          label: `${part.type === 'set' ? 'Küt' : 'Seri'}${part.count > 1 ? ` ${index + 1}` : ''}`,
        })));
  const over = game.phase === 'round-over' || game.phase === 'game-over';
  const winners = game.players.filter(player => player.score === Math.min(...game.players.map(pl => pl.score)));
  const sortedPlayers = [...game.players].sort((a, b) => a.score - b.score);
  const nextContract = game.roundIndex + 1 < ROUND_CONTRACTS.length ? ROUND_CONTRACTS[game.roundIndex + 1] : null;
  const cardsPerRow = width >= 430 ? 9 : 8;
  const handWidth = Math.min(width, 760) - 36;
  const step = Math.max(31, Math.min(46, (handWidth - CARD_WIDTH) / (cardsPerRow - 1)));
  const rows = Array.from({ length: Math.ceil(cards.length / cardsPerRow) }, (_, i) => cards.slice(i * cardsPerRow, i * cardsPerRow + cardsPerRow));

  useEffect(() => {
    if (previousPhase.current !== game.phase && (game.phase === 'round-over' || game.phase === 'game-over')) playSound('win');
    previousPhase.current = game.phase;
  }, [game.phase, playSound]);

  useEffect(() => {
    let active = true;
    if (loadedOrderKey.current !== orderKey) {
      loadedOrderKey.current = orderKey;
      setArranging(false);
      void loadHandOrder(orderKey).then((saved) => {
        if (active) setHandOrder(reconcileHandOrder(saved, me.hand));
      });
    } else {
      setHandOrder((current) => reconcileHandOrder(current, me.hand));
    }
    return () => { active = false; };
    // handSignature tracks draws/discards without depending on the mutable array.
  }, [orderKey, handSignature, me.hand]);

  function setPending(next: Pending[] | ((current: Pending[]) => Pending[])) {
    const groups = typeof next === 'function' ? next(pending) : next;
    setPendingState({ key: pendingKey, groups });
  }

  function endDrag() {
    setActiveDrag(null);
    setActiveCardId(null);
  }

  function reorderCard(cardId: string, targetIndex: number) {
    endDrag();
    const next = moveCardToIndex(arrangedHand.map((card) => card.id), cardId, targetIndex);
    setHandOrder(next);
    void saveHandOrder(orderKey, next);
  }

  function measureDropZones() {
    for (const [key, node] of Object.entries(dropNodes.current)) {
      node?.measureInWindow((x, y, measuredWidth, measuredHeight) => {
        dropRects.current[key] = { x, y, width: measuredWidth, height: measuredHeight };
      });
    }
  }

  function registerDropZone(key: string, node: Measurable | null) {
    dropNodes.current[key] = node;
    node?.measureInWindow((x, y, measuredWidth, measuredHeight) => {
      dropRects.current[key] = { x, y, width: measuredWidth, height: measuredHeight };
    });
  }

  function beginDrag(kind: typeof activeDrag, cardId?: string) {
    measureDropZones();
    setActiveDrag(kind);
    setActiveCardId(cardId ?? null);
    playSound('tap');
  }

  function isInside(key: string, point: DropPoint) {
    const rect = dropRects.current[key];
    return Boolean(rect && point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height);
  }

  function targetIndex(prefix: string, point: DropPoint) {
    const hit = Object.entries(dropRects.current).find(([key, rect]) => key.startsWith(prefix) &&
      point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height);
    return hit ? Number(hit[0].slice(prefix.length)) : -1;
  }

  function inferType(cardIds: string[]): MeldType | null {
    const group = cardIds.map(id => me.hand.find(card => card.id === id)).filter((card): card is Card => Boolean(card));
    if (isValidMeld(group, 'set')) return 'set';
    if (isValidMeld(group, 'run')) return 'run';
    return null;
  }

  function readyGroups(groups: Pending[]) {
    const ready: { type: MeldType; cardIds: string[] }[] = [];
    for (const group of groups.filter(item => item.cardIds.length)) {
      const type = group.type ?? inferType(group.cardIds);
      const cardsInGroup = group.cardIds.map(id => me.hand.find(card => card.id === id)).filter((card): card is Card => Boolean(card));
      if (!type || !isValidMeld(cardsInGroup, type)) return null;
      ready.push({ type, cardIds: group.cardIds });
    }
    return ready;
  }

  function groupsWithSlots(source = pending) {
    return dropSlots.map((slot, index) => source[index] ?? { type: slot.type, cardIds: [] });
  }

  function addCardToSlot(cardId: string, slotIndex: number, source = pending) {
    if (!playing || slotIndex < 0 || slotIndex >= dropSlots.length) return;
    let groups = groupsWithSlots(source).map(group => ({ ...group, cardIds: group.cardIds.filter(id => id !== cardId) }));
    const slot = dropSlots[slotIndex];
    if (slot.length && groups[slotIndex].cardIds.length >= slot.length) {
      setNotice(`${slot.label} dolu. Önce bir kartı eline geri sürükle.`);
      setPending(groups);
      return;
    }
    groups = groups.map((group, index) => index === slotIndex
      ? { type: slot.type, cardIds: [...group.cardIds, cardId] }
      : group);
    setPending(groups);
    setNotice('');

    if (contract.final && !me.hasOpened) return;
    if (me.hasOpened) {
      if (groups[slotIndex].cardIds.length !== slot.length) return;
      const ready = readyGroups([groups[slotIndex]]);
      if (!ready) {
        setNotice(`${slot.label} henüz geçerli değil. Kartı eline geri sürükleyebilirsin.`);
        return;
      }
      groups = groups.map((group, index) => index === slotIndex ? { type: slot.type, cardIds: [] } : group);
      setPending(groups);
      act({ type: 'open', groups: ready });
      return;
    }

    const complete = groups.every((group, index) => group.cardIds.length === dropSlots[index].length);
    if (!complete) return;
    const ready = readyGroups(groups);
    if (!ready) {
      setNotice('Görev tepsilerinden biri geçerli değil. Kartları eline geri sürükleyip düzelt.');
      return;
    }
    if (game.roundIndex < 5 && ready.some(group => group.cardIds.some(id => me.hand.find(card => card.id === id)?.isJoker))) {
      setNotice('Bu elde açılış tepsilerinde joker kullanılamaz.');
      return;
    }
    setPending([]);
    act({ type: 'open', groups: ready });
  }

  function removeStaged(cardId: string, source = pending) {
    return groupsWithSlots(source).map(group => ({ ...group, cardIds: group.cardIds.filter(id => id !== cardId) }));
  }

  function finishFinal(discardId: string, groups: Pending[]) {
    const ready = readyGroups(groups);
    const groupedCount = groups.reduce((total, group) => total + group.cardIds.length, 0);
    if (!ready?.length || groupedCount !== me.hand.length - 1 || groups.some(group => group.cardIds.length > 0 && group.cardIds.length < 3)) {
      setPending(groups);
      setNotice('Final için bir kartı atmalık bırak; diğer tüm kartları geçerli gruplara sürükle.');
      return;
    }
    setPending([]);
    act({ type: 'finish', groups: ready, discardId });
  }

  function dropOnMeld(cardId: string, meldIndex: number) {
    const meld = game.melds[meldIndex];
    const card = me.hand.find(item => item.id === cardId);
    if (!meld || !card || !me.hasOpened) {
      setNotice('Kart işlemek için önce kendi görevini açmalısın.');
      return;
    }
    if (openedThisTurn) {
      setNotice('İşleme, açılıştan sonraki sıranda serbest.');
      return;
    }
    const matchingJoker = meld.cards.find(joker => joker.isJoker && isValidMeld(
      meld.cards.map(item => item.id === joker.id ? card : item), meld.type,
    ));
    if (matchingJoker) act({ type: 'replaceJoker', meldId: meld.id, jokerId: matchingJoker.id, cardId });
    else if (isValidMeld([...meld.cards, card], meld.type)) act({ type: 'layoff', meldId: meld.id, cardId });
    else setNotice('Bu kart bıraktığın gruba işlenemiyor.');
  }

  function acceptsCard(meldIndex: number, card = activeCard) {
    const meld = game.melds[meldIndex];
    if (!meld || !card || !me.hasOpened || openedThisTurn) return false;
    const replacesJoker = meld.cards.some((joker) => joker.isJoker && isValidMeld(
      meld.cards.map((item) => item.id === joker.id ? card : item), meld.type,
    ));
    return replacesJoker || isValidMeld([...meld.cards, card], meld.type);
  }

  function dropHandCard(cardId: string, point: DropPoint) {
    endDrag();
    if (!Number.isFinite(point.x) || !playing) return;
    const slot = targetIndex('slot:', point);
    if (slot >= 0) return addCardToSlot(cardId, slot);
    const meld = targetIndex('meld:', point);
    if (meld >= 0) return dropOnMeld(cardId, meld);
    if (isInside('discard', point)) {
      if (contract.final && !me.hasOpened) return finishFinal(cardId, removeStaged(cardId));
      if (pending.some(group => group.cardIds.length)) {
        setNotice('Önce tepsideki kartları eline geri al veya grubu tamamla.');
        return;
      }
      act({ type: 'discard', cardId });
      return;
    }
    setNotice('Kartı açık karta, görev tepsisine veya yerdeki bir gruba bırak.');
  }

  function dropStagedCard(cardId: string, point: DropPoint) {
    endDrag();
    if (!Number.isFinite(point.x) || !playing) return;
    const withoutCard = removeStaged(cardId);
    if (Math.abs(point.dx) + Math.abs(point.dy) < 7) {
      setPending(withoutCard);
      setNotice('Kart eline geri döndü.');
      return;
    }
    const slot = targetIndex('slot:', point);
    if (slot >= 0) return addCardToSlot(cardId, slot, withoutCard);
    if (contract.final && !me.hasOpened && isInside('discard', point)) return finishFinal(cardId, withoutCard);
    if (isInside('hand', point)) {
      setPending(withoutCard);
      setNotice('Kart eline geri döndü.');
      return;
    }
    setNotice('Kartı başka bir tepsiye veya eline geri bırak.');
  }

  function dropPile(source: 'stock' | 'discard', point: DropPoint) {
    endDrag();
    if (!Number.isFinite(point.x) || !isInside('hand', point)) {
      setNotice('Kartı almak için desteden elinin üzerine sürükle.');
      return;
    }
    if (source === 'discard' && claiming) act({ type: 'claim', take: true });
    else if (drawing) act({ type: 'draw', source });
  }

  function toggleArrange() {
    playSound('tap');
    if (!arranging && pending.some(group => group.cardIds.length)) {
      setNotice('Elini dizmeden önce hazırladığın grupları geri al.');
      return;
    }
    setNotice(''); setArranging((current) => !current);
  }

  function autoArrange() {
    const next = autoArrangeHand(me.hand, {
      contract,
      prioritizeContract: !me.hasOpened,
      allowJokersInGroups: me.hasOpened || game.roundIndex >= 5,
    });
    setPending([]);
    setArranging(false);
    setHandOrder(next);
    void saveHandOrder(orderKey, next);
    playSound('shuffle');
    setNotice('Elin göreve ve en güçlü gruplara göre dizildi. İstersen elle değiştirebilirsin.');
  }

  function actionSound(action: GameAction): GameSound {
    switch (action.type) {
      case 'draw': return 'draw';
      case 'discard': return 'place';
      case 'open':
      case 'finish': return 'meld';
      case 'replaceJoker': return 'joker';
      case 'layoff': return 'place';
      case 'claim': return action.take ? 'draw' : 'tap';
      case 'next': return 'shuffle';
      default: return 'tap';
    }
  }
  function act(action: GameAction) { setNotice(''); playSound(actionSound(action)); onAction(action); }
  return <SafeAreaView style={s.page}>
    <View style={s.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Masadan çık" onPress={() => setExitOpen(true)} style={s.iconButton}><Text style={s.white}>←</Text></Pressable>
      <View style={s.center}><Text style={s.eyebrow}>{modeLabel}</Text><Text style={s.round}>EL {game.roundIndex + 1} / 12 · {contract.shortTitle}</Text></View>
      <View style={s.headerActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={soundEnabled ? 'Sesi kapat' : 'Sesi aç'} style={s.iconButton} onPress={toggleSound}><Text style={s.soundIcon}>{soundEnabled ? '♪' : '×'}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Puan tablosu" style={s.iconButton} onPress={() => { playSound('tap'); setScoresOpen(true); }}><Text style={s.white}>≡</Text></Pressable>
      </View>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.playersBar} contentContainerStyle={s.players}>
      {game.players.filter(pl => pl.id !== viewerId).map(pl => <View key={pl.id} style={[s.opponent, current.id === pl.id && s.activeOpponent]}>
        <View style={[s.avatar, playerMeta?.[pl.id] && { backgroundColor: playerMeta[pl.id].avatarColor }]}><Text style={s.avatarText}>{playerMeta?.[pl.id]?.avatarSymbol ?? pl.name.charAt(0)}</Text></View>
        <View><Text numberOfLines={1} style={s.opponentName}>{pl.name}{playerMeta?.[pl.id]?.botControlled ? ' · BOT' : playerMeta?.[pl.id]?.connected === false ? ' · çevrim dışı' : ''}</Text><Text style={s.small}>Sv. {playerMeta?.[pl.id]?.level ?? 1} · {game.handCounts[pl.id]} kart · {pl.score} puan{pl.hasOpened ? ' · Açtı' : ''}{playerMeta?.[pl.id]?.missedTurns ? ` · ${playerMeta[pl.id].missedTurns}/3 süre` : ''}</Text></View>
        <View style={{ marginLeft: 5 }}><PlayingCard hidden compact /></View>
      </View>)}
    </ScrollView>
    <ScrollView scrollEnabled={!activeDrag} style={s.tableScroll} contentContainerStyle={s.table}>
      <View style={s.task}><Text style={s.eyebrow}>AÇILIŞ GÖREVİ</Text><Text style={s.taskTitle}>{contract.title}</Text>
        <Text style={s.small}>{me.hasOpened ? openedThisTurn ? 'Görev açıldı · İşleme sonraki sıranda' : 'Elini açtın · Masaya kart işleyebilirsin' : game.roundIndex < 5 ? 'Açılışta joker kullanılamaz' : 'Açılışta joker kullanılabilir'}</Text>
      </View>
      {!over && <View style={s.flowGuide} accessibilityLabel="Sıra adımları">
        <FlowStep number={1} label="KART ÇEK" state={drawing ? 'active' : playing ? 'done' : 'waiting'} />
        <Text style={s.flowArrow}>›</Text>
        <FlowStep number={2} label="AÇ / İŞLE" state={playing ? 'active' : 'waiting'} />
        <Text style={s.flowArrow}>›</Text>
        <FlowStep number={3} label="KART AT" state={playing ? 'ready' : 'waiting'} />
      </View>}
      <View style={s.feltOval}>
        <View style={s.piles}>
          <View style={[s.pile, drawing && s.pileReady]}>
            <DragSurface active={drawing && Boolean(game.stockCount || game.discard.length)} onDragStart={() => beginDrag('stock')} onDrop={(point) => dropPile('stock', point)}>
              <View style={s.pile}><View style={s.stackShadow} /><PlayingCard hidden /><Text style={s.pileLabel}>DESTE · {game.stockCount}</Text></View>
            </DragSurface>
          </View>
          <View style={s.tableMark}><Text style={s.tableA}>A</Text><Text style={s.tableBrand}>AMERİKANO</Text></View>
          <View ref={(node) => registerDropZone('discard', node)} style={[s.pile, (drawing || claiming || activeDrag === 'hand') && s.pileReady, activeDrag === 'hand' && s.dropTargetActive]}>
            <DragSurface active={(drawing || claiming) && Boolean(game.discard.length) && !game.discardFaceDown} onDragStart={() => beginDrag('discard')} onDrop={(point) => dropPile('discard', point)}>
              <View style={s.pile}>{game.discardFaceDown ? <PlayingCard hidden /> : game.discard.length ? <PlayingCard card={game.discard.at(-1)} /> : <View style={s.empty} />}
                <Text style={s.pileLabel}>{game.discardFaceDown ? 'BİTİŞ KARTI · KAPALI' : activeDrag === 'hand' ? 'KARTI BURAYA AT' : 'AÇIK KART'}</Text></View>
            </DragSurface>
          </View>
        </View>
      </View>
      <View style={s.turnRow}><Text style={s.turn}>{blocked ? 'Bağlantı / hamle bekleniyor…' : game.phase === 'claim' ? claiming ? 'Almak için açık kartı eline sürükle; istemiyorsan pas geç.' : `${claimPlayer?.name} açık kartı değerlendiriyor…` : myTurn ? drawing ? 'Desteden veya açık karttan eline sürükle.' : 'Kartını hedefe sürükle ve bırak.' : `${current.name} oynuyor…`}</Text><TurnCountdown deadline={game.turnDeadline} /></View>
      {botControlled && <View style={s.botNotice}><Text style={s.botNoticeText}>Üç süre kaçırdığın için bot senin yerine oynuyor.</Text><Pressable accessibilityRole="button" disabled={blocked} onPress={onReclaim} style={[s.reclaimButton, blocked && s.disabled]}><Text style={s.reclaimText}>Koltuğu geri al</Text></Pressable></View>}
      {claiming && <View style={s.actions}>
        <Pressable accessibilityRole="button" onPress={() => act({ type: 'claim', take: false })} style={s.secondary}><Text style={s.actionText}>Pas geç</Text></Pressable>
      </View>}
      {game.phase === 'claim' && modeLabel.includes('ÇEVRİM') && <Text style={s.small}>Yanıt süresi 8 saniye; yanıt verilmezse pas geçilir.</Text>}
      {playing && !arranging && <View style={s.trayArea}>
        <Text style={s.trayHint}>{me.hasOpened ? 'Yeni grup için kartları tepsiye sürükle.' : contract.final ? 'Kartlarını gruplara ayır; son kartı açık kart alanına at.' : 'Görevi açmak için kartları tepsilere sürükle.'}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} scrollEnabled={!activeDrag} contentContainerStyle={s.trays}>
          {dropSlots.map((slot, index) => {
            const group = groupsWithSlots()[index];
            const groupCards = group.cardIds.map(id => me.hand.find(card => card.id === id)).filter((card): card is Card => Boolean(card));
            const valid = groupCards.length >= 3 && Boolean(group.type ? isValidMeld(groupCards, group.type) : inferType(group.cardIds));
             return <View key={index} ref={(node) => registerDropZone(`slot:${index}`, node)} style={[s.dropSlot, activeDrag === 'hand' && (!slot.length || group.cardIds.length < slot.length) && s.dropTargetActive, valid && s.dropSlotValid]}>
              <Text style={s.dropSlotLabel}>{slot.label} · {group.cardIds.length}{slot.length ? `/${slot.length}` : ''}</Text>
               <View style={s.slotCards}>{groupCards.map((card, cardIndex) => <DragSurface key={card.id} active={playing} onDragStart={() => beginDrag('staged', card.id)} onDrop={(point) => dropStagedCard(card.id, point)} style={{ marginLeft: cardIndex ? -10 : 0 }}><PlayingCard card={card} compact /></DragSurface>)}</View>
              {!groupCards.length && <Text style={s.dropSlotEmpty}>Buraya bırak</Text>}
            </View>;
          })}
        </ScrollView>
      </View>}
      {game.melds.length > 0 ? <View style={s.melds}>
        {game.melds.map((m, index) => <View key={m.id} ref={(node) => registerDropZone(`meld:${index}`, node)} style={[s.meld, activeDrag === 'hand' && acceptsCard(index) && s.dropTargetActive, activeDrag === 'hand' && !acceptsCard(index) && s.meldInactive]}>
          <Text style={s.small}>{game.players.find(pl => pl.id === m.ownerId)?.name} · {m.type === 'set' ? 'Küt' : 'Seri'}</Text>
          <View style={s.meldCards}>{m.cards.map((c, i) => <View key={c.id} style={{ marginLeft: i ? -16 : 0 }}><PlayingCard card={c} compact /></View>)}</View>
          {activeDrag === 'hand' && acceptsCard(index) && <Text style={s.meldDropHint}>Buraya işlenebilir</Text>}
        </View>)}
      </View> : <Text style={s.emptyTable}>Açılan gruplar burada görünecek.</Text>}
    </ScrollView>
    <View ref={(node) => registerDropZone('hand', node)} style={[s.hand, (activeDrag === 'stock' || activeDrag === 'discard' || activeDrag === 'staged') && s.handDropActive]}>
      <View style={s.handHeading}>
        <Text numberOfLines={1} style={s.handName}>{me.name} <Text style={s.small}>· {me.hand.length} kart{myMissedTurns ? ` · ${myMissedTurns}/3 süre kaçtı` : ''}</Text></Text>
        <View style={s.handMeta}><Text style={s.small}>{me.score} puan</Text><Pressable accessibilityRole="button" accessibilityLabel="Eli otomatik diz" disabled={Boolean(activeDrag)} onPress={autoArrange} style={[s.arrangeButton, activeDrag && s.disabled]}><Text style={s.gold}>Oto diz</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={arranging ? 'Kart dizmeyi bitir' : 'Eli istediğin gibi diz'} onPress={toggleArrange} style={[s.arrangeButton, arranging && s.arrangeButtonActive]}><Text style={s.gold}>{arranging ? 'Bitti' : 'Elle diz'}</Text></Pressable></View>
      </View>
      {!!(notice || error) && <Text accessibilityLiveRegion="polite" style={s.notice}>{error || notice}</Text>}
      {arranging && <Text accessibilityLiveRegion="polite" style={s.arrangeHint}>Kartı tutup istediğin konuma sürükle ve bırak.</Text>}
      <ScrollView scrollEnabled={!activeDrag} removeClippedSubviews={false} style={s.handCards} contentContainerStyle={s.handScroll}>
        <View style={s.rows}>{rows.map((row, index) => <View key={index} style={s.cardRow}>
          {row.map((c, i) => <DraggableHandCard key={c.id} card={c} index={index * cardsPerRow + i} step={step} cardsPerRow={cardsPerRow}
            arranging={arranging} gameplayEnabled={playing} onDragStart={() => beginDrag(arranging ? 'arranging' : 'hand', c.id)} onReorder={reorderCard} onGameplayDrop={dropHandCard} />)}
        </View>)}</View>
      </ScrollView>
      {!arranging && <Text style={s.dragGuide}>{drawing ? 'Kart çekmek için üstteki desteden eline sürükle.' : playing ? 'Atmak için kartı açık kartın üstüne; işlemek için gruba sürükle.' : 'Sıranı beklerken “Oto diz” veya “Elle diz” ile elini düzenleyebilirsin.'}</Text>}
    </View>
    <Modal visible={over || scoresOpen} transparent animationType="fade" onRequestClose={() => setScoresOpen(false)}>
      <View style={s.backdrop}><View style={s.sheet}>
        <Text style={s.resultIcon}>♛</Text>
        <Text style={s.resultTitle}>{game.phase === 'game-over' ? winners.map(w => w.name).join(' & ') + ' kazandı!' : game.phase === 'round-over' ? game.players.find(pl => pl.id === game.roundWinnerId)?.name + ' bitirdi!' : 'Puan tablosu'}</Text>
        <Text style={s.resultCaption}>{game.phase === 'round-over' && nextContract ? `Sıradaki el: ${nextContract.title}` : game.phase === 'game-over' ? '12 el tamamlandı. En düşük toplam puan kazandı.' : 'En düşük toplam puan kazanır.'}</Text>
        <ScrollView style={s.resultList} contentContainerStyle={s.resultListContent} showsVerticalScrollIndicator={false}>
          {sortedPlayers.map((pl, i) => {
            const detail = over ? game.roundResult?.entries.find((entry) => entry.playerId === pl.id) : undefined;
            return <View key={pl.id} style={s.scoreBlock}>
              <View style={s.score}><Text style={s.scoreName}>{i + 1}. {pl.name}</Text><Text style={s.scoreValue}>{pl.score}</Text></View>
              {detail && <>
                <Text style={s.penalty}>{detail.penalty === 0 ? 'Eli kapattı · Ceza yok' : `+${detail.penalty} ceza · ${detail.totalBefore} → ${detail.totalAfter}`}</Text>
                {detail.cards.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.remainingCards}>
                  {detail.cards.map((card) => <PlayingCard key={card.id} card={card} compact />)}
                </ScrollView>}
              </>}
            </View>;
          })}
        </ScrollView>
        {over ? game.phase === 'game-over' ? <>{onRematch && (canRematch
            ? <Pressable disabled={blocked} style={[s.resultButton, blocked && s.disabled]} onPress={onRematch}><Text style={s.actionText}>Tekrar oyna</Text></Pressable>
            : <Text style={s.resultCaption}>Oda sahibinin yeniden başlatması bekleniyor.</Text>)}
          <Pressable style={s.resultButtonSecondary} onPress={onExit}><Text style={s.resultButtonSecondaryText}>Ana menü</Text></Pressable></>
          : canAdvance ? <Pressable disabled={blocked} style={s.resultButton} onPress={() => { setPending([]); act({ type: 'next' }); }}><Text style={s.actionText}>{game.roundIndex === 11 ? 'Sonucu gör' : 'Sonraki el'}</Text></Pressable>
          : <Text style={s.resultCaption}>Oda sahibinin sonraki eli başlatması bekleniyor.</Text>
          : <Pressable style={s.resultButton} onPress={() => setScoresOpen(false)}><Text style={s.actionText}>Masaya dön</Text></Pressable>}
      </View></View>
    </Modal>
    <Modal visible={exitOpen} transparent animationType="fade" onRequestClose={() => setExitOpen(false)}><View style={s.backdrop}><View style={s.sheet}>
      <Text style={s.resultTitle}>Masadan çıkılsın mı?</Text><Text style={s.resultCaption}>Tek oyunculu oyun sıfırlanır. Çevrim içi odana aynı cihazdan tekrar dönebilirsin.</Text>
      <Pressable style={s.resultButton} onPress={onExit}><Text style={s.actionText}>Ana menüye dön</Text></Pressable>
      <Pressable style={s.resultButton} onPress={() => setExitOpen(false)}><Text style={s.actionText}>Oynamaya devam et</Text></Pressable>
    </View></View></Modal>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#09271e', width: '100%', maxWidth: 760, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 6 },
  iconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: p.line, borderRadius: 20 },
  headerActions: { flexDirection: 'row', gap: 7 }, soundIcon: { color: p.gold, fontSize: 19, fontWeight: '800' },
  white: { color: p.cream, fontSize: 20 }, center: { alignItems: 'center', gap: 4, marginLeft: 45 }, eyebrow: { color: p.gold, fontSize: 9, letterSpacing: 2, fontWeight: '800' },
  round: { color: p.cream, fontWeight: '700', fontSize: 12 }, playersBar: { flexGrow: 0, maxHeight: 64, borderBottomWidth: 1, borderColor: p.line },
  players: { gap: 8, paddingHorizontal: 12, paddingVertical: 4 }, opponent: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 4, borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  activeOpponent: { borderColor: p.gold, backgroundColor: '#d9a44115' }, avatar: { width: 27, height: 27, borderRadius: 14, backgroundColor: '#dcc48e', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontWeight: '800', color: p.felt }, opponentName: { color: p.cream, fontSize: 12, fontWeight: '700', maxWidth: 85 }, small: { fontSize: 10, color: '#adc4b6', lineHeight: 16 },
  tableScroll: { flex: 1 }, table: { padding: 8, gap: 6, flexGrow: 1 }, task: { alignItems: 'center', gap: 2 },
  taskTitle: { color: p.cream, fontSize: 14, fontWeight: '700' },
  flowGuide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 4 },
  flowStep: { minHeight: 29, paddingHorizontal: 8, borderRadius: 15, borderWidth: 1, borderColor: '#ffffff18', flexDirection: 'row', alignItems: 'center', gap: 5, opacity: 0.48 },
  flowDone: { borderColor: '#79c99a55', backgroundColor: '#3b9b6918', opacity: 0.8 }, flowActive: { borderColor: p.gold, backgroundColor: '#d9a44128', opacity: 1 }, flowReady: { borderColor: '#d9a44166', opacity: 0.85 },
  flowNumber: { color: p.muted, fontSize: 9, fontWeight: '900' }, flowLabel: { color: p.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.5 }, flowStrong: { color: p.cream }, flowArrow: { color: '#718c7d', fontSize: 17 },
  feltOval: { borderRadius: 90, backgroundColor: '#155a40', borderWidth: 3, borderColor: '#775935', paddingVertical: 8, elevation: 2 },
  piles: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }, pile: { alignItems: 'center', gap: 4, borderRadius: 8, padding: 3 }, pileReady: { backgroundColor: '#ffe1a410' },
  dropTargetActive: { borderColor: p.gold, borderWidth: 2, backgroundColor: '#d9a44122' },
  stackShadow: { position: 'absolute', width: CARD_WIDTH, height: CARD_HEIGHT, borderRadius: 5, backgroundColor: '#bda886', left: 7, top: 7, borderWidth: 1, borderColor: '#624a32' },
  pileLabel: { color: '#e1d2ad', fontSize: 8, letterSpacing: 1, fontWeight: '700' }, empty: { width: CARD_WIDTH, height: CARD_HEIGHT, borderWidth: 1, borderColor: '#ffffff25', borderRadius: 5 },
  tableMark: { alignItems: 'center', opacity: 0.25 }, tableA: { color: '#e1d2ad', fontFamily: 'serif', fontSize: 25 }, tableBrand: { color: '#e1d2ad', fontSize: 6, letterSpacing: 1.5 },
  turnRow: { minHeight: 26, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }, turn: { color: '#e8d0a1', fontSize: 12, textAlign: 'center', fontWeight: '600' },
  timer: { minWidth: 28, height: 23, paddingHorizontal: 5, borderRadius: 12, backgroundColor: '#d9a44130', alignItems: 'center', justifyContent: 'center' }, timerUrgent: { backgroundColor: '#a64048' }, timerText: { color: p.cream, fontSize: 11, fontWeight: '900' }, emptyTable: { color: '#7f9d8c', textAlign: 'center', fontSize: 11, marginTop: 3 },
  botNotice: { marginHorizontal: 12, padding: 9, borderRadius: 10, backgroundColor: '#d9a44122', borderWidth: 1, borderColor: '#d9a44166', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  botNoticeText: { color: p.cream, fontSize: 11, flex: 1 }, reclaimButton: { paddingVertical: 7, paddingHorizontal: 10, borderRadius: 8, backgroundColor: p.gold }, reclaimText: { color: p.ink, fontSize: 11, fontWeight: '800' },
  trayArea: { gap: 4, paddingVertical: 2 }, trayHint: { color: '#d9c89f', fontSize: 10, textAlign: 'center' }, trays: { gap: 7, paddingHorizontal: 3 },
  dropSlot: { minWidth: 92, minHeight: 72, padding: 6, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: '#ffffff38', backgroundColor: '#ffffff08' },
  dropSlotValid: { borderColor: '#79c99a', backgroundColor: '#3b9b6922' }, dropSlotLabel: { color: p.gold, fontSize: 9, fontWeight: '800' }, dropSlotEmpty: { color: '#789b88', fontSize: 10, textAlign: 'center', paddingTop: 15 },
  slotCards: { minHeight: 53, flexDirection: 'row', alignItems: 'center', paddingTop: 3 },
  melds: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, meld: { padding: 8, borderWidth: 1, borderColor: p.line, borderRadius: 10, gap: 4 }, meldCards: { flexDirection: 'row' },
  meldInactive: { opacity: 0.45 },
  meldDropHint: { color: p.gold, fontSize: 9, fontWeight: '700' },
  hand: { paddingTop: 10, paddingBottom: 8, borderTopWidth: 1, borderColor: '#dab77b50', backgroundColor: '#071d17', overflow: 'visible' }, handDropActive: { borderTopWidth: 3, borderTopColor: p.gold, backgroundColor: '#0d3327' },
  handHeading: { flexDirection: 'row', paddingHorizontal: 18, justifyContent: 'space-between', alignItems: 'center' }, handName: { color: p.cream, fontSize: 15, fontWeight: '700', flexShrink: 1, marginRight: 6 },
  handMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 }, arrangeButton: { minHeight: 30, paddingHorizontal: 8, borderWidth: 1, borderColor: p.line, borderRadius: 9, justifyContent: 'center' }, arrangeButtonActive: { backgroundColor: '#d9a44120', borderColor: p.gold },
  handCards: { maxHeight: 210, overflow: 'visible' },
  handScroll: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 4, flexGrow: 1, justifyContent: 'center' },
  rows: { gap: 8 }, cardRow: { flexDirection: 'row' }, actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 10 },
  secondary: { minHeight: 44, borderWidth: 1, borderColor: p.line, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flex: 1 },
  primary: { minHeight: 44, borderRadius: 11, backgroundColor: p.gold, alignItems: 'center', justifyContent: 'center', flex: 1.2 },
  actionText: { color: p.cream, fontSize: 13, fontWeight: '700' }, primaryText: { color: p.ink, fontSize: 14, fontWeight: '800' }, disabled: { opacity: 0.35 },
  notice: { color: '#ffc88a', paddingHorizontal: 18, marginTop: 6, fontSize: 12 }, arrangeHint: { color: p.gold, paddingHorizontal: 18, marginTop: 6, fontSize: 11 },
  dragGuide: { color: '#90aa9b', fontSize: 10, textAlign: 'center', paddingHorizontal: 18, paddingTop: 5 }, gold: { color: p.gold, fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: '#000b', justifyContent: 'center', padding: 24 }, sheet: { width: '100%', maxWidth: 480, maxHeight: '88%', alignSelf: 'center', backgroundColor: '#f5eedf', borderRadius: 23, padding: 25, gap: 14 },
  resultIcon: { textAlign: 'center', color: '#997431', fontSize: 36 }, resultTitle: { color: '#142c22', fontWeight: '800', fontSize: 25, textAlign: 'center' }, resultCaption: { color: '#59675f', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  resultList: { flexGrow: 0 }, resultListContent: { gap: 8 }, scoreBlock: { borderBottomWidth: 1, borderColor: '#d5cdbb', paddingBottom: 8 },
  score: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }, scoreName: { color: '#253a2e', fontSize: 15 }, scoreValue: { fontWeight: '800', color: '#80602b' },
  penalty: { color: '#59675f', fontSize: 11, marginBottom: 5 }, remainingCards: { gap: 3, paddingRight: 8 },
  resultButton: { padding: 16, backgroundColor: '#143e2c', borderRadius: 12, alignItems: 'center' },
  resultButtonSecondary: { padding: 13, borderWidth: 1, borderColor: '#9d9584', borderRadius: 12, alignItems: 'center' }, resultButtonSecondaryText: { color: '#253a2e', fontSize: 13, fontWeight: '700' },
});
