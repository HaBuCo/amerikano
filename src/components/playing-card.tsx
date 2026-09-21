import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { cardArt } from '@/constants/card-art';
import { Card } from '@/game/types';

const suits = { hearts: 'Kupa', diamonds: 'Karo', clubs: 'Sinek', spades: 'Maça' };
type Props = { card?: Card; selected?: boolean; hidden?: boolean; compact?: boolean; small?: boolean; large?: boolean; tablet?: boolean; onPress?: () => void };
export const CARD_WIDTH = 62;
export const CARD_HEIGHT = 87;
export const SMALL_CARD_WIDTH = 54;
export const SMALL_CARD_HEIGHT = 76;
export const TABLET_CARD_WIDTH = 78;
export const TABLET_CARD_HEIGHT = 110;
export const TABLET_SMALL_CARD_WIDTH = 66;
export const TABLET_SMALL_CARD_HEIGHT = 93;

export const PlayingCard = memo(function PlayingCard({ card, selected, hidden, compact, small, large, tablet, onPress }: Props) {
  const key = hidden || !card ? 'back' : card.isJoker ? 'joker' : `${card.rank}-${card.suit}`;
  const label = hidden || !card ? 'Kapalı kart' : card.isJoker ? 'Joker' : `${suits[card.suit!]} ${card.rank}`;
  const content = <View style={styles.nonInteractive}><Image source={cardArt[key]} style={styles.image} contentFit="fill" recyclingKey={key} transition={0} /></View>;
  const style = [styles.card, compact && styles.compact, small && styles.small, large && styles.large,
    tablet && !compact && !small && !large && styles.tablet,
    tablet && small && styles.tabletSmall,
    tablet && compact && styles.tabletCompact,
    selected && styles.selected];
  return <Pressable disabled={!onPress} accessibilityRole={onPress ? 'button' : 'image'} accessibilityLabel={label} accessibilityState={{ selected: !!selected }} onPress={onPress} style={({ pressed }) => [...style, pressed && { opacity: 0.85 }]}>{content}</Pressable>;
});
const styles = StyleSheet.create({
  card: { width: CARD_WIDTH, height: CARD_HEIGHT, borderRadius: 5, backgroundColor: '#fff', overflow: 'hidden', borderWidth: 1, borderColor: '#d2c6ad', elevation: 2 },
  compact: { width: 37, height: 52, borderRadius: 4 },
  small: { width: SMALL_CARD_WIDTH, height: SMALL_CARD_HEIGHT, borderRadius: 5 },
  tablet: { width: TABLET_CARD_WIDTH, height: TABLET_CARD_HEIGHT, borderRadius: 6 },
  tabletSmall: { width: TABLET_SMALL_CARD_WIDTH, height: TABLET_SMALL_CARD_HEIGHT, borderRadius: 6 },
  tabletCompact: { width: 46, height: 65, borderRadius: 4 },
  large: { width: 100, height: 140, borderRadius: 8 },
  selected: { transform: [{ translateY: -10 }], borderColor: '#edbf64', borderWidth: 3, elevation: 5 },
  image: { width: '100%', height: '100%' },
  nonInteractive: { width: '100%', height: '100%', pointerEvents: 'none' },
});
