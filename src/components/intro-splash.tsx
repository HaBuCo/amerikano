import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { useGameSounds } from '@/audio/game-sounds';
import { cardArt } from '@/constants/card-art';
import { palette as p } from '@/constants/palette';
import { useTranslations } from '@/i18n/language';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const useNativeDriver = Platform.OS !== 'web';
const paint = (css: string) => (Platform.OS === 'web' ? { backgroundImage: css } : { experimental_backgroundImage: css }) as ViewStyle;
// The native splash shows this monogram at 76 points on the felt colour; the intro starts from the same picture.
const MONOGRAM = require('../../assets/images/splash-icon.png');
const MONOGRAM_SIZE = 76;
const FAN = ['A-spades', 'A-hearts', 'joker', 'A-diamonds', 'A-clubs'];
const FAN_ANGLES = [-34, -17, 0, 17, 34];
const CARD_WIDTH = 76;
const CARD_HEIGHT = 106;
const SUITS = ['♠', '♥', '♦', '♣'];
const HOLD_MS = 2600;
const FADE_MS = 450;

type Mote = { x: number; delay: number; duration: number; size: number; suit: string; drift: number };
function makeMotes(width: number): Mote[] {
  return Array.from({ length: 14 }, (_, index) => ({
    x: (index + 0.5) / 14 * width + (Math.random() - 0.5) * 30,
    delay: Math.random() * 1400,
    duration: 3200 + Math.random() * 2200,
    size: 12 + Math.random() * 14,
    suit: SUITS[index % SUITS.length],
    drift: (Math.random() - 0.5) * 50,
  }));
}

/** Suits drifting up through the light, like dust over a card table. */
function Motes({ width, height }: { width: number; height: number }) {
  const [motes] = useState(() => makeMotes(width));
  const [values] = useState(() => motes.map(() => new Animated.Value(0)));
  useEffect(() => {
    const loops = motes.map((mote, index) => Animated.loop(Animated.sequence([
      Animated.delay(mote.delay),
      Animated.timing(values[index], { toValue: 1, duration: mote.duration, easing: Easing.linear, useNativeDriver }),
    ])));
    loops.forEach(loop => loop.start());
    return () => loops.forEach(loop => loop.stop());
  }, [motes, values]);
  return <View style={s.fill}>
    {motes.map((mote, index) => {
      const value = values[index];
      const red = mote.suit === '♥' || mote.suit === '♦';
      return <Animated.Text key={index} style={[s.mote, {
        left: mote.x, fontSize: mote.size, color: red ? '#F2A0A0' : '#F8F1DF',
        opacity: value.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 0.22, 0.22, 0] }),
        transform: [
          { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [height * 0.9, height * 0.25] }) },
          { translateX: value.interpolate({ inputRange: [0, 1], outputRange: [0, mote.drift] }) },
        ],
      }]}>{mote.suit}</Animated.Text>;
    })}
  </View>;
}

/**
 * The animated opening shown once per cold start, right after the native
 * splash: the monogram grows, a fan of aces opens behind it, the name lights up.
 * A tap skips it.
 */
export function IntroSplash({ onDone }: { onDone: () => void }) {
  const { t } = useTranslations();
  const { width, height } = useWindowDimensions();
  const safeArea = useSafeAreaInsets();
  const { play } = useGameSounds();
  const [grow] = useState(() => new Animated.Value(0));
  const [fan] = useState(() => FAN.map(() => new Animated.Value(0)));
  const [title] = useState(() => new Animated.Value(0));
  const [shine] = useState(() => new Animated.Value(0));
  const [maker] = useState(() => new Animated.Value(0));
  const [spin] = useState(() => new Animated.Value(0));
  const [leave] = useState(() => new Animated.Value(1));
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const rays = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 30000, easing: Easing.linear, useNativeDriver }));
    rays.start();
    void AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then(reduced => {
      if (cancelled) return;
      if (reduced) {
        // Still the same picture, without the movement.
        [grow, title, maker, ...fan].forEach(value => value.setValue(1));
      } else {
        Animated.parallel([
          Animated.spring(grow, { toValue: 1, friction: 6, tension: 60, useNativeDriver }),
          Animated.stagger(80, fan.map(value => Animated.spring(value, { toValue: 1, friction: 6, tension: 55, useNativeDriver }))),
          Animated.sequence([Animated.delay(550), Animated.timing(title, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver })]),
          Animated.sequence([Animated.delay(950), Animated.timing(shine, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver })]),
          Animated.sequence([Animated.delay(800), Animated.timing(maker, { toValue: 1, duration: 500, useNativeDriver })]),
        ]).start();
        setTimeout(() => { if (!cancelled) play('deal'); }, 160);
      }
      timer = setTimeout(() => { if (!cancelled) setLeaving(true); }, reduced ? 1400 : HOLD_MS);
    });
    return () => { cancelled = true; rays.stop(); if (timer) clearTimeout(timer); };
    // The intro runs once; the sound player identity does not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const fade = Animated.timing(leave, { toValue: 0, duration: FADE_MS, easing: Easing.in(Easing.quad), useNativeDriver });
    fade.start(({ finished }) => { if (finished) onDone(); });
    return () => fade.stop();
  }, [leave, leaving, onDone]);

  const emblem = Math.min(150, width * 0.34, height * 0.28);
  const lift = Math.min(70, height * 0.08);
  const radius = Math.min(150, width * 0.36);
  return <Animated.View style={[s.root, { opacity: leave }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={t("Geç")} onPress={() => setLeaving(true)} style={s.fill}>
      <View style={[s.fill, s.felt]} />
      <Animated.View style={[s.rays, { width: height * 1.6, height: height * 1.6, left: (width - height * 1.6) / 2, top: height * 0.42 - height * 0.8,
        transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
        {Array.from({ length: 10 }, (_, index) => <View key={index} style={[s.ray, { left: height * 0.8 - 6, height: height * 1.6, transform: [{ rotate: `${index * 18}deg` }] }]} />)}
      </Animated.View>
      <View style={[s.fill, s.vignette]} />
      <Motes width={width} height={height} />

      <View style={[s.stage, { top: height * 0.42 - lift }]}>
        {FAN.map((key, index) => {
          const angle = FAN_ANGLES[index];
          const radians = angle * Math.PI / 180;
          const value = fan[index];
          return <Animated.View key={key} style={[s.card, {
            opacity: value.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1] }),
            transform: [
              { translateX: value.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(radians) * radius] }) },
              { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [10, -Math.cos(radians) * radius * 0.5 + 4] }) },
              { rotate: value.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${angle}deg`] }) },
              { scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
            ],
          }]}>
            <Image source={cardArt[key]} style={s.cardFace} contentFit="fill" priority="high" transition={0} />
          </Animated.View>;
        })}
        <Animated.View style={[s.glow, { width: emblem * 1.7, height: emblem * 1.7, borderRadius: emblem, opacity: grow }]} />
        <Animated.View style={{ transform: [
          // Starts where the native splash drew it: the middle of the screen.
          { translateY: grow.interpolate({ inputRange: [0, 1], outputRange: [height * 0.08 + lift, 30] }) },
          { scale: grow.interpolate({ inputRange: [0, 1], outputRange: [MONOGRAM_SIZE / emblem, 1] }) },
        ] }}>
          <Image source={MONOGRAM} style={{ width: emblem, height: emblem }} contentFit="contain" priority="high" transition={0} />
        </Animated.View>
      </View>

      <Animated.View style={[s.titleBlock, { top: height * 0.42 + emblem * 0.55, opacity: title,
        transform: [{ translateY: title.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}>
        <View style={s.wordmarkClip}>
          <Text style={s.wordmark}>AMERİKANO</Text>
          {/* The streak fades at both ends, so the clipped edges of the word never show. */}
          <Animated.View style={[s.shine, {
            opacity: shine.interpolate({ inputRange: [0, 0.2, 0.75, 1], outputRange: [0, 0.9, 0.9, 0] }),
            transform: [{ translateX: shine.interpolate({ inputRange: [0, 1], outputRange: [-40, 280] }) }, { rotate: '18deg' }],
          }]} />
        </View>
        <Text style={s.tagline}>{t("Kartlar dağıtılıyor…")}</Text>
      </Animated.View>

      <Animated.View style={[s.makerBlock, { bottom: 36 + safeArea.bottom, opacity: maker }]}>
        <View style={s.makerRule} />
        <Text style={s.maker}>hegionsoft</Text>
      </Animated.View>
    </Pressable>
  </Animated.View>;
}

const s = StyleSheet.create({
  root: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000, backgroundColor: p.felt },
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  felt: { backgroundColor: p.felt, ...paint('radial-gradient(ellipse 90% 70% at 50% 42%, #1F6E4B 0%, #154631 45%, #0A2A1D 100%)') },
  vignette: { ...paint('radial-gradient(ellipse 120% 90% at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.45) 100%)') },
  rays: { position: 'absolute', opacity: 0.55 },
  ray: {
    position: 'absolute', top: 0, width: 12,
    ...paint('linear-gradient(180deg, rgba(255,227,154,0) 8%, rgba(255,227,154,0.16) 34%, rgba(255,227,154,0) 50%, rgba(255,227,154,0.16) 66%, rgba(255,227,154,0) 92%)'),
  },
  mote: { position: 'absolute', top: 0, fontWeight: '900' },
  stage: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center', height: 0 },
  card: {
    position: 'absolute', width: CARD_WIDTH, height: CARD_HEIGHT, borderRadius: 6, overflow: 'hidden', backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#d2c6ad', boxShadow: '0 8px 18px rgba(0,0,0,0.45)',
  },
  cardFace: { width: '100%', height: '100%' },
  glow: { position: 'absolute', ...paint('radial-gradient(circle at 50% 50%, rgba(246,213,126,0.45) 0%, rgba(217,164,65,0.12) 45%, rgba(217,164,65,0) 70%)') },
  titleBlock: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 6 },
  wordmarkClip: { overflow: 'hidden', paddingHorizontal: 6 },
  wordmark: {
    color: '#F1C66D', fontSize: 38, fontWeight: '900', letterSpacing: 5,
    textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 8,
  },
  shine: {
    position: 'absolute', top: -20, left: 0, width: 46, height: 90,
    ...paint('linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,246,214,0.7) 50%, rgba(255,255,255,0) 100%)'),
  },
  tagline: { color: '#C8D7CD', fontSize: 12, fontWeight: '800', letterSpacing: 2.4 },
  makerBlock: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 10 },
  makerRule: { width: 28, height: 1, backgroundColor: '#F8F1DF55' },
  maker: { color: '#F8F1DFB0', fontSize: 13, fontWeight: '700', letterSpacing: 4 },
});
