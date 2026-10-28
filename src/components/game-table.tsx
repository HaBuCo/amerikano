import { useTranslations } from '@/i18n/language';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { ActivityIndicator, Animated, Linking, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { palette as p } from '@/constants/palette';
import { CARD_HEIGHT, CARD_WIDTH, PlayingCard, SMALL_CARD_HEIGHT, SMALL_CARD_WIDTH, TABLET_CARD_HEIGHT, TABLET_CARD_WIDTH, TABLET_SMALL_CARD_HEIGHT, TABLET_SMALL_CARD_WIDTH } from './playing-card';
import { PrivateGameView } from '@/game/view';
import { SUITS } from '@/game/types';
import type { Card, GameAction, MeldType, Rank, Suit } from '@/game/types';
import { contractForRound, meldStyleForGame, nextContractForRound, openingJokerRestricted, roundCountForGame, rulesForGame } from '@/game/game-rules';
import { meldFeedback } from '@/game/meld-feedback';
import { cardFitsMeld, isValidMeld, jokerReplaceable, meldsPoints, STALEMATE_RECYCLES } from '@/game/engine';
import { GameSound, useGameSounds } from '@/audio/game-sounds';
import { arrangeHand, loadHandOrder, moveCardToIndex, reconcileHandOrder, saveHandOrder } from '@/game/hand-order';
import { autoArrangeHand, suggestContractGroups, suggestFinalGroups } from '@/game/auto-arrange';
import { useGameSettings } from '@/settings/game-settings';
import { feltGradient } from '@/store/catalog';
import { useEquippedCosmetics } from '@/store/use-cosmetics';
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
import { PlayerAvatar } from './player-avatar';
import { Confetti, VictoryCelebration } from './victory-celebration';
import { MODAL_ORIENTATIONS } from '@/constants/orientation';

type Props = {
  game: PrivateGameView; viewerId: string; modeLabel: string; blocked?: boolean;
  pendingDraw?: 'stock' | 'discard';
  canAdvance?: boolean; canRematch?: boolean; error?: string;
  coinResult?: { entryFee: number; payout: number | null };
  debugText?: string;
  playerMeta?: Record<string, { avatarKey: string; level: number; connected: boolean; missedTurns: number; botControlled: boolean }>;
  botControlled?: boolean; onReclaim?: () => void;
  onOpenTutorial?: () => void;
  onReact?: (reactionId: string) => void; reactions?: Record<string, { id: string; at: number }>; reactionsReady?: boolean;
  canUndo?: boolean; onUndo?: () => void;
  connectionState?: 'online' | 'reconnecting' | 'offline';
  /** Training hands: cards to light up, and no score sheet or celebration at the end. */
  highlightCardIds?: string[]; hideResults?: boolean;
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
// Melds that fit the dragged card grow, so a near miss still lands on them.
const MELD_DROP_PADDING = 40;
const HAND_DROP_PADDING = 64;
// Gold marks the viewer's own melds, so seat colours avoid it.
const SEAT_COLORS = ['#8CD6B2', '#E2A978', '#E8C8FF', '#9CC9F5', '#F2A0A0', '#C9D98C'];
const HAND_ROW_GAP = 8;

const TABLE_ICONS = {
  close: { ios: 'xmark', android: 'close', web: 'close' },
  more: { ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' },
  trophy: { ios: 'trophy', android: 'trophy', web: 'trophy' },
  chat: { ios: 'bubble.left', android: 'chat_bubble', web: 'chat_bubble' },
  rules: { ios: 'book', android: 'menu_book', web: 'menu_book' },
  settings: { ios: 'gearshape', android: 'settings', web: 'settings' },
  undo: { ios: 'arrow.uturn.backward', android: 'undo', web: 'undo' },
  auto: { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' },
  arrange: { ios: 'line.3.horizontal', android: 'drag_indicator', web: 'drag_indicator' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
} satisfies Record<string, Exclude<ComponentProps<typeof SymbolView>['name'], string>>;
type TableIconName = keyof typeof TABLE_ICONS;

function TableIcon({ name, size = 20, color = p.cream }: { name: TableIconName; size?: number; color?: string }) {
  return <SymbolView name={TABLE_ICONS[name]} size={size} tintColor={color} weight="semibold" />;
}

function ToolChip({ icon, label, onPress, disabled, tint = p.cream, active }: {
  icon: TableIconName; label: string; onPress: () => void; disabled?: boolean; tint?: string; active?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: Boolean(active) }} disabled={disabled} onPress={onPress}
    hitSlop={6} style={({ pressed }) => [s.toolChip, active && s.toolButtonActive, disabled && s.disabled, pressed && s.pressed]}>
    <TableIcon name={icon} size={16} color={active ? p.ink : tint} />
    <Text style={[s.toolChipText, active && s.toolChipTextActive]}>{label}</Text>
  </Pressable>;
}

function IconButton({ icon, label, onPress, disabled, tint = p.cream, active, shape = 'round' }: {
  icon: TableIconName; label: string; onPress?: () => void; disabled?: boolean; tint?: string; active?: boolean; shape?: 'round' | 'square';
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [shape === 'round' ? s.iconButton : s.toolButton, active && s.toolButtonActive, disabled && s.disabled, pressed && s.pressed]}>
    <TableIcon name={icon} size={shape === 'round' ? 23 : 20} color={active ? p.ink : tint} />
  </Pressable>;
}

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

function DragSurface({ active, children, onDragStart, onDrop, onMove, verticalOnly = false, style }: {
  active: boolean; children: ReactNode; onDragStart: () => void; onDrop: (point: DropPoint) => void;
  onMove?: (point: { x: number; y: number }) => void;
  /** Inside a sideways list, only an up/down pull starts a drag so swipes keep scrolling. */
  verticalOnly?: boolean; style?: object;
}) {
  const [movement] = useState(() => new Animated.ValueXY());
  const [dragging, setDragging] = useState(false);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => active && !verticalOnly,
    onMoveShouldSetPanResponder: (_, gesture) => active && (verticalOnly
      ? Math.abs(gesture.dy) > 10 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.5
      : Math.abs(gesture.dx) + Math.abs(gesture.dy) > 7),
    onPanResponderGrant: () => { movement.setValue({ x: 0, y: 0 }); setDragging(true); onDragStart(); },
    onPanResponderMove: (_, gesture) => {
      movement.setValue({ x: gesture.dx, y: gesture.dy });
      onMove?.({ x: gesture.moveX, y: gesture.moveY });
    },
    onPanResponderRelease: (_, gesture) => {
      onDrop({ x: gesture.moveX || gesture.x0 + gesture.dx, y: gesture.moveY || gesture.y0 + gesture.dy, dx: gesture.dx, dy: gesture.dy });
      movement.setValue({ x: 0, y: 0 }); setDragging(false);
    },
    onPanResponderTerminate: () => {
      onDrop({ x: Number.NaN, y: Number.NaN, dx: 0, dy: 0 });
      movement.setValue({ x: 0, y: 0 }); setDragging(false);
    },
    onPanResponderTerminationRequest: () => false,
  }), [active, movement, onDragStart, onDrop, onMove, verticalOnly]);
  return <Animated.View {...responder.panHandlers} style={[style, {
    zIndex: dragging ? 999 : 1,
    opacity: dragging ? 0.9 : 1,
    transform: [...movement.getTranslateTransform(), { scale: dragging ? 1.06 : 1 }],
  }]}>{children}</Animated.View>;
}

type DraggableCardProps = {
  card: Card; index: number; step: number; cardsPerRow: number;
  cardWidth: number; cardHeight: number; compactCard: boolean; tabletCards: boolean; glow?: boolean;
  arranging: boolean; gameplayEnabled: boolean; onDragStart: () => void;
  onReorder: (cardId: string, targetIndex: number) => void;
  onGameplayDrop: (cardId: string, point: DropPoint) => void;
  onGameplayMove: (point: { x: number; y: number }) => void;
};

function DraggableHandCard({ card, index, step, cardsPerRow, cardWidth, cardHeight, compactCard, tabletCards, glow, arranging, gameplayEnabled, onDragStart, onReorder, onGameplayDrop, onGameplayMove }: DraggableCardProps) {
  return <DragSurface active={arranging || gameplayEnabled} onDragStart={onDragStart} onMove={arranging ? undefined : onGameplayMove} onDrop={(point) => {
    if (arranging) {
      const columnMove = Math.round(point.dx / step);
      const rowMove = Math.round(point.dy / (cardHeight + 8));
      onReorder(card.id, index + columnMove + rowMove * cardsPerRow);
    } else onGameplayDrop(card.id, point);
  }} style={{ marginLeft: index % cardsPerRow ? step - cardWidth : 0, zIndex: index % cardsPerRow }}>
    <PlayingCard card={card} small={compactCard} tablet={tabletCards} glow={glow} />
  </DragSurface>;
}

const ROUND_ADVANCE_DELAY_MS = 6_000;

function PendingDrawCard({ small, tablet, marginLeft = 0 }: { small: boolean; tablet: boolean; marginLeft?: number }) {
  const { t } = useTranslations();
  const [arrival] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const animation = Animated.timing(arrival, { toValue: 1, duration: 160, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [arrival]);
  return <Animated.View pointerEvents="none" accessibilityLabel={t("Kart çekiliyor…")} accessibilityLiveRegion="polite"
    style={{ marginLeft, opacity: arrival, transform: [{ translateY: arrival.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }] }}>
    <PlayingCard hidden small={small} tablet={tablet} />
    <View style={StyleSheet.absoluteFill}><ActivityIndicator color={p.gold} style={{ flex: 1 }} /></View>
  </Animated.View>;
}

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
  // Pops in with a spring and fades out just before it is removed.
  const [pop] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!visible) return;
    pop.setValue(0);
    const remaining = REACTION_VISIBLE_MS - (Date.now() - reaction.at);
    const animation = Animated.sequence([
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 160, useNativeDriver: true }),
      Animated.delay(Math.max(0, remaining - 700)),
      Animated.timing(pop, { toValue: 2, duration: 300, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [pop, reaction.at, visible]);
  if (!visible || !item) return null;
  const emoji = item.kind === 'emoji';
  return <View pointerEvents="none" accessibilityLiveRegion="polite" style={s.reactionLayer}>
    <Animated.View style={[emoji ? s.reactionBubbleEmoji : s.reactionBubble, {
      opacity: pop.interpolate({ inputRange: [0, 0.4, 1, 2], outputRange: [0, 1, 1, 0] }),
      transform: [
        { scale: pop.interpolate({ inputRange: [0, 1, 2], outputRange: [0.3, 1, 0.85] }) },
        { translateY: pop.interpolate({ inputRange: [0, 1, 2], outputRange: [8, 0, -6] }) },
      ],
    }]}>
      <Text numberOfLines={2} style={emoji ? s.reactionEmoji : s.reactionPhrase}>{t(item.text)}</Text>
    </Animated.View>
  </View>;
}

function SettingRow({ label, value, onPress }: { label: string; value: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={onPress} style={s.settingRow}>
    <Text style={s.settingLabel}>{label}</Text><View style={[s.switchTrack, value && s.switchTrackOn]}><View style={[s.switchKnob, value && s.switchKnobOn]} /></View>
  </Pressable>;
}

export function GameTable({ game, viewerId, modeLabel, blocked, pendingDraw, canAdvance = true, canRematch = false, error, coinResult, debugText, playerMeta, botControlled = false, connectionState, onReclaim, onOpenTutorial, onReact, reactions, reactionsReady = true, canUndo = false, onUndo, highlightCardIds, hideResults = false, onAction, onRematch, onForfeit, onExit }: Props) {
  const { t, localizeMessage, language } = useTranslations();
  const [pendingState, setPendingState] = useState<{ key: string; groups: Pending[] }>({ key: '', groups: [] });
  const [notice, setNotice] = useState('');
  const [exitOpen, setExitOpen] = useState(false);
  const [scoresOpen, setScoresOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [handAreaWidth, setHandAreaWidth] = useState(0);
  const [traysOpenKey, setTraysOpenKey] = useState('');
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
  const { felt } = useEquippedCosmetics();
  const previousPhase = useRef(game.phase);
  // A won game opens with a celebration before the score sheet; a won deal gets confetti.
  const [celebrating, setCelebrating] = useState(false);
  const [dealConfetti, setDealConfetti] = useState(false);
  const celebrationTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const prizeSounded = useRef(false);
  const previousError = useRef(error);
  const previousMyTurn = useRef(false);
  const window = useWindowDimensions();
  const safeArea = useSafeAreaInsets();
  const highlighted = useMemo(() => new Set(highlightCardIds ?? []), [highlightCardIds]);
  // Android draws modals edge to edge, so the sheets keep clear of the status and
  // navigation bars themselves; in landscape the button bar sits at the side.
  const insetPadding = (vertical: number) => ({
    paddingTop: vertical + safeArea.top, paddingBottom: vertical + safeArea.bottom,
    paddingLeft: 24 + safeArea.left, paddingRight: 24 + safeArea.right,
  });
  const modalInsets = insetPadding(24);
  const sideModalInsets = insetPadding(10);
  const width = Math.max(1, Number.isFinite(window.width) ? window.width : 1);
  const height = Math.max(1, Number.isFinite(window.height) ? window.height : 1);
  const me = game.players.find(player => player.id === viewerId)!;
  const myMissedTurns = playerMeta?.[viewerId]?.missedTurns ?? 0;
  const orderKey = `${modeLabel}:${game.roundIndex}:${viewerId}`;
  const handSignature = me.hand.map((card) => card.id).join('|');
  const [handOrder, setHandOrder] = useState(() => me.hand.map((card) => card.id));
  const loadedOrderKey = useRef('');
  const current = game.players[game.currentPlayerIndex];
  const drawPending = Boolean(pendingDraw && blocked && game.phase === 'draw' && current.id === viewerId);
  const pendingKey = `${game.roundIndex}:${game.turnCount}:${current.id}:${game.phase}`;
  const pending = pendingState.key === pendingKey ? pendingState.groups : [];
  const myTurn = current.id === viewerId && !blocked && !botControlled;
  const playing = myTurn && game.phase === 'play';
  const drawing = myTurn && game.phase === 'draw';
  const claiming = game.phase === 'claim' && game.claim?.playerIds[0] === viewerId && !blocked && !botControlled;
  const claimPlayer = game.players.find(pl => pl.id === game.claim?.playerIds[0]);
  const penalizedPlayer = game.players.find(pl => pl.id === game.lastPenalty?.playerId);
  const openedThisTurn = me.openedTurn === game.turnCount;
  // Contract rummy: once the contract is down there are no new groups, only lay-offs.
  const layOffOnly = meldStyleForGame(game) === 'contract' && me.hasOpened;
  // Trays are hidden then, so nothing may stay staged in them out of sight.
  const stagedIds = new Set(layOffOnly ? [] : pending.flatMap(g => g.cardIds));
  const arrangedHand = arrangeHand(me.hand, handOrder);
  const cards = arrangedHand.filter(c => !stagedIds.has(c.id));
  const activeCard = activeCardId ? me.hand.find((card) => card.id === activeCardId) : undefined;
  const contract = contractForRound(game);
  // Contract rummy: suit-free groups, four-card runs, and no new groups after going down.
  const style = meldStyleForGame(game);
  const roundCount = roundCountForGame(game);
  const gameRules = rulesForGame(game);
  // After opening, trays are untyped: the cards decide set or run, and an empty
  // tray always waits after the last one in use.
  const lastUsedTray = pending.reduce((last, group, index) => group.cardIds.length ? index : last, -1);
  // Classic rummy opens with any groups, so its trays are untyped from the start.
  const dropSlots: DropSlot[] = me.hasOpened || contract.free
    ? Array.from({ length: lastUsedTray + 2 }, (_, index) => ({ type: null, label: t("Grup {0}", [index + 1]) }))
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
  const nextContract = nextContractForRound(game);
  // Size the hand from every card it holds, staged ones included: staging a
  // card must not drop the hand to one row and slide the buttons under a finger.
  const handCount = me.hand.length + (drawPending ? 1 : 0);
  const handGrid = getHandGrid(handCount, width, settings.compactCards);
  const tableWidth = Math.min(width, 1180);
  const landscape = width > height;
  // A phone on its side is wide but short; only a tall landscape screen gets tablet cards.
  const tabletLandscape = width >= 700 && landscape && height >= 600;
  const phoneLandscape = landscape && !tabletLandscape;
  // A sideways phone has little height: smaller hand cards keep the table in view.
  const autoCompactHand = handGrid.compact || phoneLandscape;
  const handCardWidth = tabletLandscape
    ? autoCompactHand ? TABLET_SMALL_CARD_WIDTH : TABLET_CARD_WIDTH
    : autoCompactHand ? SMALL_CARD_WIDTH : CARD_WIDTH;
  const handCardHeight = tabletLandscape
    ? autoCompactHand ? TABLET_SMALL_CARD_HEIGHT : TABLET_CARD_HEIGHT
    : autoCompactHand ? SMALL_CARD_HEIGHT : CARD_HEIGHT;
  // The hand shares its panel with the player info and, in landscape, the tray
  // column; measure the real area once laid out and estimate until then.
  const handWidth = (handAreaWidth || (landscape ? tableWidth - (tabletLandscape ? 480 : 300) : tableWidth)) - 32;
  const singleRowStep = handCount > 1 ? (handWidth - handCardWidth) / (handCount - 1) : handCardWidth;
  // Landscape keeps the hand on one row while the cards stay readable; penalty
  // draws can make a hand unusually large, so fall back to the two-row grid then.
  const cardsPerRow = landscape && singleRowStep >= (phoneLandscape ? 16 : 22) ? Math.max(1, handCount) : handGrid.cardsPerRow;
  const step = cardsPerRow <= 1
    ? handCardWidth
    : Math.max(18, Math.min(tabletLandscape ? autoCompactHand ? 50 : 57 : autoCompactHand ? 41 : 46, (handWidth - handCardWidth) / (cardsPerRow - 1)));
  const rows = Array.from({ length: Math.ceil(cards.length / cardsPerRow) }, (_, i) => cards.slice(i * cardsPerRow, i * cardsPerRow + cardsPerRow));
  // Keep the rows the whole hand needs, even while some of its cards sit in trays.
  const reservedRows = Math.max(1, Math.ceil(handCount / cardsPerRow));
  const handMinHeight = reservedRows * handCardHeight + (reservedRows - 1) * HAND_ROW_GAP;

  // Follow phase changes during render so the celebration shows on the same frame.
  // The match is decided the moment the last deal ends, so the win is celebrated
  // then rather than after the deal's score sheet.
  const matchDecided = game.phase === 'game-over' || (game.phase === 'round-over' && game.roundIndex + 1 >= roundCount);
  const [celebratedPhase, setCelebratedPhase] = useState(game.phase);
  if (celebratedPhase !== game.phase) {
    setCelebratedPhase(game.phase);
    // Going from the last deal to the final result was already celebrated.
    if (!(game.phase === 'game-over' && celebratedPhase === 'round-over')) {
      const matchWon = matchDecided && winners.some(player => player.id === viewerId);
      setCelebrating(matchWon);
      setDealConfetti(!matchWon && game.phase === 'round-over' && game.roundWinnerId === viewerId);
    }
  }

  useEffect(() => {
    const sounded = game.phase === 'game-over' && previousPhase.current === 'round-over';
    if (!sounded && previousPhase.current !== game.phase && (game.phase === 'round-over' || game.phase === 'game-over')) {
      const won = matchDecided
        ? winners.some(player => player.id === viewerId)
        : game.roundWinnerId === viewerId;
      const later = (ms: number, run: () => void) => { celebrationTimers.current.push(setTimeout(run, ms)); };
      if (won && matchDecided) {
        // The match win: a full fanfare and a run of strong haptic pulses.
        playSound('victory');
        feedback('success');
        later(320, () => feedback('success'));
        later(760, () => feedback('turn'));
        prizeSounded.current = false;
      } else if (won) {
        playSound('win');
        feedback('success');
        later(3600, () => setDealConfetti(false));
      } else {
        playSound('lose');
        feedback('impact');
      }
    }
    previousPhase.current = game.phase;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the phase change should trigger the jingle.
  }, [feedback, game.phase, playSound]);

  useEffect(() => () => { celebrationTimers.current.forEach(clearTimeout); }, []);

  // Coin tables settle the prize a moment after the game ends; ring it in once it is known.
  const prize = coinResult?.payout ?? null;
  useEffect(() => {
    if (!celebrating || !prize || prizeSounded.current) return;
    prizeSounded.current = true;
    const timer = setTimeout(() => playSound('coins'), 1300);
    return () => clearTimeout(timer);
  }, [celebrating, playSound, prize]);
  const finishCelebration = useCallback(() => setCelebrating(false), []);

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

  // Picking up a hand card can rearrange the table (lay-off mode); measure
  // every target in its new place. Dropping the card stops any edge scrolling.
  const meldScrollRef = useRef<ScrollView>(null);
  const meldScroll = useRef({ y: 0, contentHeight: 0, viewHeight: 0 });
  const autoScroll = useRef<{ direction: number; since: number; timer: ReturnType<typeof setInterval> | null }>({ direction: 0, since: 0, timer: null });
  useEffect(() => {
    if (activeDrag !== 'hand') {
      const state = autoScroll.current;
      if (state.timer) clearInterval(state.timer);
      state.timer = null;
      state.direction = 0;
      return;
    }
    const timer = setTimeout(() => {
      for (const [key, node] of Object.entries(dropNodes.current)) {
        node?.measureInWindow((x, y, measuredWidth, measuredHeight) => {
          dropRects.current[key] = { x, y, width: measuredWidth, height: measuredHeight };
        });
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [activeDrag]);

  // Holding a card near the top or bottom edge of the meld list scrolls it. A
  // short dwell keeps a card that merely passes the edge from scrolling.
  const AUTO_SCROLL_EDGE = 64;
  const AUTO_SCROLL_DWELL_MS = 250;
  const AUTO_SCROLL_STEP = 9;
  function tickAutoScroll() {
    const state = autoScroll.current;
    if (!state.direction || Date.now() - state.since < AUTO_SCROLL_DWELL_MS) return;
    const scroll = meldScroll.current;
    const next = Math.min(Math.max(0, scroll.contentHeight - scroll.viewHeight), Math.max(0, scroll.y + state.direction * AUTO_SCROLL_STEP));
    const delta = next - scroll.y;
    if (!delta) return;
    scroll.y = next;
    meldScrollRef.current?.scrollTo({ y: next, animated: false });
    // The melds moved with the list; shift their drop targets the same way.
    for (const [key, rect] of Object.entries(dropRects.current)) {
      if (key.startsWith('meld:')) dropRects.current[key] = { ...rect, y: rect.y - delta };
    }
  }

  function dragMove(point: { x: number; y: number }) {
    if (activeDrag !== 'hand') return;
    const area = dropRects.current['scroll:melds'];
    let direction = 0;
    if (area && point.x >= area.x && point.x <= area.x + area.width) {
      if (point.y >= area.y && point.y < area.y + AUTO_SCROLL_EDGE) direction = -1;
      else if (point.y > area.y + area.height - AUTO_SCROLL_EDGE && point.y <= area.y + area.height) direction = 1;
    }
    const state = autoScroll.current;
    if (direction !== state.direction) {
      state.direction = direction;
      state.since = Date.now();
    }
    if (direction && !state.timer) state.timer = setInterval(tickAutoScroll, 16);
    if (!direction && state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
  }

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
    if (isValidMeld(group, 'set', style)) return 'set';
    if (isValidMeld(group, 'run', style)) return 'run';
    return null;
  }

  function readyGroups(groups: Pending[]) {
    const ready: { type: MeldType; cardIds: string[] }[] = [];
    for (const group of groups.filter(item => item.cardIds.length)) {
      const type = group.type ?? inferType(group.cardIds);
      const cardsInGroup = group.cardIds.map(id => me.hand.find(card => card.id === id)).filter((card): card is Card => Boolean(card));
      if (!type || !isValidMeld(cardsInGroup, type, style)) return null;
      ready.push({ type, cardIds: group.cardIds });
    }
    return ready;
  }

  function groupsWithSlots(source = pending) {
    return dropSlots.map((slot, index) => source[index] ?? { type: slot.type, cardIds: [] });
  }

  function slotLimit(slot: DropSlot) {
    if (slot.length) return slot.length;
    if (!me.hasOpened && !contract.free) return undefined;
    return slot.type === 'set' ? 4 : 13;
  }

  function submitOpening(action: OpeningAction) {
    const groups = action.groups.map(group => ({
      ...group,
      jokerAssignments: { ...group.jokerAssignments },
    }));

    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      const group = groups[groupIndex];
      // Contract rummy group Jokers stand for no particular suit.
      if (group.type !== 'set' || style === 'contract') continue;
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
    if (me.hasOpened || contract.free) return;

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
    if (!playing || (!me.hasOpened && !contract.free) || openedThisTurn) return;
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
    if (layOffOnly) {
      // No trays after going down: a tap lays the card off on a meld it fits.
      const card = me.hand.find(item => item.id === cardId);
      const target = card && visibleMelds.find(({ meld }) => acceptsCard(meld.id, card));
      if (target) return dropOnMeld(cardId, target.meld.id);
      setNotice(me.hand.length <= 1
        ? t("Son kartını açık kart alanına sürükleyerek elini bitir.")
        : t("Bu kart masadaki hiçbir gruba uymuyor. Yeni grup açılmaz; sıranı bitirmek için bir kartı açık kart alanına sürükle."));
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
      return meldFeedback([...trayCards, card], slot.type, slot.length, jokersAllowed, style) !== 'invalid';
    };
    // Final hand: the player builds the groups, so a tapped card stays in the selected tray.
    if (!contract.final && !fits(slotIndex)) {
      const candidates = groups.map((_, index) => index).filter(index => index !== slotIndex && fits(index));
      const better = candidates.find(index => groups[index].cardIds.length) ?? candidates[0];
      if (better !== undefined) slotIndex = better;
    }
    // A lone card parked in another tray joins this one once it holds two or
    // more cards it fits with (J tapped first lands in a set, then Q and K start a run).
    let source: Pending[] = groups;
    if (card && !contract.final) {
      const tray = dropSlots[slotIndex];
      const limit = slotLimit(tray);
      let trayCards = [...groups[slotIndex].cardIds.map(id => me.hand.find(item => item.id === id)).filter((item): item is Card => Boolean(item)), card];
      if (trayCards.length >= 2) {
        const moved = new Set<string>();
        groups.forEach((group, index) => {
          const loose = group.cardIds.length === 1 && index !== slotIndex ? me.hand.find(item => item.id === group.cardIds[0]) : undefined;
          if (!loose || (limit && trayCards.length >= limit)) return;
          if (meldFeedback([...trayCards, loose], tray.type, tray.length, jokersAllowed, style) === 'invalid') return;
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
    const groups = suggestContractGroups(me.hand, contract, !openingJokerRestricted(game), style);
    if (!groups) {
      setNotice(contract.free
        ? t("Elinde en az {0} puanlık bir açılış bulunamadı. Kartlara dokunarak grupları elle kurabilirsin.", [contract.minPoints ?? 0])
        : t("Elinde bu görevi tamamlayan hazır bir grup bulunamadı. Kartlara dokunarak tepsileri elle doldurabilirsin."));
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
      const suggested = suggestFinalGroups(me.hand, discardId, style);
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

  // Contract rummy's last deal: every card goes into runs at once, with no discard.
  function finishWholeHand() {
    const ready = readyGroups(pending);
    const groupedCount = pending.reduce((total, group) => total + group.cardIds.length, 0);
    const groups = ready?.length && groupedCount === me.hand.length ? ready : suggestFinalGroups(me.hand, null, style);
    if (!groups) {
      setNotice(t("Elindeki bütün kartlar henüz en az dörder kartlık üç seriye dizilmiyor. Bir kart atıp sıranı bitirebilirsin."));
      return;
    }
    setPending([]);
    setNotice('');
    submitOpening({ type: 'finish', groups });
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
    const matchingJoker = jokerReplaceable(meld) ? meld.cards.find(joker => joker.isJoker && (meld.type === 'set'
      ? card.rank === meld.cards.find(item => !item.isJoker)?.rank && card.suit === meld.jokerAssignments?.[joker.id]
      : isValidMeld(meld.cards.map(item => item.id === joker.id ? card : item), meld.type, meld.style))) : undefined;
    if (matchingJoker) act({ type: 'replaceJoker', meldId: meld.id, jokerId: matchingJoker.id, cardId });
    else if (isValidMeld([...meld.cards, card], meld.type, meld.style)) act({ type: 'layoff', meldId: meld.id, cardId });
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
      if (contract.final && !contract.noDiscard && !me.hasOpened) return finishFinal(cardId, removeStaged(cardId));
      if (pending.some(group => group.cardIds.length)) {
        setNotice(t("Önce tepsideki kartları eline geri al veya grubu tamamla."));
        return;
      }
      act({ type: 'discard', cardId });
      return;
    }
    setNotice(t("Kartı açık karta, görev tepsisine veya yerdeki bir gruba bırak."));
  }

  function returnStagedCard(cardId: string) {
    playSound('tap');
    setPending(removeStaged(cardId));
    setNotice(t("Kart eline geri döndü."));
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
    if (contract.final && !contract.noDiscard && !me.hasOpened && isInside('discard', point, DISCARD_DROP_PADDING)) return finishFinal(cardId, withoutCard);
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
      style,
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

  const opponents = game.players.filter(pl => pl.id !== viewerId);
  const compactHeader = width < 700;
  const turnHighlighted = (myTurn || claiming) && !blocked;
  const discardReady = drawing || claiming || activeDrag === 'hand';
  // The discard hint takes the turn pill's place under the pile while it shows;
  // the pill only turns invisible so nothing below it moves.
  const discardHintVisible = game.discardFaceDown || activeDrag === 'hand';
  const showTrays = playing && !arranging && !openedThisTurn && !layOffOnly;
  const seatColor = (playerId: string) => SEAT_COLORS[Math.max(0, game.players.findIndex(pl => pl.id === playerId)) % SEAT_COLORS.length];
  const turnText = drawPending ? t("Kart çekiliyor…") : blocked ? t("Bekleniyor…") : game.phase === 'claim' ? claiming ? t("Açık kart kararı") : t("{0} düşünüyor…", [claimPlayer?.name ?? t("Oyuncu")]) : myTurn ? drawing ? t("Sıra sende · Çek") : t("Sıra sende · Oyna") : t("{0} oynuyor…", [current.name]);
  const openReactions = () => { feedback(); setMenuOpen(false); setReactionsOpen(true); };
  const sendReaction = (reactionId: string) => {
    feedback();
    if (!settings.showReactions) updateSettings({ showReactions: true });
    onReact?.(reactionId);
    setReactionsOpen(false);
  };
  const openHelp = () => { feedback(); setMenuOpen(false); setHelpOpen(true); };
  const openSettings = () => { feedback(); setMenuOpen(false); setSettingsOpen(true); };

  const topBar = <View style={s.topBar}>
    <IconButton icon="close" label={t("Masadan çık")} onPress={() => setExitOpen(true)} />
    <View accessible accessibilityLabel={`${localizeMessage(modeLabel)} · ${t("EL")} ${game.roundIndex + 1} / ${roundCount} · ${t(contract.shortTitle)}`} style={s.roundPill}>
      <Text numberOfLines={1} style={s.roundText}>{t("EL")} {game.roundIndex + 1} / {roundCount} <Text style={s.roundTask}>· {t(contract.shortTitle)}</Text></Text>
      <View style={s.roundDots}>{Array.from({ length: roundCount }, (_, index) => <View key={index} style={[s.roundDot, index < game.roundIndex && s.roundDotDone, index === game.roundIndex && s.roundDotCurrent]} />)}</View>
    </View>
    <View style={s.topActions}>
      {onReact && <IconButton icon="chat" label={reactionsReady ? t("Tepki gönder") : t("Tepkiler bağlanıyor")} disabled={!reactionsReady} onPress={openReactions} />}
      {!compactHeader && <IconButton icon="rules" label={t("Hızlı kural yardımı")} onPress={openHelp} />}
      <IconButton icon="trophy" tint={p.gold} label={t("Puan tablosu")} onPress={() => { playSound('tap'); setScoresOpen(true); }} />
      {compactHeader
        ? <IconButton icon="more" label={t("Menü")} onPress={() => { feedback(); setMenuOpen(true); }} />
        : <IconButton icon="settings" label={t("Oyun ayarları")} onPress={openSettings} />}
    </View>
  </View>;

  const connectionPill = connectionState && connectionState !== 'online' && <View style={[s.connectionPill, connectionState === 'reconnecting' ? s.connectionWaiting : s.connectionOffline]}>
    <Text style={s.connectionText}>{connectionState === 'reconnecting' ? t("Bağlanıyor") : t("Çevrim dışı")}</Text>
  </View>;

  const avatarSize = phoneLandscape ? 32 : 40;
  const seats = opponents.map(pl => {
    const isCurrent = current.id === pl.id;
    const meta = playerMeta?.[pl.id];
    const status = meta?.botControlled ? t("bot yönetiyor") : meta?.connected === false ? t("çevrim dışı") : '';
    const missed = meta?.missedTurns ? `${meta.missedTurns}/3` : '';
    return <View key={pl.id}
      accessibilityLabel={t("{0}, {1} kart, {2} puan{3}", [pl.name, game.handCounts[pl.id], pl.score, isCurrent ? t(", sıra bu oyuncuda") : ''])}
      style={[landscape ? s.seatRow : s.seat, landscape && isCurrent && s.seatRowActive, !isCurrent && s.seatIdle]}>
      {/* Plain round borders only: Android can draw a fill or shadow behind them as a square. */}
      <View style={[s.avatarHalo, { borderRadius: avatarSize / 2 + 6 }, isCurrent && s.avatarHaloActive]}>
        <View style={[s.avatarRing, { borderRadius: avatarSize / 2 + 3 }, isCurrent && s.avatarRingActive]}>
          {/* Bots and same-device seats have no profile avatar; their initial and seat colour match the meld badges. */}
          {meta?.avatarKey
            ? <PlayerAvatar avatarKey={meta.avatarKey} size={avatarSize} />
            : <View style={[s.initialAvatar, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2, backgroundColor: seatColor(pl.id) }]}>
              <Text style={[s.initialAvatarText, { fontSize: Math.round(avatarSize * 0.42) }]}>{pl.name.slice(0, 1).toLocaleUpperCase(language)}</Text>
            </View>}
        </View>
        {pl.hasOpened && <View style={s.openedBadge}><TableIcon name="check" size={12} color={p.canvas} /></View>}
      </View>
      <View style={landscape ? s.seatCopyRow : s.seatCopy}>
        <Text numberOfLines={1} style={s.seatName}>{pl.name}</Text>
        <Text numberOfLines={1} style={s.seatStats}>{game.handCounts[pl.id]} {t("kart")} · {pl.score}p{missed ? <Text style={s.seatStatsWarn}> · {missed}</Text> : null}</Text>
        {!!status && <Text numberOfLines={1} style={s.seatStatus}>{status}</Text>}
      </View>
      {settings.showReactions && reactions?.[pl.id] && <ReactionBubble reaction={reactions[pl.id]} />}
    </View>;
  });

  const piles = <View style={s.piles}>
    <DragSurface active={drawing && game.stockCount > 0} onDragStart={() => beginDrag('stock')} onDrop={(point) => dropPile('stock', point)}>
      <View style={s.stock}>
        {/* A neat stack: up to two cards peek out below the top one, thinning as the stock runs low. */}
        {game.stockCount > 2 && <View style={[s.stockLayer, { left: 6, top: 6 }]}><PlayingCard hidden small tablet={tabletLandscape} /></View>}
        {game.stockCount > 1 && <View style={[s.stockLayer, { left: 3, top: 3 }]}><PlayingCard hidden small tablet={tabletLandscape} /></View>}
        {game.stockCount ? <PlayingCard hidden small tablet={tabletLandscape} /> : <View style={[s.empty, tabletLandscape && s.emptyTablet]} />}
        {game.stockCount > 0 && <Text style={s.stockCount}>{game.stockCount}</Text>}
      </View>
    </DragSurface>
    <DropZoneView dropKey="discard" onNode={registerDropZone} style={[s.discard, discardReady && s.discardReady, activeDrag === 'hand' && s.discardDropActive]}>
      <DragSurface active={(drawing || claiming) && Boolean(game.discard.length) && !game.discardFaceDown} onDragStart={() => beginDrag('discard')} onDrop={(point) => dropPile('discard', point)}>
        {game.discardFaceDown ? <PlayingCard hidden small tablet={tabletLandscape} /> : game.discard.length ? <PlayingCard card={game.discard.at(-1)} small tablet={tabletLandscape} /> : <View style={[s.empty, tabletLandscape && s.emptyTablet]} />}
      </DragSurface>
      {discardHintVisible && <Text numberOfLines={1} style={s.pileLabel}>{game.discardFaceDown ? t("BİTİŞ KARTI · KAPALI") : t("KARTI BURAYA AT")}</Text>}
    </DropZoneView>
  </View>;

  const turnPill = !claiming && <View style={[s.turnPill, turnHighlighted && s.turnPillMine, discardHintVisible && s.invisible]}>
    <Text numberOfLines={1} style={[s.turnText, turnHighlighted && s.turnTextMine]}>{turnText}</Text>
    <TurnCountdown deadline={game.turnDeadline} warningEnabled={settings.criticalTimer} tickEnabled={myTurn || claiming} onUrgent={() => { if (myTurn || claiming) feedback('warning'); }} onTick={() => playSound('tick')} />
  </View>;

  const notices = <>
    {game.lastPenalty?.reason === 'playable-discard' && <View style={s.penaltyBanner}><Text style={s.penaltyText}>{penalizedPlayer?.name ?? t("Oyuncu")} {' '}{t("işlek kart attı · +")}{game.lastPenalty.points} {t("ceza")}</Text></View>}
    {botControlled && <View style={s.botNotice}><Text style={s.botNoticeText}>{t("Üç süre kaçırdığın için oyun koltuğunu otomatik yönetiyor.")}</Text><Pressable accessibilityRole="button" disabled={blocked} onPress={onReclaim} style={[s.reclaimButton, blocked && s.disabled]}><Text style={s.reclaimText}>{t("Koltuğu geri al")}</Text></Pressable></View>}
    {claiming && <View style={[s.claimCard, phoneLandscape && s.claimCardRow]}>
      <View style={[s.claimCopy, phoneLandscape && s.claimCopyRow]}>
        <Text style={s.claimTitle}>{t("Açık kartı al?")}</Text>
        <Text style={s.claimCaption}>{t("+ 1 kapalı ceza kartı")}</Text>
      </View>
      <View style={s.claimActions}>
        <Pressable accessibilityRole="button" onPress={() => act({ type: 'claim', take: false })} style={({ pressed }) => [s.claimPass, pressed && s.pressed]}><Text style={s.claimPassText}>{t("Pas geç")}</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => act({ type: 'claim', take: true })} style={({ pressed }) => [s.claimTake, pressed && s.pressed]}><Text style={s.claimTakeText}>{t("Al")}</Text></Pressable>
      </View>
    </View>}
  </>;

  const meldsView = visibleMelds.length > 0 ? <View style={[s.melds, landscape && s.meldsLandscape]}>
    {visibleMelds.map(({ meld: m }) => {
      const meldRank = m.cards.find(card => !card.isJoker)?.rank;
      // Finding the right meld is part of the game: only the optional drag hint gives it away.
      const accepted = settings.dragHints && activeDrag === 'hand' && fitsMeld(m.id);
      const rejected = rejectedMeld?.key === pendingKey && rejectedMeld.id === m.id;
      const owner = game.players.find(pl => pl.id === m.ownerId);
      return <DropZoneView key={m.id} dropKey={`meld:${m.id}`} onNode={registerDropZone}
        accessibilityLabel={`${owner?.name ?? ''} · ${m.type === 'set' ? t("Küt") : t("Seri")}`}
        style={[s.meld, accepted && s.meldValid, rejected && s.meldInvalid]}>
        <View style={s.meldRow}>
          <View style={[s.meldOwner, { backgroundColor: m.ownerId === viewerId ? '#F1C66D' : seatColor(m.ownerId) }]}><Text style={s.meldOwnerText}>{m.ownerId === viewerId ? '★' : (owner?.name ?? '?').slice(0, 1).toLocaleUpperCase(language)}</Text></View>
          <View style={s.meldCards}>{m.cards.map((c, i) => <View key={c.id} style={[s.meldCard, { marginLeft: i ? -19 : 0 }]}>
            <PlayingCard card={c} compact tablet={tabletLandscape} />
            {c.isJoker && meldRank && m.jokerAssignments?.[c.id] && <Text style={s.jokerBadge}>{suitSymbol[m.jokerAssignments[c.id]]}{meldRank}</Text>}
          </View>)}</View>
        </View>
      </DropZoneView>;
    })}
  </View> : null;

  const hasStaged = pending.some(group => group.cardIds.length);
  // Classic rummy shows how far the staged groups are from the opening minimum.
  const stagedPoints = meldsPoints(pending.flatMap(group => {
    const type = group.type ?? inferType(group.cardIds);
    return type ? [{ type, cards: group.cardIds.map(id => me.hand.find(card => card.id === id)).filter((card): card is Card => Boolean(card)) }] : [];
  }));
  const openLabel = contract.free && !me.hasOpened && hasStaged && contract.minPoints
    ? t("Masaya aç · {0}/{1}", [stagedPoints, contract.minPoints])
    : t("Masaya aç");
  const openButton = showTrays && (contract.noDiscard && !me.hasOpened
    ? <Pressable accessibilityRole="button" onPress={finishWholeHand} style={({ pressed }) => [s.openButton, pressed && s.pressed]}><Text style={s.openButtonText}>{t("Elden bit")}</Text></Pressable>
    : !me.hasOpened && !contract.final && !(contract.free && hasStaged)
    ? <Pressable accessibilityRole="button" onPress={findAndOpenContract} style={({ pressed }) => [s.openButton, pressed && s.pressed]}><Text style={s.openButtonText}>{t("Masaya aç")}</Text></Pressable>
    : (me.hasOpened || contract.free) && hasStaged
      ? <Pressable accessibilityRole="button" onPress={openStagedGroups} style={({ pressed }) => [s.openButton, pressed && s.pressed]}><Text style={s.openButtonText}>{openLabel}</Text></Pressable>
      : null);

  // Empty trays fold into a bar of the same height, so opening them moves
  // nothing; a staged card or a tap opens them, and a card dropped on the bar
  // lands in the selected tray.
  const stagedCount = pending.reduce((total, group) => total + group.cardIds.length, 0);
  const traysExpanded = stagedCount > 0 || traysOpenKey === pendingKey;
  const barSlotIndex = activeSlotIndex < dropSlots.length ? activeSlotIndex : 0;
  const clearTray = (index: number) => {
    playSound('tap');
    feedback('selection');
    setPending(groupsWithSlots().map((group, groupIndex) => groupIndex === index ? { ...group, cardIds: [] } : group));
  };
  const trayBar = <DropZonePressable dropKey={`slot:${barSlotIndex}`} onNode={registerDropZone} accessibilityRole="button" accessibilityLabel={t("Kartlara dokun, grup kur")} onPress={() => { feedback('selection'); setTraysOpenKey(pendingKey); }}
    style={[s.trayBar, tabletLandscape && s.trayBarTablet, activeDrag === 'hand' && s.trayBarDrop]}>
    <Text numberOfLines={1} style={s.trayBarHint}>{t("Kartlara dokun, grup kur")}</Text>
    {!me.hasOpened && contract.noDiscard && <Text numberOfLines={1} style={s.trayBarTask}>{t("Bütün kartlar seride · atış yok")}</Text>}
    {!me.hasOpened && !contract.final && <Text numberOfLines={1} style={s.trayBarTask}>{contract.free
      ? contract.minPoints ? t("Açılış en az {0} puan", [contract.minPoints]) : t("Serbest açılış")
      : dropSlots.map(slot => `${localizeMessage(slot.label)} 0/${slot.length}`).join(' · ')}</Text>}
  </DropZonePressable>;

  // After going down in contract rummy the tray space explains how play goes on.
  const layOffHint = layOffOnly && playing && !arranging && !openedThisTurn ? <View style={s.trayBar}>
    <Text numberOfLines={1} style={s.trayBarHint}>{t("Kartı masadaki bir gruba dokun veya sürükle")}</Text>
    <Text numberOfLines={1} style={s.trayBarTask}>{t("Yeni grup açılmaz · uymayan kartı açık kart alanına at")}</Text>
  </View> : null;
  const trays = !showTrays ? layOffHint : !traysExpanded ? trayBar : <ScrollView horizontal showsHorizontalScrollIndicator={false} scrollEnabled={!activeDrag} style={s.trayScroll} contentContainerStyle={s.trays}>
    {dropSlots.map((slot, index) => {
      const group = groupsWithSlots()[index];
      const groupCards = group.cardIds.map(id => me.hand.find(card => card.id === id)).filter((card): card is Card => Boolean(card));
      const incoming = (activeDrag === 'hand' || activeDrag === 'staged') && activeCard && !group.cardIds.includes(activeCard.id) ? activeCard : null;
      const previewCards = incoming ? [...groupCards, incoming] : groupCards;
      const status = meldFeedback(previewCards, slot.type, slot.length, me.hasOpened || !openingJokerRestricted(game), style);
      const selected = activeSlotIndex === index;
      const ghosts = Math.max(0, Math.min(slot.length ?? 3, 5) - groupCards.length);
      const groupType = groupCards.length >= 3 ? inferType(group.cardIds) : null;
      return <DropZonePressable key={index} dropKey={`slot:${index}`} onNode={registerDropZone} accessibilityRole="button" accessibilityState={{ selected }}
        accessibilityLabel={`${localizeMessage(slot.label)} · ${group.cardIds.length}${slot.length ? `/${slot.length}` : ''}`}
        onPress={() => { setActiveSlotIndex(index); feedback('selection'); }}
        style={[s.slot, selected && s.slotSelected, status === 'valid' && s.slotValid, status === 'invalid' && s.slotInvalid]}>
        <View style={s.slotCards}>
          {groupCards.map((card, cardIndex) => <DragSurface key={card.id} verticalOnly active={playing} onDragStart={() => beginDrag('staged', card.id)} onDrop={(point) => dropStagedCard(card.id, point)} style={{ marginLeft: cardIndex ? -14 : 0 }}><PlayingCard card={card} compact tablet={tabletLandscape} glow={highlighted.has(card.id)} onPress={playing ? () => returnStagedCard(card.id) : undefined} /></DragSurface>)}
          {Array.from({ length: ghosts }, (_, ghostIndex) => <View key={`ghost-${ghostIndex}`} style={[s.slotGhost, tabletLandscape && s.slotGhostTablet, (groupCards.length || ghostIndex) ? s.slotGhostSpaced : null]} />)}
        </View>
        <View style={s.slotCopy}>
          <View style={s.slotLabelRow}>
            <Text numberOfLines={1} style={s.slotLabel}>{slot.type === null && groupType ? groupType === 'set' ? t("Küt") : t("Seri") : localizeMessage(slot.label)}</Text>
            {status === 'valid' && <TableIcon name="check" size={14} color="#8FE3B4" />}
          </View>
          <Text style={[s.slotCount, status === 'invalid' && s.slotCountInvalid]}>{status === 'invalid' ? t("Geçersiz grup") : `${group.cardIds.length}${slot.length ? ` / ${slot.length}` : ''}`}</Text>
        </View>
        {groupCards.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel={t("Tepsiyi boşalt")} hitSlop={10} onPress={() => clearTray(index)} style={s.slotClear}>
          <TableIcon name="close" size={14} color={p.cream} />
        </Pressable>}
      </DropZonePressable>;
    })}
  </ScrollView>;

  // Notices float above the panel instead of pushing the hand around.
  const handMessages = (!!(notice || error) || arranging) && <View pointerEvents="none" style={s.toastWrap}>
    {!!(notice || error) && <Text accessibilityLiveRegion="polite" style={s.notice}>{localizeMessage(error || notice)}</Text>}
    {arranging && <Text accessibilityLiveRegion="polite" style={s.arrangeHint}>{t("Kartı tutup istediğin konuma sürükle ve bırak.")}</Text>}
  </View>;

  const handCards = <ScrollView onLayout={(event) => setHandAreaWidth(Math.round(event.nativeEvent.layout.width))} scrollEnabled={!activeDrag} removeClippedSubviews={false} style={[s.handCards, tabletLandscape && s.handCardsTablet]} contentContainerStyle={s.handScroll}>
    <View style={[s.rows, { minHeight: handMinHeight }]}>{rows.map((row, index) => <View key={index} style={s.cardRow}>
      {row.map((c, i) => <DraggableHandCard key={c.id} card={c} index={index * cardsPerRow + i} step={step} cardsPerRow={cardsPerRow}
        cardWidth={handCardWidth} cardHeight={handCardHeight} compactCard={autoCompactHand} tabletCards={tabletLandscape} glow={highlighted.has(c.id)} arranging={arranging} gameplayEnabled={playing} onDragStart={() => beginDrag(arranging ? 'arranging' : 'hand', c.id)} onReorder={reorderCard} onGameplayDrop={dropHandCard} onGameplayMove={dragMove} />)}
      {drawPending && index === rows.length - 1 && row.length < cardsPerRow && <PendingDrawCard small={autoCompactHand} tablet={tabletLandscape} marginLeft={row.length ? step - handCardWidth : 0} />}
    </View>)}</View>
    {drawPending && cards.length % cardsPerRow === 0 && <View style={s.cardRow}><PendingDrawCard small={autoCompactHand} tablet={tabletLandscape} /></View>}
  </ScrollView>;

  const meInfo = <View style={[s.meInfo, tabletLandscape && s.meInfoLandscape]}>
    <Text numberOfLines={1} style={s.meName}>{me.name}</Text>
    <Text numberOfLines={1} style={s.meStats}>{me.hand.length} {t("kart")} · {me.score} {t("puan")}{myMissedTurns ? t(" · {0}/3 süre kaçtı", [myMissedTurns]) : ''}</Text>
    {settings.showReactions && reactions?.[viewerId] && <ReactionBubble reaction={reactions[viewerId]} />}
  </View>;

  const handTools = <View style={s.handTools}>
    {onUndo && <ToolChip icon="undo" label={t("Geri al")} disabled={!canUndo} onPress={onUndo} />}
    <ToolChip icon="auto" tint={p.gold} label={t("Akıllı diz")} disabled={Boolean(activeDrag)} onPress={autoArrange} />
    <ToolChip icon={arranging ? 'check' : 'arrange'} active={arranging} label={arranging ? t("Bitti") : t("Elle diz")} onPress={toggleArrange} />
  </View>;
  const meStatsLine = `${me.hand.length} ${t("kart")} · ${me.score} ${t("puan")}${myMissedTurns ? t(" · {0}/3 süre kaçtı", [myMissedTurns]) : ''}`;

  const meldScrollProps = {
    ref: meldScrollRef, scrollEnabled: !activeDrag, style: s.fill, scrollEventThrottle: 16,
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => { meldScroll.current.y = event.nativeEvent.contentOffset.y; },
    onContentSizeChange: (_width: number, contentHeight: number) => { meldScroll.current.contentHeight = contentHeight; },
    onLayout: (event: LayoutChangeEvent) => { meldScroll.current.viewHeight = event.nativeEvent.layout.height; },
  };

  const handPanelActive = activeDrag === 'stock' || activeDrag === 'discard' || activeDrag === 'staged';

  const resultHeader = <>
    <Text style={s.resultTitle}>{game.phase === 'game-over' ? winners.length === 1 && winners[0].id === viewerId ? t("Sen kazandın!") : winners.map(w => w.id === viewerId ? t("Sen") : w.name).join(' & ') + (winners.some(w => w.id === viewerId) ? t(" kazandınız!") : t(" kazandı!")) : game.phase === 'round-over' ? game.roundResult?.reason === 'stalemate' ? t("El çıkmaz bitti") : game.roundWinnerId === viewerId ? t("Sen bitirdin!") : game.players.find(pl => pl.id === game.roundWinnerId)?.name + t(" bitirdi!") : t("Puan tablosu")}</Text>
    <Text style={s.resultCaption}>{game.phase === 'round-over' && game.roundResult?.reason === 'stalemate' ? t("Deste {0} kez karıştırıldı ve kimse bitiremedi; herkesin elinde kalanlar ceza yazıldı.{1}", [STALEMATE_RECYCLES, nextContract ? t(" Sıradaki el: {0}", [t(nextContract.title)]) : '']) : game.phase === 'round-over' && nextContract ? t("Sıradaki el: {0}", [t(nextContract.title)]) : game.phase === 'game-over' ? t("{0} el tamamlandı. En düşük toplam puan kazandı.", [roundCount]) : t("En düşük toplam puan kazanır.")}</Text>
    {game.phase === 'round-over' && game.roundResult?.rummyOut && <Text style={s.resultCaption}>{t("Rummy! Bütün el tek turda açıldı; cezalar ikiye katlandı.")}</Text>}
    {game.phase === 'game-over' && coinResult && <Text style={s.resultCaption}>{coinResult.payout === null ? t("Coin ödülü hesaplanıyor…") : t("Giriş: {0} coin · Kazancın: {1} coin", [coinResult.entryFee, coinResult.payout])}</Text>}
  </>;
  const resultList = <ScrollView style={[s.resultList, phoneLandscape && s.resultListSide]} contentContainerStyle={s.resultListContent} showsVerticalScrollIndicator={false}>
      {scoreHistory.length > 0 && <View accessibilityLabel={t("El el puan geçmişi")} style={s.historyTable}>
        <View style={s.historyRow}>
          <Text numberOfLines={1} style={[s.historyRound, s.historyHead]}>{t("El")}</Text>
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
            <Text style={s.penalty}>{score.penalty + score.playableDiscardPenalty === 0 ? t("Bu el: ceza yok · Önceki toplam: {0}", [score.totalBefore]) : t("Bu el: +{0} ceza{1} · Önceki toplam: {2}", [score.penalty + score.playableDiscardPenalty, score.playableDiscardPenalty ? t(" · İşlek atma: +{0}", [score.playableDiscardPenalty]) : '', score.totalBefore])}{score.cutBonus ? t(" · Tam kesim: −{0}", [score.cutBonus]) : ''}</Text>
            {detail.cards.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.remainingCards}>
              {detail.cards.map((card) => <PlayingCard key={card.id} card={card} compact />)}
            </ScrollView>}
          </>}
        </View>;
      })}
    </ScrollView>;
  const resultActions = <>
    {over ? game.phase === 'game-over' ? <>{onRematch && (canRematch
        ? <Pressable disabled={blocked} style={[s.resultButton, blocked && s.disabled]} onPress={onRematch}><Text style={s.actionText}>{t("Tekrar oyna")}</Text></Pressable>
        : <Text style={s.resultCaption}>{t("Oda sahibinin yeniden başlatması bekleniyor.")}</Text>)}
      <Pressable style={s.resultButtonSecondary} onPress={onExit}><Text style={s.resultButtonSecondaryText}>{t("Ana menü")}</Text></Pressable></>
      : <>
        {botControlled && onReclaim && <Pressable disabled={blocked} style={[s.resultButton, blocked && s.disabled]} onPress={onReclaim}><Text style={s.actionText}>{t("Koltuğu geri al")}</Text></Pressable>}
        {advanceSeconds !== null && <Text style={s.resultCaption}>{advanceSeconds} {' '}{t("saniye içinde otomatik devam edilecek.")}</Text>}
        {canAdvance
          ? <Pressable disabled={blocked} style={s.resultButton} onPress={() => { setPending([]); act({ type: 'next' }); }}><Text style={s.actionText}>{game.roundIndex + 1 >= roundCount ? t("Sonucu gör") : t("Sonraki el")}</Text></Pressable>
          : <Text style={s.resultCaption}>{t("Sıradaki ele otomatik geçilecek.")}</Text>}
      </>
      : <Pressable style={s.resultButton} onPress={() => setScoresOpen(false)}><Text style={s.actionText}>{t("Masaya dön")}</Text></Pressable>}
  </>;
  return <SafeAreaView style={[s.page, felt.id !== 'felt-classic' && { backgroundColor: felt.design.outer, experimental_backgroundImage: feltGradient(felt.design) }]}>
    <View style={phoneLandscape && s.topBarCompact}>{topBar}</View>
    {connectionPill}
    {landscape ? <View style={s.landscapeMiddle}>
      <ScrollView style={[s.seatColumn, tabletLandscape && s.seatColumnTablet]} contentContainerStyle={s.seatColumnContent} showsVerticalScrollIndicator={false}>{seats}</ScrollView>
      <View style={s.centerColumn}>{piles}{turnPill}{notices}</View>
      <DropZoneView dropKey="scroll:melds" onNode={registerDropZone} style={s.meldColumn}><ScrollView {...meldScrollProps} contentContainerStyle={s.meldColumnContent}>{meldsView}</ScrollView></DropZoneView>
    </View> : <>
      <View style={s.seats}>{seats}</View>
      {/* The piles stay put so the discard target never scrolls away; only the melds scroll. */}
      <View style={s.tableFixed}>{piles}{turnPill}{notices}</View>
      <DropZoneView dropKey="scroll:melds" onNode={registerDropZone} style={s.tableScroll}><ScrollView {...meldScrollProps} contentContainerStyle={s.table}>{meldsView}</ScrollView></DropZoneView>
    </>}
    {activeDrag === 'hand' && playing && <DropZoneView dropKey="cancel" onNode={registerDropZone} pointerEvents="none" style={[s.cancelZone, { top: safeArea.top }]}>
      <Text style={s.cancelZoneText}>{t("Sadece bakıyorum · buraya bırak, kart yerinde kalsın")}</Text>
    </DropZoneView>}
    <DropZoneView dropKey="hand" onNode={registerDropZone} style={[s.panel, landscape && s.panelLandscape, handPanelActive && s.panelDropActive]}>
      {handMessages}
      {landscape ? <>
        {tabletLandscape && meInfo}
        <View style={s.handColumn}>{handCards}</View>
        <View style={[s.sideColumn, tabletLandscape && s.sideColumnTablet]}>
          {trays}
          {openButton}
          {/* A sideways phone has no room to spare; the card count and score stay on the scoreboard. */}
          {tabletLandscape ? handTools : <View style={s.sideFooter}>{handTools}</View>}
        </View>
      </> : <>
        {/* One slim bar for the hand's count, score and tools instead of a footer row. */}
        <View style={s.panelHeader}>
          <View style={s.meInline}>
            <Text numberOfLines={1} style={s.meStats}>{meStatsLine}</Text>
            {settings.showReactions && reactions?.[viewerId] && <ReactionBubble reaction={reactions[viewerId]} />}
          </View>
          {handTools}
        </View>
        {/* The trays get the full width; the open button sits under them as a slim bar. */}
        {trays && <View style={s.trayRow}>{trays}</View>}
        {openButton && <View style={s.openRow}>{openButton}</View>}
        {handCards}

      </>}
    </DropZoneView>
    <Modal supportedOrientations={MODAL_ORIENTATIONS} visible={(over && !celebrating && !hideResults) || scoresOpen} transparent animationType="fade" onRequestClose={() => setScoresOpen(false)}>
      <View style={[s.backdrop, phoneLandscape ? sideModalInsets : modalInsets]}><View style={[s.sheet, phoneLandscape && s.sheetSide]}>
        {/* A sideways phone keeps the title and buttons beside the score table, so the table gets the full height. */}
        {phoneLandscape
          ? <><View style={s.sheetSideInfo}>{resultHeader}{resultActions}</View>{resultList}</>
          : <>{resultHeader}{resultList}{resultActions}</>}
      </View><Confetti active={dealConfetti && game.phase === 'round-over'} count={40} /></View>
    </Modal>
    <VictoryCelebration visible={celebrating && matchDecided && !hideResults} onDone={finishCelebration}
      title={winners.length > 1 ? t("Zirveyi paylaştın!") : t("Kazandın!")}
      subtitle={t("{0} puanla masanın en iyisi oldun.", [me.score])}
      prize={prize} />
    <Modal supportedOrientations={MODAL_ORIENTATIONS} visible={exitOpen} transparent animationType="fade" onRequestClose={() => setExitOpen(false)}><View style={[s.backdrop, modalInsets]}><View style={s.sheet}>
      <Text style={s.resultTitle}>{t("Masadan çıkılsın mı?")}</Text><Text style={s.resultCaption}>{onForfeit ? t("Şimdilik çıkarsan aynı cihazdan masaya dönebilirsin. Kalıcı ayrılırsan koltuğun otomatik yönetilir.") : t("Oyun kaydedilir; aynı cihazdan kaldığın yerden devam edebilirsin.")}</Text>
      <Pressable style={s.resultButton} onPress={onExit}><Text style={s.actionText}>{onForfeit ? t("Şimdilik çık · koltuğumu koru") : t("Ana menüye dön")}</Text></Pressable>
      {onForfeit && <Pressable style={s.forfeitButton} onPress={onForfeit}><Text style={s.forfeitText}>{t("Kalıcı ayrıl · oyun devam etsin")}</Text></Pressable>}
      <Pressable style={s.resultButtonSecondary} onPress={() => setExitOpen(false)}><Text style={s.resultButtonSecondaryText}>{t("Oynamaya devam et")}</Text></Pressable>
    </View></View></Modal>
    <Modal supportedOrientations={MODAL_ORIENTATIONS} visible={Boolean(jokerChoice)} transparent animationType="fade" onRequestClose={() => setJokerChoice(null)}><View style={[s.backdrop, modalInsets]}><View style={s.sheet}>
      <Text style={s.resultTitle}>{t("Joker hangi kart?")}</Text>
      <Text style={s.resultCaption}>{t("Bu seçim sabit kalır. Jokeri yalnızca seçtiğin tam kartla değiştiren oyuncu geri alabilir.")}</Text>
      <View style={s.jokerChoices}>{jokerChoice?.suits.map(suit => <Pressable key={suit} accessibilityRole="button" onPress={() => chooseJokerSuit(suit)} style={s.jokerChoiceButton}>
        <Text style={[s.jokerChoiceSymbol, (suit === 'hearts' || suit === 'diamonds') && s.jokerChoiceRed]}>{suitSymbol[suit]}</Text>
        <Text style={s.jokerChoiceText}>{t(suitName[suit])} {jokerChoice.rank}</Text>
      </Pressable>)}</View>
      <Pressable style={s.resultButtonSecondary} onPress={() => setJokerChoice(null)}><Text style={s.resultButtonSecondaryText}>{t("Vazgeç")}</Text></Pressable>
    </View></View></Modal>
    <Modal supportedOrientations={MODAL_ORIENTATIONS} visible={debugOpen} transparent animationType="fade" onRequestClose={() => setDebugOpen(false)}><View style={[s.backdrop, modalInsets]}><View style={[s.sheet, s.debugSheet]}>
      <Text style={s.resultTitle}>{t("Canlı oyun durumu")}</Text>
      <Text style={s.resultCaption}>{t("Her hamlede yenilenir. Rakiplerin elleri yalnızca bu geliştirici görünümünde gösterilir.")}</Text>
      <ScrollView style={s.debugScroll} contentContainerStyle={s.debugContent}>
        <Text selectable style={s.debugText}>{debugText}</Text>
      </ScrollView>
      <Pressable style={s.resultButton} onPress={() => setDebugOpen(false)}><Text style={s.actionText}>{t("Masaya dön")}</Text></Pressable>
    </View></View></Modal>
    {onReact && <Modal supportedOrientations={MODAL_ORIENTATIONS} visible={reactionsOpen} transparent animationType="slide" onRequestClose={() => setReactionsOpen(false)}><Pressable style={[s.reactionBackdrop, modalInsets]} onPress={() => setReactionsOpen(false)}><Pressable style={[s.reactionSheet, { backgroundColor: felt.design.middle }]}>
      <View style={s.reactionHandle} />
      <View style={s.reactionEmojiRow}>{REACTIONS.filter(item => item.kind === 'emoji').map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.id} onPress={() => sendReaction(item.id)} style={({ pressed }) => [s.reactionEmojiButton, pressed && s.reactionEmojiPressed]}><Text style={s.reactionEmojiLarge}>{t(item.text)}</Text></Pressable>)}</View>
      <View style={s.reactionGrid}>{REACTIONS.filter(item => item.kind === 'phrase').map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => sendReaction(item.id)} style={({ pressed }) => [s.reactionPhraseButton, pressed && s.reactionPhrasePressed]}><Text style={s.reactionPhraseText}>{t(item.text)}</Text></Pressable>)}</View>
      <Text style={s.reactionCaption}>{t("Tepkiler masadaki herkese birkaç saniye görünür.")}</Text>
    </Pressable></Pressable></Modal>}
    <Modal supportedOrientations={MODAL_ORIENTATIONS} visible={settingsOpen} transparent animationType="fade" onRequestClose={() => setSettingsOpen(false)}><View style={[s.backdrop, modalInsets]}><View style={s.sheet}>
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
    <Modal supportedOrientations={MODAL_ORIENTATIONS} visible={helpOpen} transparent animationType="fade" onRequestClose={() => setHelpOpen(false)}><View style={[s.backdrop, modalInsets]}><View style={s.sheet}>
      <Text style={s.resultTitle}>{t("Bu elde ne yapacağım?")}</Text>
      <View style={s.helpTask}><Text style={s.helpTaskLabel}>{t("EL")} {game.roundIndex + 1} / {roundCount} {' '}{contract.free ? t("· RUMMY") : t("GÖREVİ")}</Text><Text style={s.helpTaskTitle}>{t(contract.title)}</Text></View>
      <ScrollView style={s.helpScroll} contentContainerStyle={s.helpContent}>
        <Text style={s.helpLine}><Text style={s.helpStrong}>{t("1. Kart çek:")}</Text>{' '}{t("Deste veya açık kartı eline sürükle.")}</Text>
        <Text style={s.helpLine}><Text style={s.helpStrong}>{t("2. Aç / işle:")}</Text>{' '}{t("Karta dokunarak yeni küt veya seri tepsisine ekle. Masadaki gruba işlemek için kartı grubun üzerine sürükle.")}</Text>
        <Text style={s.helpLine}><Text style={s.helpStrong}>{t("3. Kart at:")}</Text>{' '}{t("Bir kartı açık kart alanına sürükleyerek sıranı bitir.")}</Text>
        {style === 'contract' ? <>
          <Text style={s.helpLine}><Text style={s.helpStrong}>{t("Küt:")}</Text>{' '}{t("Türden bağımsız, aynı değerde en az 3 kart.")}<Text style={s.helpStrong}>{t("Seri:")}</Text>{' '}{t("Aynı türde ardışık en az 4 kart; As düşük (A-2-3-4) veya yüksek (J-Q-K-A) olabilir, K-A-2 olmaz.")}</Text>
          <Text style={s.helpLine}><Text style={s.helpStrong}>{t("İlk açılış:")}</Text>{' '}{t("Yalnızca bu elin kontratındaki gruplar açılır. Açtıktan sonra yeni grup açamazsın; sonraki sıralarında masadaki gruplara kart işlersin.")}</Text>
          <Text style={s.helpLine}><Text style={s.helpStrong}>{t("Joker:")}</Text>{' '}{t("Serideki joker, yerine geçtiği gerçek kartla değiştirilebilir. Kütteki joker değiştirilemez.")}</Text>
          <Text style={s.helpLine}><Text style={s.helpStrong}>{t("May I?:")}</Text> {gameRules.claimsEnabled ? t("Desteden çekildiğinde diğer oyuncular açık kartı alabilir; alan ayrıca 1 ceza kartı çeker. Sınır yoktur. Karar süresi {0} saniye.", [gameRules.claimTimeoutMs / 1000]) : t("Bu oyunda kapalı.")}</Text>
          <Text style={s.helpLine}><Text style={s.helpStrong}>{t("Son el:")}</Text>{' '}{t("Bütün kartlarını tek hamlede en az dörder kartlık üç seri olarak açıp bitirirsin; kart atılmaz.")}</Text>
          <Text style={s.helpLine}><Text style={s.helpStrong}>{t("Puan:")}</Text>{' '}{t("Elde kalan sayılar değeri kadar, J-Q-K 10, As ve Joker 15 ceza verir. En düşük toplam kazanır.")}</Text>
        </> : <Text style={s.helpLine}><Text style={s.helpStrong}>{t("Küt:")}</Text>{' '}{t("Aynı sayı, farklı semboller.")}<Text style={s.helpStrong}>{t("Seri:")}</Text>{' '}{t("Aynı sembolde ardışık kartlar; As başta (A-2-3) veya sonda (Q-K-A) olabilir.")}</Text>}
        {style === 'contract' ? null : contract.free ? <>
          <Text style={s.helpLine}><Text style={s.helpStrong}>{t("İlk açılış:")}</Text>{' '}{contract.minPoints ? t("Masaya ilk kez koyduğun grupların toplamı en az {0} puan olmalı; Joker yerine geçtiği kartın değerini sayar.", [contract.minPoints]) : t("Herhangi bir geçerli küt veya seriyle açabilirsin.")}</Text>
          <Text style={s.helpLine}><Text style={s.helpStrong}>{t("Joker:")}</Text>{' '}{t("Kütte jokerin temsil ettiği sembol açılırken seçilir; joker yalnızca ilan edilen tam kartla değiştirilebilir.")}</Text>
          <Text style={s.helpLine}><Text style={s.helpStrong}>{t("Rummy!:")}</Text>{' '}{t("Bütün elini tek turda açıp bitirirsen diğer oyuncuların cezası ikiye katlanır.")}</Text>
        </> : <>
        <Text style={s.helpLine}><Text style={s.helpStrong}>{t("Joker:")}</Text> {gameRules.jokerOpeningRestrictionRounds ? t("İlk {0} elin ilk açılışında kullanılamaz.", [gameRules.jokerOpeningRestrictionRounds]) : t("Açılış görevlerinde kullanılabilir.")}{t("Kütte jokerin temsil ettiği sembol açılırken seçilir; joker yalnızca ilan edilen tam kartla değiştirilebilir.")}</Text>
        <Text style={s.helpLine}><Text style={s.helpStrong}>{t("Açık kart teklifi:")}</Text> {gameRules.claimsEnabled ? t("3+ kişilik masada desteden kart seçildiğinde diğer oyuncular açık kartı 1 ceza kartıyla alabilir. Karar süresi {0} saniyedir; iki kişilik oyunda teklif açılmaz.", [gameRules.claimTimeoutMs / 1000]) : t("Bu oyunda kapalı.")}</Text>
        <Text style={s.helpLine}><Text style={s.helpStrong}>{t("İşlek kart:")}</Text>{' '}{t("Yerdeki bir küt veya seriye işlenebilen kartı atmak +25 ceza verir. Bu kural, henüz elini açmamış oyuncuya da uygulanır.")}</Text>
        </>}
        {style !== 'contract' && <Text style={s.helpLine}><Text style={s.helpStrong}>{t("Puan:")}</Text>{' '}{t("Elde kalan sayılar değeri kadar, J-Q-K 10, As 11, Joker 25 ceza verir. En düşük toplam kazanır.")}</Text>}
      </ScrollView>
      {onOpenTutorial && <Pressable style={s.resultButtonSecondary} onPress={() => { setHelpOpen(false); onOpenTutorial(); }}><Text style={s.resultButtonSecondaryText}>{t("Detaylı eğitimi tekrar izle")}</Text></Pressable>}
      <Pressable style={s.resultButton} onPress={() => setHelpOpen(false)}><Text style={s.actionText}>{t("Masaya dön")}</Text></Pressable>
    </View></View></Modal>
    <Modal supportedOrientations={MODAL_ORIENTATIONS} visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}><Pressable style={[s.backdrop, modalInsets]} onPress={() => setMenuOpen(false)}><Pressable style={s.sheet}>
      <Text style={s.menuMode}>{localizeMessage(modeLabel)}</Text>
      <Pressable accessibilityRole="button" onPress={openHelp} style={s.menuRow}><TableIcon name="rules" color="#253a2e" /><Text style={s.menuRowText}>{t("Hızlı kural yardımı")}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={openSettings} style={s.menuRow}><TableIcon name="settings" color="#253a2e" /><Text style={s.menuRowText}>{t("Oyun ayarları")}</Text></Pressable>
      <Pressable style={s.resultButton} onPress={() => setMenuOpen(false)}><Text style={s.actionText}>{t("Masaya dön")}</Text></Pressable>
    </Pressable></Pressable></Modal>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  settingsScroll: { flexGrow: 0 },
  settingsScrollContent: { paddingBottom: 8 },
  page: { flex: 1, width: '100%', maxWidth: 1180, alignSelf: 'center', backgroundColor: '#0A2A1D', experimental_backgroundImage: 'radial-gradient(ellipse 120% 75% at 50% 32%, #1F6E4B 0%, #124A33 48%, #0A2A1D 100%)' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.96 }] },
  fill: { flex: 1 },
  disabled: { opacity: 0.35 },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 4 },
  topActions: { flexDirection: 'row', gap: 8 },
  // Bare icons over the felt; the 44pt box keeps the touch target.
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  roundPill: { flexShrink: 1, alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.25)' },
  roundText: { color: p.cream, fontSize: 13, fontWeight: '900', letterSpacing: 0.2 },
  roundTask: { color: '#F1C66D' },
  roundDots: { flexDirection: 'row', gap: 3 },
  roundDot: { width: 8, height: 4, borderRadius: 2, backgroundColor: 'rgba(248,241,223,0.2)' },
  roundDotDone: { backgroundColor: '#F1C66D' },
  roundDotCurrent: { backgroundColor: p.cream },
  connectionPill: { alignSelf: 'center', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 2 },
  connectionWaiting: { backgroundColor: '#d9a44140' }, connectionOffline: { backgroundColor: '#a6404860' },
  connectionText: { color: p.cream, fontSize: 11, fontWeight: '800' },

  seats: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 10, paddingTop: 2, paddingBottom: 0 },
  seat: { flex: 1, maxWidth: 120, alignItems: 'center', gap: 3, position: 'relative' },
  seatIdle: { opacity: 0.78 },
  seatRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, paddingLeft: 4, paddingRight: 10, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.2)', position: 'relative' },
  seatRowActive: { backgroundColor: 'rgba(241,198,109,0.16)' },
  avatarHalo: { borderWidth: 3, borderColor: 'transparent', position: 'relative' },
  avatarHaloActive: { borderColor: 'rgba(241,198,109,0.35)' },
  avatarRing: { borderWidth: 3, borderColor: 'transparent' },
  avatarRingActive: { borderColor: '#F1C66D' },
  openedBadge: { position: 'absolute', left: -2, bottom: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: '#3FB57E', alignItems: 'center', justifyContent: 'center' },
  seatCopy: { alignItems: 'center', gap: 0, maxWidth: '100%' },
  seatCopyRow: { flexShrink: 1, gap: 1 },
  seatName: { color: p.cream, fontSize: 12, fontWeight: '800' },
  seatStats: { color: 'rgba(248,241,223,0.72)', fontSize: 11, fontWeight: '700' },
  seatStatsWarn: { color: '#FFD7B0' },
  initialAvatar: { alignItems: 'center', justifyContent: 'center' },
  initialAvatarText: { color: '#10251B', fontWeight: '900' },
  seatStatus: { color: '#FFD7B0', fontSize: 10, fontWeight: '700' },

  tableFixed: { paddingHorizontal: 14, paddingTop: 8, gap: 10 },
  tableScroll: { flex: 1 }, table: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 14, flexGrow: 1 },
  landscapeMiddle: { flex: 1, flexDirection: 'row', gap: 14, paddingHorizontal: 14, paddingTop: 2, paddingBottom: 6 },
  seatColumn: { width: 150, flexGrow: 0 }, seatColumnTablet: { width: 220 }, seatColumnContent: { gap: 8, paddingVertical: 2 },
  centerColumn: { alignItems: 'center', justifyContent: 'center', gap: 8, minWidth: 170 },
  meldColumn: { flex: 1 }, meldColumnContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 4 },

  piles: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22, paddingTop: 4, paddingBottom: 6 },
  stock: { position: 'relative', paddingRight: 6, paddingBottom: 6 },
  stockLayer: { position: 'absolute' },
  stockCount: { position: 'absolute', right: -6, bottom: -4, minWidth: 28, textAlign: 'center', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, overflow: 'hidden', backgroundColor: '#0A2A1D', color: p.cream, fontSize: 11, fontWeight: '900' },
  discard: { alignItems: 'center', borderRadius: 11, padding: 4 },
  discardReady: { backgroundColor: 'rgba(241,198,109,0.18)', boxShadow: '0 0 24px rgba(241,198,109,0.55)' },
  discardDropActive: { backgroundColor: 'rgba(241,198,109,0.35)' },
  pileLabel: { position: 'absolute', bottom: -18, width: 150, textAlign: 'center', color: '#F1C66D', fontSize: 9, letterSpacing: 0.8, fontWeight: '900' },
  empty: { width: SMALL_CARD_WIDTH, height: SMALL_CARD_HEIGHT, borderRadius: 7, backgroundColor: 'rgba(0,0,0,0.2)' },
  emptyTablet: { width: TABLET_SMALL_CARD_WIDTH, height: TABLET_SMALL_CARD_HEIGHT },

  turnPill: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 36, paddingHorizontal: 16, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.28)' },
  turnPillMine: { backgroundColor: '#F1C66D', boxShadow: '0 6px 22px rgba(241,198,109,0.45)' },
  turnText: { color: '#E8D0A1', fontSize: 13, fontWeight: '800', flexShrink: 1, paddingVertical: 8, textAlign: 'center' },
  turnTextMine: { color: p.ink, fontWeight: '900' },
  timer: { minWidth: 26, height: 26, paddingHorizontal: 6, borderRadius: 13, backgroundColor: '#0B2419', alignItems: 'center', justifyContent: 'center' },
  timerUrgent: { backgroundColor: '#a64048' }, timerText: { color: p.cream, fontSize: 12, fontWeight: '900' },
  penaltyBanner: { alignSelf: 'center', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#a6404855' },
  penaltyText: { color: '#ffd7d7', textAlign: 'center', fontSize: 12, fontWeight: '900' },
  botNotice: { padding: 10, borderRadius: 16, backgroundColor: 'rgba(241,198,109,0.14)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  botNoticeText: { color: p.cream, fontSize: 12, flex: 1 }, reclaimButton: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: p.gold }, reclaimText: { color: p.ink, fontSize: 12, fontWeight: '900' },
  claimCard: { alignSelf: 'center', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#0B2419', boxShadow: '0 8px 24px rgba(0,0,0,0.4), 0 0 0 1.5px rgba(241,198,109,0.6)' },
  claimCardRow: { flexDirection: 'row', paddingVertical: 8, gap: 14 },
  claimCopy: { alignItems: 'center', gap: 1 },
  claimCopyRow: { alignItems: 'flex-start' },
  claimTitle: { color: p.cream, fontSize: 15, fontWeight: '900', textAlign: 'center' },
  claimCaption: { color: '#FFD7B0', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  claimActions: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  claimPass: { minHeight: 44, minWidth: 104, paddingHorizontal: 16, borderRadius: 14, backgroundColor: 'rgba(248,241,223,0.1)', alignItems: 'center', justifyContent: 'center' },
  claimPassText: { color: p.cream, fontSize: 14, fontWeight: '800' },
  claimTake: { minHeight: 44, minWidth: 104, paddingHorizontal: 22, borderRadius: 14, backgroundColor: '#F1C66D', alignItems: 'center', justifyContent: 'center' },
  claimTakeText: { color: p.ink, fontSize: 14, fontWeight: '900' },

  melds: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-start', gap: 8, paddingBottom: 4 },
  meldsLandscape: { justifyContent: 'flex-start' },
  meld: { padding: 5, borderRadius: 12, borderWidth: 1.5, borderColor: 'transparent', backgroundColor: 'rgba(0,0,0,0.22)', gap: 4 },
  meldValid: { borderColor: 'rgba(120,214,160,0.75)' },
  meldInvalid: { backgroundColor: 'rgba(196,68,68,0.3)' },
  meldRow: { flexDirection: 'row', alignItems: 'center' },
  meldOwner: { position: 'absolute', left: -9, bottom: -9, zIndex: 2, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#0E3324' },
  meldOwnerText: { color: '#10251B', fontSize: 9, fontWeight: '900' },
  meldCards: { flexDirection: 'row' }, meldCard: { position: 'relative' },
  jokerBadge: { position: 'absolute', left: 3, right: 3, bottom: 3, borderRadius: 4, paddingVertical: 2, backgroundColor: '#071d17e8', color: p.gold, fontSize: 9, fontWeight: '900', textAlign: 'center', overflow: 'hidden' },

  reactionLayer: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  reactionBubbleEmoji: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: p.paper, boxShadow: '0 6px 16px rgba(0,0,0,0.45), 0 0 0 2px #D9A441' },
  reactionBubble: { maxWidth: '100%', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: p.paper, boxShadow: '0 6px 16px rgba(0,0,0,0.45), 0 0 0 2px #D9A441' },
  reactionEmoji: { fontSize: 28 }, reactionPhrase: { color: p.ink, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  reactionBackdrop: { flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' },
  reactionSheet: { width: '100%', maxWidth: 520, alignSelf: 'center', borderRadius: 26, borderWidth: 1, borderColor: 'rgba(217,164,65,0.35)', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18, gap: 14, boxShadow: '0 10px 30px rgba(0,0,0,0.5)' },
  reactionHandle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(248,241,223,0.25)' },
  reactionEmojiRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, padding: 6, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.06)' },
  reactionEmojiButton: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' }, reactionEmojiPressed: { backgroundColor: 'rgba(217,164,65,0.25)', transform: [{ scale: 1.15 }] }, reactionEmojiLarge: { fontSize: 32 },
  reactionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  reactionPhraseButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(217,164,65,0.55)', backgroundColor: 'rgba(217,164,65,0.08)', alignItems: 'center', justifyContent: 'center' }, reactionPhrasePressed: { backgroundColor: p.gold },
  reactionPhraseText: { color: p.cream, fontSize: 13, fontWeight: '700' }, reactionCaption: { color: p.muted, fontSize: 12, textAlign: 'center' },
  cancelZone: { position: 'absolute', top: 0, left: 0, right: 0, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d3327f2', boxShadow: '0 4px 18px rgba(0,0,0,0.4)' },
  cancelZoneText: { color: p.gold, fontSize: 12, fontWeight: '900' },

  panel: { flexShrink: 0, gap: 8, paddingTop: 12, paddingBottom: 8, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#0B2419', boxShadow: '0 -12px 40px rgba(0,0,0,0.45)', overflow: 'visible' },
  panelLandscape: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  panelDropActive: { backgroundColor: '#123527', boxShadow: '0 -12px 40px rgba(0,0,0,0.45), 0 -2px 0 #D9A441' },
  trayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  trayScroll: { flexGrow: 1, flexShrink: 1 }, trays: { gap: 8, alignItems: 'center', paddingVertical: 3, paddingHorizontal: 2 },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 16, borderWidth: 1.5, borderColor: 'transparent', backgroundColor: 'rgba(241,198,109,0.08)' },
  slotSelected: { backgroundColor: 'rgba(241,198,109,0.2)', borderColor: '#D9A441' },
  slotValid: { backgroundColor: 'rgba(63,181,126,0.28)', borderColor: 'rgba(143,227,180,0.7)' },
  slotInvalid: { backgroundColor: 'rgba(196,68,68,0.3)' },
  slotCards: { flexDirection: 'row', alignItems: 'center', minHeight: 52 },
  slotGhost: { width: 22, height: 52, borderRadius: 5, backgroundColor: 'rgba(248,241,223,0.1)' },
  slotGhostTablet: { width: 28, height: 65 },
  slotGhostSpaced: { marginLeft: 4 },
  slotCopy: { gap: 1 },
  slotLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  slotClear: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  trayBar: { flexGrow: 1, flexShrink: 1, minHeight: 67, marginVertical: 3, justifyContent: 'center', gap: 2, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1.5, borderColor: 'transparent', backgroundColor: 'rgba(241,198,109,0.08)' },
  trayBarTablet: { minHeight: 80 },
  trayBarDrop: { borderColor: '#D9A441', backgroundColor: 'rgba(241,198,109,0.18)' },
  trayBarHint: { color: p.cream, fontSize: 13, fontWeight: '800' },
  trayBarTask: { color: '#F1C66D', fontSize: 11, fontWeight: '800' },
  slotLabel: { color: p.cream, fontSize: 12, fontWeight: '800', maxWidth: 70 },
  slotCount: { color: '#F1C66D', fontSize: 11, fontWeight: '800' },
  slotCountInvalid: { color: '#ffb4b4' },
  openButton: { minHeight: 40, paddingHorizontal: 16, borderRadius: 13, backgroundColor: '#F1C66D', alignItems: 'center', justifyContent: 'center' },
  openRow: { paddingHorizontal: 14 },
  openButtonText: { color: p.ink, fontSize: 14, fontWeight: '900' },
  handColumn: { flex: 1, minWidth: 0 },
  sideColumn: { width: 220, gap: 6 }, sideColumnTablet: { width: 320 },
  handCards: { maxHeight: 210, overflow: 'visible' },
  handCardsTablet: { maxHeight: 260 },
  handScroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 2, flexGrow: 1, justifyContent: 'center' },
  rows: { gap: HAND_ROW_GAP }, cardRow: { flexDirection: 'row' },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 16 },
  meInline: { flexShrink: 1, position: 'relative', minHeight: 32, justifyContent: 'center' },
  toolChip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingHorizontal: 10, borderRadius: 16, backgroundColor: 'rgba(248,241,223,0.08)' },
  toolChipText: { color: p.cream, fontSize: 12, fontWeight: '800' },
  toolChipTextActive: { color: p.ink },
  meInfo: { flexShrink: 1, gap: 1, position: 'relative' }, meInfoLandscape: { width: 90 },
  meName: { color: p.cream, fontSize: 15, fontWeight: '900' },
  meStats: { color: 'rgba(248,241,223,0.65)', fontSize: 12, fontWeight: '700' },
  handTools: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 },
  sideFooter: { flexDirection: 'row', justifyContent: 'flex-end' },
  topBarCompact: { marginTop: -4, marginBottom: -4 },
  toolButton: { width: 46, height: 46, borderRadius: 15, backgroundColor: 'rgba(248,241,223,0.08)', alignItems: 'center', justifyContent: 'center' },
  toolButtonActive: { backgroundColor: '#F1C66D' },
  toastWrap: { position: 'absolute', left: 16, right: 16, bottom: '100%', marginBottom: 10, alignItems: 'center', gap: 6, zIndex: 20 },
  notice: { color: '#FFE2B8', fontSize: 12, fontWeight: '700', textAlign: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, overflow: 'hidden', backgroundColor: 'rgba(11,36,25,0.94)' },
  arrangeHint: { color: p.gold, fontSize: 12, fontWeight: '700', textAlign: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, overflow: 'hidden', backgroundColor: 'rgba(11,36,25,0.94)' },
  invisible: { opacity: 0 },
  actionText: { color: p.cream, fontSize: 13, fontWeight: '700' },
  menuMode: { color: '#80602b', fontSize: 10, letterSpacing: 1.4, fontWeight: '900', textAlign: 'center' },
  menuRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#ece4d1' },
  menuRowText: { color: '#253a2e', fontSize: 15, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: '#000b', justifyContent: 'center' }, sheetSide: { maxWidth: 780, maxHeight: '100%', flexDirection: 'row', padding: 16, gap: 16 },
  sheetSideInfo: { width: 230, justifyContent: 'center', gap: 10 }, sheet: { width: '100%', maxWidth: 480, maxHeight: '88%', alignSelf: 'center', backgroundColor: '#f5eedf', borderRadius: 23, padding: 25, gap: 14 },
  resultIcon: { textAlign: 'center', color: '#997431', fontSize: 36 }, resultTitle: { color: '#142c22', fontWeight: '800', fontSize: 25, textAlign: 'center' }, resultCaption: { color: '#59675f', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  resultList: { flexGrow: 0 }, resultListSide: { flexGrow: 1, flexShrink: 1, flexBasis: 0 }, resultListContent: { gap: 8 }, scoreBlock: { borderBottomWidth: 1, borderColor: '#d5cdbb', paddingBottom: 8 },
  score: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 }, scoreName: { color: '#253a2e', fontSize: 15 },
  scoreTotal: { alignItems: 'flex-end' }, scoreTotalLabel: { color: '#7b7568', fontSize: 8, letterSpacing: 0.8, fontWeight: '800' }, scoreValue: { fontWeight: '900', color: '#80602b', fontSize: 20 },
  historyTable: { borderWidth: 1, borderColor: '#d5cdbb', borderRadius: 12, overflow: 'hidden', marginBottom: 4 },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 8 }, historyRowAlt: { backgroundColor: '#ece4d1' },
  historyRound: { width: 44, color: '#7b7568', fontSize: 12, fontWeight: '700' }, historyCell: { flex: 1, textAlign: 'center', color: '#253a2e', fontSize: 14, fontVariant: ['tabular-nums'] },
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
