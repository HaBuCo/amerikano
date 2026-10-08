import { useTranslations } from '@/i18n/language';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette } from '@/constants/palette';
import { ROUND_CONTRACTS } from '@/game/contracts';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

export default function RulesScreen() {
  const { t } = useTranslations();
  const { isTablet } = useResponsiveLayout();
  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={[styles.content, isTablet && styles.contentTablet]}>
        <Text style={styles.intro}>{t("12 el boyunca görevleri tamamla, elini bitir ve en az ceza puanını topla.")}</Text>

        <View style={[styles.ruleGrid, isTablet && styles.ruleGridTablet]}>
          <Rule tablet={isTablet} title={t("Dağıtım ve yön")} symbol="↶" text={t("2 deste + 2 joker: 106 kart. Başlayan oyuncu 14, diğerleri 13 kart alır. Başlayan kart çekmeden oynar. Oyun saat yönünün tersine, dağıtıcının sağından ilerler.")} />
          <Rule tablet={isTablet} title={t("Küt")} symbol="777" text={t("Aynı değerde, farklı türlerden en az üç kart. Örnek: ♥7 ♣7 ♠7")} />
          <Rule tablet={isTablet} title={t("Seri")} symbol="456" text={t("Aynı türden ardışık en az üç kart. As yalnızca yüksek karttır: Q-K-A olur; A-2-3 ve K-A-2 olmaz.")} />
          <Rule tablet={isTablet} title={t("Joker")} symbol="★" text={t("İstenen kartın yerine geçer. İlk beş elin açılış görevinde kullanılamaz. Elini açtıktan sonra yerdeki jokerin tam karşılık kartını koyup jokeri eline alabilirsin. Seride aynı sembol ve eksik değer gerekir; kütte aynı değerin eksik sembollerinden biri gerekir.")} />
          <Rule tablet={isTablet} title={t("Çekme ve ceza kartı")} symbol="+1" text={t("Sıranda açık kartı doğrudan alabilirsin. 3 veya daha fazla oyunculu masada desteyi seçersen diğer oyunculara sırayla açık kartı alma hakkı sunulur. Alan kişi açık kartla birlikte desteden 1 ceza kartı alır; sonra senin kapalı kartın çekilir. Birden fazla isteyen varsa oyun yönündeki sıra önceliklidir. Çevrim içi odada her karar için 8 saniye vardır; yanıt yoksa pas geçilir. İki kişilik oyunda bu teklif aşaması atlanır. Kapalı deste ilk kez tükenince eski açık kartlar karıştırılır; ikinci kez tükenirse el çıkmaz biter ve elde kalan kartlar ceza yazılır.")} />
          <Rule tablet={isTablet} title={t("Açılış ve işleme")} symbol="↓" text={t("İlk açılış yalnızca o elin görevinden oluşur. Aynı turda ek grup açamaz veya masaya kart işleyemezsin. Sonraki sıralarında kendi veya diğer oyuncuların gruplarına uygun kart işleyebilir, ek grup açabilirsin.")} />
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
      </ScrollView>
    </SafeAreaView>
  );
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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.felt },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 24, paddingBottom: 44 },
  contentTablet: { maxWidth: 1120, paddingHorizontal: 34, paddingTop: 30 },
  intro: { color: palette.cream, fontSize: 20, lineHeight: 29, fontWeight: '700', marginBottom: 24 },
  ruleGrid: {},
  ruleGridTablet: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  rule: { flexDirection: 'row', gap: 14, paddingVertical: 15, borderTopWidth: 1, borderTopColor: palette.line },
  ruleTablet: { width: '48%', flexGrow: 1, alignSelf: 'stretch', borderWidth: 1, borderColor: palette.line, borderRadius: 16, padding: 16, backgroundColor: '#ffffff05' },
  ruleSymbol: { width: 52, height: 52, borderRadius: 12, backgroundColor: palette.cream, alignItems: 'center', justifyContent: 'center' },
  ruleSymbolText: { color: palette.red, fontSize: 18, fontWeight: '900' },
  ruleCopy: { flex: 1 },
  ruleTitle: { color: palette.cream, fontSize: 17, fontWeight: '900' },
  ruleText: { color: palette.muted, fontSize: 14, lineHeight: 20, marginTop: 4 },
  sectionTitle: { color: palette.gold, fontSize: 11, fontWeight: '900', letterSpacing: 2.2, marginTop: 31, marginBottom: 10 },
  referenceGrid: {}, referenceGridTablet: { flexDirection: 'row', gap: 22, alignItems: 'flex-start' }, referenceColumn: { flex: 1, minWidth: 0 },
  roundList: { borderWidth: 1, borderColor: palette.line, borderRadius: 16, overflow: 'hidden' },
  roundRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: palette.line },
  roundNumber: { color: palette.gold, width: 37, fontSize: 12, fontWeight: '900' },
  roundTitle: { color: palette.cream, fontSize: 14, fontWeight: '700' },
  points: { borderRadius: 16, backgroundColor: palette.feltLight, paddingHorizontal: 16 },
  pointRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: palette.line },
  pointLabel: { color: palette.cream, fontWeight: '800' },
  pointValue: { color: palette.gold, fontWeight: '800' },
  note: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 12 },
});
