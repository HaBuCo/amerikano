import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
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

const NOTCH_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

/** Her masa bir poker çipi: kenarında çentikler, ortada giriş ücreti. Seçili çip büyür ve parlar. */
export function RoomTierCard({ tier, selected, affordable, width, waitingPlayers, recommended, prized, onPress }: {
  tier: Tier;
  selected: boolean;
  affordable: boolean | null;
  width: number;
  waitingPlayers?: number;
  recommended?: boolean;
  /** Winning here earns a felt and a badge sold nowhere else. */
  prized?: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslations();
  const [focus] = useState(() => new Animated.Value(selected ? 1 : 0));
  useEffect(() => {
    Animated.spring(focus, { toValue: selected ? 1 : 0, friction: 7, tension: 70, useNativeDriver: true }).start();
  }, [selected, focus]);
  const scale = focus.interpolate({ inputRange: [0, 1], outputRange: [0.76, 1] });
  const labelOpacity = focus.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  const locked = affordable === false;
  const status = locked ? t('BAKİYE YETERSİZ')
    : recommended ? t('EN HIZLI SEÇENEK')
    : waitingPlayers !== undefined && waitingPlayers > 0 ? t('{0} oyuncu bekliyor', [waitingPlayers])
    : prized ? t('Kazanana özel çuha')
    : null;
  const notchWidth = width * 0.17;
  const innerSize = width * 0.7;
  return <Pressable accessibilityRole="button"
    accessibilityLabel={`${t(tier.name)}, ${tier.fee.toLocaleString()} coin`}
    accessibilityState={{ selected }} onPress={onPress} style={[s.item, { width }]}>
    <Animated.View style={[s.chip, { width, height: width, borderRadius: width / 2, backgroundColor: tier.accent, transform: [{ scale }] },
      selected && { shadowColor: tier.accent, shadowOpacity: 0.7, shadowRadius: 22, shadowOffset: { width: 0, height: 0 }, elevation: 12 }, locked && s.chipLocked]}>
      {NOTCH_ANGLES.map(angle => <View key={angle} pointerEvents="none" style={[s.notchRing, { transform: [{ rotate: `${angle}deg` }] }]}>
        <View style={[s.notch, { width: notchWidth, height: width * 0.12, left: (width - notchWidth) / 2 }]} />
      </View>)}
      <View style={[s.inner, { width: innerSize, height: innerSize, borderRadius: innerSize / 2, backgroundColor: tier.surface }]}>
        <Text style={[s.fee, { fontSize: width * 0.25 }]} adjustsFontSizeToFit numberOfLines={1}>{tier.fee.toLocaleString()}</Text>
        <Text style={[s.coin, { color: tier.accent }]}>{t('COIN GİRİŞ')}</Text>
      </View>
    </Animated.View>
    <Animated.View style={[s.labels, { opacity: labelOpacity }]}>
      <Text style={s.name} numberOfLines={1}>{t(tier.name)}</Text>
      <View style={s.statusSlot}>
        {status && <Text style={[s.status, locked ? s.statusLocked : (recommended || (waitingPlayers ?? 0) > 0) ? s.statusLive : prized && { color: tier.accent }]} numberOfLines={1}>{status}</Text>}
      </View>
    </Animated.View>
  </Pressable>;
}

const s = StyleSheet.create({
  item: { alignItems: 'center', paddingVertical: 14 },
  chip: { alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  chipLocked: { opacity: 0.45 },
  notchRing: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  notch: { position: 'absolute', top: 0, borderRadius: 4, backgroundColor: '#FFF8E9' },
  inner: { alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFF8E9', paddingHorizontal: 8 },
  fee: { color: '#FFF8E9', fontWeight: '900', letterSpacing: -0.5 },
  coin: { fontSize: 8, fontWeight: '900', letterSpacing: 1.2, marginTop: 1 },
  labels: { alignItems: 'center', marginTop: 6, gap: 3 },
  name: { color: '#FFF8E9', fontSize: 20, fontWeight: '900' },
  statusSlot: { minHeight: 16 },
  status: { color: '#F8F2E8B0', fontSize: 11, lineHeight: 16, fontWeight: '800' },
  statusLive: { color: '#A9F3CD' },
  statusLocked: { color: '#FFD7B0' },
});
