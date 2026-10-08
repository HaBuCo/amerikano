import { useTranslations } from '@/i18n/language';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Animated, Linking, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { palette as p } from '@/constants/palette';
import { CARD_HEIGHT, CARD_WIDTH, PlayingCard, SMALL_CARD_HEIGHT, SMALL_CARD_WIDTH, TABLET_CARD_HEIGHT, TABLET_CARD_WIDTH, TABLET_SMALL_CARD_HEIGHT, TABLET_SMALL_CARD_WIDTH } from './playing-card';
import { PrivateGameView } from '@/game/view';
import { SUITS } from '@/game/types';
import type { Card, GameAction, MeldType, Rank, Suit } from '@/game/types';
import { ROUND_CONTRACTS } from '@/game/contracts';
import { contractForRound, openingJokerRestricted, roundCountForGame, rulesForGame } from '@/game/game-rules';
import { meldFeedback } from '@/game/meld-feedback';
import { cardFitsMeld, isValidMeld } from '@/game/engine';
import { GameSound, useGameSounds } from '@/audio/game-sounds';
import { arrangeHand, loadHandOrder, moveCardToIndex, reconcileHandOrder, saveHandOrder } from '@/game/hand-order';
import { autoArrangeHand, suggestContractGroups, suggestFinalGroups } from '@/game/auto-arrange';
import { useGameSettings } from '@/settings/game-settings';
import { getHandGrid } from '@/game/hand-layout';
import { isMeldHidden } from '@/game/meld-visibility';
import { closestDropTarget, containsDropPoint, isTapDrop } from '@/game/drop-geometry';
import type { DropPoint, DropRect } from '@/game/drop-geometry';
import { scoreSummary } from '@/game/score-summary';
import { snapshotActor, tableSound } from '@/game/table-sounds';
import type { TableSnapshot } from '@/game/table-sounds';
import { REACTIONS, REACTION_VISIBLE_MS, reactionById } from '@/game/reactions';
import { deleteAccountUrl, privacyPolicyUrl, TERMS_LABEL, termsUrl } from '@/constants/legal';
import { LanguagePicker } from './language-picker';

type Props = {
  game: PrivateGameView; viewerId: string; modeLabel: string; blocked?: boolean;
  canAdvance?: boolean; canRematch?: boolean; error?: string;
  debugText?: string;
  playerMeta?: Record<string, { avatarColor: string; avatarSymbol: string; level: number; connected: boolean; missedTurns: number; botControlled: boolean }>;
  botControlled?: boolean; onReclaim?: () => void;
  onOpenTutorial?: () => void;
  onReact?: (reactionId: string) => void; reactions?: Record<string, { id: string; at: number }>;
  canUndo?: boolean; onUndo?: () => void;
  connectionState?: 'online' | 'reconnecting' | 'offline';
  onAction: (a: GameAction) => void; onRematch?: () => void; onForfeit?: () => void; onExit: () => void;
};
type Pending = { type: MeldType | null; cardIds: string[] };
type OpeningAction = Extract<GameAction, { type: 'open' | 'finish' }>;
type JokerChoice = { action: OpeningAction; groupIndex: number; jokerId: string; rank: Rank; suits: Suit[] };
type DropSlot = { type: MeldType | null; length?: number; label: string };
type Measurable = { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void };
type DropZoneNodeHandler = (key: string, node: Measurable | null) => void;
const suitName: Record<Suit, string> = { hearts: 'Kupa', diamonds: 'Karo', clubs: 'Sinek', spades: 'Maça' };
const suitSymbol: Record<Suit, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const DISCARD_DROP_PADDING = 46;
const MELD_DROP_PADDING = 24;
const HAND_DROP_PADDING = 64;

function DropZoneView({ dropKey, onNode, onLayout, ...props }: Omit<ComponentProps<typeof View>, 'ref'> & { dropKey: string; onNode: DropZoneNodeHandler }) {
  const nodeRef = useRef<Measurable | null>(null);
  const measuredRef = useCallback((node: Measurable | null) => {
    nodeRef.current = node;
    onNode(dropKey, node);
  }, [dropKey, onNode]);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    onLayout?.(event);
    if (nodeRef.current) onNode(dropKey, nodeRef.current);
  }, [dropKey, onLayout, onNode]);
  return <View {...props} ref={measuredRef} onLayout={handleLayout} />;
}

function DropZonePressable({ dropKey, onNode, onLayout, ...props }: Omit<ComponentProps<typeof Pressable>, 'ref'> & { dropKey: string; onNode: DropZoneNodeHandler }) {
  const nodeRef = useRef<Measurable | null>(null);
  const measuredRef = useCallback((node: Measurable | null) => {
    nodeRef.current = node;
    onNode(dropKey, node);
  }, [dropKey, onNode]);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    onLayout?.(event);
    if (nodeRef.current) onNode(dropKey, nodeRef.current);
  }, [dropKey, onLayout, onNode]);
  return <Pressable {...props} ref={measuredRef} onLayout={handleLayout} />;
}

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
  cardWidth: number; cardHeight: number; compactCard: boolean; tabletCards: boolean;
  arranging: boolean; gameplayEnabled: boolean; onDragStart: () => void;
  onReorder: (cardId: string, targetIndex: number) => void;
  onGameplayDrop: (cardId: string, point: DropPoint) => void;
};

function DraggableHandCard({ card, index, step, cardsPerRow, cardWidth, cardHeight, compactCard, tabletCards, arranging, gameplayEnabled, onDragStart, onReorder, onGameplayDrop }: DraggableCardProps) {
  return <DragSurface active={arranging || gameplayEnabled} onDragStart={onDragStart} onDrop={(point) => {
    if (arranging) {
      const columnMove = Math.round(point.dx / step);
      const rowMove = Math.round(point.dy / (cardHeight + 8));
      onReorder(card.id, index + columnMove + rowMove * cardsPerRow);
    } else onGameplayDrop(card.id, point);
  }} style={{ marginLeft: index % cardsPerRow ? step - cardWidth : 0, zIndex: index % cardsPerRow }}>
    <PlayingCard card={card} small={compactCard} tablet={tabletCards} />
  </DragSurface>;
}

const ROUND_ADVANCE_DELAY_MS = 6_000;

function TurnCountdown({ deadline, warningEnabled, tickEnabled, onUrgent, onTick }: { deadline?: number; warningEnabled: boolean; tickEnabled: boolean; onUrgent: () => void; onTick: () => void }) {
  const { t } = useTranslations();
  const [seconds, setSeconds] = useState(() => deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : 0);
  const warnedDeadline = useRef<number | undefined>(undefined);
  const tickedKey = useRef('');
  useEffect(() => {
    if (!deadline) return;
    const update = () => setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [deadline]);
  useEffect(() => {
    if (deadline && warningEnabled && seconds === 10 && warnedDeadline.current !== deadline) {
      warnedDeadline.current = deadline;
      onUrgent();
    }
  }, [deadline, onUrgent, seconds, warningEnabled]);
  useEffect(() => {
    const key = `${deadline}:${seconds}`;
    if (deadline && warningEnabled && tickEnabled && seconds > 0 && seconds <= 10 && tickedKey.current !== key) {
      tickedKey.current = key;
      onTick();
    }
  }, [deadline, onTick, seconds, tickEnabled, warningEnabled]);
  if (!deadline) return null;
  return <View accessibilityLabel={t("Sıra süresi {0} saniye", [seconds])} style={[s.timer, warningEnabled && seconds <= 10 && s.timerUrgent]}><Text style={s.timerText}>{seconds}</Text></View>;
}

function ReactionBubble({ reaction }: { reaction: { id: string; at: number } }) {
  const { t } = useTranslations();
  const [hiddenAt, setHiddenAt] = useState<number | null>(() => Date.now() - reaction.at >= REACTION_VISIBLE_MS ? reaction.at : null);
  useEffect(() => {
    const remaining = REACTION_VISIBLE_MS - (Date.now() - reaction.at);
    if (remaining <= 0) return;
    const timer = setTimeout(() => setHiddenAt(reaction.at), remaining);
    return () => clearTimeout(timer);
  }, [reaction.at]);
  const visible = hiddenAt !== reaction.at;
  const item = reactionById(reaction.id);
  if (!visible || !item) return null;
  return <View pointerEvents="none" accessibilityLiveRegion="polite" style={s.reactionBubble}>
    <Text numberOfLines={1} style={item.kind === 'emoji' ? s.reactionEmoji : s.reactionPhrase}>{t(item.text)}</Text>
  </View>;
}

function SettingRow({ label, value, onPress }: { label: string; value: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={onPress} style={s.settingRow}>
    <Text style={s.settingLabel}>{label}</Text><View style={[s.switchTrack, value && s.switchTrackOn]}><View style={[s.switchKnob, value && s.switchKnobOn]} /></View>
  </Pressable>;
}

export function GameTable({ game, viewerId, modeLabel, blocked, canAdvance = true, canRematch = false, error, debugText, playerMeta, botControlled = false, connectionState, onReclaim, onOpenTutorial, onReact, reactions, canUndo = false, onUndo, onAction, onRematch, onForfeit, onExit }: Props) {
  const { t, localizeMessage, language } = useTranslations();
  const [pendingState, setPendingState] = useState<{ key: string; groups: Pending[] }>({ key: '', groups: [] });
  const [notice, setNotice] = useState('');
  const [exitOpen, setExitOpen] = useState(false);
  const [scoresOpen, setScoresOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);
  const [jokerChoice, setJokerChoice] = useState<JokerChoice | null>(null);
  const [activeDrag, setActiveDrag] = useState<'hand' | 'stock' | 'discard' | 'staged' | 'arranging' | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [rejectedMeld, setRejectedMeld] = useState<{ key: string; id: string } | null>(null);
  const [advance, setAdvance] = useState<{ roundIndex: number; seconds: number } | null>(null);
  const dropNodes = useRef<Record<string, Measurable | null>>({});
  const dropRects = useRef<Record<string, DropRect>>({});
  const { enabled: soundEnabled, toggle: toggleSound, play: playSound } = useGameSounds();
  const { settings, updateSettings, feedback } = useGameSettings();
  const previousPhase = useRef(game.phase);
  const previousError = useRef(error);
  const previousMyTurn = useRef(false);
  const window = useWindowDimensions();
  const width = Math.max(1, Number.isFinite(window.width) ? window.width : 1);
  const height = Math.max(1, Number.isFinite(window.height) ? window.height : 1);
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
  const penalizedPlayer = game.players.find(pl => pl.id === game.lastPenalty?.playerId);
  const openedThisTurn = me.openedTurn === game.turnCount;
  const stagedIds = new Set(pending.flatMap(g => g.cardIds));
  const arrangedHand = arrangeHand(me.hand, handOrder);
  const cards = arrangedHand.filter(c => !stagedIds.has(c.id));
  const activeCard = activeCardId ? me.hand.find((card) => card.id === activeCardId) : undefined;
  const contract = contractForRound(game);
  const roundCount = roundCountForGame(game);
  const gameRules = rulesForGame(game);
  const dropSlots: DropSlot[] = me.hasOpened
    ? [{ type: 'set', label: t("Yeni küt") }, { type: 'run', label: t("Yeni seri") }]
    : contract.final
      ? Array.from({ length: Math.max(4, Math.ceil((me.hand.length - 1) / 3)) }, (_, index) => ({ type: null, label: t("Grup {0}", [index + 1]) }))
      : contract.parts.flatMap(part => Array.from({ length: part.count }, (_, index) => ({
          type: part.type, length: part.length,
          label: `${part.type === 'set' ? t("Küt") : t("Seri")}${part.count > 1 ? ` ${index + 1}` : ''}`,
        })));
  const over = game.phase === 'round-over' || game.phase === 'game-over';
  const winners = game.players.filter(player => player.score === Math.min(...game.players.map(pl => pl.score)));
  const sortedPlayers = [...game.players].sort((a, b) => a.score - b.score);
  const scoreHistory = game.scoreHistory ?? [];
  const visibleMelds = game.melds
    .map((meld, index) => ({ meld, index }))
    .filter(({ meld }) => !isMeldHidden(
      meld,
      game.turnCount,
      game.phase,
      game.players.find(player => player.id === meld.ownerId)?.openedTurn,
    ));
  const nextContractIndex = gameRules.contractSequence[game.roundIndex + 1];
  const nextContract = nextContractIndex === undefined ? null : ROUND_CONTRACTS[nextContractIndex];
  const handGrid = getHandGrid(cards.length, width, settings.compactCards);
  const autoCompactHand = handGrid.compact;
  // Penalty draws can make a hand unusually large. Increase overlap instead of
  // adding a visually awkward third row that pushes the table out of view.
  const cardsPerRow = handGrid.cardsPerRow;
  const tableWidth = Math.min(width, 1180);
  const tabletLandscape = width >= 700 && width > height;
  const handCardWidth = tabletLandscape
    ? autoCompactHand ? TABLET_SMALL_CARD_WIDTH : TABLET_CARD_WIDTH
    : autoCompactHand ? SMALL_CARD_WIDTH : CARD_WIDTH;
  const handCardHeight = tabletLandscape
    ? autoCompactHand ? TABLET_SMALL_CARD_HEIGHT : TABLET_CARD_HEIGHT
    : autoCompactHand ? SMALL_CARD_HEIGHT : CARD_HEIGHT;
  const handWidth = tableWidth - 36;
  const playerColumns = width >= 700 ? game.players.length : game.players.length === 4 ? 2 : Math.min(3, game.players.length);
  const playerTileWidth = Math.max(72, (tableWidth - 28 - Math.max(0, playerColumns - 1) * 6) / Math.max(1, playerColumns));
  const step = cardsPerRow <= 1
    ? handCardWidth
    : Math.max(18, Math.min(tabletLandscape ? autoCompactHand ? 50 : 57 : autoCompactHand ? 41 : 46, (handWidth - handCardWidth) / (cardsPerRow - 1)));
  const rows = Array.from({ length: Math.ceil(cards.length / cardsPerRow) }, (_, i) => cards.slice(i * cardsPerRow, i * cardsPerRow + cardsPerRow));

  useEffect(() => {
    if (previousPhase.current !== game.phase && (game.phase === 'round-over' || game.phase === 'game-over')) {
      const won = game.phase === 'game-over'
        ? winners.some(player => player.id === viewerId)
        : game.roundWinnerId === viewerId;
      playSound(won ? 'win' : 'lose');
      feedback(won ? 'success' : 'impact');
    }
    previousPhase.current = game.phase;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the phase change should trigger the jingle.
  }, [feedback, game.phase, playSound]);

  useEffect(() => {
    if (error && error !== previousError.current) {
      playSound('error');
      feedback('error');
    }
    previousError.current = error;
  }, [error, feedback, playSound]);

  // Sounds for moves other people (or the bot seat) made. Our own actions already
  // play theirs from act(), so skip changes whose previous actor was us.
  const previousTable = useRef<TableSnapshot | null>(null);
  useEffect(() => {
    const snapshot: TableSnapshot = {
      roundIndex: game.roundIndex, stockCount: game.stockCount, melds: game.melds, lastPenalty: game.lastPenalty,
      phase: game.phase, players: game.players, currentPlayerIndex: game.currentPlayerIndex, claim: game.claim,
    };
    const before = previousTable.current;
    previousTable.current = snapshot;
    if (!before) return;
    const sound = tableSound(before, snapshot);
    if (!sound) return;
    const ownMove = snapshotActor(before) === viewerId && !botControlled && sound !== 'penalty' && sound !== 'deal';
    if (!ownMove) playSound(sound);
  }, [game.roundIndex, game.stockCount, game.melds, game.lastPenalty, game.phase, game.players, game.currentPlayerIndex, game.claim, viewerId, botControlled, playSound]);

  useEffect(() => {
    const needsMe = myTurn || claiming;
    if (needsMe && !previousMyTurn.current) {
      playSound('turn');
      feedback('turn');
    }
    previousMyTurn.current = needsMe;
  }, [myTurn, claiming, playSound, feedback]);

  useEffect(() => {
    let active = true;
    if (loadedOrderKey.current !== orderKey) {
      loadedOrderKey.current = orderKey;
      setArranging(false);
      void loadHandOrder(orderKey).then((saved) => {
        if (active) setHandOrder(reconcileHandOrder(saved, me.hand));
      });
    } else {
      setHandOrder((current) => {
        const next = reconcileHandOrder(current, me.hand);
        return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next;
      });
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

  function measureDropZones(onlyKeys?: Set<string>) {
    for (const [key, node] of Object.entries(dropNodes.current)) {
      if (onlyKeys && !onlyKeys.has(key)) continue;
      node?.measureInWindow((x, y, measuredWidth, measuredHeight) => {
        dropRects.current[key] = { x, y, width: measuredWidth, height: measuredHeight };
      });
    }
  }

  const registerDropZone = useCallback((key: string, node: Measurable | null) => {
    if (!node) {
      delete dropNodes.current[key];
      delete dropRects.current[key];
      return;
    }
    dropNodes.current[key] = node;
    node.measureInWindow((x, y, measuredWidth, measuredHeight) => {
      dropRects.current[key] = { x, y, width: measuredWidth, height: measuredHeight };
    });
  }, []);

  function beginDrag(kind: typeof activeDrag, cardId?: string) {
    setRejectedMeld(null);
    measureDropZones(kind === 'stock' || kind === 'discard' ? new Set(['hand']) : undefined);
    setActiveDrag(kind);
    setActiveCardId(cardId ?? null);
    playSound('tap');
    feedback('selection');
  }

  function isInside(key: string, point: DropPoint, padding = 0) {
    return containsDropPoint(dropRects.current[key], point, padding);
  }

  function targetIndex(prefix: string, point: DropPoint) {
    const hit = Object.entries(dropRects.current).find(([key, rect]) => key.startsWith(prefix) &&
      point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height);
    return hit ? Number(hit[0].slice(prefix.length)) : -1;
  }

  function targetMeldId(point: DropPoint, card?: Card) {
    const targets = Object.entries(dropRects.current)
      .filter(([key]) => key.startsWith('meld:'))
      .map(([key, rect]) => {
        const meldId = key.slice('meld:'.length);
        return { value: meldId, rect, preferred: acceptsCard(meldId, card) };
      })
      .filter(target => target.preferred || containsDropPoint(target.rect, point));
    return closestDropTarget(targets, point, MELD_DROP_PADDING);
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

  function slotLimit(slot: DropSlot) {
    if (slot.length) return slot.length;
    if (!me.hasOpened) return undefined;
    return slot.type === 'set' ? 4 : 13;
  }

  function submitOpening(action: OpeningAction) {
    const groups = action.groups.map(group => ({
      ...group,
      jokerAssignments: { ...group.jokerAssignments },
    }));

    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      const group = groups[groupIndex];
      if (group.type !== 'set') continue;
      const groupCards = group.cardIds.map(id => me.hand.find(card => card.id === id)).filter((card): card is Card => Boolean(card));
      const rank = groupCards.find(card => !card.isJoker)?.rank;
      if (!rank) continue;
      const jokers = groupCards.filter(card => card.isJoker);
      const used = new Set(groupCards.filter(card => !card.isJoker).map(card => card.suit!));
      for (const joker of jokers) {
        const assigned = group.jokerAssignments[joker.id];
        if (assigned) used.add(assigned);
      }
      const unresolved = jokers.filter(joker => !group.jokerAssignments[joker.id]);
      const available = SUITS.filter(suit => !used.has(suit));
      if (available.length < unresolved.length) {
        setNotice(t("Jokerler için geçerli sembol seçimi kalmadı."));
        return;
      }
      if (unresolved.length && available.length === unresolved.length) {
        unresolved.forEach((joker, index) => { group.jokerAssignments[joker.id] = available[index]; });
        continue;
      }
      if (unresolved.length) {
        const prepared = { ...action, groups } as OpeningAction;
        setJokerChoice({ action: prepared, groupIndex, jokerId: unresolved[0].id, rank, suits: available });
        return;
      }
    }

    setJokerChoice(null);
    act({ ...action, groups } as OpeningAction);
  }

  function chooseJokerSuit(suit: Suit) {
    if (!jokerChoice) return;
    const groups = jokerChoice.action.groups.map((group, index) => index === jokerChoice.groupIndex
      ? { ...group, jokerAssignments: { ...group.jokerAssignments, [jokerChoice.jokerId]: suit } }
      : group);
    setJokerChoice(null);
    submitOpening({ ...jokerChoice.action, groups } as OpeningAction);
  }

  function addCardToSlot(cardId: string, slotIndex: number, source = pending) {
    if (!playing || openedThisTurn || slotIndex < 0 || slotIndex >= dropSlots.length) return;
    let groups = groupsWithSlots(source).map(group => ({ ...group, cardIds: group.cardIds.filter(id => id !== cardId) }));
    const slot = dropSlots[slotIndex];
    const limit = slotLimit(slot);
    if (limit && groups[slotIndex].cardIds.length >= limit) {
      setNotice(t("{0} dolu. Önce bir kartı eline geri sürükle.", [localizeMessage(slot.label)]));
      setPending(groups);
      return;
    }
    groups = groups.map((group, index) => index === slotIndex
      ? { type: slot.type, cardIds: [...group.cardIds, cardId] }
      : group);
    setPending(groups);
    setNotice('');
    if (slot.length && groups[slotIndex].cardIds.length >= slot.length) {
      const nextSlot = groups.findIndex((group, index) => index !== slotIndex &&
        (!dropSlots[index].length || group.cardIds.length < dropSlots[index].length!));
      if (nextSlot >= 0) setActiveSlotIndex(nextSlot);
    }

    if (contract.final && !me.hasOpened) return;
    if (me.hasOpened) return;

    const complete = groups.every((group, index) => group.cardIds.length === dropSlots[index].length);
    if (!complete) return;
    const ready = readyGroups(groups);
    if (!ready) {
      setNotice(t("Görev tepsilerinden biri geçerli değil. Kartları eline geri sürükleyip düzelt."));
      return;
    }
    if (openingJokerRestricted(game) && ready.some(group => group.cardIds.some(id => me.hand.find(card => card.id === id)?.isJoker))) {
      setNotice(t("Bu elde açılış tepsilerinde joker kullanılamaz."));
      return;
    }
    setPending([]);
    submitOpening({ type: 'open', groups: ready });
  }

  function openStagedGroups() {
    if (!playing || !me.hasOpened || openedThisTurn) return;
    const ready = readyGroups(pending);
    if (!ready?.length) {
      setNotice(t("Masaya açmak için en az 3 karttan oluşan geçerli bir küt veya seri hazırla."));
      return;
    }
    setPending([]);
    setNotice('');
    submitOpening({ type: 'open', groups: ready });
  }

  function addTappedCard(cardId: string) {
    if (openedThisTurn) {
      setNotice(t("Açılış tamamlandı. Bu tur yalnızca bir kart atabilirsin."));
      return;
    }
    const groups = groupsWithSlots();
    let slotIndex = activeSlotIndex;
    const activeSlot = dropSlots[slotIndex];
    if (!activeSlot || (slotLimit(activeSlot) && groups[slotIndex].cardIds.length >= slotLimit(activeSlot)!)) {
      slotIndex = groups.findIndex((group, index) =>
        !slotLimit(dropSlots[index]) || group.cardIds.length < slotLimit(dropSlots[index])!);
    }
    if (slotIndex < 0) {
      setNotice(t("Bütün tepsiler dolu. Bir kartı tepsiden çıkarıp tekrar dene."));
      return;
    }
    // Tapping lets the game route the card: keep the selected tray when the card
    // still fits it, otherwise move to a tray it can belong to (filled ones first).
    const card = me.hand.find(item => item.id === cardId);
    const jokersAllowed = me.hasOpened || !openingJokerRestricted(game);
    const fits = (index: number) => {
      const slot = dropSlots[index];
      const limit = slotLimit(slot);
      if (!card || (limit && groups[index].cardIds.length >= limit)) return false;
      const trayCards = groups[index].cardIds.map(id => me.hand.find(item => item.id === id)).filter((item): item is Card => Boolean(item));
      return meldFeedback([...trayCards, card], slot.type, slot.length, jokersAllowed) !== 'invalid';
    };
    if (!fits(slotIndex)) {
      const candidates = groups.map((_, index) => index).filter(index => index !== slotIndex && fits(index));
      const better = candidates.find(index => groups[index].cardIds.length) ?? candidates[0];
      if (better !== undefined) slotIndex = better;
    }
    // A lone card parked in another tray joins this one once it holds two or
    // more cards it fits with (J tapped first lands in a set, then Q and K start a run).
    let source: Pending[] = groups;
    if (card) {
      const tray = dropSlots[slotIndex];
      const limit = slotLimit(tray);
      let trayCards = [...groups[slotIndex].cardIds.map(id => me.hand.find(item => item.id === id)).filter((item): item is Card => Boolean(item)), card];
      if (trayCards.length >= 2) {
        const moved = new Set<string>();
        groups.forEach((group, index) => {
          const loose = group.cardIds.length === 1 && index !== slotIndex ? me.hand.find(item => item.id === group.cardIds[0]) : undefined;
          if (!loose || (limit && trayCards.length >= limit)) return;
          if (meldFeedback([...trayCards, loose], tray.type, tray.length, jokersAllowed) === 'invalid') return;
          trayCards = [...trayCards, loose];
          moved.add(loose.id);
        });
        if (moved.size) source = groups.map((group, index) => index === slotIndex
          ? { ...group, cardIds: [...group.cardIds, ...moved] }
          : { ...group, cardIds: group.cardIds.filter(id => !moved.has(id)) });
      }
    }
    setActiveSlotIndex(slotIndex);
    addCardToSlot(cardId, slotIndex, source);
  }

  function findAndOpenContract() {
    const groups = suggestContractGroups(me.hand, contract, !openingJokerRestricted(game));
    if (!groups) {
      setNotice(t("Elinde bu görevi tamamlayan hazır bir grup bulunamadı. Kartlara dokunarak tepsileri elle doldurabilirsin."));
      return;
    }
    setPending([]);
    setNotice('');
    submitOpening({ type: 'open', groups });
  }

  function removeStaged(cardId: string, source = pending) {
    return groupsWithSlots(source).map(group => ({ ...group, cardIds: group.cardIds.filter(id => id !== cardId) }));
  }

  function finishFinal(discardId: string, groups: Pending[]) {
    const ready = readyGroups(groups);
    const groupedCount = groups.reduce((total, group) => total + group.cardIds.length, 0);
    if (!ready?.length || groupedCount !== me.hand.length - 1 || groups.some(group => group.cardIds.length > 0 && group.cardIds.length < 3)) {
      const suggested = suggestFinalGroups(me.hand, discardId);
      if (suggested) {
        setPending([]);
        setNotice('');
        submitOpening({ type: 'finish', groups: suggested, discardId });
        return;
      }
      // The final round still has ordinary draw/discard turns until the whole
      // hand is ready. Staged cards only live in the UI, so return them to the
      // hand and let this discard advance play normally.
      setPending([]);
      setNotice('');
      act({ type: 'discard', cardId: discardId });
      return;
    }
    setPending([]);
    submitOpening({ type: 'finish', groups: ready, discardId });
  }

  function dropOnMeld(cardId: string, meldId: string) {
    if (!acceptsCard(meldId, me.hand.find(item => item.id === cardId))) {
      setRejectedMeld({ key: pendingKey, id: meldId });
    }
    const meld = game.melds.find(item => item.id === meldId);
    const card = me.hand.find(item => item.id === cardId);
    if (!meld || !card || !me.hasOpened) {
      setNotice(t("Kart işlemek için önce kendi görevini açmalısın."));
      return;
    }
    if (openedThisTurn) {
      setNotice(t("İşleme, açılıştan sonraki sıranda serbest."));
      return;
    }
    const matchingJoker = meld.cards.find(joker => joker.isJoker && (meld.type === 'set'
      ? card.rank === meld.cards.find(item => !item.isJoker)?.rank && card.suit === meld.jokerAssignments?.[joker.id]
      : isValidMeld(meld.cards.map(item => item.id === joker.id ? card : item), meld.type)));
    if (matchingJoker) act({ type: 'replaceJoker', meldId: meld.id, jokerId: matchingJoker.id, cardId });
    else if (isValidMeld([...meld.cards, card], meld.type)) act({ type: 'layoff', meldId: meld.id, cardId });
    else setNotice(t("Bu kart bıraktığın gruba işlenemiyor."));
  }

  function acceptsCard(meldId: string, card = activeCard) {
    return me.hasOpened && !openedThisTurn && fitsMeld(meldId, card);
  }

  // Whether the card belongs on this meld, regardless of whether we may lay it
  // off right now. Drives the highlight so playable (penalised) discards show
  // up before opening and on the opening turn too.
  function fitsMeld(meldId: string, card = activeCard) {
    const meld = game.melds.find(item => item.id === meldId);
    if (!meld || !card) return false;
    return me.hand.length > 1 && cardFitsMeld(meld, card);
  }

  function dropHandCard(cardId: string, point: DropPoint) {
    endDrag();
    if (!Number.isFinite(point.x) || !playing) return;
    if (isTapDrop(point)) return addTappedCard(cardId);
    // Peek zone: lets the player drag a card over the table to check it without committing.
    if (isInside('cancel', point)) return;
    const slot = targetIndex('slot:', point);
    if (slot >= 0) return addCardToSlot(cardId, slot);
    const meldId = targetMeldId(point, me.hand.find(card => card.id === cardId));
    if (meldId) return dropOnMeld(cardId, meldId);
    if (isInside('discard', point, DISCARD_DROP_PADDING)) {
      if (contract.final && !me.hasOpened) return finishFinal(cardId, removeStaged(cardId));
      if (pending.some(group => group.cardIds.length)) {
        setNotice(t("Önce tepsideki kartları eline geri al veya grubu tamamla."));
        return;
      }
      act({ type: 'discard', cardId });
      return;
    }
    setNotice(t("Kartı açık karta, görev tepsisine veya yerdeki bir gruba bırak."));
  }

  function dropStagedCard(cardId: string, point: DropPoint) {
    endDrag();
    if (!Number.isFinite(point.x) || !playing) return;
    const withoutCard = removeStaged(cardId);
    if (isTapDrop(point)) {
      setPending(withoutCard);
      setNotice(t("Kart eline geri döndü."));
      return;
    }
    const slot = targetIndex('slot:', point);
    if (slot >= 0) return addCardToSlot(cardId, slot, withoutCard);
    if (contract.final && !me.hasOpened && isInside('discard', point, DISCARD_DROP_PADDING)) return finishFinal(cardId, withoutCard);
    if (isInside('hand', point, HAND_DROP_PADDING)) {
      setPending(withoutCard);
      setNotice(t("Kart eline geri döndü."));
      return;
    }
    setNotice(t("Kartı başka bir tepsiye veya eline geri bırak."));
  }

  function dropPile(source: 'stock' | 'discard', point: DropPoint) {
    endDrag();
    if (!Number.isFinite(point.x)) return;
    if (isTapDrop(point)) {
      if (source === 'discard' && claiming) act({ type: 'claim', take: true });
      else if (drawing) act({ type: 'draw', source });
      return;
    }
    if (!isInside('hand', point, HAND_DROP_PADDING)) {
      setNotice(t("Kartı almak için desteden elinin üzerine sürükle."));
      return;
    }
    if (source === 'discard' && claiming) act({ type: 'claim', take: true });
    else if (drawing) act({ type: 'draw', source });
  }

  function toggleArrange() {
    playSound('tap');
    if (!arranging && pending.some(group => group.cardIds.length)) {
      setNotice(t("Elini dizmeden önce hazırladığın grupları geri al."));
      return;
    }
    setNotice(''); setArranging((current) => !current);
  }

  function autoArrange() {
    setNotice('');
    const next = autoArrangeHand(me.hand, {
      contract,
      prioritizeContract: !me.hasOpened,
      allowJokersInGroups: me.hasOpened || !openingJokerRestricted(game),
    });
    setPending([]);
    setArranging(false);
    setHandOrder(next);
    void saveHandOrder(orderKey, next);
    playSound('shuffle');
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
  function act(action: GameAction) {
    setNotice('');
    playSound(actionSound(action));
    feedback(action.type === 'open' || action.type === 'finish' ? 'success' : 'impact');
    onAction(action);
  }
  // The auto-advance timer must call the latest handlers without restarting on every render.
  const advanceRef = useRef(() => {});
  useEffect(() => {
    advanceRef.current = () => {
      if (!canAdvance || blocked) return;
      setPending([]);
      act({ type: 'next' });
    };
  });

  useEffect(() => {
    if (game.phase !== 'round-over') return;
    const roundIndex = game.roundIndex;
    const deadline = Date.now() + ROUND_ADVANCE_DELAY_MS;
    const tick = setInterval(() => {
      setAdvance({ roundIndex, seconds: Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) });
    }, 250);
    const timeout = setTimeout(() => advanceRef.current(), ROUND_ADVANCE_DELAY_MS);
    return () => { clearInterval(tick); clearTimeout(timeout); };
  }, [game.phase, game.roundIndex]);
  const advanceSeconds = game.phase !== 'round-over' ? null
    : advance?.roundIndex === game.roundIndex ? advance.seconds : Math.ceil(ROUND_ADVANCE_DELAY_MS / 1000);

  return <SafeAreaView style={[s.page, tabletLandscape && s.pageTabletLandscape]}>
    <View style={s.header}>
      <Pressable accessibilityRole="button" accessibilityLabel={t("Masadan çık")} onPress={() => setExitOpen(true)} style={s.headerMenuButton}><Text style={s.headerMenuText}>{t("Çık")}</Text></Pressable>
      <View style={s.center}><Text style={s.eyebrow}>{localizeMessage(modeLabel)}</Text><Text style={s.round}>{t("EL")} {game.roundIndex + 1} / {roundCount} · {t(contract.shortTitle)}</Text></View>
      <View style={s.headerActions}>
        {onReact && <Pressable accessibilityRole="button" accessibilityLabel={t("Tepki gönder")} style={s.headerMenuButton} onPress={() => { feedback(); setReactionsOpen(true); }}><Text style={s.headerMenuText}>{t("Tepki")}</Text></Pressable>}
        <Pressable accessibilityRole="button" accessibilityLabel={t("Hızlı kural yardımı")} style={s.headerMenuButton} onPress={() => { feedback(); setHelpOpen(true); }}><Text style={s.headerMenuText}>{t("Kural")}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t("Oyun ayarları")} style={s.headerMenuButton} onPress={() => { feedback(); setSettingsOpen(true); }}><Text style={s.headerMenuText}>{t("Ayar")}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t("Puan tablosu")} style={s.headerMenuButton} onPress={() => { playSound('tap'); setScoresOpen(true); }}><Text style={s.headerMenuText}>{t("Puan")}</Text></Pressable>
      </View>
    </View>
    {connectionState && <View style={[s.connectionBar, connectionState === 'online' ? s.connectionOnline : connectionState === 'reconnecting' ? s.connectionWaiting : s.connectionOffline]}>
      <Text style={s.connectionText}>{connectionState === 'online' ? t("Bağlı") : connectionState === 'reconnecting' ? t("Bağlanıyor") : t("Çevrim dışı")}</Text>
    </View>}
    <View style={s.playersBar}>
      <View style={s.players}>
        {game.players.map(pl => {
          const isViewer = pl.id === viewerId;
          const isCurrent = current.id === pl.id;
          const isOffline = playerMeta?.[pl.id]?.connected === false;
          const isBotControlled = playerMeta?.[pl.id]?.botControlled === true;
          return <View
            key={pl.id}
            accessibilityLabel={t("{0}, {1} kart, {2} puan{3}", [pl.name, game.handCounts[pl.id], pl.score, isCurrent ? t(", sıra bu oyuncuda") : ''])}
            style={[s.playerTile, { width: playerTileWidth }, isViewer && s.viewerTile, isCurrent && s.activePlayerTile]}
          >
            <View style={[s.avatar, playerMeta?.[pl.id] && { backgroundColor: playerMeta[pl.id].avatarColor }]}><Text style={s.avatarText}>{playerMeta?.[pl.id]?.avatarSymbol ?? pl.name.charAt(0)}</Text></View>
            <View style={s.playerInfo}>
              <Text numberOfLines={1} style={s.playerName}>{pl.name}{isViewer ? t(" · SEN") : isBotControlled ? t(" · bot yönetiyor") : isOffline ? t(" · çevrim dışı") : ''}</Text>
              <Text numberOfLines={1} style={s.playerStats}>{game.handCounts[pl.id]} {' '}{t("kart ·")}{pl.score}p{pl.hasOpened ? t(" · Açtı") : ''}{playerMeta?.[pl.id]?.missedTurns ? ` · ${playerMeta[pl.id].missedTurns}/3` : ''}</Text>
            </View>
            {isCurrent && <View style={s.turnDot} />}
            {settings.showReactions && reactions?.[pl.id] && <ReactionBubble reaction={reactions[pl.id]} />}
          </View>;
        })}
      </View>
    </View>
    <ScrollView scrollEnabled={!activeDrag} style={s.tableScroll} contentContainerStyle={s.table}>
      <View style={s.feltOval}>
        <View style={s.piles}>
          <View style={[s.pile, drawing && s.pileReady]}>
            <DragSurface active={drawing && Boolean(game.stockCount || game.discard.length)} onDragStart={() => beginDrag('stock')} onDrop={(point) => dropPile('stock', point)}>
              <View style={[s.pile, s.tablePileTouch, tabletLandscape && s.tablePileTouchTablet]}><View style={[s.stackShadow, tabletLandscape && s.stackShadowTablet]} /><PlayingCard hidden small tablet={tabletLandscape} /><Text style={s.pileLabel}>{t("DESTE ·")}{game.stockCount}</Text></View>
            </DragSurface>
          </View>
          <View style={s.tableMark}><Text style={s.tableA}>A</Text><Text style={s.tableBrand}>{t("AMERİKANO")}</Text></View>
          <DropZoneView dropKey="discard" onNode={registerDropZone} style={[s.pile, (drawing || claiming || activeDrag === 'hand') && s.pileReady, activeDrag === 'hand' && s.dropTargetActive]}>
            <DragSurface active={(drawing || claiming) && Boolean(game.discard.length) && !game.discardFaceDown} onDragStart={() => beginDrag('discard')} onDrop={(point) => dropPile('discard', point)}>
              <View style={[s.pile, s.tablePileTouch, tabletLandscape && s.tablePileTouchTablet]}>{game.discardFaceDown ? <PlayingCard hidden small tablet={tabletLandscape} /> : game.discard.length ? <PlayingCard card={game.discard.at(-1)} small tablet={tabletLandscape} /> : <View style={[s.empty, tabletLandscape && s.emptyTablet]} />}
                <Text style={s.pileLabel}>{game.discardFaceDown ? t("BİTİŞ KARTI · KAPALI") : activeDrag === 'hand' ? t("KARTI BURAYA AT") : t("AÇIK KART")}</Text></View>
            </DragSurface>
          </DropZoneView>
        </View>
      </View>
      <View style={s.turnRow}><Text style={s.turn}>{blocked ? t("Bekleniyor…") : game.phase === 'claim' ? claiming ? t("Karar sende") : t("{0} düşünüyor…", [claimPlayer?.name ?? t("Oyuncu")]) : myTurn ? drawing ? t("Sıra sende · Çek") : t("Sıra sende · Oyna") : t("{0} oynuyor…", [current.name])}</Text><TurnCountdown deadline={game.turnDeadline} warningEnabled={settings.criticalTimer} tickEnabled={myTurn || claiming} onUrgent={() => { if (myTurn || claiming) feedback('warning'); }} onTick={() => playSound('tick')} /></View>
      {game.lastPenalty?.reason === 'playable-discard' && <View style={s.playablePenaltyBanner}><Text style={s.playablePenaltyText}>{penalizedPlayer?.name ?? t("Oyuncu")} {' '}{t("işlek kart attı · +")}{game.lastPenalty.points} {t("ceza")}</Text></View>}
      {botControlled && <View style={s.botNotice}><Text style={s.botNoticeText}>{t("Üç süre kaçırdığın için oyun koltuğunu otomatik yönetiyor.")}</Text><Pressable accessibilityRole="button" disabled={blocked} onPress={onReclaim} style={[s.reclaimButton, blocked && s.disabled]}><Text style={s.reclaimText}>{t("Koltuğu geri al")}</Text></Pressable></View>}
      {claiming && <View style={s.actions}>
        <Pressable accessibilityRole="button" onPress={() => act({ type: 'claim', take: false })} style={s.secondary}><Text style={s.actionText}>{t("Pas geç")}</Text></Pressable>
      </View>}
      {visibleMelds.length > 0 ? <View style={s.melds}>
        {visibleMelds.map(({ meld: m }) => {
          const meldRank = m.cards.find(card => !card.isJoker)?.rank;
          const draggingHere = activeDrag === 'hand';
          const accepted = draggingHere && fitsMeld(m.id);
          const rejected = (draggingHere && !accepted) || (rejectedMeld?.key === pendingKey && rejectedMeld.id === m.id);
          return <DropZoneView key={m.id} dropKey={`meld:${m.id}`} onNode={registerDropZone} style={[s.meld, accepted && s.dropSlotValid, rejected && s.dropSlotInvalid]}>
            <Text style={s.small}>{game.players.find(pl => pl.id === m.ownerId)?.name} · {m.type === 'set' ? t("Küt") : t("Seri")}</Text>
            <View style={s.meldCards}>{m.cards.map((c, i) => <View key={c.id} style={[s.meldCard, { marginLeft: i ? -16 : 0 }]}>
              <PlayingCard card={c} compact tablet={tabletLandscape} />
              {c.isJoker && meldRank && m.jokerAssignments?.[c.id] && <Text style={s.jokerBadge}>{suitSymbol[m.jokerAssignments[c.id]]}{meldRank}</Text>}
            </View>)}</View>
            {settings.dragHints && activeDrag === 'hand' && fitsMeld(m.id) && <Text style={s.meldDropHint}>{acceptsCard(m.id) ? t("Buraya işlenebilir") : gameRules.playableDiscardPenalty ? t("İşlek kart · atarsan +25") : t("Bu gruba uyuyor")}</Text>}
          </DropZoneView>;
        })}
      </View> : null}
    </ScrollView>
    {playing && !arranging && !openedThisTurn && <View style={s.trayArea}>
      {!me.hasOpened && !contract.final && <Pressable accessibilityRole="button" onPress={findAndOpenContract} style={s.quickOpenButton}>
        <Text style={s.quickOpenText}>{t("Görevi bul ve aç")}</Text>
      </Pressable>}
      {me.hasOpened && pending.some(group => group.cardIds.length) && <Pressable accessibilityRole="button" onPress={openStagedGroups} style={s.quickOpenButton}>
        <Text style={s.quickOpenText}>{t("Masaya aç")}</Text>
      </Pressable>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} scrollEnabled={!activeDrag} contentContainerStyle={s.trays}>
        {dropSlots.map((slot, index) => {
          const group = groupsWithSlots()[index];
          const groupCards = group.cardIds.map(id => me.hand.find(card => card.id === id)).filter((card): card is Card => Boolean(card));
          const incoming = (activeDrag === 'hand' || activeDrag === 'staged') && activeCard && !group.cardIds.includes(activeCard.id) ? activeCard : null;
          const previewCards = incoming ? [...groupCards, incoming] : groupCards;
          const status = meldFeedback(previewCards, slot.type, slot.length, me.hasOpened || !openingJokerRestricted(game));
          return <DropZonePressable key={index} dropKey={`slot:${index}`} onNode={registerDropZone} accessibilityRole="button" accessibilityState={{ selected: activeSlotIndex === index }} onPress={() => { setActiveSlotIndex(index); feedback('selection'); }} style={[s.dropSlot, tabletLandscape && s.dropSlotTablet, activeSlotIndex === index && s.dropSlotSelected, status === 'valid' && s.dropSlotValid, status === 'invalid' && s.dropSlotInvalid]}>
            <Text style={s.dropSlotLabel}>{activeSlotIndex === index ? t("SEÇİLİ · ") : ''}{localizeMessage(slot.label)} · {group.cardIds.length}{slot.length ? `/${slot.length}` : ''}</Text>
            <View style={[s.slotCards, tabletLandscape && s.slotCardsTablet]}>{groupCards.map((card, cardIndex) => <DragSurface key={card.id} active={playing} onDragStart={() => beginDrag('staged', card.id)} onDrop={(point) => dropStagedCard(card.id, point)} style={{ marginLeft: cardIndex ? -10 : 0 }}><PlayingCard card={card} compact tablet={tabletLandscape} /></DragSurface>)}</View>
            {status === 'invalid' && <Text style={s.invalidDropHint}>{t("Geçersiz grup")}</Text>}
          </DropZonePressable>;
        })}
      </ScrollView>
    </View>}
    {activeDrag === 'hand' && playing && <DropZoneView dropKey="cancel" onNode={registerDropZone} pointerEvents="none" style={s.cancelZone}>
      <Text style={s.cancelZoneText}>{t("Sadece bakıyorum · buraya bırak, kart yerinde kalsın")}</Text>
    </DropZoneView>}
    <DropZoneView dropKey="hand" onNode={registerDropZone} style={[s.hand, tabletLandscape && s.handTablet, (activeDrag === 'stock' || activeDrag === 'discard' || activeDrag === 'staged') && s.handDropActive]}>
      <View style={s.handHeading}>
        <Text numberOfLines={1} style={s.handName}>{me.name} <Text style={s.small}>· {me.hand.length} {t("kart")}{myMissedTurns ? t(" · {0}/3 süre kaçtı", [myMissedTurns]) : ''}</Text></Text>
        <View style={s.handMeta}><Text style={s.small}>{me.score} {t("puan")}</Text>{onUndo && <Pressable accessibilityRole="button" accessibilityLabel={t("Son hamleyi geri al")} disabled={!canUndo} onPress={onUndo} style={[s.arrangeButton, !canUndo && s.disabled]}><Text style={s.gold}>{t("Geri al")}</Text></Pressable>}<Pressable accessibilityRole="button" accessibilityLabel={t("Eli otomatik diz")} disabled={Boolean(activeDrag)} onPress={autoArrange} style={[s.arrangeButton, activeDrag && s.disabled]}><Text style={s.gold}>{t("Oto diz")}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={arranging ? t("Kart dizmeyi bitir") : t("Eli istediğin gibi diz")} onPress={toggleArrange} style={[s.arrangeButton, arranging && s.arrangeButtonActive]}><Text style={s.gold}>{arranging ? t("Bitti") : t("Elle diz")}</Text></Pressable></View>
      </View>
      {!!(notice || error) && <Text accessibilityLiveRegion="polite" style={s.notice}>{localizeMessage(error || notice)}</Text>}
      {arranging && <Text accessibilityLiveRegion="polite" style={s.arrangeHint}>{t("Kartı tutup istediğin konuma sürükle ve bırak.")}</Text>}
      <ScrollView scrollEnabled={!activeDrag} removeClippedSubviews={false} style={[s.handCards, tabletLandscape && s.handCardsTablet]} contentContainerStyle={s.handScroll}>
        <View style={s.rows}>{rows.map((row, index) => <View key={index} style={s.cardRow}>
          {row.map((c, i) => <DraggableHandCard key={c.id} card={c} index={index * cardsPerRow + i} step={step} cardsPerRow={cardsPerRow}
            cardWidth={handCardWidth} cardHeight={handCardHeight} compactCard={autoCompactHand} tabletCards={tabletLandscape} arranging={arranging} gameplayEnabled={playing} onDragStart={() => beginDrag(arranging ? 'arranging' : 'hand', c.id)} onReorder={reorderCard} onGameplayDrop={dropHandCard} />)}
        </View>)}</View>
      </ScrollView>
    </DropZoneView>
    <Modal visible={over || scoresOpen} transparent animationType="fade" onRequestClose={() => setScoresOpen(false)}>
      <View style={s.backdrop}><View style={s.sheet}>
        <Text style={s.resultTitle}>{game.phase === 'game-over' ? winners.length === 1 && winners[0].id === viewerId ? t("Sen kazandın!") : winners.map(w => w.id === viewerId ? t("Sen") : w.name).join(' & ') + (winners.some(w => w.id === viewerId) ? t(" kazandınız!") : t(" kazandı!")) : game.phase === 'round-over' ? game.roundResult?.reason === 'stalemate' ? t("El çıkmaz bitti") : game.roundWinnerId === viewerId ? t("Sen bitirdin!") : game.players.find(pl => pl.id === game.roundWinnerId)?.name + t(" bitirdi!") : t("Puan tablosu")}</Text>
        <Text style={s.resultCaption}>{game.phase === 'round-over' && game.roundResult?.reason === 'stalemate' ? t("Deste ikinci kez tükendi; elde kalan kartlar ceza yazıldı.{0}", [nextContract ? t(" Sıradaki el: {0}", [t(nextContract.title)]) : '']) : game.phase === 'round-over' && nextContract ? t("Sıradaki el: {0}", [t(nextContract.title)]) : game.phase === 'game-over' ? t("{0} el tamamlandı. En düşük toplam puan kazandı.", [roundCount]) : t("En düşük toplam puan kazanır.")}</Text>
        <ScrollView style={s.resultList} contentContainerStyle={s.resultListContent} showsVerticalScrollIndicator={false}>
          {scoreHistory.length > 0 && <View accessibilityLabel={t("El el puan geçmişi")} style={s.historyTable}>
            <View style={s.historyRow}>
              <Text style={[s.historyRound, s.historyHead]}>{t("El")}</Text>
              {game.players.map(pl => <Text key={pl.id} numberOfLines={1} style={[s.historyCell, s.historyHead]}>{pl.name}</Text>)}
            </View>
            {scoreHistory.map((row, index) => <View key={index} style={[s.historyRow, index % 2 === 1 && s.historyRowAlt]}>
              <Text style={s.historyRound}>{index + 1}.</Text>
              {game.players.map(pl => <Text key={pl.id} style={[s.historyCell, (row[pl.id] ?? 0) === 0 && s.historyZero]}>{row[pl.id] ?? 0}</Text>)}
            </View>)}
            <View style={[s.historyRow, s.historyTotalRow]}>
              <Text style={[s.historyRound, s.historyTotal]}>Σ</Text>
              {game.players.map(pl => <Text key={pl.id} style={[s.historyCell, s.historyTotal, pl.score === Math.min(...game.players.map(o => o.score)) && s.historyLeader]}>{pl.score}</Text>)}
            </View>
          </View>}
          {sortedPlayers.map((pl, i) => {
            const detail = over ? game.roundResult?.entries.find((entry) => entry.playerId === pl.id) : undefined;
            const score = scoreSummary(detail, pl.score);
            return <View key={pl.id} style={s.scoreBlock}>
              <View style={s.score}><Text style={s.scoreName}>{i + 1}. {pl.name}</Text><View style={s.scoreTotal}><Text style={s.scoreTotalLabel}>{t("TOPLAM SKOR")}</Text><Text style={s.scoreValue}>{score.totalAfter}</Text></View></View>
              {detail && <>
                <Text style={s.penalty}>{score.roundPenalty === 0 ? t("Bu el: ceza yok · Önceki toplam: {0}", [score.totalBefore]) : t("Bu el: +{0} ceza{1} · Önceki toplam: {2}", [score.roundPenalty, score.playableDiscardPenalty ? t(" · İşlek atma: +{0}", [score.playableDiscardPenalty]) : '', score.totalBefore])}</Text>
                {detail.cards.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.remainingCards}>
                  {detail.cards.map((card) => <PlayingCard key={card.id} card={card} compact />)}
                </ScrollView>}
              </>}
            </View>;
          })}
        </ScrollView>
        {over ? game.phase === 'game-over' ? <>{onRematch && (canRematch
            ? <Pressable disabled={blocked} style={[s.resultButton, blocked && s.disabled]} onPress={onRematch}><Text style={s.actionText}>{t("Tekrar oyna")}</Text></Pressable>
            : <Text style={s.resultCaption}>{t("Oda sahibinin yeniden başlatması bekleniyor.")}</Text>)}
          <Pressable style={s.resultButtonSecondary} onPress={onExit}><Text style={s.resultButtonSecondaryText}>{t("Ana menü")}</Text></Pressable></>
          : <>
            {botControlled && onReclaim && <Pressable disabled={blocked} style={[s.resultButton, blocked && s.disabled]} onPress={onReclaim}><Text style={s.actionText}>{t("Koltuğu geri al")}</Text></Pressable>}
            {advanceSeconds !== null && <Text style={s.resultCaption}>{advanceSeconds} {' '}{t("saniye içinde otomatik devam edilecek.")}</Text>}
            {canAdvance
              ? <Pressable disabled={blocked} style={s.resultButton} onPress={() => { setPending([]); act({ type: 'next' }); }}><Text style={s.actionText}>{game.roundIndex === 11 ? t("Sonucu gör") : t("Sonraki el")}</Text></Pressable>
              : <Text style={s.resultCaption}>{t("Sıradaki ele otomatik geçilecek.")}</Text>}
          </>
          : <Pressable style={s.resultButton} onPress={() => setScoresOpen(false)}><Text style={s.actionText}>{t("Masaya dön")}</Text></Pressable>}
      </View></View>
    </Modal>
    <Modal visible={exitOpen} transparent animationType="fade" onRequestClose={() => setExitOpen(false)}><View style={s.backdrop}><View style={s.sheet}>
      <Text style={s.resultTitle}>{t("Masadan çıkılsın mı?")}</Text><Text style={s.resultCaption}>{onForfeit ? t("Şimdilik çıkarsan aynı cihazdan masaya dönebilirsin. Kalıcı ayrılırsan koltuğun otomatik yönetilir.") : t("Oyun kaydedilir; aynı cihazdan kaldığın yerden devam edebilirsin.")}</Text>
      <Pressable style={s.resultButton} onPress={onExit}><Text style={s.actionText}>{onForfeit ? t("Şimdilik çık · koltuğumu koru") : t("Ana menüye dön")}</Text></Pressable>
      {onForfeit && <Pressable style={s.forfeitButton} onPress={onForfeit}><Text style={s.forfeitText}>{t("Kalıcı ayrıl · oyun devam etsin")}</Text></Pressable>}
      <Pressable style={s.resultButtonSecondary} onPress={() => setExitOpen(false)}><Text style={s.resultButtonSecondaryText}>{t("Oynamaya devam et")}</Text></Pressable>
    </View></View></Modal>
    <Modal visible={Boolean(jokerChoice)} transparent animationType="fade" onRequestClose={() => setJokerChoice(null)}><View style={s.backdrop}><View style={s.sheet}>
      <Text style={s.resultTitle}>{t("Joker hangi kart?")}</Text>
      <Text style={s.resultCaption}>{t("Bu seçim sabit kalır. Jokeri yalnızca seçtiğin tam kartla değiştiren oyuncu geri alabilir.")}</Text>
      <View style={s.jokerChoices}>{jokerChoice?.suits.map(suit => <Pressable key={suit} accessibilityRole="button" onPress={() => chooseJokerSuit(suit)} style={s.jokerChoiceButton}>
        <Text style={[s.jokerChoiceSymbol, (suit === 'hearts' || suit === 'diamonds') && s.jokerChoiceRed]}>{suitSymbol[suit]}</Text>
        <Text style={s.jokerChoiceText}>{t(suitName[suit])} {jokerChoice.rank}</Text>
      </Pressable>)}</View>
      <Pressable style={s.resultButtonSecondary} onPress={() => setJokerChoice(null)}><Text style={s.resultButtonSecondaryText}>{t("Vazgeç")}</Text></Pressable>
    </View></View></Modal>
    <Modal visible={debugOpen} transparent animationType="fade" onRequestClose={() => setDebugOpen(false)}><View style={s.backdrop}><View style={[s.sheet, s.debugSheet]}>
      <Text style={s.resultTitle}>{t("Canlı oyun durumu")}</Text>
      <Text style={s.resultCaption}>{t("Her hamlede yenilenir. Rakiplerin elleri yalnızca bu geliştirici görünümünde gösterilir.")}</Text>
      <ScrollView style={s.debugScroll} contentContainerStyle={s.debugContent}>
        <Text selectable style={s.debugText}>{debugText}</Text>
      </ScrollView>
      <Pressable style={s.resultButton} onPress={() => setDebugOpen(false)}><Text style={s.actionText}>{t("Masaya dön")}</Text></Pressable>
    </View></View></Modal>
    {onReact && <Modal visible={reactionsOpen} transparent animationType="fade" onRequestClose={() => setReactionsOpen(false)}><Pressable style={s.backdrop} onPress={() => setReactionsOpen(false)}><Pressable style={s.sheet}>
      <Text style={s.resultTitle}>{t("Tepki gönder")}</Text>
      <View style={s.reactionGrid}>{REACTIONS.filter(item => item.kind === 'emoji').map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.id} onPress={() => { onReact(item.id); setReactionsOpen(false); }} style={s.reactionEmojiButton}><Text style={s.reactionEmojiLarge}>{t(item.text)}</Text></Pressable>)}</View>
      <View style={s.reactionGrid}>{REACTIONS.filter(item => item.kind === 'phrase').map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => { onReact(item.id); setReactionsOpen(false); }} style={s.reactionPhraseButton}><Text style={s.reactionPhraseText}>{t(item.text)}</Text></Pressable>)}</View>
      <Text style={s.resultCaption}>{t("Tepkiler masadaki herkese birkaç saniye görünür.")}</Text>
    </Pressable></Pressable></Modal>}
    <Modal visible={settingsOpen} transparent animationType="fade" onRequestClose={() => setSettingsOpen(false)}><View style={s.backdrop}><View style={s.sheet}>
      <Text style={s.resultTitle}>{t("Oyun ayarları")}</Text>
      <ScrollView style={s.settingsScroll} contentContainerStyle={s.settingsScrollContent}>
      <View style={s.settingRow}><Text style={s.settingLabel}>{t('Dil')}</Text><LanguagePicker light /></View>
      <SettingRow label={t("Ses efektleri")} value={soundEnabled} onPress={() => { toggleSound(); feedback(); }} />
      <SettingRow label={t("Titreşim")} value={settings.haptics} onPress={() => updateSettings({ haptics: !settings.haptics })} />
      <SettingRow label={t("Son 10 saniye uyarısı")} value={settings.criticalTimer} onPress={() => { feedback(); updateSettings({ criticalTimer: !settings.criticalTimer }); }} />
      <SettingRow label={t("Eldeki kartları küçült")} value={settings.compactCards} onPress={() => { feedback(); updateSettings({ compactCards: !settings.compactCards }); }} />
      <SettingRow label={t("Sürükleme ipuçları")} value={settings.dragHints} onPress={() => { feedback(); updateSettings({ dragHints: !settings.dragHints }); }} />
      <SettingRow label={t("Tepkileri göster")} value={settings.showReactions} onPress={() => { feedback(); updateSettings({ showReactions: !settings.showReactions }); }} />
      <Text style={s.settingsSectionTitle}>{t("YASAL VE GİZLİLİK")}</Text>
      <View style={s.settingsLinks}>
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(privacyPolicyUrl(language))} style={s.settingsLink}><Text style={s.settingsLinkText}>{t("Gizlilik politikası")}</Text><Text style={s.settingsLinkAction}>{t("Aç")}</Text></Pressable>
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(termsUrl(language))} style={s.settingsLink}><Text style={s.settingsLinkText}>{t(TERMS_LABEL)}</Text><Text style={s.settingsLinkAction}>{t("Aç")}</Text></Pressable>
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(deleteAccountUrl(language))} style={s.settingsLink}><Text style={s.settingsLinkText}>{t("Hesap ve veri silme")}</Text><Text style={s.settingsLinkAction}>{t("Aç")}</Text></Pressable>
      </View>
      {debugText && <Pressable accessibilityRole="button" onPress={() => { setSettingsOpen(false); setDebugOpen(true); }} style={s.debugEntry}>
        <View><Text style={s.debugEntryTitle}>{t("Canlı oyun durumu")}</Text><Text style={s.debugEntryCaption}>{t("El, masa ve son hamleleri incele")}</Text></View><Text style={s.settingsLinkAction}>{t("Aç")}</Text>
      </Pressable>}
      </ScrollView>
      <Pressable style={s.resultButton} onPress={() => setSettingsOpen(false)}><Text style={s.actionText}>{t("Tamam")}</Text></Pressable>
    </View></View></Modal>
    <Modal visible={helpOpen} transparent animationType="fade" onRequestClose={() => setHelpOpen(false)}><View style={s.backdrop}><View style={s.sheet}>
      <Text style={s.resultTitle}>{t("Bu elde ne yapacağım?")}</Text>
      <View style={s.helpTask}><Text style={s.helpTaskLabel}>{t("EL")} {game.roundIndex + 1} / {roundCount} {' '}{t("GÖREVİ")}</Text><Text style={s.helpTaskTitle}>{t(contract.title)}</Text></View>
      <ScrollView style={s.helpScroll} contentContainerStyle={s.helpContent}>
        <Text style={s.helpLine}><Text style={s.helpStrong}>{t("1. Kart çek:")}</Text>{' '}{t("Deste veya açık kartı eline sürükle.")}</Text>
        <Text style={s.helpLine}><Text style={s.helpStrong}>{t("2. Aç / işle:")}</Text>{' '}{t("Görev tepsilerini doldur. Elini açtıktan sonra 3 veya daha fazla kartı yeni küt ya da seri tepsisinde hazırlayıp tek seferde masaya açabilirsin.")}</Text>
        <Text style={s.helpLine}><Text style={s.helpStrong}>{t("3. Kart at:")}</Text>{' '}{t("Bir kartı açık kart alanına sürükleyerek sıranı bitir.")}</Text>
        <Text style={s.helpLine}><Text style={s.helpStrong}>{t("Küt:")}</Text>{' '}{t("Aynı sayı, farklı semboller.")}<Text style={s.helpStrong}>{t("Seri:")}</Text>{' '}{t("Aynı sembolde ardışık kartlar; As yalnızca Q-K-A sonunda kullanılır.")}</Text>
        <Text style={s.helpLine}><Text style={s.helpStrong}>{t("Joker:")}</Text> {gameRules.jokerOpeningRestrictionRounds ? t("İlk {0} elin ilk açılışında kullanılamaz.", [gameRules.jokerOpeningRestrictionRounds]) : t("Açılış görevlerinde kullanılabilir.")}{t("Kütte jokerin temsil ettiği sembol açılırken seçilir; joker yalnızca ilan edilen tam kartla değiştirilebilir.")}</Text>
        <Text style={s.helpLine}><Text style={s.helpStrong}>{t("Açık kart teklifi:")}</Text> {gameRules.claimsEnabled ? t("3+ kişilik masada desteden kart seçildiğinde diğer oyuncular açık kartı 1 ceza kartıyla alabilir. Karar süresi {0} saniyedir; iki kişilik oyunda teklif açılmaz.", [gameRules.claimTimeoutMs / 1000]) : t("Bu oyunda kapalı.")}</Text>
        <Text style={s.helpLine}><Text style={s.helpStrong}>{t("İşlek kart:")}</Text>{' '}{t("Yerdeki bir küt veya seriye işlenebilen kartı atmak +25 ceza verir. Bu kural, henüz elini açmamış oyuncuya da uygulanır.")}</Text>
        <Text style={s.helpLine}><Text style={s.helpStrong}>{t("Puan:")}</Text>{' '}{t("Elde kalan sayılar değeri kadar, J-Q-K 10, As 11, Joker 25 ceza verir. En düşük toplam kazanır.")}</Text>
      </ScrollView>
      {onOpenTutorial && <Pressable style={s.resultButtonSecondary} onPress={() => { setHelpOpen(false); onOpenTutorial(); }}><Text style={s.resultButtonSecondaryText}>{t("Detaylı eğitimi tekrar izle")}</Text></Pressable>}
      <Pressable style={s.resultButton} onPress={() => setHelpOpen(false)}><Text style={s.actionText}>{t("Masaya dön")}</Text></Pressable>
    </View></View></Modal>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  settingsScroll: { flexGrow: 0 },
  settingsScrollContent: { paddingBottom: 8 },
  page: { flex: 1, backgroundColor: '#09271e', width: '100%', maxWidth: 1180, alignSelf: 'center' },
  pageTabletLandscape: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#ffffff0d' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 6 },
  connectionBar: { marginHorizontal: 12, marginBottom: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignItems: 'center' },
  connectionOnline: { backgroundColor: '#2f8d5b35' }, connectionWaiting: { backgroundColor: '#d9a44130' }, connectionOffline: { backgroundColor: '#a6404838' }, connectionText: { color: p.cream, fontSize: 10, fontWeight: '700' },
  headerMenuButton: { minHeight: 36, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: p.line, borderRadius: 18 },
  headerMenuText: { color: p.cream, fontSize: 9, fontWeight: '900' },
  headerActions: { flexDirection: 'row', gap: 5 },
  white: { color: p.cream, fontSize: 20 }, center: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 5 }, eyebrow: { color: p.gold, fontSize: 9, letterSpacing: 2, fontWeight: '800' },
  round: { color: p.cream, fontWeight: '700', fontSize: 12 }, playersBar: { flexGrow: 0, borderBottomWidth: 1, borderColor: p.line, backgroundColor: '#071d1766' },
  players: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingVertical: 6 },
  playerTile: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6, paddingVertical: 5, borderRadius: 10, borderWidth: 1, borderColor: '#ffffff12', backgroundColor: '#ffffff06', position: 'relative' },
  viewerTile: { backgroundColor: '#3b9b6917', borderColor: '#79c99a42' }, activePlayerTile: { borderColor: p.gold, backgroundColor: '#d9a44120' },
  playerInfo: { flex: 1, minWidth: 0 }, turnDot: { position: 'absolute', width: 7, height: 7, borderRadius: 4, backgroundColor: p.gold, right: 5, top: 5 },
  avatar: { width: 25, height: 25, borderRadius: 13, backgroundColor: '#dcc48e', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontWeight: '800', color: p.felt, fontSize: 12 }, playerName: { color: p.cream, fontSize: 10, fontWeight: '800', paddingRight: 4 }, playerStats: { fontSize: 9, color: '#adc4b6', lineHeight: 13 }, small: { fontSize: 10, color: '#adc4b6', lineHeight: 16 },
  tableScroll: { flex: 1 }, table: { padding: 8, gap: 6, flexGrow: 1 },
  feltOval: { borderRadius: 54, backgroundColor: '#155a40', borderWidth: 2, borderColor: '#775935', paddingVertical: 4, elevation: 2 },
  piles: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, pile: { alignItems: 'center', gap: 2, borderRadius: 8, padding: 2 }, tablePileTouch: { minWidth: 78, minHeight: 92, justifyContent: 'center' }, pileReady: { backgroundColor: '#ffe1a410' },
  tablePileTouchTablet: { minWidth: 92, minHeight: 112 },
  dropTargetActive: { borderColor: p.gold, borderWidth: 2, backgroundColor: '#d9a44122' },
  stackShadow: { position: 'absolute', width: SMALL_CARD_WIDTH, height: SMALL_CARD_HEIGHT, borderRadius: 5, backgroundColor: '#bda886', left: 15, top: 7, borderWidth: 1, borderColor: '#624a32' },
  stackShadowTablet: { width: TABLET_SMALL_CARD_WIDTH, height: TABLET_SMALL_CARD_HEIGHT, left: 17 },
  pileLabel: { color: '#e1d2ad', fontSize: 8, letterSpacing: 0.8, fontWeight: '700' }, empty: { width: SMALL_CARD_WIDTH, height: SMALL_CARD_HEIGHT, borderWidth: 1, borderColor: '#ffffff25', borderRadius: 5 },
  emptyTablet: { width: TABLET_SMALL_CARD_WIDTH, height: TABLET_SMALL_CARD_HEIGHT, borderRadius: 6 },
  tableMark: { alignItems: 'center', opacity: 0.25 }, tableA: { color: '#e1d2ad', fontFamily: 'serif', fontSize: 20 }, tableBrand: { color: '#e1d2ad', fontSize: 5, letterSpacing: 1.2 },
  turnRow: { minHeight: 26, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }, turn: { color: '#e8d0a1', fontSize: 12, textAlign: 'center', fontWeight: '600' },
  reactionBubble: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, backgroundColor: '#0d3327f5', borderWidth: 1, borderColor: p.gold },
  reactionEmoji: { fontSize: 22 }, reactionPhrase: { color: p.gold, fontSize: 11, fontWeight: '900', textAlign: 'center' },
  reactionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  reactionEmojiButton: { width: 54, height: 54, borderRadius: 14, borderWidth: 1, borderColor: '#d8cbb0', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fffaf0' }, reactionEmojiLarge: { fontSize: 28 },
  reactionPhraseButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: '#997431', backgroundColor: '#fffaf0', alignItems: 'center', justifyContent: 'center' }, reactionPhraseText: { color: '#142c22', fontSize: 13, fontWeight: '800' },
  cancelZone: { position: 'absolute', top: 0, left: 0, right: 0, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d3327f2', borderBottomWidth: 2, borderColor: p.gold },
  cancelZoneText: { color: p.gold, fontSize: 12, fontWeight: '900' },
  playablePenaltyBanner: { marginHorizontal: 12, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#a6404838', borderWidth: 1, borderColor: '#d87878' }, playablePenaltyText: { color: '#ffd7d7', textAlign: 'center', fontSize: 11, fontWeight: '900' },
  timer: { minWidth: 28, height: 23, paddingHorizontal: 5, borderRadius: 12, backgroundColor: '#d9a44130', alignItems: 'center', justifyContent: 'center' }, timerUrgent: { backgroundColor: '#a64048' }, timerText: { color: p.cream, fontSize: 11, fontWeight: '900' },
  botNotice: { marginHorizontal: 12, padding: 9, borderRadius: 10, backgroundColor: '#d9a44122', borderWidth: 1, borderColor: '#d9a44166', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  botNoticeText: { color: p.cream, fontSize: 11, flex: 1 }, reclaimButton: { paddingVertical: 7, paddingHorizontal: 10, borderRadius: 8, backgroundColor: p.gold }, reclaimText: { color: p.ink, fontSize: 11, fontWeight: '800' },
  trayArea: { flexShrink: 0, gap: 5, paddingVertical: 7, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#dab77b50', backgroundColor: '#0d3327' }, trays: { gap: 7, paddingHorizontal: 12 },
  quickOpenButton: { minHeight: 36, marginHorizontal: 12, borderRadius: 10, backgroundColor: p.gold, alignItems: 'center', justifyContent: 'center' }, quickOpenText: { color: p.ink, fontSize: 12, fontWeight: '900' },
  dropSlot: { minWidth: 92, minHeight: 72, padding: 6, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: '#ffffff38', backgroundColor: '#ffffff08' },
  dropSlotTablet: { minWidth: 112, minHeight: 88 },
  dropSlotSelected: { borderStyle: 'solid', borderColor: p.gold, backgroundColor: '#d9a44118' },
  dropSlotValid: { borderColor: '#79c99a', backgroundColor: '#3b9b6922' }, dropSlotLabel: { color: p.gold, fontSize: 9, fontWeight: '800' },
  dropSlotInvalid: { borderColor: '#ee7777', backgroundColor: '#c4444433' },
  invalidDropHint: { color: '#ffb4b4', fontSize: 9, fontWeight: '800', marginTop: 4 },
  slotCards: { minHeight: 53, flexDirection: 'row', alignItems: 'center', paddingTop: 3 },
  slotCardsTablet: { minHeight: 66 },
  melds: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, meld: { padding: 8, borderWidth: 1, borderColor: p.line, borderRadius: 10, gap: 4 }, meldCards: { flexDirection: 'row' }, meldCard: { position: 'relative' },
  jokerBadge: { position: 'absolute', left: 3, right: 3, bottom: 3, borderRadius: 4, paddingVertical: 2, backgroundColor: '#071d17e8', color: p.gold, fontSize: 9, fontWeight: '900', textAlign: 'center', overflow: 'hidden' },
  meldDropHint: { color: p.gold, fontSize: 9, fontWeight: '700' },
  hand: { paddingTop: 10, paddingBottom: 8, borderTopWidth: 1, borderColor: '#dab77b50', backgroundColor: '#071d17', overflow: 'visible' }, handDropActive: { borderTopWidth: 3, borderTopColor: p.gold, backgroundColor: '#0d3327' },
  handTablet: { paddingTop: 12, paddingBottom: 10 },
  handHeading: { flexDirection: 'row', paddingHorizontal: 18, justifyContent: 'space-between', alignItems: 'center' }, handName: { color: p.cream, fontSize: 15, fontWeight: '700', flexShrink: 1, marginRight: 6 },
  handMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 }, arrangeButton: { minHeight: 30, paddingHorizontal: 8, borderWidth: 1, borderColor: p.line, borderRadius: 9, justifyContent: 'center' }, arrangeButtonActive: { backgroundColor: '#d9a44120', borderColor: p.gold },
  handCards: { maxHeight: 210, overflow: 'visible' },
  handCardsTablet: { maxHeight: 260 },
  handScroll: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 4, flexGrow: 1, justifyContent: 'center' },
  rows: { gap: 8 }, cardRow: { flexDirection: 'row' }, actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 10 },
  secondary: { minHeight: 44, borderWidth: 1, borderColor: p.line, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flex: 1 },
  primary: { minHeight: 44, borderRadius: 11, backgroundColor: p.gold, alignItems: 'center', justifyContent: 'center', flex: 1.2 },
  actionText: { color: p.cream, fontSize: 13, fontWeight: '700' }, primaryText: { color: p.ink, fontSize: 14, fontWeight: '800' }, disabled: { opacity: 0.35 },
  notice: { color: '#ffc88a', paddingHorizontal: 18, marginTop: 6, fontSize: 12 }, arrangeHint: { color: p.gold, paddingHorizontal: 18, marginTop: 6, fontSize: 11 },
  gold: { color: p.gold, fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: '#000b', justifyContent: 'center', padding: 24 }, sheet: { width: '100%', maxWidth: 480, maxHeight: '88%', alignSelf: 'center', backgroundColor: '#f5eedf', borderRadius: 23, padding: 25, gap: 14 },
  resultIcon: { textAlign: 'center', color: '#997431', fontSize: 36 }, resultTitle: { color: '#142c22', fontWeight: '800', fontSize: 25, textAlign: 'center' }, resultCaption: { color: '#59675f', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  resultList: { flexGrow: 0 }, resultListContent: { gap: 8 }, scoreBlock: { borderBottomWidth: 1, borderColor: '#d5cdbb', paddingBottom: 8 },
  score: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 }, scoreName: { color: '#253a2e', fontSize: 15 },
  scoreTotal: { alignItems: 'flex-end' }, scoreTotalLabel: { color: '#7b7568', fontSize: 8, letterSpacing: 0.8, fontWeight: '800' }, scoreValue: { fontWeight: '900', color: '#80602b', fontSize: 20 },
  historyTable: { borderWidth: 1, borderColor: '#d5cdbb', borderRadius: 12, overflow: 'hidden', marginBottom: 4 },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 8 }, historyRowAlt: { backgroundColor: '#ece4d1' },
  historyRound: { width: 30, color: '#7b7568', fontSize: 12, fontWeight: '700' }, historyCell: { flex: 1, textAlign: 'center', color: '#253a2e', fontSize: 14, fontVariant: ['tabular-nums'] },
  historyHead: { color: '#7b7568', fontSize: 11, fontWeight: '800' }, historyZero: { color: '#2f7a55', fontWeight: '800' },
  historyTotalRow: { borderTopWidth: 1, borderColor: '#d5cdbb', backgroundColor: '#e6dcc4' }, historyTotal: { fontWeight: '900', color: '#80602b', fontSize: 15 }, historyLeader: { color: '#142c22' },
  penalty: { color: '#59675f', fontSize: 11, marginBottom: 5 }, remainingCards: { gap: 3, paddingRight: 8 },
  resultButton: { padding: 16, backgroundColor: '#143e2c', borderRadius: 12, alignItems: 'center' },
  resultButtonSecondary: { padding: 13, borderWidth: 1, borderColor: '#9d9584', borderRadius: 12, alignItems: 'center' }, resultButtonSecondaryText: { color: '#253a2e', fontSize: 13, fontWeight: '700' },
  forfeitButton: { padding: 13, borderWidth: 1, borderColor: '#b75b5b', borderRadius: 12, alignItems: 'center' }, forfeitText: { color: '#9f3030', fontSize: 13, fontWeight: '800' },
  jokerChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, jokerChoiceButton: { minWidth: '47%', flexGrow: 1, minHeight: 68, borderWidth: 1, borderColor: '#9d9584', borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: '#fffaf0' },
  jokerChoiceSymbol: { color: '#17251e', fontSize: 24, fontWeight: '900' }, jokerChoiceRed: { color: '#b33b3b' }, jokerChoiceText: { color: '#253a2e', fontSize: 13, fontWeight: '800' },
  settingRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#d5cdbb' }, settingLabel: { color: '#253a2e', fontSize: 14, fontWeight: '700' },
  switchTrack: { width: 43, height: 25, padding: 3, borderRadius: 13, backgroundColor: '#a9a398' }, switchTrackOn: { backgroundColor: '#2f7454' }, switchKnob: { width: 19, height: 19, borderRadius: 10, backgroundColor: '#fff' }, switchKnobOn: { alignSelf: 'flex-end' },
  settingsSectionTitle: { color: '#80602b', fontSize: 9, letterSpacing: 1.4, fontWeight: '900', marginTop: 8 },
  settingsLinks: { borderWidth: 1, borderColor: '#d5cdbb', borderRadius: 12, overflow: 'hidden' },
  settingsLink: { minHeight: 43, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#d5cdbb' },
  settingsLinkText: { color: '#253a2e', fontSize: 12, fontWeight: '800' }, settingsLinkAction: { color: '#80602b', fontSize: 10, fontWeight: '900' },
  helpTask: { padding: 13, borderRadius: 12, backgroundColor: '#e8ddc6', gap: 4 }, helpTaskLabel: { color: '#80602b', fontSize: 9, letterSpacing: 1.5, fontWeight: '900' }, helpTaskTitle: { color: '#253a2e', fontSize: 18, fontWeight: '900' },
  helpScroll: { flexGrow: 0 }, helpContent: { gap: 12 }, helpLine: { color: '#59675f', fontSize: 13, lineHeight: 20 }, helpStrong: { color: '#253a2e', fontWeight: '900' },
  debugEntry: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#b9914e55', backgroundColor: '#d9a44112', borderRadius: 12, padding: 12 },
  debugEntryTitle: { color: '#253a2e', fontSize: 14, fontWeight: '900' }, debugEntryCaption: { color: '#59675f', fontSize: 11, marginTop: 2 },
  debugSheet: { maxWidth: 620, maxHeight: '88%' }, debugScroll: { width: '100%', maxHeight: 520, borderRadius: 12, backgroundColor: '#102b22' },
  debugContent: { padding: 14 }, debugText: { color: '#dbe9df', fontSize: 12, lineHeight: 19 },
});
