import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { avatarFor } from '@/network/profile';

export function PlayerAvatar({ avatarKey, size, style }: { avatarKey: string; size: number; style?: StyleProp<ViewStyle> }) {
  const avatar = avatarFor(avatarKey);
  const frame = { width: size, height: size, borderRadius: size / 2, backgroundColor: avatar.color };
  if (avatar.image !== null) {
    return <View style={[s.base, frame, style]}>
      <Image source={avatar.image} contentFit="cover" style={{ width: size, height: size, borderRadius: size / 2 }} />
    </View>;
  }
  return <View style={[s.base, frame, style]}>
    <Text style={[s.symbol, { fontSize: Math.round(size * 0.43) }]}>{avatar.symbol}</Text>
  </View>;
}

const s = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  symbol: { color: '#fff', fontWeight: '900' },
});
