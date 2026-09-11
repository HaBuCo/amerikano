import { Image } from 'expo-image';
import { Pressable, StyleSheet } from 'react-native';
import { cardArt } from '@/constants/card-art';
import { Card } from '@/game/types';

const suits = { hearts: 'Kupa', diamonds: 'Karo', clubs: 'Sinek', spades: 'Maça' };
type Props = { card?: Card; selected?: boolean; hidden?: boolean; compact?: boolean; large?: boolean; onPress?: () => void };

export function PlayingCard({ card, selected, hidden, compact, large, onPress }: Props) {
  const key = hidden || !card ? 'back' : card.isJoker ? 'joker' : `${card.rank}-${card.suit}`;
  const label = hidden || !card ? 'Kapalı kart' : card.isJoker ? 'Joker' : `${suits[card.suit!]} ${card.rank}`;
  const content = <Image source={cardArt[key]} style={styles.image} contentFit="fill" recyclingKey={key} transition={0} />;
  const style = [styles.card, compact && styles.compact, large && styles.large, selected && styles.selected];
  return <Pressable disabled={!onPress} accessibilityRole={onPress ? 'button' : 'image'} accessibilityLabel={label} accessibilityState={{ selected: !!selected }} onPress={onPress} style={({ pressed }) => [...style, pressed && { opacity: 0.85 }]}>{content}</Pressable>;
}
const styles = StyleSheet.create({
  card: { width: 72, height: 101, borderRadius: 6, backgroundColor: '#fff', overflow: 'hidden', borderWidth: 1, borderColor: '#d2c6ad',
    boxShadow: '0 3px 8px #0005' },
  compact: { width: 43, height: 60, borderRadius: 4 },
  large: { width: 115, height: 161, borderRadius: 9 },
  selected: { transform: [{ translateY: -14 }], borderColor: '#edbf64', borderWidth: 3, boxShadow: '0 0 12px #edbf6480' },
  image: { width: '100%', height: '100%' },
});
