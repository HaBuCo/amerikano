import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import { cardArt } from '@/constants/card-art';
import { Card } from '@/game/types';

const suits = { hearts: 'Kupa', diamonds: 'Karo', clubs: 'Sinek', spades: 'Maça' };
type Props = { card?: Card; selected?: boolean; hidden?: boolean; compact?: boolean; large?: boolean; onPress?: () => void };
export const CARD_WIDTH = 62;
export const CARD_HEIGHT = 87;

export function PlayingCard({ card, selected, hidden, compact, large, onPress }: Props) {
  const key = hidden || !card ? 'back' : card.isJoker ? 'joker' : `${card.rank}-${card.suit}`;
  const label = hidden || !card ? 'Kapalı kart' : card.isJoker ? 'Joker' : `${suits[card.suit!]} ${card.rank}`;
  const content = <View style={styles.nonInteractive}><Image source={cardArt[key]} style={styles.image} contentFit="fill" recyclingKey={key} transition={0} /></View>;
  const style = [styles.card, compact && styles.compact, large && styles.large, selected && styles.selected];
  return <Pressable disabled={!onPress} accessibilityRole={onPress ? 'button' : 'image'} accessibilityLabel={label} accessibilityState={{ selected: !!selected }} onPress={onPress} style={({ pressed }) => [...style, pressed && { opacity: 0.85 }]}>{content}</Pressable>;
}
const styles = StyleSheet.create({
  card: { width: CARD_WIDTH, height: CARD_HEIGHT, borderRadius: 5, backgroundColor: '#fff', overflow: 'hidden', borderWidth: 1, borderColor: '#d2c6ad', elevation: 2 },
  compact: { width: 37, height: 52, borderRadius: 4 },
  large: { width: 100, height: 140, borderRadius: 8 },
  selected: { transform: [{ translateY: -10 }], borderColor: '#edbf64', borderWidth: 3, elevation: 5 },
  image: { width: '100%', height: '100%' },
  nonInteractive: { width: '100%', height: '100%', pointerEvents: 'none' },
});
