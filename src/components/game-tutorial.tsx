import { useTranslations } from '@/i18n/language';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { palette as p } from '@/constants/palette';

type Visual = 'goal' | 'turn' | 'melds' | 'contract' | 'after-open' | 'claim' | 'finish';
type Step = { eyebrow: string; title: string; body: string; points: string[]; tip: string; visual: Visual };

const steps: Step[] = [
  {
    eyebrow: 'AMAÇ',
    title: 'Az puanla bitir',
    body: 'Amerikano 12 el sürer. Her elde farklı bir açılış görevi tamamlanır; oyun sonunda en düşük toplam ceza puanı kazanır.',
    points: ['Elde kalan kartlar ceza yazar.', 'Eli erken bitirmek rakiplerine daha çok ceza bırakır.'],
    tip: 'Sayılar değeri kadar, J–Q–K 10, As 11, Joker 25 puandır.',
    visual: 'goal',
  },
  {
    eyebrow: 'SIRA AKIŞI',
    title: 'Çek, oyna, bir kart at',
    body: 'Sıran üç basit bölümden oluşur. Kartları dokunarak veya ilgili alana sürükleyerek oynayabilirsin.',
    points: ['Başlangıç oyuncusu 14 kartla başlar ve ilk turda kart çekmez.', 'Diğer sıralarda desteden ya da açık karttan bir kart seç.'],
    tip: 'Sıranı mutlaka elinden bir kartı açık kart alanına atarak bitir.',
    visual: 'turn',
  },
  {
    eyebrow: 'KART GRUPLARI',
    title: 'Küt ve seriyi ayır',
    body: 'Görevlerin tamamı iki temel kart grubundan oluşur.',
    points: ['Küt: aynı değer, farklı sembollerden en az 3 kart.', 'Seri: aynı sembolde ardışık en az 3 kart. As yalnızca Q–K–A sonunda kullanılır.'],
    tip: 'A–2–3 ve K–A–2 geçerli seri değildir.',
    visual: 'melds',
  },
  {
    eyebrow: 'ELİN GÖREVİ',
    title: 'Önce istenen görevi aç',
    body: 'Üst bölümde o elin görevi yazar. Kartlarını alttaki görev tepsilerine yerleştir; yeşile dönen geçerli grupları masaya aç.',
    points: ['İlk açılışın yalnızca görevde istenen gruplardan oluşur.', 'İlk 5 elde görevi açarken Joker kullanılamaz.'],
    tip: '“Görevi bul ve aç” düğmesi elindeki uygun kartları senin için arar.',
    visual: 'contract',
  },
  {
    eyebrow: 'AÇTIKTAN SONRA',
    title: 'Masaya kart işle',
    body: 'Görevini açtıktan sonraki sıralarda oyun hızlanır.',
    points: ['Yerdeki uygun küt ve serilere kart ekleyebilirsin.', 'En az 3 kartlık yeni küt veya seri açabilirsin.', 'Jokerin tam karşılığını koyup Jokeri eline alabilirsin.'],
    tip: 'Görevi açtığın aynı turda ek grup açamaz veya masaya kart işleyemezsin.',
    visual: 'after-open',
  },
  {
    eyebrow: 'AÇIK KART TEKLİFİ',
    title: '8 saniyelik karar ne?',
    body: '3 veya daha fazla oyunculu masada biri kapalı desteyi seçerse, yerdeki açık kart sırayla diğer oyunculara teklif edilir.',
    points: ['Alırsan açık kartla birlikte 1 kapalı ceza kartı da alırsın.', 'İstemiyorsan “Pas geç”; 8 saniye dolarsa sunucu otomatik pas verir.'],
    tip: 'İki kişilik oyunda bu teklif hiç açılmaz.',
    visual: 'claim',
  },
  {
    eyebrow: 'ELİ BİTİR',
    title: 'Son kartını kapalı at',
    body: 'Elindeki kartları bitiren oyuncu eli kapatır; diğer herkesin elinde kalan kartları ceza puanına dönüşür.',
    points: ['İşlenebilen bir kartı açık atmak ayrıca +25 ceza verir.', '12. elde bütün elini tek hamlede gruplandırıp “Elden bit” ile tamamla.'],
    tip: 'Takıldığında masanın üstündeki ? düğmesi o elin görevini ve hızlı kuralları gösterir.',
    visual: 'finish',
  },
];

function MiniCard({ value, suit }: { value: string; suit: string }) {
  const red = suit === '♥' || suit === '♦';
  return <View style={s.miniCard}><Text style={[s.miniValue, red && s.red]}>{value}</Text><Text style={[s.miniSuit, red && s.red]}>{suit}</Text></View>;
}

function FlowBox({ number, label }: { number: string; label: string }) {
  return <View style={s.flowBox}><Text style={s.flowNumber}>{number}</Text><Text style={s.flowLabel}>{label}</Text></View>;
}

function TutorialVisual({ type, roundCount, claimSeconds }: { type: Visual; roundCount: number; claimSeconds: number }) {
  const { t } = useTranslations();
  if (type === 'goal') return <View style={s.scoreVisual}>
    <View style={s.scoreCard}><Text style={s.scoreLabel}>{t("İYİ EL")}</Text><Text style={s.scoreGood}>+0</Text></View>
    <Text style={s.visualArrow}>→</Text>
    <View style={s.scoreCard}><Text style={s.scoreLabel}>{t("ELDE JOKER")}</Text><Text style={s.scoreBad}>+25</Text></View>
  </View>;
  if (type === 'turn') return <View style={s.flow}>
    <FlowBox number="1" label={t("KART ÇEK")} /><Text style={s.visualArrow}>›</Text><FlowBox number="2" label={t("OYNA")} /><Text style={s.visualArrow}>›</Text><FlowBox number="3" label={t("KART AT")} />
  </View>;
  if (type === 'melds') return <View style={s.meldVisual}>
    <View style={s.exampleRow}><Text style={s.exampleLabel}>{t("KÜT")}</Text><MiniCard value="7" suit="♥" /><MiniCard value="7" suit="♣" /><MiniCard value="7" suit="♠" /></View>
    <View style={s.exampleRow}><Text style={s.exampleLabel}>{t("SERİ")}</Text><MiniCard value="4" suit="♦" /><MiniCard value="5" suit="♦" /><MiniCard value="6" suit="♦" /></View>
  </View>;
  if (type === 'contract') return <View style={s.contractVisual}>
    <Text style={s.contractLabel}>{t("EL 5 GÖREVİ")}</Text><Text style={s.contractTitle}>{t("3’lü küt + seri")}</Text>
    <View style={s.trayRow}><View style={s.tray}><Text style={s.trayText}>{t("KÜT · 3/3 ✓")}</Text></View><View style={s.tray}><Text style={s.trayText}>{t("SERİ · 3/3 ✓")}</Text></View></View>
  </View>;
  if (type === 'after-open') return <View style={s.flow}>
    <FlowBox number="✓" label={t("AÇ")} /><Text style={s.visualArrow}>›</Text><FlowBox number="+" label={t("İŞLE")} /><Text style={s.visualArrow}>›</Text><FlowBox number="3+" label={t("YENİ GRUP")} />
  </View>;
  if (type === 'claim') return <View style={s.claimVisual}>
    <MiniCard value="9" suit="♠" /><View style={s.claimCopy}><Text style={s.claimTitle}>{t("Açık kartı al?")}</Text><Text style={s.claimPenalty}>{t("+ 1 kapalı ceza kartı")}</Text></View><View style={s.clock}><Text style={s.clockText}>{claimSeconds}</Text></View>
  </View>;
  return <View style={s.finishVisual}><Text style={s.finishNumber}>{roundCount}</Text><View><Text style={s.finishLabel}>{t("EL TAMAMLANINCA")}</Text><Text style={s.finishTitle}>{t("En düşük puan kazanır")}</Text></View></View>;
}

export function GameTutorial({ visible, onDone, roundCount = 12, claimsEnabled = true, claimSeconds = 8, jokerRestrictionRounds = 5, playableDiscardPenalty = true }: { visible: boolean; onDone: () => void; roundCount?: number; claimsEnabled?: boolean; claimSeconds?: number; jokerRestrictionRounds?: 0 | 4 | 5; playableDiscardPenalty?: boolean }) {
  const { t } = useTranslations();
  const [step, setStep] = useState(0);
  const adaptedSteps = steps.map(item => {
    if (item.visual === 'goal') return { ...item, body: t("Bu oyun {0} el sürer. Her elde farklı bir açılış görevi tamamlanır; oyun sonunda en düşük toplam ceza puanı kazanır.", [roundCount]) };
    if (item.visual === 'contract') return { ...item, points: [item.points[0], jokerRestrictionRounds ? t("İlk {0} klasik görevde açılış yaparken Joker kullanılamaz.", [jokerRestrictionRounds]) : t("Bu oyunda açılış görevlerinde Joker kullanabilirsin.")] };
    if (item.visual === 'claim') return claimsEnabled
      ? { ...item, points: [item.points[0], t("İstemiyorsan “Pas geç”; {0} saniye dolarsa oyun otomatik pas verir.", [claimSeconds])] }
      : { ...item, body: t("Bu oyunda açık kart teklifi kapalı. Kapalı desteden çekildiğinde yerdeki kart diğer oyunculara sorulmaz."), points: [t("Teklif, oyun kurulurken Gelişmiş ayarlardan açılabilir."), t("İki kişilik oyunda teklif her zaman kapalıdır.")] };
    if (item.visual === 'finish') return { ...item, points: [playableDiscardPenalty ? t("İşlenebilen bir kartı açık atmak ayrıca +25 ceza verir.") : t("Bu oyunda işlek kart cezası kapalıdır."), t("{0}. elde bütün elini tek hamlede gruplandırıp “Elden bit” ile tamamla.", [roundCount])] };
    return item;
  });
  const current = adaptedSteps[step];
  const finish = () => { setStep(0); onDone(); };

  return <Modal visible={visible} animationType="fade" onRequestClose={finish}>
    <SafeAreaView style={s.page}>
      <View style={s.topRow}>
        <View><Text style={s.eyebrow}>{t("AMERİKANO AKADEMİSİ")}</Text><Text style={s.topCaption}>{t("İlk elden önce 2 dakikalık rehber")}</Text></View>
        <Pressable accessibilityRole="button" onPress={finish}><Text style={s.skip}>{t("Geç")}</Text></Pressable>
      </View>
      <View style={s.progress}>{adaptedSteps.map((_, index) => <View key={index} style={[s.progressItem, index <= step && s.progressActive]} />)}</View>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.visualBox}><TutorialVisual type={current.visual} roundCount={roundCount} claimSeconds={claimSeconds} /></View>
        <Text style={s.counter}>{String(step + 1).padStart(2, '0')} / {String(adaptedSteps.length).padStart(2, '0')} · {t(current.eyebrow)}</Text>
        <Text style={s.title}>{t(current.title)}</Text>
        <Text style={s.body}>{t(current.body)}</Text>
        <View style={s.points}>{current.points.map((point, index) => <View key={t(point)} style={s.pointRow}><Text style={s.pointNumber}>{index + 1}</Text><Text style={s.pointText}>{t(point)}</Text></View>)}</View>
        <View style={s.tip}><Text style={s.tipLabel}>{t("AKLINDA KALSIN")}</Text><Text style={s.tipText}>{t(current.tip)}</Text></View>
      </ScrollView>
      <View style={s.actions}>
        {step > 0 && <Pressable accessibilityRole="button" style={s.secondary} onPress={() => setStep(value => value - 1)}><Text style={s.secondaryText}>{t("Geri")}</Text></Pressable>}
        <Pressable accessibilityRole="button" style={s.primary} onPress={() => step === adaptedSteps.length - 1 ? finish() : setStep(value => value + 1)}>
          <Text style={s.primaryText}>{step === adaptedSteps.length - 1 ? t("Masaya otur") : t("Devam")}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  </Modal>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#09271e', paddingHorizontal: 22, paddingTop: 14, paddingBottom: 18 },
  topRow: { width: '100%', maxWidth: 720, alignSelf: 'center', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: p.gold, fontSize: 11, letterSpacing: 2.2, fontWeight: '900' }, topCaption: { color: p.muted, fontSize: 11, marginTop: 5 }, skip: { color: p.cream, fontSize: 14, padding: 10 },
  progress: { width: '100%', maxWidth: 720, alignSelf: 'center', flexDirection: 'row', gap: 6, marginTop: 14 }, progressItem: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#ffffff20' }, progressActive: { backgroundColor: p.gold },
  scroll: { flex: 1 }, content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingVertical: 20, gap: 13 },
  visualBox: { minHeight: 150, borderRadius: 22, borderWidth: 1, borderColor: p.line, backgroundColor: '#ffffff08', padding: 16, alignItems: 'center', justifyContent: 'center' },
  counter: { color: p.gold, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 }, title: { color: p.cream, fontSize: 30, lineHeight: 35, fontWeight: '900', letterSpacing: -0.5 },
  body: { color: '#c4d2c9', fontSize: 15, lineHeight: 23 }, points: { gap: 9 }, pointRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, pointNumber: { width: 23, height: 23, borderRadius: 12, textAlign: 'center', paddingTop: 3, overflow: 'hidden', backgroundColor: '#d9a44124', color: p.gold, fontSize: 11, fontWeight: '900' }, pointText: { color: p.cream, fontSize: 14, lineHeight: 21, flex: 1 },
  tip: { borderLeftWidth: 3, borderLeftColor: p.gold, paddingLeft: 12, paddingVertical: 4 }, tipLabel: { color: p.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 }, tipText: { color: p.muted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  actions: { flexDirection: 'row', gap: 10, width: '100%', maxWidth: 720, alignSelf: 'center', paddingTop: 10 },
  primary: { flex: 2, minHeight: 54, borderRadius: 14, backgroundColor: p.gold, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: p.ink, fontSize: 16, fontWeight: '900' },
  secondary: { flex: 1, minHeight: 54, borderRadius: 14, borderWidth: 1, borderColor: p.line, alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: p.cream, fontSize: 15, fontWeight: '800' },
  miniCard: { width: 43, height: 58, borderRadius: 6, backgroundColor: '#fffaf0', borderWidth: 1, borderColor: '#d5cdbb', padding: 5, alignItems: 'center', justifyContent: 'center' }, miniValue: { color: '#17211c', fontSize: 16, fontWeight: '900' }, miniSuit: { color: '#17211c', fontSize: 16 }, red: { color: '#b83942' },
  visualArrow: { color: p.gold, fontSize: 24, fontWeight: '700' }, scoreVisual: { flexDirection: 'row', alignItems: 'center', gap: 13 }, scoreCard: { minWidth: 105, borderRadius: 13, padding: 13, alignItems: 'center', backgroundColor: '#0d3327', borderWidth: 1, borderColor: p.line }, scoreLabel: { color: p.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1 }, scoreGood: { color: '#79c99a', fontSize: 28, fontWeight: '900', marginTop: 5 }, scoreBad: { color: '#f08080', fontSize: 28, fontWeight: '900', marginTop: 5 },
  flow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, flowBox: { width: 78, minHeight: 68, borderRadius: 12, backgroundColor: '#0d3327', borderWidth: 1, borderColor: p.line, alignItems: 'center', justifyContent: 'center', padding: 7 }, flowNumber: { color: p.gold, fontSize: 20, fontWeight: '900' }, flowLabel: { color: p.cream, fontSize: 9, fontWeight: '900', marginTop: 5, textAlign: 'center' },
  meldVisual: { gap: 10 }, exampleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 }, exampleLabel: { color: p.gold, width: 42, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  contractVisual: { width: '100%', gap: 9, alignItems: 'center' }, contractLabel: { color: p.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 }, contractTitle: { color: p.cream, fontSize: 20, fontWeight: '900' }, trayRow: { flexDirection: 'row', gap: 8, width: '100%' }, tray: { flex: 1, minHeight: 55, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: '#79c99a', backgroundColor: '#3b9b6922', alignItems: 'center', justifyContent: 'center' }, trayText: { color: '#9fe0b8', fontSize: 10, fontWeight: '900' },
  claimVisual: { flexDirection: 'row', alignItems: 'center', gap: 12 }, claimCopy: { gap: 4 }, claimTitle: { color: p.cream, fontSize: 17, fontWeight: '900' }, claimPenalty: { color: p.muted, fontSize: 11 }, clock: { width: 42, height: 42, borderRadius: 21, backgroundColor: p.red, alignItems: 'center', justifyContent: 'center' }, clockText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  finishVisual: { flexDirection: 'row', alignItems: 'center', gap: 16 }, finishNumber: { color: p.gold, fontSize: 62, lineHeight: 67, fontWeight: '900' }, finishLabel: { color: p.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 }, finishTitle: { color: p.cream, fontSize: 18, fontWeight: '900', marginTop: 5 },
});
