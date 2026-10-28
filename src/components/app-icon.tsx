import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { palette as p } from '@/constants/palette';

// SF Symbols on iOS, Material Symbols on Android and the web.
const APP_ICONS = {
  play: { ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' },
  chevron: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  back: { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  expand: { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' },
  external: { ios: 'arrow.up.right', android: 'open_in_new', web: 'open_in_new' },
  person: { ios: 'person', android: 'person', web: 'person' },
  friends: { ios: 'person.2', android: 'group', web: 'group' },
  account: { ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' },
  trophy: { ios: 'trophy', android: 'trophy', web: 'trophy' },
  store: { ios: 'bag', android: 'shopping_bag', web: 'shopping_bag' },
  stats: { ios: 'chart.bar', android: 'bar_chart', web: 'bar_chart' },
  rules: { ios: 'book', android: 'menu_book', web: 'menu_book' },
  lessons: { ios: 'graduationcap', android: 'school', web: 'school' },
  settings: { ios: 'gearshape', android: 'settings', web: 'settings' },
  more: { ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' },
  device: { ios: 'iphone', android: 'smartphone', web: 'smartphone' },
  score: { ios: 'list.number', android: 'scoreboard', web: 'scoreboard' },
  star: { ios: 'star', android: 'star', web: 'star' },
  gift: { ios: 'gift', android: 'redeem', web: 'redeem' },
  bell: { ios: 'bell', android: 'notifications', web: 'notifications' },
  sound: { ios: 'speaker.wave.2', android: 'volume_up', web: 'volume_up' },
  haptics: { ios: 'iphone.radiowaves.left.and.right', android: 'vibration', web: 'vibration' },
  timer: { ios: 'timer', android: 'timer', web: 'timer' },
  cards: { ios: 'rectangle.stack', android: 'style', web: 'style' },
  drag: { ios: 'hand.draw', android: 'pan_tool', web: 'pan_tool' },
  reactions: { ios: 'face.smiling', android: 'mood', web: 'mood' },
  language: { ios: 'globe', android: 'language', web: 'language' },
  adsOff: { ios: 'nosign', android: 'block', web: 'block' },
  restore: { ios: 'arrow.clockwise', android: 'restore', web: 'restore' },
  privacy: { ios: 'lock', android: 'lock', web: 'lock' },
  terms: { ios: 'doc.text', android: 'description', web: 'description' },
  adChoices: { ios: 'hand.raised', android: 'privacy_tip', web: 'privacy_tip' },
  trash: { ios: 'trash', android: 'delete', web: 'delete' },
  logout: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' },
} satisfies Record<string, Exclude<ComponentProps<typeof SymbolView>['name'], string>>;

export type AppIconName = keyof typeof APP_ICONS;

export function AppIcon({ name, size = 20, color = p.cream }: { name: AppIconName; size?: number; color?: string }) {
  return <SymbolView name={APP_ICONS[name]} size={size} tintColor={color} weight="semibold" />;
}
