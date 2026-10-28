import { useTranslations } from '@/i18n/language';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { paint, Trophy } from '@/components/trophy';
import { palette as p } from '@/constants/palette';
import { MODAL_ORIENTATIONS } from '@/constants/orientation';

const useNativeDriver = Platform.OS !== 'web';
const CONFETTI_COLORS = [p.gold, '#F1C66D', p.cream, '#E05A5A', '#7BE4A5', '#8EC5FF'];
const SUITS = ['♠', '♥', '♦', '♣'];

type Piece = { x: number; delay: number; duration: number; drift: number; spin: number; size: number; color: string; suit?: string };

function makePieces(count: number, width: number): Piece[] {
  return Array.from({ length: count }, (_, index) => ({
    x: Math.random() * width,
    delay: Math.random() * 650,
    duration: 1900 + Math.random() * 1500,
    drift: (Math.random() - 0.5) * 120,
    spin: (Math.random() - 0.5) * 900,
    size: 7 + Math.random() * 8,
    color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
    // Every fourth piece is a card suit instead of a paper strip.
    suit: index % 4 === 0 ? SUITS[(index / 4) % SUITS.length] : undefined,
  }));
}

/** Falling confetti and card suits over the whole screen; never catches touches. */
export function Confetti({ active, count = 46 }: { active: boolean; count?: number }) {
  const { width, height } = useWindowDimensions();
  // A fresh shower each time it turns on.
  const pieces = useMemo(() => (active ? makePieces(count, width) : []), [active, count, width]);
  const values = useMemo(() => pieces.map(() => new Animated.Value(0)), [pieces]);

  useEffect(() => {
    if (!active) return;
    const animations = pieces.map((piece, index) => Animated.timing(values[index], {
      toValue: 1, delay: piece.delay, duration: piece.duration, easing: Easing.in(Easing.quad), useNativeDriver,
    }));
    const all = Animated.parallel(animations);
    all.start();
    return () => all.stop();
  }, [active, pieces, values]);

  if (!active) return null;
  return <View style={s.confetti}>
    {pieces.map((piece, index) => {
      const value = values[index];
      const style = {
        left: piece.x,
        opacity: value.interpolate({ inputRange: [0, 0.08, 0.85, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [-40, height + 40] }) },
          { translateX: value.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, piece.drift, piece.drift * 0.4] }) },
          { rotate: value.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${piece.spin}deg`] }) },
        ],
      };
      return piece.suit
        ? <Animated.Text key={index} style={[s.suit, { color: piece.color, fontSize: piece.size * 2 }, style]}>{piece.suit}</Animated.Text>
        : <Animated.View key={index} style={[s.strip, { width: piece.size, height: piece.size * 0.45, backgroundColor: piece.color }, style]} />;
    })}
  </View>;
}

/** Counts up to `target` so a prize lands with a little drama. */
function useCountUp(target: number | null, delay: number) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!target) return;
    let frame = 0;
    const startAt = Date.now() + delay;
    const tick = () => {
      const elapsed = Math.max(0, Date.now() - startAt);
      const share = Math.min(1, elapsed / 1100);
      setShown(Math.round(target * (1 - (1 - share) ** 3)));
      if (share < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [delay, target]);
  return shown;
}

/**
 * Full-screen win moment shown before the score sheet: a trophy that springs
 * in, the result and, at coin tables, the prize counting up.
 */
export function VictoryCelebration({ visible, title, subtitle, prize, onDone }: {
  visible: boolean; title: string; subtitle?: string; prize?: number | null; onDone: () => void;
}) {
  const { t } = useTranslations();
  const [entrance] = useState(() => new Animated.Value(0));
  const coins = useCountUp(visible && prize ? prize : null, 900);

  useEffect(() => {
    if (!visible) {
      entrance.setValue(0);
      return;
    }
    const pop = Animated.spring(entrance, { toValue: 1, friction: 5, tension: 70, useNativeDriver });
    pop.start();
    // The score sheet follows on its own if the player does not tap.
    const timer = setTimeout(onDone, 6000);
    return () => { pop.stop(); clearTimeout(timer); };
  }, [entrance, onDone, visible]);

  return <Modal supportedOrientations={MODAL_ORIENTATIONS} visible={visible} transparent animationType="fade" onRequestClose={onDone}>
    <Pressable accessibilityRole="button" accessibilityLabel={t("Sonuçları gör")} onPress={onDone} style={s.backdrop}>
      <Confetti active={visible} count={64} />
      <Animated.View style={[s.center, {
        opacity: entrance,
        transform: [{ scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
      }]}>
        <Animated.View style={{ transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [-70, 0] }) }] }}>
          <Trophy active={visible} />
        </Animated.View>
        <Text style={s.kicker}>{t("ZAFER")}</Text>
        <Text style={s.title}>{title}</Text>
        {!!subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
        {!!prize && <View style={s.prizeRow}>
          <Text style={s.prize}>+{coins.toLocaleString()}</Text>
          <View style={s.coin}><View style={s.coinInner} /></View>
        </View>}
        <Text style={s.hint}>{t("Sonuçları görmek için dokun")}</Text>
      </Animated.View>
    </Pressable>
  </Modal>;
}

const s = StyleSheet.create({
  confetti: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden', pointerEvents: 'none' },
  strip: { position: 'absolute', top: 0, borderRadius: 2 },
  suit: { position: 'absolute', top: 0, fontWeight: '900' },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: '#03110bdd' },
  center: { alignItems: 'center', maxWidth: 460 },
  kicker: { color: p.gold, fontSize: 12, fontWeight: '900', letterSpacing: 5, marginTop: 8 },
  title: { color: p.cream, fontSize: 40, lineHeight: 46, fontWeight: '900', letterSpacing: -1, textAlign: 'center', marginTop: 6 },
  subtitle: { color: '#C8D7CD', fontSize: 15, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  prizeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 },
  prize: { color: p.gold, fontSize: 34, fontWeight: '900', fontVariant: ['tabular-nums'] },
  coin: {
    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: p.gold,
    ...paint('radial-gradient(circle at 35% 30%, #FFF1B8 0%, #E9B848 45%, #A26C17 100%)'),
    boxShadow: '0 3px 6px rgba(0,0,0,0.4)',
  },
  coinInner: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#9A6516' },
  hint: { color: p.muted, fontSize: 12, fontWeight: '700', marginTop: 28 },
});
