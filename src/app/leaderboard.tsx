import { useCallback, useEffect, useRef, useState } from 'react';
import { router, Stack } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette as p } from '@/constants/palette';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { useTranslations } from '@/i18n/language';
import { fetchLeaderboard, type LeaderboardData, type LeaderboardPeriod, type LeaderboardPlayer } from '@/network/leaderboard';
import { PlayerAvatar } from '@/components/player-avatar';

export default function LeaderboardScreen() {
  const { t, language, localizeMessage } = useTranslations();
  const { isTablet } = useResponsiveLayout();
  const [period, setPeriod] = useState<LeaderboardPeriod>('week');
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestNo = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestNo.current;
    setLoading(true);
    setError('');
    try {
      const next = await fetchLeaderboard(period);
      if (request === requestNo.current) setData(next);
    } catch (cause) {
      if (request === requestNo.current) setError(cause instanceof Error ? cause.message : 'Liderlik tablosu alınamadı.');
    } finally {
      if (request === requestNo.current) setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    const pendingRequests = requestNo;
    const timer = setTimeout(() => { void load(); }, 0);
    return () => { clearTimeout(timer); pendingRequests.current++; };
  }, [load]);

  const leaders = data?.leaders ?? [];
  const formatter = new Intl.NumberFormat(language === 'en' ? 'en-US' : 'tr-TR');
  const points = (value: number) => `${value > 0 ? '+' : ''}${formatter.format(value)}`;
  const periodDate = period === 'week' && data?.periodStart
    ? new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'tr-TR', { day: 'numeric', month: 'long' }).format(new Date(data.periodStart))
    : null;

  return <SafeAreaView style={s.page}>
    <Stack.Screen options={{ headerShown: false }} />
    <ScrollView contentContainerStyle={[s.content, isTablet && s.contentTablet]} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={loading && data !== null} onRefresh={() => void load()} tintColor={p.gold} colors={[p.gold]} />}>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={s.backButton}><Text style={s.back}>{t('Geri')}</Text></Pressable>

      <View style={s.hero}>
        <View style={s.heroCircle} />
        <Text style={s.eyebrow}>{t('AMERİKANO LİGİ')}</Text>
        <Text style={s.title}>{t('Liderlik tablosu')}</Text>
        <Text style={s.heroText}>{t('Coin masalarında en iyi performansı gösteren oyuncular.')}</Text>
        <View style={s.heroRule}><Text style={s.heroRuleText}>{t('SADECE BİTEN ÇEVRİM İÇİ MAÇLAR')}</Text></View>
      </View>

      <View style={s.tabs}>
        {(['week', 'all'] as const).map(option => <Pressable key={option} accessibilityRole="button"
          accessibilityState={{ selected: period === option }} onPress={() => { if (period !== option) { setData(null); setPeriod(option); } }}
          style={[s.tab, period === option && s.tabActive]}>
          <Text style={[s.tabText, period === option && s.tabTextActive]}>{option === 'week' ? t('Bu hafta') : t('Tüm zamanlar')}</Text>
        </Pressable>)}
      </View>

      <View style={s.introRow}>
        <View><Text style={s.sectionEyebrow}>{period === 'week' ? t('HAFTALIK SIRALAMA') : t('TÜM ZAMANLAR')}</Text>
          <Text style={s.sectionTitle}>{t('En çok net coin kazananlar')}</Text></View>
        <Text style={s.date}>{periodDate ? t('{0} itibarıyla', [periodDate]) : ''}</Text>
      </View>

      {loading && !data ? <View style={s.emptyCard}><Text style={s.emptyIcon}>♛</Text><Text style={s.emptyTitle}>{t('Sıralama hazırlanıyor…')}</Text></View> : null}
      {!!error && <View style={s.emptyCard}><Text style={s.emptyIcon}>!</Text><Text style={s.emptyTitle}>{t('Sıralama yüklenemedi')}</Text>
        <Text style={s.emptyText}>{localizeMessage(error)}</Text>
        <Pressable accessibilityRole="button" onPress={() => void load()} style={s.retry}><Text style={s.retryText}>{t('YENİDEN DENE')}</Text></Pressable></View>}
      {!loading && !error && leaders.length === 0 && <View style={s.emptyCard}><Text style={s.emptyIcon}>♛</Text>
        <Text style={s.emptyTitle}>{t('Podyum seni bekliyor')}</Text>
        <Text style={s.emptyText}>{t('İlk ücretli çevrim içi maçlar tamamlandığında liderler burada görünecek.')}</Text></View>}

      {leaders.length > 0 && <>
        <View style={[s.podium, isTablet && s.podiumTablet]}>
          {leaders.slice(0, 3).map((player) => <PodiumCard key={player.userId} player={player} points={points(player.netCoins)} />)}
        </View>
        {leaders.length > 3 && <View style={s.list}>
          {leaders.slice(3).map((player) => <LeaderboardRow key={player.userId} player={player} points={points(player.netCoins)} />)}
        </View>}
      </>}

      {data && <View style={s.myCard}>
        <View><Text style={s.myEyebrow}>{t('SENİN DURUMUN')}</Text><Text style={s.myRank}>{data.me.rank ? `#${data.me.rank}` : '—'}</Text></View>
        <View style={s.myRight}><Text style={s.myPoints}>{points(data.me.netCoins)} <Text style={s.coinSymbol}>🪙</Text></Text>
          <Text style={s.myMatches}>{t('{0} ücretli maç', [data.me.matches])}</Text></View>
      </View>}

      <Text style={s.explainer}>{t('Sıralama, biten ücretli maçlarda kazandığın ödülden giriş ücretinin çıkarılmasıyla hesaplanır. Günlük hediye ve satın alınan coinler sayılmaz.')}</Text>
      <Text style={s.footer}>{t('Haftalık tablo her pazartesi 00.00 UTC’de yenilenir. Yalnızca net kazancı pozitif oyuncular listelenir.')}</Text>
    </ScrollView>
  </SafeAreaView>;
}

function PodiumCard({ player, points }: { player: LeaderboardPlayer; points: string }) {
  const { t } = useTranslations();
  return <View style={[s.podiumCard, player.rank === 1 && s.podiumFirst]}>
    <Text style={[s.medal, player.rank === 1 && s.medalFirst]}>{player.rank === 1 ? '♛' : `#${player.rank}`}</Text>
    <PlayerAvatar avatarKey={player.avatarKey} size={44} style={s.podiumAvatar} />
    <Text numberOfLines={1} style={s.podiumName}>{player.username}</Text>
    <Text style={[s.podiumPoints, player.rank === 1 && s.podiumPointsFirst]}>{points}</Text>
    <Text style={s.podiumMatches}>{t('{0} maç', [player.matches])}</Text>
  </View>;
}

function LeaderboardRow({ player, points }: { player: LeaderboardPlayer; points: string }) {
  const { t } = useTranslations();
  return <View style={s.row}>
    <Text style={s.rowRank}>{player.rank}.</Text>
    <PlayerAvatar avatarKey={player.avatarKey} size={36} />
    <View style={s.rowCopy}><Text numberOfLines={1} style={s.rowName}>{player.username}</Text><Text style={s.rowMatches}>{t('{0} maç', [player.matches])}</Text></View>
    <Text style={s.rowPoints}>{points} <Text style={s.rowCoin}>🪙</Text></Text>
  </View>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: p.canvas },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 46, gap: 18 },
  contentTablet: { maxWidth: 1040, paddingHorizontal: 34, paddingTop: 18 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 12 }, back: { color: p.cream, fontSize: 15 },
  hero: { minHeight: 185, borderBottomWidth: 1, borderBottomColor: p.line, paddingVertical: 15, overflow: 'hidden', justifyContent: 'center', gap: 9 },
  heroCircle: { position: 'absolute', width: 230, height: 230, borderRadius: 115, borderWidth: 26, borderColor: '#D9A44113', right: -35, top: -63 },
  eyebrow: { color: p.gold, fontSize: 10, letterSpacing: 3, fontWeight: '900' },
  title: { color: p.cream, fontSize: 35, lineHeight: 40, fontWeight: '900', letterSpacing: -0.7 },
  heroText: { color: p.muted, fontSize: 14, lineHeight: 20, maxWidth: 480 },
  heroRule: { alignSelf: 'flex-start', backgroundColor: '#D9A4411C', paddingHorizontal: 11, paddingVertical: 8, borderRadius: 8, marginTop: 7 },
  heroRuleText: { color: p.gold, fontSize: 9, letterSpacing: 1.3, fontWeight: '900' },
  tabs: { backgroundColor: '#071E15A8', borderWidth: 1, borderColor: p.line, borderRadius: 15, padding: 5, flexDirection: 'row' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 43, borderRadius: 11 },
  tabActive: { backgroundColor: p.gold }, tabText: { color: p.muted, fontWeight: '800', fontSize: 13 }, tabTextActive: { color: p.ink },
  introRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  sectionEyebrow: { color: p.gold, fontSize: 9, letterSpacing: 2, fontWeight: '900' },
  sectionTitle: { color: p.cream, fontSize: 20, fontWeight: '900', marginTop: 5 },
  date: { color: p.muted, fontSize: 10 },
  podium: { flexDirection: 'row', gap: 8, alignItems: 'stretch' }, podiumTablet: { gap: 14 },
  podiumCard: { flex: 1, minWidth: 0, minHeight: 178, backgroundColor: '#0B2C20', borderWidth: 1, borderColor: p.line, borderRadius: 19, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, paddingVertical: 13, gap: 5 },
  podiumFirst: { borderColor: p.gold, backgroundColor: '#5C441D66' },
  medal: { color: p.muted, fontSize: 17, fontWeight: '900' }, medalFirst: { color: p.gold, fontSize: 23 },
  podiumAvatar: { marginTop: 2 },
  podiumName: { color: p.cream, fontSize: 12, fontWeight: '900', maxWidth: '100%' },
  podiumPoints: { color: p.cream, fontWeight: '900', fontSize: 17 }, podiumPointsFirst: { color: p.gold },
  podiumMatches: { color: p.muted, fontSize: 10 },
  list: { borderTopWidth: 1, borderTopColor: p.line },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: p.line, gap: 10 },
  rowRank: { width: 28, color: p.gold, fontSize: 13, fontWeight: '900' },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 }, rowName: { color: p.cream, fontSize: 13, fontWeight: '800' }, rowMatches: { color: p.muted, fontSize: 10 },
  rowPoints: { color: p.gold, fontWeight: '900', fontSize: 13 }, rowCoin: { fontSize: 12 },
  myCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#D9A44118', borderRadius: 16, padding: 17 },
  myEyebrow: { color: p.gold, fontSize: 9, letterSpacing: 2, fontWeight: '900' }, myRank: { color: p.cream, fontSize: 30, fontWeight: '900', marginTop: 3 },
  myRight: { alignItems: 'flex-end' }, myPoints: { color: p.gold, fontSize: 20, fontWeight: '900' }, coinSymbol: { fontSize: 16 }, myMatches: { color: p.muted, fontSize: 11, marginTop: 5 },
  emptyCard: { backgroundColor: '#0B2C20', borderRadius: 20, borderWidth: 1, borderColor: p.line, minHeight: 190, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyIcon: { color: p.gold, fontSize: 34 }, emptyTitle: { color: p.cream, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  emptyText: { color: p.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  retry: { backgroundColor: p.gold, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, marginTop: 5 }, retryText: { color: p.ink, fontSize: 10, fontWeight: '900' },
  explainer: { color: p.muted, fontSize: 12, lineHeight: 18, paddingHorizontal: 4 },
  footer: { color: '#789B84', fontSize: 10, lineHeight: 16, textAlign: 'center', paddingHorizontal: 8 },
});
