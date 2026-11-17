import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native';

const useNativeDriver = Platform.OS !== 'web';
// Polished gold on a turned cup: dark edges and a bright band where the light hits.
const GOLD = 'linear-gradient(90deg, #6E4209 0%, #B98022 13%, #F0C65A 29%, #FFF6CF 37%, #F3C650 47%, #C99129 69%, #8C5912 87%, #573505 100%)';
const GOLD_TOP = 'linear-gradient(180deg, #FFF3C2 0%, #EDBD4C 55%, #A26C17 100%)';
const RAY_COUNT = 9;
// React Native draws CSS gradients natively; the web build reads the standard property.
export const paint = (css: string) => (Platform.OS === 'web' ? { backgroundImage: css } : { experimental_backgroundImage: css }) as ViewStyle;
// Where the sparkles glint, around the cup's centre.
const SPARKLES = [
  { x: -78, y: -26, size: 20, delay: 0 },
  { x: 80, y: -48, size: 15, delay: 700 },
  { x: -66, y: 62, size: 12, delay: 1300 },
  { x: 78, y: 40, size: 18, delay: 400 },
  { x: -26, y: -84, size: 11, delay: 1800 },
  { x: 34, y: -88, size: 13, delay: 1000 },
];

const ease = Easing.inOut(Easing.quad);
const to = (value: Animated.Value, toValue: number, duration: number, easing = ease) =>
  Animated.timing(value, { toValue, duration, easing, useNativeDriver });

function Sparkle({ x, y, size, delay, active }: (typeof SPARKLES)[number] & { active: boolean }) {
  const [glint] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(delay), to(glint, 1, 380), to(glint, 0, 520), Animated.delay(1500 - delay / 2),
    ]));
    loop.start();
    return () => { loop.stop(); glint.setValue(0); };
  }, [active, delay, glint]);
  return <Animated.View style={[s.sparkle, {
    left: 110 + x - size / 2, top: 92 + y - size / 2, width: size, height: size, opacity: glint,
    transform: [
      { scale: glint.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) },
      { rotate: glint.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }) },
    ],
  }]}>
    <View style={[s.sparkleBar, { width: size, height: 2, top: size / 2 - 1 }]} />
    <View style={[s.sparkleBar, { width: 2, height: size, left: size / 2 - 1 }]} />
  </Animated.View>;
}

/** A gold cup drawn from layers, floating, catching light and throwing rays. */
export function Trophy({ active }: { active: boolean }) {
  const [float] = useState(() => new Animated.Value(0));
  const [shine] = useState(() => new Animated.Value(0));
  const [spin] = useState(() => new Animated.Value(0));
  const [glow] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!active) return;
    const loops = [
      Animated.loop(Animated.sequence([to(float, 1, 1700), to(float, 0, 1700)])),
      // A streak of light sweeps across the bowl now and then.
      Animated.loop(Animated.sequence([
        Animated.delay(450), to(shine, 1, 950, Easing.inOut(Easing.cubic)), to(shine, 0, 0), Animated.delay(1600),
      ])),
      Animated.loop(to(spin, 1, 26000, Easing.linear)),
      Animated.loop(Animated.sequence([to(glow, 1, 1100), to(glow, 0, 1100)])),
    ];
    loops.forEach(loop => loop.start());
    return () => {
      loops.forEach(loop => loop.stop());
      [float, shine, spin, glow].forEach(value => value.setValue(0));
    };
  }, [active, float, glow, shine, spin]);

  const lift = float.interpolate({ inputRange: [0, 1], outputRange: [0, -7] });
  return <View style={s.stage}>
    <Animated.View style={[s.glow, {
      opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
      transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] }) }],
    }]} />
    <Animated.View style={[s.rays, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
      {Array.from({ length: RAY_COUNT }, (_, index) =>
        <View key={index} style={[s.ray, { transform: [{ rotate: `${index * (180 / RAY_COUNT)}deg` }] }]} />)}
    </Animated.View>
    <Animated.View style={[s.floorShadow, {
      transform: [{ scaleX: float.interpolate({ inputRange: [0, 1], outputRange: [1, 0.86] }) }],
      opacity: float.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] }),
    }]} />
    <Animated.View style={[s.cup, { transform: [{ translateY: lift }] }]}>
      <View style={[s.handle, s.handleLeft]} />
      <View style={[s.handle, s.handleRight]} />
      <View style={s.bowl}>
        <View style={s.bowlShade} />
        <View style={s.medallion}><Text style={s.medallionText}>1</Text></View>
        <Animated.View style={[s.shine, {
          transform: [
            { translateX: shine.interpolate({ inputRange: [0, 1], outputRange: [-70, 160] }) },
            { rotate: '20deg' },
          ],
        }]} />
      </View>
      <View style={s.rim} />
      <View style={s.mouth} />
      <View style={s.collar} />
      <View style={s.stem} />
      <View style={s.knot} />
      <View style={s.foot} />
      <View style={s.cap} />
      <View style={s.plinth}><View style={s.plaque} /></View>
    </Animated.View>
    {SPARKLES.map((sparkle, index) => <Sparkle key={index} {...sparkle} active={active} />)}
  </View>;
}

const metal = { backgroundColor: '#E8BE70', ...paint(GOLD) };
const s = StyleSheet.create({
  stage: { width: 220, height: 232, pointerEvents: 'none' },
  glow: {
    position: 'absolute', left: -30, top: -50, width: 280, height: 280, borderRadius: 140,
    ...paint('radial-gradient(circle at 50% 50%, rgba(246,213,126,0.5) 0%, rgba(232,190,112,0.18) 38%, rgba(232,190,112,0) 66%)'),
  },
  rays: { position: 'absolute', left: -50, top: -68, width: 320, height: 320 },
  ray: {
    position: 'absolute', left: 156, top: 0, width: 8, height: 320,
    ...paint('linear-gradient(180deg, rgba(255,227,154,0) 4%, rgba(255,227,154,0.28) 30%, rgba(255,227,154,0) 48%, rgba(255,227,154,0) 52%, rgba(255,227,154,0.28) 70%, rgba(255,227,154,0) 96%)'),
  },
  floorShadow: {
    position: 'absolute', left: 44, top: 200, width: 132, height: 18, borderRadius: 66,
    ...paint('radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 70%)'),
  },
  cup: { position: 'absolute', left: 0, top: 0, width: 220, height: 232 },
  handle: { position: 'absolute', top: 34, width: 48, height: 58, borderRadius: 24, borderWidth: 9, borderColor: '#C48D2A', borderTopColor: '#F2CB63' },
  handleLeft: { left: 26, borderLeftColor: '#9C6618' },
  handleRight: { left: 146, borderRightColor: '#E3B44A' },
  bowl: {
    ...metal, position: 'absolute', left: 54, top: 24, width: 112, height: 98, overflow: 'hidden',
    borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomLeftRadius: 56, borderBottomRightRadius: 56,
  },
  // Darkens the underside of the bowl, away from the light.
  bowlShade: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 60,
    ...paint('linear-gradient(180deg, rgba(60,32,0,0) 0%, rgba(60,32,0,0.38) 100%)'),
  },
  medallion: {
    position: 'absolute', left: 37, top: 26, width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: '#94600F',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9B848',
    ...paint('radial-gradient(circle at 38% 32%, #FFF1B8 0%, #EDBD4C 45%, #B47C1F 100%)'),
    boxShadow: '0 2px 3px rgba(70,40,0,0.45)',
  },
  medallionText: { color: '#7E4F0C', fontSize: 20, fontWeight: '900', textShadowColor: '#FFF2C4', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
  shine: {
    position: 'absolute', top: -30, left: 0, width: 26, height: 170,
    ...paint('linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.75) 50%, rgba(255,255,255,0) 100%)'),
  },
  rim: {
    position: 'absolute', left: 47, top: 15, width: 126, height: 18, borderRadius: 9,
    backgroundColor: '#EDBD4C', ...paint(GOLD_TOP), boxShadow: '0 2px 4px rgba(60,32,0,0.35)',
  },
  mouth: {
    position: 'absolute', left: 56, top: 19, width: 108, height: 9, borderRadius: 5,
    ...paint('linear-gradient(180deg, #3E2404 0%, #84540F 100%)'), backgroundColor: '#5A3606',
  },
  collar: { ...metal, position: 'absolute', left: 90, top: 117, width: 40, height: 9, borderRadius: 5 },
  stem: { ...metal, position: 'absolute', left: 101, top: 124, width: 18, height: 22 },
  knot: { ...metal, position: 'absolute', left: 89, top: 138, width: 42, height: 12, borderRadius: 6 },
  foot: { ...metal, position: 'absolute', left: 76, top: 148, width: 68, height: 12, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  cap: { position: 'absolute', left: 64, top: 159, width: 92, height: 8, borderRadius: 2, backgroundColor: '#EDBD4C', ...paint(GOLD_TOP) },
  plinth: {
    position: 'absolute', left: 58, top: 166, width: 104, height: 36, borderRadius: 5, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#2B190B', ...paint('linear-gradient(180deg, #57361B 0%, #2E1B0C 55%, #170D05 100%)'),
    boxShadow: '0 6px 12px rgba(0,0,0,0.45)',
  },
  plaque: { ...metal, width: 58, height: 14, borderRadius: 2, borderWidth: 1, borderColor: '#8C5912' },
  sparkle: { position: 'absolute' },
  sparkleBar: { position: 'absolute', borderRadius: 1, backgroundColor: '#FFF7DA', boxShadow: '0 0 8px 2px rgba(255,227,154,0.9)' },
});
