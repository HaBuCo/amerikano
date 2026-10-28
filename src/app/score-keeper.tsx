import { useTranslations } from '@/i18n/language';
import { Stack } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { cardScannerSupported, preloadCardScanner, scanCards } from '@/camera/card-scanner';
import { kit, PrimaryButton, ScreenHeader, Section, SecondaryButton, Segmented } from '@/components/screen-kit';
import { palette as p } from '@/constants/palette';
import { ROUND_CONTRACTS } from '@/game/contracts';
import {
  CARD_VALUES, CardValueKey, createScoreSheet, currentRound, playerTotals, ScoreSheet, setRoundScore, sheetWinners,
  sumCardValues, SCORE_KEEPER_MAX_PLAYERS, SCORE_KEEPER_MIN_PLAYERS,
} from '@/game/score-keeper';
import { loadScoreSheet, saveScoreSheet } from '@/game/score-keeper-store';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { hasRemovedAds, purchaseRemoveAds, subscribeRemoveAds } from '@/purchases/purchases';
import { MODAL_ORIENTATIONS } from '@/constants/orientation';

type Cell = { round: number; player: number };

export default function ScoreKeeperScreen() {
  const { t } = useTranslations();
  const { isTablet } = useResponsiveLayout();
  const [sheet, setSheet] = useState<ScoreSheet | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Cell | null>(null);

  useEffect(() => {
    let active = true;
    void loadScoreSheet().then((saved) => { if (active) { setSheet(saved); setLoaded(true); } });
    return () => { active = false; };
  }, []);

  function update(next: ScoreSheet | null) {
    setSheet(next);
    void saveScoreSheet(next);
  }

  function confirmNewMatch() {
    Alert.alert(t("Yeni maç başlasın mı?"), t("Bu cetveldeki bütün puanlar silinir."), [
      { text: t("Vazgeç"), style: 'cancel' },
      { text: t("Yeni maç"), style: 'destructive', onPress: () => update(null) },
    ]);
  }

  function saveCell(cell: Cell, score: number | null) {
    if (!sheet) return;
    const next = setRoundScore(sheet, cell.round, cell.player, score);
    update(next);
    // Aynı elde sıradaki boş hücreye geç; el dolduysa kapat.
    const row = next.rounds[cell.round];
    const following = row.findIndex((value, index) => index > cell.player && value === null);
    const first = following === -1 ? row.findIndex((value) => value === null) : following;
    setEditing(score !== null && first !== -1 ? { round: cell.round, player: first } : null);
  }

  return <SafeAreaView edges={['top', 'bottom']} style={kit.page}>
    <Stack.Screen options={{ headerShown: false }} />
    {!loaded ? null : sheet
      ? <SheetView sheet={sheet} isTablet={isTablet} onEdit={setEditing} onNewMatch={confirmNewMatch} />
      : <SetupView isTablet={isTablet} onStart={(names) => update(createScoreSheet(names))} />}
    {sheet && editing && <EntryModal key={`${editing.round}:${editing.player}`} sheet={sheet} cell={editing}
      onClose={() => setEditing(null)} onSave={(score) => saveCell(editing, score)} />}
  </SafeAreaView>;
}

function SetupView({ isTablet, onStart }: { isTablet: boolean; onStart: (names: string[]) => void }) {
  const { t } = useTranslations();
  const [names, setNames] = useState([t("Oyuncu 1"), t("Oyuncu 2"), t("Oyuncu 3"), t("Oyuncu 4")]);
  const counts = Array.from({ length: SCORE_KEEPER_MAX_PLAYERS - SCORE_KEEPER_MIN_PLAYERS + 1 }, (_, i) => i + SCORE_KEEPER_MIN_PLAYERS);

  function resize(count: number) {
    setNames((current) => Array.from({ length: count }, (_, i) => current[i] ?? t("Oyuncu {0}", [i + 1])));
  }

  return <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={[kit.content, isTablet && kit.contentTablet, s.content]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    <ScreenHeader title={t("Skor tutucu")} subtitle={t("Gerçek kartlarla oynarken her elin sonunda kalan kartları gir; toplamları ve lideri cetvel hesaplar.")} />
    <Segmented label={t("Oyuncu sayısı")} value={names.length} onChange={resize}
      choices={counts.map((count) => ({ value: count, label: String(count) }))} />
    <Section title={t("MASADA KİMLER VAR?")}>
      {names.map((name, index) => <View key={index} style={[s.inputRow, index < names.length - 1 && s.inputDivider]}>
        <Text style={s.numberText}>{index + 1}</Text>
        <TextInput accessibilityLabel={t("{0}. oyuncunun adı", [index + 1])} autoCapitalize="words" maxLength={18}
          onChangeText={(value) => setNames((current) => current.map((item, i) => i === index ? value : item))}
          placeholder={t("Oyuncu adı")} placeholderTextColor="#809487" returnKeyType="done" style={s.input} value={name} />
      </View>)}
    </Section>
    <PrimaryButton icon="score" label={t("Cetveli aç")} onPress={() => onStart(names.map((name, i) => name.trim() || t("Oyuncu {0}", [i + 1])))} />
  </KeyboardAwareScrollView>;
}

function SheetView({ sheet, isTablet, onEdit, onNewMatch }: { sheet: ScoreSheet; isTablet: boolean; onEdit: (cell: Cell) => void; onNewMatch: () => void }) {
  const { t } = useTranslations();
  const totals = playerTotals(sheet);
  const round = currentRound(sheet);
  const winners = sheetWinners(sheet);
  const leader = Math.min(...totals);
  const anyScore = sheet.rounds.some((row) => row.some((cell) => cell !== null));

  return <ScrollView contentContainerStyle={[kit.content, isTablet && kit.contentTablet, s.content]} showsVerticalScrollIndicator={false}>
    <ScreenHeader
      title={winners.length
        ? t("{0} kazandı!", [winners.map((i) => sheet.players[i]).join(' & ')])
        : round === null ? t("Skor tutucu") : t("{0}. el · {1}", [round + 1, t(ROUND_CONTRACTS[round].shortTitle)])}
      subtitle={winners.length ? t("12 el tamamlandı. En düşük toplam puan kazandı.") : t("Bir hücreye dokunup o oyuncunun elinde kalan kartları gir.")}
      right={<SecondaryButton icon="restore" label={t("Yeni maç")} onPress={onNewMatch} style={s.newMatch} />} />

    <View style={s.table}>
      <View style={s.row}>
        <View style={[s.roundCell, s.headerCell]}><Text style={s.headerText}>{t("EL")}</Text></View>
        {sheet.players.map((name, i) => <View key={i} style={[s.cell, s.headerCell]}><Text numberOfLines={1} style={s.headerText}>{name}</Text></View>)}
      </View>
      <View style={[s.row, s.totalRow]}>
        <View style={s.roundCell}><Text style={s.headerText}>{t("TOPLAM")}</Text></View>
        {totals.map((total, i) => <View key={i} style={s.cell}>
          <Text style={[s.totalText, anyScore && total === leader && s.totalLeader]}>{total}</Text>
        </View>)}
      </View>
      {sheet.rounds.map((row, r) => <View key={r} style={[s.row, r === round && s.rowCurrent]}>
        <View style={s.roundCell}>
          <Text style={s.roundNumber}>{String(r + 1).padStart(2, '0')}</Text>
          <Text numberOfLines={1} style={s.roundTitle}>{t(ROUND_CONTRACTS[r].shortTitle)}</Text>
        </View>
        {row.map((value, player) => <Pressable key={player} accessibilityRole="button"
          accessibilityLabel={t("{0}, {1}. el: {2}", [sheet.players[player], r + 1, value ?? '—'])}
          onPress={() => onEdit({ round: r, player })} style={({ pressed }) => [s.cell, pressed && s.cellPressed]}>
          <Text style={[s.cellText, value === 0 && s.cellZero, value === null && s.cellEmpty]}>{value === null ? '·' : value}</Text>
        </Pressable>)}
      </View>)}
    </View>
  </ScrollView>;
}

function EntryModal({ sheet, cell, onClose, onSave }: { sheet: ScoreSheet; cell: Cell; onClose: () => void; onSave: (score: number | null) => void }) {
  const { t } = useTranslations();
  const safeArea = useSafeAreaInsets();
  const existing = sheet.rounds[cell.round][cell.player];
  const [cards, setCards] = useState<CardValueKey[]>([]);
  const [typed, setTyped] = useState(existing === null ? '' : String(existing));
  // Kart eklenince toplam kartlardan gelir; elle yazılan sayı ise kartları siler.
  const score = cards.length ? sumCardValues(cards) : typed.trim() === '' ? null : Number(typed);
  const valid = score === null || Number.isInteger(score);
  const ownsRemoveAds = useSyncExternalStore(subscribeRemoveAds, hasRemovedAds, hasRemovedAds);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState('');
  const { isPhoneLandscape: side } = useResponsiveLayout();

  useEffect(() => { if (cardScannerSupported && ownsRemoveAds) preloadCardScanner(); }, [ownsRemoveAds]);

  async function scan(source: 'camera' | 'library') {
    if (!ownsRemoveAds) {
      Alert.alert(t("Kamerayla okuma reklamsız sürümde"), t("Reklamsız sürümü alınca kartların fotoğrafını çekip puanı otomatik hesaplayabilirsin."), [
        { text: t("Vazgeç"), style: 'cancel' },
        { text: t("Reklamsız sürümü al"), onPress: () => { void purchaseRemoveAds(); } },
      ]);
      return;
    }
    setScanning(true);
    setScanNote('');
    const result = await scanCards(source);
    setScanning(false);
    if (result.status === 'cancelled') return;
    if (result.status === 'error') {
      setScanNote(result.reason === 'permission' ? t("Kamera izni verilmedi. Ayarlardan izin verebilirsin.") : t("Fotoğraf okunamadı, tekrar dene."));
      return;
    }
    setCards(result.cards);
    setScanNote(result.cards.length
      ? t("{0} kart bulundu. Eksik ya da fazla varsa düzelt.", [result.cards.length])
      : t("Kart bulunamadı. Köşeleri görünecek şekilde yayıp tekrar çek."));
  }

  const actions = <View style={s.sheetActions}>
    <Pressable accessibilityRole="button" onPress={existing === null ? onClose : () => onSave(null)} style={s.secondary}>
      <Text style={s.secondaryText}>{existing === null ? t("Vazgeç") : t("Hücreyi temizle")}</Text>
    </Pressable>
    <Pressable accessibilityRole="button" disabled={score === null || !valid} onPress={() => onSave(score)}
      style={[s.save, (score === null || !valid) && s.disabled]}>
      <Text style={s.saveText}>{t("Kaydet")}</Text>
    </Pressable>
  </View>;

  return <Modal supportedOrientations={MODAL_ORIENTATIONS} visible transparent animationType="fade" onRequestClose={onClose}>
    {/* Android draws modals edge to edge; keep the sheet clear of the system bars. */}
    <View style={[s.backdrop, {
      paddingTop: (side ? 10 : 18) + safeArea.top, paddingBottom: (side ? 10 : 18) + safeArea.bottom,
      paddingLeft: 18 + safeArea.left, paddingRight: 18 + safeArea.right,
    }]}>
      {/* A sideways phone cannot fit the sheet's height, so the card values move beside the score. */}
      <View style={[s.sheet, side && s.sheetSide]}>
        <View style={[s.sheetColumn, side && s.sheetColumnSide]}>
          <Text style={s.sheetEyebrow}>{t("{0}. EL · {1}", [cell.round + 1, t(ROUND_CONTRACTS[cell.round].shortTitle)])}</Text>
          <Text style={s.sheetTitle}>{sheet.players[cell.player]}</Text>

          <View style={s.scoreBox}>
            <TextInput accessibilityLabel={t("Puan")} keyboardType="number-pad" maxLength={4} placeholder="—" placeholderTextColor="#9a9384"
              value={cards.length ? String(score) : typed} onChangeText={(value) => { setCards([]); setTyped(value.replace(/[^0-9]/g, '')); }}
              style={s.scoreInput} />
            <Text style={s.scoreUnit}>{t("puan")}</Text>
          </View>

          <Pressable accessibilityRole="button" onPress={() => onSave(0)} style={({ pressed }) => [s.finishButton, pressed && s.pressed]}>
            <Text style={s.finishText}>{t("Eli bitirdi · 0")}</Text>
          </Pressable>

          {cardScannerSupported && <View style={s.scanRow}>
            <Pressable accessibilityRole="button" disabled={scanning} onPress={() => { void scan('camera'); }} style={({ pressed }) => [s.scanButton, pressed && s.pressed]}>
              {scanning ? <ActivityIndicator color={p.cream} /> : <Text style={s.scanText}>{t("Kamerayla oku")}{ownsRemoveAds ? '' : ' 🔒'}</Text>}
            </Pressable>
            <Pressable accessibilityRole="button" disabled={scanning} onPress={() => { void scan('library'); }} style={s.scanGallery}>
              <Text style={s.scanGalleryText}>{t("Galeriden")}</Text>
            </Pressable>
          </View>}
          {!!scanNote && <Text style={s.scanNote}>{scanNote}</Text>}
          {side && actions}
        </View>
        <ScrollView style={side && s.valuesSide} contentContainerStyle={s.sheetColumn} showsVerticalScrollIndicator={false}>
          <Text style={s.chipsLabel}>{t("ELİNDE KALAN KARTLAR")}</Text>
          <View style={s.values}>
            {CARD_VALUES.map((value) => <Pressable key={value.key} accessibilityRole="button" accessibilityLabel={t("{0} ekle", [value.label])}
              onPress={() => setCards((current) => [...current, value.key])} style={({ pressed }) => [s.value, value.key === 'joker' && s.valueWide, pressed && s.valuePressed]}>
              <Text style={s.valueLabel}>{value.key === 'joker' ? t("Joker") : value.label}</Text>
              <Text style={s.valuePoints}>{value.points}</Text>
            </Pressable>)}
          </View>
          {cards.length > 0 && <View style={s.picked}>
            {cards.map((key, i) => <Pressable key={i} accessibilityRole="button" accessibilityLabel={t("{0} çıkar", [key])}
              onPress={() => setCards((current) => current.filter((_, index) => index !== i))} style={s.pickedChip}>
              <Text style={s.pickedText}>{key === 'joker' ? '★' : key} ✕</Text>
            </Pressable>)}
          </View>}
        </ScrollView>
        {!side && actions}
      </View>
    </View>
  </Modal>;
}

const s = StyleSheet.create({
  content: { maxWidth: 680 },
  newMatch: { minHeight: 40, paddingHorizontal: 12 },
  inputRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 },
  inputDivider: { borderBottomWidth: 1, borderBottomColor: p.line },
  numberText: { width: 22, color: p.gold, fontSize: 15, fontWeight: '900', textAlign: 'center' },
  input: { flex: 1, color: p.cream, fontSize: 16, fontWeight: '700', paddingVertical: 12 },
  pressed: { opacity: 0.8 },
  table: { borderWidth: 1, borderColor: p.line, borderRadius: 18, overflow: 'hidden', backgroundColor: p.surface },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: p.line },
  rowCurrent: { backgroundColor: '#d9a44118' },
  roundCell: { width: 72, paddingHorizontal: 10, paddingVertical: 7, justifyContent: 'center' },
  headerCell: { paddingVertical: 11 },
  headerText: { color: p.gold, fontSize: 10, letterSpacing: 0.8, fontWeight: '900' },
  roundNumber: { color: p.cream, fontSize: 14, fontWeight: '900' },
  roundTitle: { color: p.muted, fontSize: 8, marginTop: 1 },
  cell: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, paddingVertical: 7, borderLeftWidth: 1, borderLeftColor: p.line },
  cellPressed: { backgroundColor: '#ffffff12' },
  cellText: { color: p.cream, fontSize: 16, fontWeight: '800' },
  cellZero: { color: p.gold },
  cellEmpty: { color: '#ffffff40' },
  totalRow: { backgroundColor: '#00000033' },
  totalText: { color: p.cream, fontSize: 18, fontWeight: '900', paddingVertical: 4 },
  totalLeader: { color: p.gold },
  backdrop: { flex: 1, backgroundColor: '#000b', justifyContent: 'center' },
  sheet: { width: '100%', maxWidth: 480, maxHeight: '100%', alignSelf: 'center', backgroundColor: '#f5eedf', borderRadius: 23, padding: 22, gap: 12 },
  sheetSide: { maxWidth: 760, flexDirection: 'row', padding: 16, gap: 18 },
  sheetColumn: { gap: 12 }, sheetColumnSide: { width: 280, gap: 9 }, valuesSide: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  sheetEyebrow: { color: p.goldDark, fontSize: 10, letterSpacing: 2, fontWeight: '900' },
  sheetTitle: { color: p.ink, fontSize: 24, fontWeight: '900', marginTop: -6 },
  scoreBox: { flexDirection: 'row', alignItems: 'baseline', gap: 8, borderBottomWidth: 2, borderBottomColor: p.gold },
  scoreInput: { flex: 1, minWidth: 0, color: p.ink, fontSize: 44, fontWeight: '900', paddingVertical: 4 },
  scoreUnit: { color: '#6d6658', fontSize: 14, fontWeight: '700' },
  finishButton: { borderRadius: 12, borderWidth: 1.5, borderColor: '#143e2c', paddingVertical: 11, alignItems: 'center' },
  finishText: { color: '#143e2c', fontSize: 14, fontWeight: '900' },
  scanRow: { flexDirection: 'row', gap: 8 },
  scanButton: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: '#143e2c', alignItems: 'center', justifyContent: 'center' },
  scanText: { color: p.cream, fontSize: 14, fontWeight: '900' },
  scanGallery: { minHeight: 44, borderRadius: 12, paddingHorizontal: 14, backgroundColor: '#e6dcc5', alignItems: 'center', justifyContent: 'center' },
  scanGalleryText: { color: p.ink, fontSize: 13, fontWeight: '800' },
  scanNote: { color: '#6d6658', fontSize: 12, lineHeight: 17, marginTop: -4 },
  chipsLabel: { color: '#6d6658', fontSize: 10, letterSpacing: 1.5, fontWeight: '900', marginTop: 2 },
  values: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  value: { width: 50, height: 52, borderRadius: 10, backgroundColor: p.paper, borderWidth: 1, borderColor: '#d9cfb8', alignItems: 'center', justifyContent: 'center' },
  valueWide: { width: 107 },
  valuePressed: { backgroundColor: '#efe2c2' },
  valueLabel: { color: p.ink, fontSize: 17, fontWeight: '900' },
  valuePoints: { color: '#8a826f', fontSize: 9, fontWeight: '700' },
  picked: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pickedChip: { borderRadius: 999, backgroundColor: '#143e2c', paddingHorizontal: 10, paddingVertical: 5 },
  pickedText: { color: p.cream, fontSize: 12, fontWeight: '800' },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  secondary: { flex: 1, borderRadius: 12, paddingVertical: 15, alignItems: 'center', backgroundColor: '#e6dcc5' },
  secondaryText: { color: p.ink, fontSize: 14, fontWeight: '800' },
  save: { flex: 1, borderRadius: 12, paddingVertical: 15, alignItems: 'center', backgroundColor: '#143e2c' },
  saveText: { color: p.cream, fontSize: 14, fontWeight: '900' },
  disabled: { opacity: 0.35 },
});
