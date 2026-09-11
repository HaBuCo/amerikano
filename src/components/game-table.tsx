import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { palette as p } from '@/constants/palette';
import { PlayingCard } from './playing-card';
import { PrivateGameView } from '@/game/view';
import { GameAction, MeldType } from '@/game/types';
import { ROUND_CONTRACTS } from '@/game/contracts';
import { isValidMeld } from '@/game/engine';
import { GameSound, useGameSounds } from '@/audio/game-sounds';
import { arrangeHand, loadHandOrder, moveCardBefore, reconcileHandOrder, saveHandOrder } from '@/game/hand-order';

type Props = {
  game: PrivateGameView; viewerId: string; modeLabel: string; blocked?: boolean;
  canAdvance?: boolean; error?: string; onAction: (a: GameAction) => void; onExit: () => void;
};
type Pending = { type: MeldType; cardIds: string[] };
export function GameTable({ game, viewerId, modeLabel, blocked, canAdvance = true, error, onAction, onExit }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [notice, setNotice] = useState('');
  const [exitOpen, setExitOpen] = useState(false);
  const [scoresOpen, setScoresOpen] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [pickedCardId, setPickedCardId] = useState<string | null>(null);
  const { enabled: soundEnabled, toggle: toggleSound, play: playSound } = useGameSounds();
  const previousPhase = useRef(game.phase);
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const me = game.players.find(player => player.id === viewerId)!;
  const orderKey = `${modeLabel}:${game.roundIndex}:${viewerId}`;
  const handSignature = me.hand.map((card) => card.id).join('|');
  const [handOrder, setHandOrder] = useState(() => me.hand.map((card) => card.id));
  const loadedOrderKey = useRef('');
  const current = game.players[game.currentPlayerIndex];
  const myTurn = current.id === viewerId && !blocked;
  const playing = myTurn && game.phase === 'play';
  const drawing = myTurn && game.phase === 'draw';
  const claiming = game.phase === 'claim' && game.claim?.playerIds[0] === viewerId && !blocked;
  const claimPlayer = game.players.find(pl => pl.id === game.claim?.playerIds[0]);
  const openedThisTurn = me.openedTurn === game.turnCount;
  const stagedIds = new Set(pending.flatMap(g => g.cardIds));
  const arrangedHand = arrangeHand(me.hand, handOrder);
  const cards = arrangedHand.filter(c => !stagedIds.has(c.id));
  const validSelected = selected.filter(id => cards.some(c => c.id === id));
  const contract = ROUND_CONTRACTS[game.roundIndex];
  const over = game.phase === 'round-over' || game.phase === 'game-over';
  const winners = game.players.filter(player => player.score === Math.min(...game.players.map(pl => pl.score)));
  const handWidth = landscape ? width * 0.46 - 36 : Math.min(width, 760) - 40;
  const step = Math.max(23, Math.min(55, (handWidth - 72) / 6));
  const rows = Array.from({ length: Math.ceil(cards.length / 7) }, (_, i) => cards.slice(i * 7, i * 7 + 7));

  useEffect(() => {
    if (previousPhase.current !== game.phase && (game.phase === 'round-over' || game.phase === 'game-over')) playSound('win');
    previousPhase.current = game.phase;
  }, [game.phase, playSound]);

  useEffect(() => {
    let active = true;
    if (loadedOrderKey.current !== orderKey) {
      loadedOrderKey.current = orderKey;
      setArranging(false); setPickedCardId(null);
      void loadHandOrder(orderKey).then((saved) => {
        if (active) setHandOrder(reconcileHandOrder(saved, me.hand));
      });
    } else {
      setHandOrder((current) => reconcileHandOrder(current, me.hand));
    }
    return () => { active = false; };
    // handSignature tracks draws/discards without depending on the mutable array.
  }, [orderKey, handSignature, me.hand]);

  function arrangeCard(cardId: string) {
    playSound('tap');
    if (!pickedCardId) { setPickedCardId(cardId); return; }
    if (pickedCardId === cardId) { setPickedCardId(null); return; }
    const next = moveCardBefore(arrangedHand.map((card) => card.id), pickedCardId, cardId);
    setHandOrder(next); setPickedCardId(null);
    void saveHandOrder(orderKey, next);
  }

  function toggleArrange() {
    playSound('tap');
    if (!arranging && pending.length) {
      setNotice('Elini dizmeden önce hazırladığın grupları geri al.');
      return;
    }
    setSelected([]); setPickedCardId(null); setNotice(''); setArranging((current) => !current);
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
  function stage(type: MeldType) {
    if (!playing) return;
    playSound('tap');
    const group = me.hand.filter(c => validSelected.includes(c.id));
    if (!isValidMeld(group, type)) {
      setNotice(type === 'set' ? 'Küt: aynı değer, farklı türler; 3 veya 4 kart.' : 'Seri: aynı türden ardışık en az 3 kart.'); return;
    }
    setPending([...pending, { type, cardIds: validSelected }]); setSelected([]); setNotice('');
  }
  function open() {
    if (!playing || !pending.length) return;
    if (contract.final) {
      if (cards.length !== 1) { setNotice('Final: tüm kartları gruplara ayır, ters atmak için yalnızca bir kart bırak.'); return; }
      act({ type: 'finish', groups: pending, discardId: cards[0].id });
    } else act({ type: 'open', groups: pending });
    setPending([]); setSelected([]);
  }
  function discard() {
    if (pending.length) { setNotice('Önce hazırladığın grupları aç veya geri al.'); return; }
    if (validSelected.length !== 1) { setNotice('Atmak için tek kart seç.'); return; }
    act({ type: 'discard', cardId: validSelected[0] }); setSelected([]);
  }
  function layoff(meldId: string) {
    if (!playing || !me.hasOpened) { setNotice('Kart işlemek için önce el görevini açmalısın.'); return; }
    if (openedThisTurn) { setNotice('Bu tur yalnızca görevini açabilirsin. İşleme sonraki sıranda serbest.'); return; }
    if (validSelected.length !== 1 || pending.length) { setNotice('Elinden bir kart seç, ardından masadaki gruba dokun.'); return; }
    act({ type: 'layoff', meldId, cardId: validSelected[0] }); setSelected([]);
  }
  function replaceJoker(meldId: string, jokerId: string) {
    if (!playing || !me.hasOpened) { setNotice('Jokeri almak için önce kendi görevini açmalısın.'); return; }
    if (openedThisTurn) { setNotice('Joker değiştirme işlemini açılıştan sonraki sıranda yapabilirsin.'); return; }
    if (validSelected.length !== 1 || pending.length) { setNotice('Elindeki tam karşılık kartını seç, sonra yerdeki jokere dokun.'); return; }
    act({ type: 'replaceJoker', meldId, jokerId, cardId: validSelected[0] }); setSelected([]);
  }
  return <SafeAreaView style={[s.page, landscape && s.pageLandscape]}>
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
        <View style={s.avatar}><Text style={s.avatarText}>{pl.name.charAt(0)}</Text></View>
        <View><Text numberOfLines={1} style={s.opponentName}>{pl.name}</Text><Text style={s.small}>{game.handCounts[pl.id]} kart · {pl.score} puan{pl.hasOpened ? ' · Açtı' : ''}</Text></View>
        <View style={{ marginLeft: 5 }}><PlayingCard hidden compact /></View>
      </View>)}
    </ScrollView>
    <View style={[s.playArea, landscape && s.playAreaLandscape]}>
    <ScrollView style={[s.tableScroll, landscape && s.tableScrollLandscape]} contentContainerStyle={s.table}>
      <View style={s.task}><Text style={s.eyebrow}>AÇILIŞ GÖREVİ</Text><Text style={s.taskTitle}>{contract.title}</Text>
        <Text style={s.small}>{me.hasOpened ? openedThisTurn ? 'Görev açıldı · İşleme sonraki sıranda' : 'Elini açtın · Masaya kart işleyebilirsin' : game.roundIndex < 5 ? 'Açılışta joker kullanılamaz' : 'Açılışta joker kullanılabilir'}</Text>
      </View>
      <View style={s.feltOval}>
        <View style={s.piles}>
          <Pressable accessibilityRole="button" accessibilityLabel="Desteden kart çek" disabled={!drawing || (!game.stockCount && !game.discard.length)} style={[s.pile, drawing && s.pileReady]} onPress={() => act({ type: 'draw', source: 'stock' })}>
            <View style={s.stackShadow} /><PlayingCard hidden /><Text style={s.pileLabel}>DESTE · {game.stockCount}</Text>
          </Pressable>
          <View style={s.tableMark}><Text style={s.tableA}>A</Text><Text style={s.tableBrand}>AMERİKANO</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Yerdeki kartı al" disabled={!drawing || !game.discard.length} style={[s.pile, drawing && s.pileReady]} onPress={() => act({ type: 'draw', source: 'discard' })}>
            {game.discardFaceDown ? <PlayingCard hidden /> : game.discard.length ? <PlayingCard card={game.discard.at(-1)} /> : <View style={s.empty} />}
            <Text style={s.pileLabel}>{game.discardFaceDown ? 'BİTİŞ KARTI · KAPALI' : 'AÇIK KART'}</Text>
          </Pressable>
        </View>
      </View>
      <Text style={s.turn}>{blocked ? 'Bağlantı / hamle bekleniyor…' : game.phase === 'claim' ? claiming ? 'Açık kartı 1 ceza kartıyla almak ister misin?' : `${claimPlayer?.name} açık kartı değerlendiriyor…` : myTurn ? drawing ? 'Sıra sende. Bir kart çek.' : 'Kartlarını seç, aç veya bir kart at.' : `${current.name} oynuyor…`}</Text>
      {claiming && <View style={s.actions}>
        <Pressable accessibilityRole="button" onPress={() => act({ type: 'claim', take: false })} style={s.secondary}><Text style={s.actionText}>Pas geç</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => act({ type: 'claim', take: true })} style={s.primary}><Text style={s.primaryText}>Al · +1 ceza kartı</Text></Pressable>
      </View>}
      {game.phase === 'claim' && modeLabel.includes('ÇEVRİM') && <Text style={s.small}>Yanıt süresi 8 saniye; yanıt verilmezse pas geçilir.</Text>}
      {game.melds.length > 0 ? <View style={s.melds}>
        {game.melds.map(m => <View key={m.id} style={s.meld}>
          <Text style={s.small}>{game.players.find(pl => pl.id === m.ownerId)?.name} · {m.type === 'set' ? 'Küt' : 'Seri'}</Text>
          <View style={s.meldCards}>{m.cards.map((c, i) => <View key={c.id} style={{ marginLeft: i ? -20 : 0 }}><PlayingCard card={c} compact onPress={c.isJoker ? () => replaceJoker(m.id, c.id) : undefined} /></View>)}</View>
          <Pressable accessibilityRole="button" accessibilityLabel={`${m.type === 'set' ? 'Küt' : 'Seri'} grubuna kart işle`} onPress={() => layoff(m.id)} style={s.meldAction}><Text style={s.gold}>Seçili kartı işle</Text></Pressable>
        </View>)}
      </View> : <Text style={s.emptyTable}>Açılan gruplar burada görünecek.</Text>}
    </ScrollView>
    <View style={[s.hand, landscape && s.handLandscape]}>
      <View style={s.handHeading}>
        <Text style={s.handName}>{me.name} <Text style={s.small}>· {me.hand.length} kart</Text></Text>
        <View style={s.handMeta}><Text style={s.small}>{me.score} puan</Text><Pressable accessibilityRole="button" accessibilityLabel={arranging ? 'Kart dizmeyi bitir' : 'Eli istediğin gibi diz'} onPress={toggleArrange} style={[s.arrangeButton, arranging && s.arrangeButtonActive]}><Text style={s.gold}>{arranging ? 'Bitti' : 'Eli diz'}</Text></Pressable></View>
      </View>
      {!!(notice || error) && <Text accessibilityLiveRegion="polite" style={s.notice}>{error || notice}</Text>}
      {arranging && <Text accessibilityLiveRegion="polite" style={s.arrangeHint}>{pickedCardId ? 'Şimdi taşımak istediğin konumdaki karta dokun.' : 'Taşımak için bir karta dokun.'}</Text>}
      {!!pending.length && <View style={s.pending}><ScrollView horizontal>{pending.map((g, i) => <Text key={i} style={s.pendingLabel}>{g.cardIds.length}’lü {g.type === 'set' ? 'küt' : 'seri'}  </Text>)}</ScrollView><Pressable onPress={() => { setPending([]); setSelected([]); }}><Text style={s.gold}>Geri al</Text></Pressable></View>}
      <ScrollView style={landscape ? s.handCardsLandscape : s.handCardsPortrait} contentContainerStyle={[s.handScroll, landscape && s.handScrollLandscape]}>
        <View style={s.rows}>{rows.map((row, index) => <View key={index} style={s.cardRow}>
          {row.map((c, i) => <View key={c.id} style={{ marginLeft: i ? step - 72 : 0, zIndex: i }}>
            <PlayingCard card={c} selected={arranging ? pickedCardId === c.id : validSelected.includes(c.id)} onPress={arranging ? () => arrangeCard(c.id) : playing ? () => { playSound('tap'); setSelected(old => old.includes(c.id) ? old.filter(id => id !== c.id) : [...old, c.id]); } : undefined} />
          </View>)}
        </View>)}</View>
      </ScrollView>
      <View style={[s.actions, arranging && s.actionsMuted]}>
        <Pressable accessibilityRole="button" disabled={!playing || arranging} onPress={() => stage('set')} style={[s.secondary, (!playing || arranging) && s.disabled]}><Text style={s.actionText}>Küt yap</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={!playing || arranging} onPress={() => stage('run')} style={[s.secondary, (!playing || arranging) && s.disabled]}><Text style={s.actionText}>Seri yap</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={!playing || arranging} onPress={pending.length ? open : discard} style={[s.primary, (!playing || arranging) && s.disabled]}><Text style={s.primaryText}>{pending.length ? contract.final ? 'Elden bit' : 'Yere aç' : 'Kart at'}</Text></Pressable>
      </View>
    </View>
    </View>
    <Modal visible={over || scoresOpen} transparent animationType="fade" onRequestClose={() => setScoresOpen(false)}>
      <View style={s.backdrop}><View style={s.sheet}>
        <Text style={s.resultIcon}>♛</Text>
        <Text style={s.resultTitle}>{game.phase === 'game-over' ? winners.map(w => w.name).join(' & ') + ' kazandı!' : game.phase === 'round-over' ? game.players.find(pl => pl.id === game.roundWinnerId)?.name + ' bitirdi!' : 'Puan tablosu'}</Text>
        <Text style={s.resultCaption}>En düşük toplam puan kazanır.</Text>
        {[...game.players].sort((a, b) => a.score - b.score).map((pl, i) => <View key={pl.id} style={s.score}><Text style={s.scoreName}>{i + 1}. {pl.name}</Text><Text style={s.scoreValue}>{pl.score}</Text></View>)}
        {over ? game.phase === 'game-over' ? <Pressable style={s.resultButton} onPress={onExit}><Text style={s.actionText}>Ana menü</Text></Pressable>
          : canAdvance ? <Pressable disabled={blocked} style={s.resultButton} onPress={() => { setPending([]); setSelected([]); act({ type: 'next' }); }}><Text style={s.actionText}>{game.roundIndex === 11 ? 'Sonucu gör' : 'Sonraki el'}</Text></Pressable>
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
  pageLandscape: { maxWidth: '100%' }, playArea: { flex: 1 }, playAreaLandscape: { flexDirection: 'row' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 9 },
  iconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: p.line, borderRadius: 20 },
  headerActions: { flexDirection: 'row', gap: 7 }, soundIcon: { color: p.gold, fontSize: 19, fontWeight: '800' },
  white: { color: p.cream, fontSize: 20 }, center: { alignItems: 'center', gap: 4, marginLeft: 45 }, eyebrow: { color: p.gold, fontSize: 9, letterSpacing: 2, fontWeight: '800' },
  round: { color: p.cream, fontWeight: '700', fontSize: 13 }, playersBar: { flexGrow: 0, maxHeight: 80, borderBottomWidth: 1, borderColor: p.line },
  players: { gap: 10, paddingHorizontal: 14, paddingVertical: 6 }, opponent: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, borderRadius: 12, borderWidth: 1, borderColor: 'transparent' },
  activeOpponent: { borderColor: p.gold, backgroundColor: '#d9a44115' }, avatar: { width: 31, height: 31, borderRadius: 16, backgroundColor: '#dcc48e', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontWeight: '800', color: p.felt }, opponentName: { color: p.cream, fontSize: 12, fontWeight: '700', maxWidth: 85 }, small: { fontSize: 10, color: '#adc4b6', lineHeight: 16 },
  tableScroll: { flex: 1 }, tableScrollLandscape: { borderRightWidth: 1, borderRightColor: '#dab77b50' }, table: { padding: 14, gap: 10, flexGrow: 1 }, task: { alignItems: 'center', gap: 4 },
  taskTitle: { color: p.cream, fontSize: 16, fontWeight: '700' },
  feltOval: { borderRadius: 110, backgroundColor: '#155a40', borderWidth: 5, borderColor: '#775935', paddingVertical: 13, boxShadow: 'inset 0 0 25px #0005, 0 5px 8px #0003' },
  piles: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 }, pile: { alignItems: 'center', gap: 6, borderRadius: 8, padding: 5 }, pileReady: { backgroundColor: '#ffe1a410' },
  stackShadow: { position: 'absolute', width: 72, height: 101, borderRadius: 6, backgroundColor: '#bda886', left: 8, top: 8, borderWidth: 1, borderColor: '#624a32' },
  pileLabel: { color: '#e1d2ad', fontSize: 8, letterSpacing: 1, fontWeight: '700' }, empty: { width: 72, height: 101, borderWidth: 1, borderColor: '#ffffff25', borderRadius: 6 },
  tableMark: { alignItems: 'center', opacity: 0.3 }, tableA: { color: '#e1d2ad', fontFamily: 'serif', fontSize: 32 }, tableBrand: { color: '#e1d2ad', fontSize: 7, letterSpacing: 2 },
  turn: { color: '#e8d0a1', fontSize: 12, textAlign: 'center', fontWeight: '600' }, emptyTable: { color: '#7f9d8c', textAlign: 'center', fontSize: 11, marginTop: 3 },
  melds: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, meld: { padding: 8, borderWidth: 1, borderColor: p.line, borderRadius: 10, gap: 4 }, meldCards: { flexDirection: 'row' },
  meldAction: { paddingTop: 3, minHeight: 25, justifyContent: 'center' },
  hand: { paddingTop: 10, paddingBottom: 8, borderTopWidth: 1, borderColor: '#dab77b50', backgroundColor: '#071d17' },
  handLandscape: { width: '46%', height: '100%', borderTopWidth: 0, paddingTop: 7 },
  handHeading: { flexDirection: 'row', paddingHorizontal: 18, justifyContent: 'space-between', alignItems: 'center' }, handName: { color: p.cream, fontSize: 15, fontWeight: '700' },
  handMeta: { flexDirection: 'row', alignItems: 'center', gap: 9 }, arrangeButton: { minHeight: 30, paddingHorizontal: 10, borderWidth: 1, borderColor: p.line, borderRadius: 9, justifyContent: 'center' }, arrangeButtonActive: { backgroundColor: '#d9a44120', borderColor: p.gold },
  handCardsPortrait: { maxHeight: 244 }, handCardsLandscape: { flex: 1 },
  handScroll: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 4, flexGrow: 1, justifyContent: 'center' }, handScrollLandscape: { paddingTop: 8 },
  rows: { gap: 8 }, cardRow: { flexDirection: 'row' }, actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 10 },
  secondary: { minHeight: 44, borderWidth: 1, borderColor: p.line, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flex: 1 },
  primary: { minHeight: 44, borderRadius: 11, backgroundColor: p.gold, alignItems: 'center', justifyContent: 'center', flex: 1.2 },
  actionText: { color: p.cream, fontSize: 13, fontWeight: '700' }, primaryText: { color: p.ink, fontSize: 14, fontWeight: '800' }, disabled: { opacity: 0.35 },
  notice: { color: '#ffc88a', paddingHorizontal: 18, marginTop: 6, fontSize: 12 }, arrangeHint: { color: p.gold, paddingHorizontal: 18, marginTop: 6, fontSize: 11 }, actionsMuted: { opacity: 0.35 }, pending: { flexDirection: 'row', marginHorizontal: 18, marginTop: 8, padding: 8, backgroundColor: '#d9a44118', borderRadius: 8 },
  pendingLabel: { color: p.cream, fontSize: 12 }, gold: { color: p.gold, fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: '#000b', justifyContent: 'center', padding: 24 }, sheet: { width: '100%', maxWidth: 480, alignSelf: 'center', backgroundColor: '#f5eedf', borderRadius: 23, padding: 25, gap: 14 },
  resultIcon: { textAlign: 'center', color: '#997431', fontSize: 36 }, resultTitle: { color: '#142c22', fontWeight: '800', fontSize: 25, textAlign: 'center' }, resultCaption: { color: '#59675f', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  score: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#d5cdbb' }, scoreName: { color: '#253a2e', fontSize: 15 }, scoreValue: { fontWeight: '800', color: '#80602b' },
  resultButton: { padding: 16, backgroundColor: '#143e2c', borderRadius: 12, alignItems: 'center' },
});
