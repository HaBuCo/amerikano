import { Href, router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlayingCard } from '@/components/playing-card';
import { palette } from '@/constants/palette';
import { Card } from '@/game/types';
import { useAuth } from '@/network/auth';

const sampleCards: Card[] = [
  { id: 'hero-1', rank: 'Q', suit: 'hearts', isJoker: false },
  { id: 'hero-2', rank: 'K', suit: 'spades', isJoker: false },
  { id: 'hero-3', rank: 'A', suit: 'spades', isJoker: false },
];

export default function HomeScreen() {
  const auth = useAuth();
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}><Text style={styles.brandLetter}>A</Text></View>
          <Text style={styles.brand}>AMERİKANO</Text>
          <View style={{ flex: 1 }} />
          <Pressable accessibilityRole="button" onPress={() => router.push('/login')}>
            <Text style={styles.account}>{auth.status === 'signed-in' ? 'Hesabım' : 'Giriş yap'}</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <View style={styles.cardFan}>
            {sampleCards.map((card, index) => (
              <View
                key={card.id}
                style={[styles.fanCard, { left: 35 + index * 53, top: index === 1 ? 0 : 17, transform: [{ rotate: `${(index - 1) * 17}deg` }] }]}>
                <PlayingCard card={card} large />
              </View>
            ))}
          </View>
          <Text style={styles.kicker}>BİR DESTE. BİR MASA. BİR REKABET.</Text>
          <Text style={styles.title}>{'İyi bir el,\niyi bir akşam.'}</Text>
          <Text style={styles.subtitle}>{'Klasik kartlar, tanıdık heyecan.\nİster tek başına, ister arkadaşlarınla.'}</Text>
        </View>

        <View style={styles.actions}>
          <Pressable accessibilityRole="button" style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={() => router.push({ pathname: '/game', params: { mode: 'single' } })}>
            <View><Text style={styles.primaryText}>Tek oyunculu</Text><Text style={styles.primaryCaption}>3 bota karşı · İnternetsiz oyna</Text></View>
            <Text style={styles.arrow}>→</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={({ pressed }) => [styles.onlineButton, pressed && styles.pressed]} onPress={() => router.push('/online?quick=1')}>
            <View><Text style={styles.secondaryText}>Hemen oyna</Text><Text style={styles.onlineCaption}>Uygun çevrim içi masaya otomatik otur</Text></View><Text style={styles.onlineArrow}>→</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={({ pressed }) => [styles.friendButton, pressed && styles.pressed]} onPress={() => router.push('/online')}>
            <View><Text style={styles.friendText}>Arkadaşlarınla oyna</Text><Text style={styles.onlineCaption}>Özel masa kur, katıl veya davet et</Text></View><Text style={styles.friendArrow}>↗</Text>
          </Pressable>
          <View style={styles.links}><Pressable accessibilityRole="button" onPress={() => router.push('/friends' as Href)}><Text style={styles.link}>Arkadaşlar</Text></Pressable><Text style={styles.link}>·</Text><Pressable accessibilityRole="button" onPress={() => router.push('/setup')}><Text style={styles.link}>Aynı cihazda</Text></Pressable><Text style={styles.link}>·</Text><Pressable accessibilityRole="button" onPress={() => router.push('/rules')}><Text style={styles.link}>Kurallar</Text></Pressable></View>
        </View>

        <Text style={styles.footer}>12 EL · KLASİK AMERİKANO</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.felt },
  content: { flexGrow: 1, paddingHorizontal: 26, paddingBottom: 22, maxWidth: 620, width: '100%', alignSelf: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 12 },
  brandMark: { width: 30, height: 38, borderRadius: 5, backgroundColor: palette.cream, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-6deg' }] },
  brandLetter: { color: palette.felt, fontSize: 20, fontWeight: '900' },
  brand: { color: palette.cream, fontSize: 16, fontWeight: '900', letterSpacing: 3 },
  account: { color: palette.gold, fontSize: 13, fontWeight: '700', paddingVertical: 8, paddingLeft: 12 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 36, paddingBottom: 30 },
  cardFan: { width: 290, height: 198, marginBottom: 22 },
  fanCard: { position: 'absolute' },
  title: { color: palette.cream, fontSize: 42, lineHeight: 46, fontWeight: '800', textAlign: 'center', letterSpacing: -1.4 },
  kicker: { color: palette.gold, fontSize: 9, fontWeight: '700', letterSpacing: 2, marginBottom: 15 },
  subtitle: { color: palette.muted, fontSize: 16, lineHeight: 23, textAlign: 'center', marginTop: 12, maxWidth: 310 },
  actions: { gap: 12 },
  primaryButton: { minHeight: 76, borderRadius: 16, backgroundColor: palette.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  primaryCaption: { color: '#494127', fontSize: 12, marginTop: 5 },
  onlineButton: { minHeight: 76, borderRadius: 16, borderWidth: 1, borderColor: '#b1c2a650', backgroundColor: '#ffffff08', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  friendButton: { minHeight: 62, borderRadius: 16, borderWidth: 1, borderColor: palette.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  onlineCaption: { color: palette.muted, fontSize: 12, marginTop: 5 },
  onlineArrow: { color: palette.gold, fontSize: 27 },
  friendText: { color: palette.cream, fontSize: 15, fontWeight: '700' }, friendArrow: { color: palette.muted, fontSize: 22 },
  links: { flexDirection: 'row', gap: 20, justifyContent: 'center', paddingVertical: 8 },
  link: { color: '#b8c6bb', fontSize: 13, paddingVertical: 8 },
  primaryText: { color: palette.ink, fontSize: 18, fontWeight: '900' },
  arrow: { color: palette.ink, fontSize: 25, fontWeight: '500' },
  secondaryButton: { minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: palette.cream, fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  footer: { color: palette.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.6, textAlign: 'center', marginTop: 18 },
});
