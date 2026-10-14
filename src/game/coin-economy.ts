export const STARTING_COINS = 1000;
export const DAILY_GIFT_COINS = 500;
export const ROOM_ENTRY_FEES = [50, 100, 250, 500, 1000, 2000] as const;
export type RoomEntryFee = (typeof ROOM_ENTRY_FEES)[number];

export const ROOM_TIERS = [
  { fee: 50, name: 'Başlangıç', subtitle: 'Rahat bir başlangıç', suit: '♣', accent: '#8CD6B2', surface: '#174F3D' },
  { fee: 100, name: 'Bronz', subtitle: 'Klasik masa', suit: '♦', accent: '#E2A978', surface: '#543827' },
  { fee: 250, name: 'Gümüş', subtitle: 'Bir adım ileri', suit: '♠', accent: '#D3DFE4', surface: '#344D53' },
  { fee: 500, name: 'Altın', subtitle: 'İddialı oyun', suit: '♥', accent: '#F1C66D', surface: '#5E4827' },
  { fee: 1000, name: 'Zümrüt', subtitle: 'Ustalık masası', suit: '♣', accent: '#80E8BE', surface: '#125B4C' },
  { fee: 2000, name: 'Kraliyet', subtitle: 'En yüksek masa', suit: '♠', accent: '#E8C8FF', surface: '#463056' },
] as const satisfies readonly {
  fee: RoomEntryFee; name: string; subtitle: string; suit: string; accent: string; surface: string;
}[];

export function isRoomEntryFee(value: unknown): value is RoomEntryFee {
  return ROOM_ENTRY_FEES.includes(value as RoomEntryFee);
}
