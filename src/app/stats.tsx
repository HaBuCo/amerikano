import { useTranslations } from '@/i18n/language';
import type { Language } from '@/i18n/translate';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, Stack } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

  return <SafeAreaView style={s.page}>
    <Stack.Screen options={{ headerShown: false }} />
    <ScrollView contentContainerStyle={[s.content, isTablet && s.contentTablet]} showsVerticalScrollIndicator={false}>
      <Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={s.back}>{t("← Geri")}</Text></Pressable>

      <View style={s.heading}>
        <Text style={s.eyebrow}>{t("İSTATİSTİKLERİM")}</Text>
        <Text style={s.title}>{t("Masadaki hikâyen.")}</Text>
        <Text style={s.body}>{t("Galibiyetlerini, skor rekorlarını ve oynadığın maçları tek yerde takip et.")}</Text>
      </View>

      <View style={[s.columns, isWideTablet && s.columnsWide]}>
        <StatSection title={t("ÇEVRİM İÇİ KARİYER")} subtitle={t("Hesabındaki bütün çevrim içi maçlar")}>
          <View style={s.grid}>
            <Metric label={t("MAÇ")} value={online.gamesPlayed} />
            <Metric label={t("GALİBİYET")} value={online.wins} highlight />
            <Metric label={t("MAĞLUBİYET")} value={online.losses} />
            <Metric label={t("KAZANMA ORANI")} value={`%${online.winRate}`} />
          </View>
        </StatSection>

        <StatSection title={t("TEK OYUNCULU")} subtitle={t("Bu cihazda botlara karşı oynadığın oyunlar")}>
          <View style={s.grid}>
            <Metric label={t("OYUN")} value={single.gamesPlayed} />
            <Metric label={t("GALİBİYET")} value={single.wins} highlight />
            <Metric label={t("MAĞLUBİYET")} value={single.losses} />
            <Metric label={t("KAZANMA ORANI")} value={`%${single.winRate}`} />
            <Metric label={t("EN DÜŞÜK SKOR")} value={scoreValue(singleState.stats.bestScore)} />
            <Metric label={t("ORTALAMA")} value={scoreValue(singleAverage)} />
          </View>
        </StatSection>
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
        {history.slice(0, 8).map(result => <View key={result.id ?? `${result.createdAt}-${result.score}`} style={s.matchRow}>
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
  return <View style={s.section}><Text style={s.sectionTitle}>{title}</Text><Text style={s.sectionSubtitle}>{subtitle}</Text>{children}</View>;
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

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: p.felt },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: 24, paddingBottom: 42, gap: 18 },
  contentTablet: { maxWidth: 1060, paddingHorizontal: 36, paddingTop: 30 },
  back: { color: p.cream, fontSize: 15, paddingVertical: 10 },
  heading: { gap: 8, marginVertical: 4 },
  eyebrow: { color: p.gold, letterSpacing: 3, fontSize: 11, fontWeight: '900' },
  title: { color: p.cream, fontSize: 36, lineHeight: 42, fontWeight: '900', letterSpacing: -0.8 },
  body: { color: p.muted, fontSize: 15, lineHeight: 22, maxWidth: 620 },
  columns: { gap: 18 },
  columnsWide: { flexDirection: 'row', alignItems: 'stretch' },
  section: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: p.line, borderRadius: 20, backgroundColor: '#071e154d', padding: 18, gap: 12 },
  sectionTitle: { color: p.gold, fontSize: 10, letterSpacing: 1.8, fontWeight: '900' },
  sectionSubtitle: { color: p.muted, fontSize: 11, lineHeight: 16, marginTop: -7 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderColor: p.line, borderRadius: 15, overflow: 'hidden' },
  metric: { width: '50%', minHeight: 86, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 0.5, borderColor: p.line },
  metricValue: { color: p.cream, fontSize: 25, fontWeight: '900' },
  metricHighlight: { color: p.gold },
  metricLabel: { color: p.muted, fontSize: 8, letterSpacing: 1.2, fontWeight: '800', textAlign: 'center' },
  recordGrid: { gap: 10 },
  recordGridTablet: { flexDirection: 'row' },
  record: { flex: 1, minWidth: 0, minHeight: 126, borderRadius: 15, backgroundColor: '#ffffff08', padding: 14, justifyContent: 'space-between' },
  recordLabel: { color: p.muted, fontSize: 8, lineHeight: 12, letterSpacing: 1, fontWeight: '900' },
  recordValue: { color: p.cream, fontSize: 30, fontWeight: '900' },
  recordNote: { color: '#819c8c', fontSize: 9, lineHeight: 13 },
  info: { color: p.muted, fontSize: 11, lineHeight: 17, padding: 12, borderRadius: 12, backgroundColor: '#d9a44110' },
  matchRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: p.line },
  matchPlace: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#ffffff0a', alignItems: 'baseline', justifyContent: 'center', flexDirection: 'row' },
  matchPlaceValue: { color: p.cream, fontSize: 18, fontWeight: '900' },
  matchPlaceTotal: { color: p.muted, fontSize: 10 },
  matchCopy: { flex: 1, gap: 5 },
  win: { color: p.gold, fontSize: 9, letterSpacing: 1.2, fontWeight: '900' },
  loss: { color: p.muted, fontSize: 9, letterSpacing: 1.2, fontWeight: '900' },
  matchDate: { color: p.cream, fontSize: 12, fontWeight: '700' },
  matchScore: { color: p.cream, fontSize: 20, fontWeight: '900', textAlign: 'right' },
  matchScoreLabel: { color: p.muted, fontSize: 7, letterSpacing: 1, textAlign: 'right' },
  empty: { color: p.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingVertical: 20 },
  errorBox: { borderRadius: 14, borderWidth: 1, borderColor: '#a6404866', padding: 14, gap: 10, alignItems: 'center' },
  error: { color: '#f0aaa4', textAlign: 'center' },
  retry: { color: p.gold, fontWeight: '900', fontSize: 10, letterSpacing: 1 },
  footer: { color: '#708f7d', fontSize: 9, lineHeight: 14, textAlign: 'center', paddingHorizontal: 12 },
});
