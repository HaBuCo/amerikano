import { useTranslations } from '@/i18n/language';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Href, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { kit, PrimaryButton, ScreenHeader, Segmented } from '@/components/screen-kit';
import { palette } from '@/constants/palette';
import { CONTRACT_RUMMY_CONTRACTS, ROUND_CONTRACTS } from '@/game/contracts';
import type { GameVariant } from '@/game/types';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { selectedVariant, useGameSettings } from '@/settings/game-settings';

export default function RulesScreen() {
  const { t } = useTranslations();
  const { isTablet } = useResponsiveLayout();
  const { settings } = useGameSettings();
  // Settings load asynchronously: show the chosen game until a tab is tapped.
  const [picked, setVariant] = useState<GameVariant | null>(null);
  const variant = picked ?? selectedVariant(settings);
  return (
    <SafeAreaView edges={['top', 'bottom']} style={kit.page}>
      <ScrollView contentContainerStyle={[kit.content, styles.content, isTablet && kit.contentTablet]} showsVerticalScrollIndicator={false}>
        <ScreenHeader title={t("Nasıl oynanır?")} />
        <Segmented label={t("Oyun türü")} value={variant} onChange={setVariant} choices={[
          { value: 'amerikano', label: t("Amerikano") }, { value: 'rummy', label: t("Rummy") }, { value: 'contract', label: t("Contract") },
        ]} />
        <PrimaryButton icon="lessons" label={t("Eğitim")} caption={t("Kuralları kartlar elindeyken öğren")} onPress={() => router.push(`/lessons?variant=${variant}` as Href)} />
        {variant === 'contract' ? <ContractRules tablet={isTablet} /> : variant === 'rummy' ? <RummyRules tablet={isTablet} /> : <>
        <Text style={styles.intro}>{t("12 el boyunca görevleri tamamla, elini bitir ve en az ceza puanını topla.")}</Text>

        <View style={[styles.ruleGrid, isTablet && styles.ruleGridTablet]}>
          <Rule tablet={isTablet} title={t("Dağıtım ve yön")} symbol="♣" text={t("2 deste + 2 joker: 106 kart. Başlayan oyuncu 14, diğerleri 13 kart alır. Başlayan kart çekmeden oynar. Oyun saat yönünün tersine, dağıtıcının sağından ilerler.")} />
          <Rule tablet={isTablet} title={t("Küt")} symbol="777" text={t("Aynı değerde, farklı türlerden en az üç kart. Örnek: ♥7 ♣7 ♠7")} />
          <Rule tablet={isTablet} title={t("Seri")} symbol="456" text={t("Aynı türden ardışık en az üç kart. As başta da sonda da kullanılır: A-2-3 ve Q-K-A olur; K-A-2 gibi dönüşler olmaz.")} />
          <Rule tablet={isTablet} title={t("Joker")} symbol="★" text={t("İstenen kartın yerine geçer. İlk beş elin açılış görevinde kullanılamaz. Elini açtıktan sonra yerdeki jokerin tam karşılık kartını koyup jokeri eline alabilirsin. Seride aynı sembol ve eksik değer gerekir; kütte aynı değerin eksik sembollerinden biri gerekir.")} />
          <Rule tablet={isTablet} title={t("Çekme ve ceza kartı")} symbol="+1" text={t("Sıranda açık kartı doğrudan alabilirsin. 3 veya daha fazla oyunculu masada desteyi seçersen diğer oyunculara sırayla açık kartı alma hakkı sunulur. Alan kişi açık kartla birlikte desteden 1 ceza kartı alır; sonra senin kapalı kartın çekilir. Birden fazla isteyen varsa oyun yönündeki sıra önceliklidir. Çevrim içi odada her karar için 8 saniye vardır; yanıt yoksa pas geçilir. İki kişilik oyunda bu teklif aşaması atlanır. Kapalı deste tükendiğinde en üstteki açık kart yerde kalır; altındaki ıskartalar karıştırılıp yeni kapalı deste yapılır. Bu işlem gerektiği kadar tekrarlanır ve el devam eder.")} />
          <Rule tablet={isTablet} title={t("Açılış ve işleme")} symbol="♠" text={t("İlk açılış yalnızca o elin görevinden oluşur. Aynı turda ek grup açamaz veya masaya kart işleyemezsin. Sonraki sıralarında kendi veya diğer oyuncuların gruplarına uygun kart işleyebilir, ek grup açabilirsin.")} />
          <Rule tablet={isTablet} title={t("Bitiş ve final")} symbol="12" text={t("Son kartını kapalı atarak bitersin. 12. elde önceden açmak yok: bütün elini gruplara ayır, bir bitiş kartı bırak ve Elden bit düğmesine bas. Açma ve bitiş tek hamlede gerçekleşir.")} />
        </View>

        <View style={[styles.referenceGrid, isTablet && styles.referenceGridTablet]}>
          <View style={styles.referenceColumn}>
            <Text style={styles.sectionTitle}>{t("12 EL")}</Text>
            <View style={styles.roundList}>
              {ROUND_CONTRACTS.map((round, index) => (
                <View key={t(round.title)} style={styles.roundRow}>
                  <Text style={styles.roundNumber}>{String(index + 1).padStart(2, '0')}</Text>
                  <Text style={styles.roundTitle}>{t(round.title)}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.referenceColumn}>
            <Text style={styles.sectionTitle}>{t("PUANLAMA")}</Text>
            <View style={styles.points}>
              <Point label="2–10" value={t("Kart değeri")} />
              <Point label="J · Q · K" value={t("10 puan")} />
              <Point label={t("As")} value={t("11 puan")} />
              <Point label={t("Joker")} value={t("25 puan")} />
            </View>
            <Text style={styles.note}>{t("Her el sonunda elde kalan kartlar ceza puanıdır. Hiç açamayanlara da yalnızca ellerindeki kartların toplamı yazılır; ek sabit ceza yoktur. 12 el sonunda en düşük toplam puan kazanır.")}</Text>
          </View>
        </View>
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}

function ContractRules({ tablet }: { tablet: boolean }) {
  const { t } = useTranslations();
  return <>
    <Text style={styles.intro}>{t("7 el boyunca her elin kontratını tamamla, elini bitir ve en az ceza puanını topla.")}</Text>
    <View style={[styles.ruleGrid, tablet && styles.ruleGridTablet]}>
      <Rule tablet={tablet} title={t("Dağıtım ve deste")} symbol="♣" text={t("2 deste ve oyuncu sayısından bir eksik joker kullanılır. İlk üç elde 10, son dört elde 12 kart dağıtılır; başlayan oyuncu bir kart fazla alır ve kart çekmeden oynar.")} />
      <Rule tablet={tablet} title={t("Küt")} symbol="777" text={t("Türden bağımsız, aynı değerde en az 3 kart. Aynı tür tekrar edebilir: ♥7 ♥7 ♣7 geçerlidir.")} />
      <Rule tablet={tablet} title={t("Seri")} symbol="4567" text={t("Aynı türden ardışık en az 4 kart. As düşük (A-2-3-4) veya yüksek (J-Q-K-A) olabilir; K-A-2 gibi dönüşler olmaz.")} />
      <Rule tablet={tablet} title={t("İlk açılış")} symbol="♠" text={t("İlk açılışta yalnızca kontratın istediği gruplar, istenen uzunlukta açılır. Açtıktan sonra kendi yeni grubunu açamazsın; sonraki sıralarından itibaren masadaki bütün gruplara kart işleyebilirsin.")} />
      <Rule tablet={tablet} title={t("Joker")} symbol="★" text={t("Her kartın yerine geçer. Serideki jokeri yerine geçtiği gerçek kartla değiştirip alabilirsin; kütteki joker değiştirilemez.")} />
      <Rule tablet={tablet} title={t("May I?")} symbol="+1" text={t("Desteden çekildiğinde açık kart diğer oyunculara sırayla sunulur. Alan oyuncu ayrıca kapalı desteden 1 ceza kartı çeker. Bir elde kaç kez alınabileceğine sınır yoktur; iki kişilik oyunda bu aşama atlanır.")} />
      <Rule tablet={tablet} title={t("Çıkmaz el")} symbol="∞" text={t("Herkes açtıktan sonra yeni grup açılamadığı için kimsenin bitiremediği bir el olabilir. Kapalı deste üçüncü kez karıştırıldığında el biter ve herkesin elinde kalan kartlar ceza yazılır.")} />
      <Rule tablet={tablet} title={t("Son el")} symbol="7" text={t("7. elde önceden açmak yok: bütün kartlarını tek hamlede en az dörder kartlık üç seri olarak açarsın. Kart atılmaz; açan oyuncu eli bitirir.")} />
      <Rule tablet={tablet} title={t("Deste kesme bonusu")} symbol="−50" text={t("İsteğe bağlı Liverpool kuralı: dağıtımdan önce desteyi kesen oyuncu tam dağıtılacak sayıda kart keserse puanından 50 düşülür.")} />
    </View>
    <View style={[styles.referenceGrid, tablet && styles.referenceGridTablet]}>
      <View style={styles.referenceColumn}>
        <Text style={styles.sectionTitle}>{t("7 EL")}</Text>
        <View style={styles.roundList}>
          {CONTRACT_RUMMY_CONTRACTS.map((round, index) => (
            <View key={round.title} style={styles.roundRow}>
              <Text style={styles.roundNumber}>{String(index + 1).padStart(2, '0')}</Text>
              <Text style={styles.roundTitle}>{t(round.title)}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.referenceColumn}>
        <Text style={styles.sectionTitle}>{t("PUANLAMA")}</Text>
        <View style={styles.points}>
          <Point label="2–10" value={t("Kart değeri")} />
          <Point label="J · Q · K" value={t("10 puan")} />
          <Point label={t("As")} value={t("15 puan")} />
          <Point label={t("Joker")} value={t("15 puan")} />
        </View>
        <Text style={styles.note}>{t("Her el sonunda elde kalan kartlar ceza puanıdır. 7 el sonunda en düşük toplam puan kazanır.")}</Text>
      </View>
    </View>
  </>;
}

function RummyRules({ tablet }: { tablet: boolean }) {
  const { t } = useTranslations();
  return <>
    <Text style={styles.intro}>{t("Görev yok: kartlarını küt ve serilere diz, elini ilk bitiren ol ve en az ceza puanını topla.")}</Text>
    <View style={[styles.ruleGrid, tablet && styles.ruleGridTablet]}>
      <Rule tablet={tablet} title={t("Dağıtım ve yön")} symbol="♣" text={t("2 deste + 2 joker: 106 kart. Başlayan oyuncu 14, diğerleri 13 kart alır. Başlayan kart çekmeden oynar. Sırada desteden veya açık karttan bir kart çekilir, sıra bir kart atılarak biter.")} />
      <Rule tablet={tablet} title={t("Küt ve seri")} symbol="777" text={t("Küt: aynı değerde, farklı türlerden 3 veya 4 kart. Seri: aynı türden ardışık en az 3 kart; As başta (A-2-3) veya sonda (Q-K-A) olabilir.")} />
      <Rule tablet={tablet} title={t("İlk açılış")} symbol="40" text={t("İlk kez masaya açarken koyduğun bütün grupların toplamı en az 40 puan olmalı (tek oyunculuda baraj değiştirilebilir). Kart değerleri puan tablosundaki gibidir; Joker yerine geçtiği kartın değerini sayar.")} />
      <Rule tablet={tablet} title={t("Joker")} symbol="★" text={t("Her kartın yerine geçebilir ve ilk açılışta da kullanılabilir. Elini açtıktan sonra yerdeki jokerin tam karşılık kartını koyup jokeri eline alabilirsin.")} />
      <Rule tablet={tablet} title={t("Açtıktan sonra")} symbol="♠" text={t("Sonraki sıralarında yeni küt veya seri açabilir, masadaki bütün gruplara kart işleyebilirsin. Açtığın aynı turda ek grup açamaz veya kart işleyemezsin.")} />
      <Rule tablet={tablet} title={t("Bitiş ve Rummy")} symbol="R!" text={t("Son kartını atarak elini bitirirsin; elini açmadan son kartı atamazsın. Bütün elini tek turda açıp bitirirsen Rummy olur ve diğer oyuncuların cezası ikiye katlanır.")} />
    </View>
    <Text style={styles.sectionTitle}>{t("PUANLAMA")}</Text>
    <View style={styles.points}>
      <Point label="2–10" value={t("Kart değeri")} />
      <Point label="J · Q · K" value={t("10 puan")} />
      <Point label={t("As")} value={t("11 puan")} />
      <Point label={t("Joker")} value={t("25 puan ceza")} />
    </View>
    <Text style={styles.note}>{t("Her el sonunda elde kalan kartlar ceza puanıdır. Açık kart teklifi ve işlek kart cezası Klasik Rummy'de yoktur. Son el bitince en düşük toplam puan kazanır.")}</Text>
  </>;
}

function Rule({ title, symbol, text, tablet = false }: { title: string; symbol: string; text: string; tablet?: boolean }) {
  return (
    <View style={[styles.rule, tablet && styles.ruleTablet]}>
      <View style={styles.ruleSymbol}><Text style={styles.ruleSymbolText}>{symbol}</Text></View>
      <View style={styles.ruleCopy}><Text style={styles.ruleTitle}>{title}</Text><Text style={styles.ruleText}>{text}</Text></View>
    </View>
  );
}

function Point({ label, value }: { label: string; value: string }) {
  return <View style={styles.pointRow}><Text style={styles.pointLabel}>{label}</Text><Text style={styles.pointValue}>{value}</Text></View>;
}

// Rows in a card draw a bottom line and pull up by one pixel, so the last
// line hides under the card's edge instead of doubling it.
const cardBox = { borderRadius: 18, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, overflow: 'hidden' } as const;
const cardRow = { borderBottomWidth: 1, borderBottomColor: palette.line, marginBottom: -1 } as const;

const styles = StyleSheet.create({
  content: { maxWidth: 760 },
  intro: { color: palette.cream, fontSize: 16, lineHeight: 23, fontWeight: '700', marginTop: 4 },
  ruleGrid: cardBox,
  ruleGridTablet: {},
  rule: { ...cardRow, flexDirection: 'row', gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
  ruleTablet: {},
  ruleSymbol: { width: 40, alignItems: 'center', paddingTop: 1 },
  ruleSymbolText: { color: palette.gold, fontSize: 15, fontWeight: '900' },
  ruleCopy: { flex: 1 },
  ruleTitle: { color: palette.cream, fontSize: 15, fontWeight: '900' },
  ruleText: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 3 },
  sectionTitle: { color: palette.gold, fontSize: 10, fontWeight: '900', letterSpacing: 2, marginTop: 10, marginBottom: 8, marginLeft: 4 },
  referenceGrid: {}, referenceGridTablet: { flexDirection: 'row', gap: 22, alignItems: 'flex-start' }, referenceColumn: { flex: 1, minWidth: 0 },
  roundList: cardBox,
  roundRow: { ...cardRow, flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14 },
  roundNumber: { color: palette.gold, width: 34, fontSize: 12, fontWeight: '900' },
  roundTitle: { color: palette.cream, fontSize: 14, fontWeight: '700', flex: 1 },
  points: cardBox,
  pointRow: { ...cardRow, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 14 },
  pointLabel: { color: palette.cream, fontWeight: '800' },
  pointValue: { color: palette.gold, fontWeight: '800' },
  note: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 10, marginHorizontal: 4 },
});
