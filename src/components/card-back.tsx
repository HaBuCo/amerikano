import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';
import { cardBackArt } from '@/store/art';
import type { CardBackId } from '@/store/catalog';

export function CardBack({ id }: { id: CardBackId }) {
  return <Image source={cardBackArt[id]} style={s.fill} contentFit="fill" recyclingKey={id} transition={0} />;
}

const s = StyleSheet.create({ fill: { width: '100%', height: '100%' } });
