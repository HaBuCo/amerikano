import { StyleSheet, Text, View } from 'react-native';
import { useTranslations } from '@/i18n/language';
import type { TableBadge as Badge } from '@/game/coin-economy';

const LOOK: Record<Badge, { label: string; color: string; background: string }> = {
  royal: { label: 'KRALİYET', color: '#E8C8FF', background: '#E8C8FF24' },
  emerald: { label: 'ZÜMRÜT', color: '#80E8BE', background: '#80E8BE21' },
};

/** Shown beside a player who has won at the Emerald or Royal table. */
export function TableBadge({ badge, large = false }: { badge: Badge | null | undefined; large?: boolean }) {
  const { t } = useTranslations();
  if (!badge) return null;
  const look = LOOK[badge];
  return <View accessibilityLabel={t("{0} masası şampiyonu", [t(look.label)])}
    style={[s.pill, large && s.large, { backgroundColor: look.background, borderColor: look.color + '66' }]}>
    <Text style={[s.text, large && s.textLarge, { color: look.color }]} numberOfLines={1}>{t(look.label)}</Text>
  </View>;
}

const s = StyleSheet.create({
  pill: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7, borderWidth: 1 },
  large: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9 },
  text: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  textLarge: { fontSize: 11, letterSpacing: 1.4 },
});
