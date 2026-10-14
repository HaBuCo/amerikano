import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslations } from '@/i18n/language';
import type { RoomEntryFee } from '@/game/coin-economy';

type Tier = {
  fee: RoomEntryFee;
  name: string;
  subtitle: string;
  suit: string;
  accent: string;
  surface: string;
};

export function RoomTierCard({ tier, selected, affordable, tablet, waitingPlayers, recommended, onPress }: {
  tier: Tier;
  selected: boolean;
  affordable: boolean | null;
  tablet: boolean;
  waitingPlayers?: number;
  recommended?: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslations();
  return <Pressable accessibilityRole="button"
    accessibilityLabel={`${t(tier.name)}, ${tier.fee.toLocaleString()} coin`}
    accessibilityState={{ selected }} onPress={onPress}
    style={({ pressed }) => [s.card, { width: tablet ? '31.8%' : '48.3%', borderColor: selected ? tier.accent : '#ffffff1b',
      backgroundColor: selected ? tier.surface : '#143b2c' }, pressed && s.pressed]}>
    <View style={[s.accent, { backgroundColor: tier.accent }]} />
    <View style={s.top}><Text style={[s.suit, { color: tier.accent }]}>{tier.suit}</Text>
      <View style={[s.radio, selected && { backgroundColor: tier.accent, borderColor: tier.accent }]}>{selected && <Text style={s.radioCheck}>✓</Text>}</View></View>
    <View style={s.bottom}>
      <Text style={s.name} numberOfLines={1}>{t(tier.name)}</Text>
      <Text style={s.subtitle} numberOfLines={1}>{t(tier.subtitle)}</Text>
      {waitingPlayers !== undefined && <Text style={[s.activity, waitingPlayers > 0 && s.activityLive]} numberOfLines={1}>
        {waitingPlayers > 0 ? t('{0} oyuncu bekliyor', [waitingPlayers]) : t('Bekleyen yok')}
      </Text>}
      {recommended && <Text style={s.recommended}>{t('EN HIZLI SEÇENEK')}</Text>}
      <View style={s.priceLine}><Text style={s.fee}>{tier.fee.toLocaleString()}</Text><Text style={s.coin}>{t('COIN GİRİŞ')}</Text></View>
    </View>
    {affordable === false && <Text style={s.locked}>{t('BAKİYE YETERSİZ')}</Text>}
  </Pressable>;
}

const s = StyleSheet.create({
  card: { minHeight: 152, borderRadius: 16, borderWidth: 1, padding: 14, justifyContent: 'space-between', overflow: 'hidden' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.985 }] },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  suit: { fontSize: 30, lineHeight: 34, fontWeight: '900' },
  radio: { width: 19, height: 19, borderRadius: 10, borderWidth: 1, borderColor: '#ffffff59', alignItems: 'center', justifyContent: 'center' },
  radioCheck: { color: '#17211C', fontSize: 11, fontWeight: '900' },
  bottom: { gap: 2 },
  name: { color: '#FFF8E9', fontSize: 17, fontWeight: '900' },
  subtitle: { color: '#F8F1DFB0', fontSize: 10, lineHeight: 14 },
  activity: { color: '#F8F1DFB090', fontSize: 10, lineHeight: 14, fontWeight: '700' },
  activityLive: { color: '#A9F3CD' },
  recommended: { color: '#F1C66D', fontSize: 8, lineHeight: 12, fontWeight: '900', letterSpacing: 0.8 },
  priceLine: { flexDirection: 'row', gap: 5, alignItems: 'baseline', marginTop: 4 },
  fee: { color: '#FFF8E9', fontSize: 21, lineHeight: 25, fontWeight: '900' },
  coin: { color: '#F8F1DFB0', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  locked: { position: 'absolute', right: 11, top: 43, color: '#FFD7B0', fontSize: 7, fontWeight: '900' },
});
