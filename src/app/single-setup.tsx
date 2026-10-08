import { useTranslations } from '@/i18n/language';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette as p } from '@/constants/palette';
import { DEFAULT_SINGLE_GAME_OPTIONS, SINGLE_GAME_PROFILES } from '@/game/single-game-options';
import type { SingleGameOptions, SingleGameProfile } from '@/game/single-game-options';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

type Choice<T extends string | number> = { value: T; label: string; caption?: string };

function Selector<T extends string | number>({ label, value, choices, wide = false, onChange }: { label: string; value: T; choices: Choice<T>[]; wide?: boolean; onChange: (value: T) => void }) {
  return <View style={[s.field, wide && s.fieldWide]}>
    <Text style={s.label}>{label}</Text>
    <View style={s.choiceRow}>{choices.map(choice => <Pressable key={choice.value} accessibilityRole="button" accessibilityState={{ selected: value === choice.value }} onPress={() => onChange(choice.value)} style={[s.choice, value === choice.value && s.choiceActive]}>
      <Text style={[s.choiceText, value === choice.value && s.choiceTextActive]}>{choice.label}</Text>
      {choice.caption && <Text style={[s.choiceCaption, value === choice.value && s.choiceCaptionActive]}>{choice.caption}</Text>}
    </Pressable>)}</View>
  </View>;
}

function ToggleRow({ label, caption, value, disabled, onPress }: { label: string; caption: string; value: boolean; disabled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="switch" accessibilityState={{ checked: value, disabled }} disabled={disabled} onPress={onPress} style={[s.toggleRow, disabled && s.disabled]}>
    <View style={s.toggleCopy}><Text style={s.toggleLabel}>{label}</Text><Text style={s.toggleCaption}>{caption}</Text></View>
    <View style={[s.switchTrack, value && s.switchTrackOn]}><View style={[s.switchKnob, value && s.switchKnobOn]} /></View>
  </Pressable>;
}

const profileCopy: Record<Exclude<SingleGameProfile, 'custom'>, { title: string; caption: string }> = {
  classic: { title: 'Klasik', caption: '4 kişi · 12 el' },
  relaxed: { title: 'Rahat', caption: 'Kolay · 6 el' },
  fast: { title: 'Hızlı', caption: 'Zor · 3 el' },
};

export default function SingleSetupScreen() {
  const { t } = useTranslations();
  const { isTablet } = useResponsiveLayout();
  const [options, setOptions] = useState<SingleGameOptions>({ ...DEFAULT_SINGLE_GAME_OPTIONS });
  const [advanced, setAdvanced] = useState(false);

  function chooseProfile(profile: Exclude<SingleGameProfile, 'custom'>) {
    setOptions({ ...SINGLE_GAME_PROFILES[profile] });
  }
  function update<K extends keyof SingleGameOptions>(key: K, value: SingleGameOptions[K]) {
    setOptions(current => ({ ...current, profile: 'custom', [key]: value }));
  }
  function start() {
    router.push({ pathname: '/game', params: { mode: 'single', config: JSON.stringify(options) } });
  }

  return <SafeAreaView edges={['bottom']} style={s.safeArea}>
    <ScrollView contentContainerStyle={[s.content, isTablet && s.contentTablet]}>
      <Text style={s.eyebrow}>{t("TEK OYUNCULU")}</Text>
      <Text style={s.title}>{t("Oyunu nasıl kuralım?")}</Text>
      <Text style={s.description}>{t("Hazır bir tarz seç veya masayı kendine göre ayarla.")}</Text>

      <View style={s.profiles}>{(['classic', 'relaxed', 'fast'] as const).map(profile => <Pressable key={profile} accessibilityRole="button" accessibilityState={{ selected: options.profile === profile }} onPress={() => chooseProfile(profile)} style={[s.profile, options.profile === profile && s.profileActive]}>
        <Text style={[s.profileTitle, options.profile === profile && s.profileTitleActive]}>{t(profileCopy[profile].title)}</Text>
        <Text style={[s.profileCaption, options.profile === profile && s.profileCaptionActive]}>{t(profileCopy[profile].caption)}</Text>
      </Pressable>)}</View>
      {options.profile === 'custom' && <Text style={s.customLabel}>{t("ÖZEL AYAR")}</Text>}

      <View style={[s.settingsGrid, isTablet && s.settingsGridTablet]}>
        <Selector wide={isTablet} label={t("Oyuncu sayısı")} value={options.playerCount} choices={[2, 3, 4, 5, 6].map(value => ({ value, label: String(value) }))} onChange={value => update('playerCount', value)} />
        <Selector wide={isTablet} label={t("Rakip seviyesi")} value={options.difficulty} choices={[{ value: 'easy', label: t("Kolay") }, { value: 'normal', label: t("Normal") }, { value: 'hard', label: t("Zor") }]} onChange={value => update('difficulty', value)} />
        <Selector wide={isTablet} label={t("Rakip oynama hızı")} value={options.speed} choices={[{ value: 'fast', label: t("Hızlı") }, { value: 'normal', label: t("Normal") }, { value: 'relaxed', label: t("Sakin") }]} onChange={value => update('speed', value)} />
        <Selector wide={isTablet} label={t("Oyun uzunluğu")} value={options.length} choices={[{ value: 'mini', label: t("Mini"), caption: t("3 el") }, { value: 'quick', label: t("Hızlı"), caption: t("6 el") }, { value: 'full', label: t("Tam"), caption: t("12 el") }]} onChange={value => update('length', value)} />
      </View>

      <Pressable accessibilityRole="button" accessibilityState={{ expanded: advanced }} onPress={() => setAdvanced(value => !value)} style={s.advancedButton}>
        <View><Text style={s.advancedTitle}>{t("Gelişmiş ayarlar")}</Text><Text style={s.advancedCaption}>{t("Teklif, cezalar, Joker ve yardımcılar")}</Text></View><Text style={s.chevron}>{advanced ? '−' : '+'}</Text>
      </Pressable>

      {advanced && <View style={s.advancedPanel}>
        <ToggleRow label={t("Açık kart teklifi")} caption={options.playerCount <= 2 ? t("İki kişilik oyunda kullanılmaz.") : t("Desteden çekilince açık kart diğer oyunculara cezalı sunulur.")} value={options.claimsEnabled && options.playerCount > 2} disabled={options.playerCount <= 2} onPress={() => update('claimsEnabled', !options.claimsEnabled)} />
        {options.claimsEnabled && options.playerCount > 2 && <Selector label={t("Teklif karar süresi")} value={options.claimSeconds} choices={[5, 8, 12].map(value => ({ value: value as 5 | 8 | 12, label: t("{0} sn", [value]) }))} onChange={value => update('claimSeconds', value)} />}
        <ToggleRow label={t("İşlek kart cezası")} caption={t("Masadaki bir gruba uyabilecek kartı atmak +25 puan yazar.")} value={options.playableDiscardPenalty} onPress={() => update('playableDiscardPenalty', !options.playableDiscardPenalty)} />
        <Selector label={t("Açılışta Joker yasağı")} value={options.jokerOpeningRestrictionRounds} choices={[{ value: 0, label: t("Kapalı") }, { value: 4, label: t("İlk 4 el") }, { value: 5, label: t("İlk 5 el") }]} onChange={value => update('jokerOpeningRestrictionRounds', value)} />
        <ToggleRow label={t("Son hamleyi geri al")} caption={t("Rakibin oynamadan önce yaptığın son hamleyi geri alabilirsin.")} value={options.undoEnabled} onPress={() => update('undoEnabled', !options.undoEnabled)} />
        <Selector label={t("İlk başlayan")} value={options.starter} choices={[{ value: 'random', label: t("Rastgele") }, { value: 'you', label: t("Sen") }]} onChange={value => update('starter', value)} />
        <Selector label={t("Yeni el açıklaması")} value={options.roundIntro} choices={[{ value: 'off', label: t("Kapalı") }, { value: 'short', label: t("Kısa") }, { value: 'detailed', label: t("Detaylı") }]} onChange={value => update('roundIntro', value)} />
      </View>}

      <View style={s.infoCard}><Text style={s.infoIcon}>♣</Text><Text style={s.infoText}><Text style={s.infoStrong}>{t("Açık kart teklifi nedir?")}</Text>{'\n'}{t("Bir oyuncu kapalı desteden çekerse yerdeki açık kart diğer oyunculara sırayla sorulur. Alan oyuncu açık kartın yanında bir ceza kartı da çeker; normal sırası değişmez.")}</Text></View>
    </ScrollView>
    <View style={s.bottomBar}><Pressable accessibilityRole="button" onPress={start} style={({ pressed }) => [s.startButton, isTablet && s.startButtonTablet, pressed && s.pressed]}><View><Text style={s.startText}>{t("Masayı Kur")}</Text><Text style={s.startCaption}>{options.playerCount - 1} {' '}{t("rakip ·")} {options.length === 'full' ? 12 : options.length === 'quick' ? 6 : 3} {t("el")}</Text></View><Text style={s.arrow}>→</Text></Pressable></View>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: p.felt }, content: { width: '100%', maxWidth: 620, alignSelf: 'center', padding: 24, paddingBottom: 32 },
  contentTablet: { maxWidth: 960, paddingHorizontal: 34, paddingTop: 30 },
  eyebrow: { color: p.gold, fontSize: 10, fontWeight: '900', letterSpacing: 2.4 }, title: { color: p.cream, fontSize: 30, fontWeight: '900', marginTop: 7 }, description: { color: p.muted, fontSize: 14, lineHeight: 20, marginTop: 7 },
  profiles: { flexDirection: 'row', gap: 8, marginTop: 22 }, profile: { flex: 1, minHeight: 72, borderWidth: 1, borderColor: p.line, borderRadius: 13, padding: 11, justifyContent: 'center' }, profileActive: { backgroundColor: p.gold, borderColor: p.gold }, profileTitle: { color: p.cream, fontSize: 14, fontWeight: '900' }, profileTitleActive: { color: p.ink }, profileCaption: { color: p.muted, fontSize: 10, marginTop: 4 }, profileCaptionActive: { color: '#55451f' }, customLabel: { color: p.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.6, marginTop: 8 },
  settingsGrid: {}, settingsGridTablet: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18 },
  field: { gap: 8, marginTop: 20 }, fieldWide: { width: '48%', flexGrow: 1 }, label: { color: p.cream, fontSize: 13, fontWeight: '800' }, choiceRow: { flexDirection: 'row', gap: 7 }, choice: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: p.line, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }, choiceActive: { backgroundColor: '#d9a44122', borderColor: p.gold }, choiceText: { color: p.muted, fontSize: 12, fontWeight: '800', textAlign: 'center' }, choiceTextActive: { color: p.gold }, choiceCaption: { color: '#71877a', fontSize: 9, marginTop: 2 }, choiceCaptionActive: { color: '#c9a961' },
  advancedButton: { minHeight: 62, marginTop: 24, paddingHorizontal: 15, borderRadius: 13, borderWidth: 1, borderColor: p.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, advancedTitle: { color: p.cream, fontWeight: '900', fontSize: 14 }, advancedCaption: { color: p.muted, fontSize: 11, marginTop: 3 }, chevron: { color: p.gold, fontSize: 25 }, advancedPanel: { marginTop: 10, padding: 14, borderRadius: 14, backgroundColor: '#071d1755', borderWidth: 1, borderColor: p.line },
  toggleRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: p.line, paddingVertical: 10 }, toggleCopy: { flex: 1 }, toggleLabel: { color: p.cream, fontSize: 13, fontWeight: '800' }, toggleCaption: { color: p.muted, fontSize: 10, lineHeight: 15, marginTop: 3 }, switchTrack: { width: 40, height: 23, borderRadius: 12, padding: 3, backgroundColor: '#ffffff20' }, switchTrackOn: { backgroundColor: p.gold }, switchKnob: { width: 17, height: 17, borderRadius: 9, backgroundColor: p.cream }, switchKnobOn: { transform: [{ translateX: 17 }], backgroundColor: p.ink }, disabled: { opacity: 0.42 },
  infoCard: { marginTop: 20, padding: 15, borderRadius: 14, backgroundColor: p.feltLight, flexDirection: 'row', gap: 12 }, infoIcon: { color: p.gold, fontSize: 22 }, infoText: { color: p.muted, fontSize: 11, lineHeight: 17, flex: 1 }, infoStrong: { color: p.cream, fontWeight: '900' },
  bottomBar: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 14, borderTopWidth: 1, borderTopColor: p.line, backgroundColor: p.felt }, startButton: { width: '100%', maxWidth: 572, alignSelf: 'center', minHeight: 61, borderRadius: 15, backgroundColor: p.gold, paddingHorizontal: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, startText: { color: p.ink, fontSize: 17, fontWeight: '900' }, startCaption: { color: '#55451f', fontSize: 10, marginTop: 3 }, arrow: { color: p.ink, fontSize: 25 }, pressed: { opacity: 0.8 },
  startButtonTablet: { maxWidth: 892 },
});
