import { useTranslations } from '@/i18n/language';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { palette as p } from '@/constants/palette';

/**
 * Shared building blocks for the app's list screens (settings, store,
 * profile…): one header, grouped cards and rows, so every screen reads alike.
 */

export const DANGER = '#f0aaa4';

export function ScreenHeader({ title, subtitle, onBack = () => router.back(), right }: {
  title: string; subtitle?: string; onBack?: (() => void) | null; right?: ReactNode;
}) {
  const { t } = useTranslations();
  return <View style={s.header}>
    <View style={s.headerBar}>
      {onBack ? <Pressable accessibilityRole="button" accessibilityLabel={t("Geri")} onPress={onBack} hitSlop={8} style={({ pressed }) => [s.backButton, pressed && s.pressed]}>
        <AppIcon name="back" size={20} color={p.cream} />
      </Pressable> : <View />}
      {right}
    </View>
    <Text style={s.title}>{title}</Text>
    {!!subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
  </View>;
}

export function Section({ title, children, style }: { title?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.section, style]}>
    {!!title && <Text style={s.sectionTitle}>{title}</Text>}
    <View style={s.group}>{children}</View>
  </View>;
}

/** A plain card, for content that is not a list of rows. */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Row({ icon, label, detail, last, danger, onPress, accessory, disabled }: {
  icon?: AppIconName; label: string; detail?: string; last?: boolean; danger?: boolean; disabled?: boolean;
  onPress?: () => void; accessory?: ReactNode;
}) {
  const content = <>
    {icon && <AppIcon name={icon} size={20} color={danger ? DANGER : p.gold} />}
    <View style={s.rowCopy}>
      <Text style={[s.rowTitle, danger && s.dangerText]}>{label}</Text>
      {!!detail && <Text style={s.rowDetail}>{detail}</Text>}
    </View>
    {accessory}
  </>;
  if (!onPress) return <View style={[s.row, !last && s.rowDivider]}>{content}</View>;
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.row, !last && s.rowDivider, disabled && s.disabled, pressed && s.rowPressed]}>{content}</Pressable>;
}

export const Chevron = () => <AppIcon name="chevron" size={18} color={p.muted} />;
export const External = () => <AppIcon name="external" size={16} color={p.muted} />;

export function Switch({ value }: { value: boolean }) {
  return <View style={[s.switchTrack, value && s.switchTrackOn]}><View style={[s.switchKnob, value && s.switchKnobOn]} /></View>;
}

export function ToggleRow({ icon, label, detail, value, last, disabled, onPress }: {
  icon?: AppIconName; label: string; detail?: string; value: boolean; last?: boolean; disabled?: boolean; onPress: () => void;
}) {
  return <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value, disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.row, !last && s.rowDivider, disabled && s.disabled, pressed && s.rowPressed]}>
    {icon && <AppIcon name={icon} size={20} color={p.gold} />}
    <View style={s.rowCopy}><Text style={s.rowTitle}>{label}</Text>{!!detail && <Text style={s.rowDetail}>{detail}</Text>}</View>
    <Switch value={value} />
  </Pressable>;
}

export type Choice<T extends string | number> = { value: T; label: string; caption?: string };

export function Segmented<T extends string | number>({ value, choices, onChange, label, compact }: {
  value: T; choices: Choice<T>[]; onChange: (value: T) => void; label?: string; compact?: boolean;
}) {
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[s.segment, compact && s.segmentCompact]}>
    {choices.map(choice => {
      const active = choice.value === value;
      return <Pressable key={String(choice.value)} accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => onChange(choice.value)}
        style={[s.segmentItem, !compact && s.segmentItemWide, active && s.segmentItemActive]}>
        <Text numberOfLines={1} style={[s.segmentText, active && s.segmentTextActive]}>{choice.label}</Text>
        {!!choice.caption && <Text numberOfLines={1} style={[s.segmentCaption, active && s.segmentCaptionActive]}>{choice.caption}</Text>}
      </Pressable>;
    })}
  </View>;
}

/** A row whose choice sits under its label, for settings with several options. */
export function ChoiceRow<T extends string | number>({ icon, label, detail, value, choices, onChange, last }: {
  icon?: AppIconName; label: string; detail?: string; value: T; choices: Choice<T>[]; onChange: (value: T) => void; last?: boolean;
}) {
  return <View style={[s.choiceRow, !last && s.rowDivider]}>
    <View style={s.choiceHead}>
      {icon && <AppIcon name={icon} size={20} color={p.gold} />}
      <View style={s.rowCopy}><Text style={s.rowTitle}>{label}</Text>{!!detail && <Text style={s.rowDetail}>{detail}</Text>}</View>
    </View>
    <Segmented value={value} choices={choices} onChange={onChange} label={label} />
  </View>;
}

export function PrimaryButton({ label, caption, onPress, disabled, icon, style }: {
  label: string; caption?: string; onPress: () => void; disabled?: boolean; icon?: AppIconName; style?: StyleProp<ViewStyle>;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.primary, disabled && s.disabled, pressed && s.pressed, style]}>
    {icon && <AppIcon name={icon} size={20} color={p.ink} />}
    <View style={s.buttonCopy}>
      <Text style={s.primaryText}>{label}</Text>
      {!!caption && <Text style={s.primaryCaption}>{caption}</Text>}
    </View>
  </Pressable>;
}

export function SecondaryButton({ label, onPress, disabled, icon, danger, style }: {
  label: string; onPress: () => void; disabled?: boolean; icon?: AppIconName; danger?: boolean; style?: StyleProp<ViewStyle>;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.secondary, disabled && s.disabled, pressed && s.pressed, style]}>
    {icon && <AppIcon name={icon} size={18} color={danger ? DANGER : p.gold} />}
    <Text style={[s.secondaryText, danger && s.dangerText]}>{label}</Text>
  </Pressable>;
}

/** A one-line explanation under a group: muted, with an optional icon. */
export function Note({ icon, children }: { icon?: AppIconName; children: ReactNode }) {
  return <View style={s.note}>
    {icon && <AppIcon name={icon} size={16} color={p.muted} />}
    <Text style={s.noteText}>{children}</Text>
  </View>;
}

export const kit = StyleSheet.create({
  /** Content column every kit screen scrolls in. */
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 6, paddingBottom: 36, gap: 14 },
  contentTablet: { maxWidth: 1040, paddingHorizontal: 34, paddingTop: 20 },
  page: { flex: 1, backgroundColor: p.canvas },
  columns: { gap: 14 },
  columnsTablet: { flexDirection: 'row', alignItems: 'flex-start', gap: 22 },
  column: { minWidth: 0, gap: 14 },
  // Only side by side columns share the width; stacked, flex would collapse them.
  columnTablet: { flex: 1 },
  error: { color: DANGER, fontSize: 13, lineHeight: 19, marginLeft: 4 },
  success: { color: '#9fe3bd', fontSize: 13, lineHeight: 19, marginLeft: 4 },
  input: { minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: p.line, paddingHorizontal: 16, color: p.cream, fontSize: 16, backgroundColor: '#0000001f' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.45 },
});

const s = StyleSheet.create({
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.45 },
  header: { gap: 4, marginBottom: 2 },
  headerBar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff0d', borderWidth: 1, borderColor: p.line },
  title: { color: p.cream, fontSize: 32, fontWeight: '900', letterSpacing: -0.6 },
  subtitle: { color: p.muted, fontSize: 14, lineHeight: 20 },

  section: { gap: 8 },
  sectionTitle: { color: p.gold, fontSize: 10, letterSpacing: 2, fontWeight: '900', marginTop: 6, marginLeft: 4 },
  group: { borderRadius: 18, backgroundColor: p.surface, borderWidth: 1, borderColor: p.line, overflow: 'hidden' },
  card: { borderRadius: 18, backgroundColor: p.surface, borderWidth: 1, borderColor: p.line, padding: 14, gap: 10 },
  row: { minHeight: 58, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 13 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: p.line },
  rowPressed: { backgroundColor: '#ffffff0a' },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { color: p.cream, fontSize: 14, fontWeight: '800' },
  rowDetail: { color: p.muted, fontSize: 11, lineHeight: 15, marginTop: 2 },
  dangerText: { color: DANGER },

  switchTrack: { width: 44, height: 26, padding: 3, borderRadius: 13, backgroundColor: '#ffffff26' },
  switchTrackOn: { backgroundColor: p.gold },
  switchKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: p.paper, boxShadow: '0 1px 3px #00000040' },
  switchKnobOn: { alignSelf: 'flex-end' },

  segment: { flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: '#0000002e' },
  segmentCompact: { alignSelf: 'flex-start' },
  segmentItem: { minHeight: 34, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentItemWide: { flex: 1, paddingHorizontal: 4 },
  segmentItemActive: { backgroundColor: p.cream },
  segmentText: { color: p.muted, fontSize: 12, fontWeight: '800' },
  segmentTextActive: { color: p.ink, fontWeight: '900' },
  segmentCaption: { color: '#71877a', fontSize: 9, marginTop: 1 },
  segmentCaptionActive: { color: '#5b6a61' },
  choiceRow: { paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  choiceHead: { flexDirection: 'row', alignItems: 'center', gap: 13 },

  primary: { minHeight: 56, borderRadius: 16, backgroundColor: p.gold, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, paddingHorizontal: 16 },
  buttonCopy: { alignItems: 'center' },
  primaryText: { color: p.ink, fontSize: 16, fontWeight: '900' },
  primaryCaption: { color: '#5a4720', fontSize: 11, fontWeight: '700', marginTop: 1 },
  secondary: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 14, backgroundColor: '#ffffff0d', borderWidth: 1, borderColor: p.line },
  secondaryText: { color: p.cream, fontSize: 14, fontWeight: '800' },
  note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingHorizontal: 4 },
  noteText: { flex: 1, color: p.muted, fontSize: 12, lineHeight: 18 },
});
