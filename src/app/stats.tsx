import { useTranslations } from '@/i18n/language';
import type { Language } from '@/i18n/translate';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Stack } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { kit, ScreenHeader } from '@/components/screen-kit';
import { palette as p } from '@/constants/palette';
import { basicRecord, MatchResult, summarizeMatches } from '@/game/player-stats';
import { loadSinglePlayerStats, useSinglePlayerStats } from '@/game/single-stats';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { refreshPlayerProfile, usePlayerProfile } from '@/network/profile';
import { fetchPlayerMatchResults } from '@/network/stats';

export default function StatsScreen() {
  const { t, localizeMessage, language } = useTranslations();
  const { isTablet, isWideTablet } = useResponsiveLayout();
  const profileState = usePlayerProfile();
  const singleState = useSinglePlayerStats();
  const [history, setHistory] = useState<MatchResult[]>([]);
  const [historyAvailable, setHistoryAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await Promise.all([refreshPlayerProfile(), loadSinglePlayerStats()]);
      const result = await fetchPlayerMatchResults();
      setHistory(result.results);
      setHistoryAvailable(result.available);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'İstatistikler alınamadı.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const online = basicRecord(profileState.profile?.gamesPlayed ?? 0, profileState.profile?.wins ?? 0);
  const single = basicRecord(singleState.stats.gamesPlayed, singleState.stats.wins);
  const detailed = useMemo(() => summarizeMatches(history), [history]);
  const singleAverage = single.gamesPlayed ? Math.round(singleState.stats.scoreTotal / single.gamesPlayed) : null;

  return <SafeAreaView edges={['top', 'bottom']} style={kit.page}>
    <Stack.Screen options={{ headerShown: false }} />
    <ScrollView contentContainerStyle={[kit.content, isTablet && kit.contentTablet, s.content]} showsVerticalScrollIndicator={false}>
      <ScreenHeader title={t("İstatistiklerim")} subtitle={t("Galibiyetlerini, skor rekorlarını ve oynadığın maçları tek yerde takip et.")} />

      <View style={[s.columns, isWideTablet && s.columnsWide]}>
        <View style={isWideTablet && s.half}><StatSection title={t("ÇEVRİM İÇİ KARİYER")} subtitle={t("Hesabındaki bütün çevrim içi maçlar")}>
          <View style={s.grid}>
            <Metric label={t("MAÇ")} value={online.gamesPlayed} />
            <Metric label={t("GALİBİYET")} value={online.wins} highlight />
            <Metric label={t("MAĞLUBİYET")} value={online.losses} />
            <Metric label={t("KAZANMA ORANI")} value={`%${online.winRate}`} />
          </View>
        </StatSection></View>

        <View style={isWideTablet && s.half}><StatSection title={t("TEK OYUNCULU")} subtitle={t("Bu cihazda botlara karşı oynadığın oyunlar")}>
          <View style={s.grid}>
            <Metric label={t("OYUN")} value={single.gamesPlayed} />
            <Metric label={t("GALİBİYET")} value={single.wins} highlight />
            <Metric label={t("MAĞLUBİYET")} value={single.losses} />
            <Metric label={t("KAZANMA ORANI")} value={`%${single.winRate}`} />
            <Metric label={t("EN DÜŞÜK SKOR")} value={scoreValue(singleState.stats.bestScore)} />
            <Metric label={t("ORTALAMA")} value={scoreValue(singleAverage)} />
          </View>
        </StatSection></View>
      </View>

      <StatSection title={t("SKOR REKORLARI")} subtitle={t("Çevrim içi bitirdiğin oyunların skor özeti")}>
        <View style={[s.recordGrid, isTablet && s.recordGridTablet]}>
          <Record label={t("EN DÜŞÜK PUANLA BİTİRME")} value={scoreValue(detailed.bestScore)} note={t("Galibiyet şartı olmadan")} />
          <Record label={t("EN DÜŞÜK GALİBİYET SKORU")} value={scoreValue(detailed.bestWinningScore)} note={t("Kazandığın oyunlar içinde")} />
          <Record label={t("ORTALAMA BİTİRME SKORU")} value={scoreValue(detailed.averageScore)} note={t("{0} ayrıntılı maçtan", [detailed.trackedMatches])} />
          <Record label={t("İLK 3")} value={detailed.podiums} note={t("Podyumda bitirdiğin maç")} />
        </View>
        {!historyAvailable
          ? <Text style={s.info}>{t("Ayrıntılı skor takibi sunucu güncellemesi yayımlandığında başlayacak. Eski maç ve galibiyet toplamların korunuyor.")}</Text>
          : detailed.trackedMatches === 0 && <Text style={s.info}>{t("Henüz ayrıntılı skor kaydın yok. Bundan sonraki çevrim içi maçların burada görünecek.")}</Text>}
      </StatSection>

      <StatSection title={t("SON MAÇLAR")} subtitle={t("En yeni çevrim içi sonuçların")}>
        {history.slice(0, 8).map((result, index, shown) => <View key={result.id ?? `${result.createdAt}-${result.score}`} style={[s.matchRow, index < shown.length - 1 && s.divider]}>
          <View style={s.matchPlace}><Text style={s.matchPlaceValue}>{result.place}.</Text><Text style={s.matchPlaceTotal}>/{result.playerCount}</Text></View>
          <View style={s.matchCopy}><Text style={result.won ? s.win : s.loss}>{result.won ? t("GALİBİYET") : t("MAĞLUBİYET")}</Text><Text style={s.matchDate}>{formatDate(result.createdAt, language)}</Text></View>
          <View><Text style={s.matchScore}>{result.score}</Text><Text style={s.matchScoreLabel}>{t("PUAN")}</Text></View>
        </View>)}
        {!history.length && <Text style={s.empty}>{loading ? t("İstatistiklerin hazırlanıyor…") : t("Oynadığın çevrim içi maçlar burada sıralanacak.")}</Text>}
      </StatSection>

      {!!error && <View style={s.errorBox}><Text style={s.error}>{localizeMessage(error)}</Text><Pressable accessibilityRole="button" onPress={() => void load()}><Text style={s.retry}>{t("YENİDEN DENE")}</Text></Pressable></View>}
      <Text style={s.footer}>{t("Beraberlikte en düşük skoru paylaşan oyuncuların tümü galip sayılır.")}</Text>
    </ScrollView>
  </SafeAreaView>;
}

function StatSection({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <View style={s.section}>
    <View style={s.sectionHead}><Text style={s.sectionTitle}>{title}</Text><Text style={s.sectionSubtitle}>{subtitle}</Text></View>
    <View style={s.card}>{children}</View>
  </View>;
}

function Metric({ label, value, highlight = false }: { label: string; value: string | number; highlight?: boolean }) {
  return <View style={s.metric}><Text style={[s.metricValue, highlight && s.metricHighlight]}>{value}</Text><Text style={s.metricLabel}>{label}</Text></View>;
}

function Record({ label, value, note }: { label: string; value: string | number; note: string }) {
  return <View style={s.record}><Text style={s.recordLabel}>{label}</Text><Text style={s.recordValue}>{value}</Text><Text style={s.recordNote}>{note}</Text></View>;
}

function scoreValue(score: number | null) {
  return score === null ? '—' : score;
}

function formatDate(value: string, language: Language) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

// Cells and rows draw a bottom line and pull up by one pixel, so the last
// line hides under the card's edge instead of doubling it.
const cardRow = { borderBottomWidth: 1, borderBottomColor: p.line, marginBottom: -1 } as const;

const s = StyleSheet.create({
  content: { maxWidth: 680 },
  columns: { gap: 14 },
  columnsWide: { flexDirection: 'row', alignItems: 'stretch' },
  section: { minWidth: 0, gap: 8 },
  // Only side by side sections share the width; stacked, flex would collapse them.
  half: { flex: 1, minWidth: 0 },
  sectionHead: { marginLeft: 4, gap: 2, marginTop: 6 },
  sectionTitle: { color: p.gold, fontSize: 10, letterSpacing: 2, fontWeight: '900' },
  sectionSubtitle: { color: p.muted, fontSize: 11, lineHeight: 16 },
  card: { borderRadius: 18, backgroundColor: p.surface, borderWidth: 1, borderColor: p.line, overflow: 'hidden' },
  divider: { borderBottomWidth: 1, borderBottomColor: p.line },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  metric: { ...cardRow, width: '50%', minHeight: 86, alignItems: 'center', justifyContent: 'center', gap: 4 },
  metricValue: { color: p.cream, fontSize: 25, fontWeight: '900' },
  metricHighlight: { color: p.gold },
  metricLabel: { color: p.muted, fontSize: 8, letterSpacing: 1.2, fontWeight: '800', textAlign: 'center' },
  recordGrid: {},
  recordGridTablet: { flexDirection: 'row' },
  record: { ...cardRow, flex: 1, minWidth: 0, minHeight: 104, paddingVertical: 14, paddingHorizontal: 14, justifyContent: 'space-between', gap: 4 },
  recordLabel: { color: p.muted, fontSize: 8, lineHeight: 12, letterSpacing: 1, fontWeight: '900' },
  recordValue: { color: p.cream, fontSize: 30, fontWeight: '900' },
  recordNote: { color: '#819c8c', fontSize: 9, lineHeight: 13 },
  info: { color: p.muted, fontSize: 11, lineHeight: 17, padding: 14 },
  matchRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 10, paddingHorizontal: 14 },
  matchPlace: { width: 44, alignItems: 'baseline', justifyContent: 'center', flexDirection: 'row' },
  matchPlaceValue: { color: p.cream, fontSize: 18, fontWeight: '900' },
  matchPlaceTotal: { color: p.muted, fontSize: 10 },
  matchCopy: { flex: 1, gap: 5 },
  win: { color: p.gold, fontSize: 9, letterSpacing: 1.2, fontWeight: '900' },
  loss: { color: p.muted, fontSize: 9, letterSpacing: 1.2, fontWeight: '900' },
  matchDate: { color: p.cream, fontSize: 12, fontWeight: '700' },
  matchScore: { color: p.cream, fontSize: 20, fontWeight: '900', textAlign: 'right' },
  matchScoreLabel: { color: p.muted, fontSize: 7, letterSpacing: 1, textAlign: 'right' },
  empty: { color: p.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingVertical: 20 },
  errorBox: { borderRadius: 18, borderWidth: 1, borderColor: '#a6404866', backgroundColor: '#a640481a', padding: 14, gap: 10, alignItems: 'center' },
  error: { color: '#f0aaa4', textAlign: 'center' },
  retry: { color: p.gold, fontWeight: '900', fontSize: 10, letterSpacing: 1 },
  footer: { color: '#708f7d', fontSize: 9, lineHeight: 14, textAlign: 'center', paddingHorizontal: 12 },
});
