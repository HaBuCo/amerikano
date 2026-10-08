import { useTranslations } from '@/i18n/language';
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { palette as p } from '@/constants/palette';
import { PlayingCard } from './playing-card';
import { avatarFor } from '@/network/profile';
import { RoomView } from '@/network/types';

const MIN_SEATS = 4;
const MAX_SEATS = 6;

function PulsingDots() {
  const [value] = useState(() => new Animated.Value(0.35));
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(value, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(value, { toValue: 0.35, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [value]);
  return <Animated.View style={[s.emptySeatDot, { opacity: value }]} />;
}

type Seat = RoomView['members'][number];

function SeatTile({ seat, isYou, isHost, tileWidth }: { seat: Seat; isYou: boolean; isHost: boolean; tileWidth: number }) {
  const { t } = useTranslations();
  const avatar = avatarFor(seat.avatarKey);
  const statusLabel = !seat.connected ? t("Yeniden bağlanıyor") : seat.ready ? t("✓ Hazır") : t("Bekleniyor");
  return <View style={[s.seat, s.seatFilled, { width: tileWidth }, isYou && s.seatYou]}>
    <View style={[s.seatAvatar, { backgroundColor: avatar.color }]}><Text style={s.seatAvatarText}>{avatar.symbol}</Text></View>
    <Text numberOfLines={1} style={s.seatName}>{seat.name}{seat.isBot ? t(" · BOT") : isHost ? ' ♛' : ''}</Text>
    <Text numberOfLines={1} style={[s.seatStatus, seat.ready && seat.connected && s.seatStatusReady]}>{isYou ? t("SEN") : statusLabel}</Text>
  </View>;
}

function EmptySeatTile({ searching, tileWidth, onPress }: { searching: boolean; tileWidth: number; onPress?: () => void }) {
  const { t } = useTranslations();
  const Wrapper = onPress ? Pressable : View;
  return <Wrapper accessibilityRole={onPress ? 'button' : undefined} onPress={onPress} style={[s.seat, s.seatEmpty, { width: tileWidth }]}>
    <View style={s.seatAvatarEmpty} />
    <Text style={s.seatEmptyLabel}>{searching ? t("Aranıyor") : onPress ? t("Davet et") : t("Boş koltuk")}</Text>
    {searching && <PulsingDots />}
  </Wrapper>;
}

export function WaitingTable({ room, tableWidth, searching, onInviteEmptySeat }: {
  room: RoomView; tableWidth: number; searching: boolean; onInviteEmptySeat?: () => void;
}) {
  const capacity = room.visibility === 'public' ? MIN_SEATS : Math.min(MAX_SEATS, Math.max(MIN_SEATS, room.members.length));
  const emptySeatCount = Math.max(0, capacity - room.members.length);
  const columns = tableWidth >= 560 ? capacity : capacity <= 4 ? 2 : 3;
  const tileWidth = Math.max(96, (tableWidth - 24 - (columns - 1) * 8) / columns);
  return <View style={s.felt}>
    <View style={s.seatsGrid}>
      {room.members.map((member) => <SeatTile key={member.id} seat={member} isYou={member.id === room.you} isHost={member.id === room.hostId} tileWidth={tileWidth} />)}
      {Array.from({ length: emptySeatCount }, (_, index) => <EmptySeatTile key={`empty-${index}`} searching={searching} tileWidth={tileWidth} onPress={!searching ? onInviteEmptySeat : undefined} />)}
    </View>
    <View style={s.tableCenter}>
      <View style={s.cardStack}>
        <PlayingCard hidden small />
        <View style={[s.cardStackCard, { left: 10 }]}><PlayingCard hidden small /></View>
        <View style={[s.cardStackCard, { left: 20 }]}><PlayingCard hidden small /></View>
      </View>
    </View>
  </View>;
}

const s = StyleSheet.create({
  felt: { borderRadius: 22, backgroundColor: p.feltLight, borderWidth: 1, borderColor: p.line, padding: 16, gap: 18, alignItems: 'center' },
  seatsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', width: '100%' },
  seat: { borderRadius: 14, minHeight: 92, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 6 },
  seatFilled: { backgroundColor: '#ffffff0d', borderWidth: 1, borderColor: p.line },
  seatYou: { borderColor: p.gold, backgroundColor: '#d9a44120' },
  seatEmpty: { borderWidth: 1.5, borderColor: p.line, borderStyle: 'dashed' },
  seatAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  seatAvatarText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  seatAvatarEmpty: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: p.line, borderStyle: 'dashed' },
  seatName: { color: p.cream, fontSize: 13, fontWeight: '700', maxWidth: '100%' },
  seatStatus: { color: p.muted, fontSize: 10, fontWeight: '700' },
  seatStatusReady: { color: '#8fd6a8' },
  seatEmptyLabel: { color: p.muted, fontSize: 11, fontWeight: '700' },
  emptySeatDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: p.gold },
  tableCenter: { alignItems: 'center', paddingTop: 4 },
  cardStack: { width: 74, height: 76 },
  cardStackCard: { position: 'absolute', top: 0 },
});
