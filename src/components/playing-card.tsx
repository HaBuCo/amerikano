import { useTranslations } from '@/i18n/language';
import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { cardArt } from '@/constants/card-art';
import { Card } from '@/game/types';
import { useEquippedCosmetics } from '@/store/use-cosmetics';
import { CardBack } from './card-back';

const suits = { hearts: 'Kupa', diamonds: 'Karo', clubs: 'Sinek', spades: 'Maça' };
type Props = { card?: Card; selected?: boolean; hidden?: boolean; compact?: boolean; small?: boolean; large?: boolean; tablet?: boolean; glow?: boolean; onPress?: () => void };
export const CARD_WIDTH = 62;
export const CARD_HEIGHT = 87;
export const SMALL_CARD_WIDTH = 54;
export const SMALL_CARD_HEIGHT = 76;
export const TABLET_CARD_WIDTH = 78;
export const TABLET_CARD_HEIGHT = 110;
export const TABLET_SMALL_CARD_WIDTH = 66;
export const TABLET_SMALL_CARD_HEIGHT = 93;

export const PlayingCard = memo(function PlayingCard({ card, selected, hidden, compact, small, large, tablet, glow, onPress }: Props) {
  const { t } = useTranslations();
  const key = hidden || !card ? 'back' : card.isJoker ? 'joker' : `${card.rank}-${card.suit}`;
  const label = hidden || !card ? t("Kapalı kart") : card.isJoker ? t("Joker") : `${t(suits[card.suit!])} ${card.rank}`;
  const { cardBack } = useEquippedCosmetics();
  const content = <View style={styles.nonInteractive}>{key === 'back'
    ? <CardBack id={cardBack.id} />
    : <Image source={cardArt[key]} style={styles.image} contentFit="fill" recyclingKey={key} transition={0} />}</View>;
  const style = [styles.card, compact && styles.compact, small && styles.small, large && styles.large,
    tablet && !compact && !small && !large && styles.tablet,
    tablet && small && styles.tabletSmall,
    tablet && compact && styles.tabletCompact,
    selected && styles.selected, glow && styles.glow];
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
  // A training hand lights the cards its current step is about.
  glow: { borderColor: '#7BE4A5', borderWidth: 3, boxShadow: '0 0 14px 3px rgba(123, 228, 165, 0.75)' },
  image: { width: '100%', height: '100%' },
  nonInteractive: { width: '100%', height: '100%', pointerEvents: 'none' },
});
