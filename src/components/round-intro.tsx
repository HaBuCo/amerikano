import { useTranslations } from '@/i18n/language';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { palette as p } from '@/constants/palette';
import { ROUND_CONTRACTS } from '@/game/contracts';

export function RoundIntro({ roundIndex, contractIndex = roundIndex, roundCount = 12, starterName, jokerRestricted = contractIndex < 5, mode = 'detailed', enabled = true }: { roundIndex: number; contractIndex?: number; roundCount?: number; starterName: string; jokerRestricted?: boolean; mode?: 'short' | 'detailed' | 'off'; enabled?: boolean }) {
  const { t } = useTranslations();
  const [progress] = useState(() => new Animated.Value(0));
  const lastShownRound = useRef<number | null>(null);
  const contract = ROUND_CONTRACTS[contractIndex];
  const useNativeDriver = Platform.OS !== 'web';

  useEffect(() => {
    if (!enabled) {
      progress.stopAnimation();
      progress.setValue(0);
      return;
    }
    if (lastShownRound.current === roundIndex) return;
    lastShownRound.current = roundIndex;
    progress.setValue(0);
    const animation = Animated.sequence([
      Animated.delay(250),
      Animated.timing(progress, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver }),
      Animated.delay(1750),
      Animated.timing(progress, { toValue: 0, duration: 420, easing: Easing.in(Easing.cubic), useNativeDriver }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [enabled, progress, roundIndex, useNativeDriver]);

  if (!contract) return null;
  if (mode === 'off') return null;
  const note = contract.final ? t("Bütün elini tek seferde aç") : jokerRestricted ? t("Açılışta Joker kullanılamaz") : t("Açılışta Joker kullanılabilir");
  return <Animated.View style={[s.overlay, {
    opacity: progress,
    transform: [
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
    ],
  }]}>
    <View style={s.rule} />
    <Text style={s.eyebrow}>{t("YENİ EL")}</Text>
    <Text style={s.number}>{String(roundIndex + 1).padStart(2, '0')} <Text style={s.of}>/ {roundCount}</Text></Text>
    <Text style={s.contract}>{t(contract.title)}</Text>
    {mode === 'detailed' && <View style={s.details}><Text style={s.detail}>{t("Başlayan ·")} {starterName}</Text><Text style={s.dot}>◆</Text><Text style={s.detail}>{note}</Text></View>}
    <View style={s.rule} />
  </Animated.View>;
}

const s = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000, elevation: 1000, pointerEvents: 'none', backgroundColor: '#061a13f2', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  rule: { width: 54, height: 1, backgroundColor: p.gold, marginVertical: 18 }, eyebrow: { color: p.gold, fontSize: 10, fontWeight: '900', letterSpacing: 4 },
  number: { color: p.cream, fontSize: 62, lineHeight: 69, fontWeight: '300', marginTop: 10 }, of: { color: p.muted, fontSize: 20, fontWeight: '700' },
  contract: { color: p.cream, fontSize: 25, lineHeight: 31, fontWeight: '900', textAlign: 'center', maxWidth: 430, marginTop: 8 },
  details: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 9, marginTop: 15 }, detail: { color: p.muted, fontSize: 11, fontWeight: '700' }, dot: { color: p.gold, fontSize: 7 },
});
