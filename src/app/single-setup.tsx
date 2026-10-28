import { useTranslations } from '@/i18n/language';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { ChoiceRow, kit, Note, PrimaryButton, Row, ScreenHeader, Section, Segmented, ToggleRow } from '@/components/screen-kit';
import { palette as p } from '@/constants/palette';
import { profileOptions, roundsForLength, SINGLE_GAME_PROFILES } from '@/game/single-game-options';
import type { GameLength, SingleGameOptions, SingleGameProfile } from '@/game/single-game-options';
import { RUMMY_OPENING_POINTS } from '@/game/game-rules';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { selectedVariant, useGameSettings } from '@/settings/game-settings';

const profileCopy: Record<Exclude<SingleGameProfile, 'custom'>, { title: string; caption: string }> = {
  classic: { title: 'Klasik', caption: '4 kişi · {0} el' },
  relaxed: { title: 'Rahat', caption: 'Kolay · {0} el' },
  fast: { title: 'Hızlı', caption: 'Zor · {0} el' },
};

const GAME_NAMES = { amerikano: 'Amerikano', rummy: 'Klasik Rummy', contract: 'Contract Rummy' } as const;

export default function SingleSetupScreen() {
  const { t } = useTranslations();
  const { isTablet } = useResponsiveLayout();
  const { settings } = useGameSettings();
  // The game comes from settings, which load asynchronously; never copy it into state.
  const variant = selectedVariant(settings);
  const [draft, setOptions] = useState<SingleGameOptions>(() => profileOptions('classic', variant));
  const options = { ...draft, variant };
  const [advanced, setAdvanced] = useState(false);
  const rummy = options.variant === 'rummy';
  const contractMode = options.variant === 'contract';
  const rounds = (length: GameLength) => roundsForLength(options.variant, length);
  const claimsPossible = options.playerCount > 2;

  function chooseProfile(profile: SingleGameProfile) {
    if (profile !== 'custom') setOptions(profileOptions(profile, options.variant));
  }
  function update<K extends keyof SingleGameOptions>(key: K, value: SingleGameOptions[K]) {
    setOptions(current => ({ ...current, profile: 'custom', [key]: value }));
  }
  function start() {
    router.push({ pathname: '/game', params: { mode: 'single', config: JSON.stringify(options) } });
  }
  const claimSeconds = <ChoiceRow icon="timer" label={t("Teklif karar süresi")} value={options.claimSeconds}
    choices={[5, 8, 12].map(value => ({ value: value as 5 | 8 | 12, label: t("{0} sn", [value]) }))} onChange={value => update('claimSeconds', value)} />;

  return <SafeAreaView edges={['top', 'bottom']} style={kit.page}>
    <ScrollView contentContainerStyle={[kit.content, isTablet && kit.contentTablet]} showsVerticalScrollIndicator={false}>
      <ScreenHeader title={t("Tek oyunculu")} subtitle={t("{0} · Hazır bir tarz seç veya masayı kendine göre ayarla.", [t(GAME_NAMES[options.variant])])} />

      <Segmented label={t("Hazır tarz")} value={options.profile} onChange={chooseProfile}
        choices={(['classic', 'relaxed', 'fast'] as const).map(profile => ({
          value: profile, label: t(profileCopy[profile].title), caption: t(profileCopy[profile].caption, [rounds(SINGLE_GAME_PROFILES[profile].length)]),
        }))} />
      {options.profile === 'custom' && <Note icon="settings">{t("Özel ayar: hazır tarzlardan birine dönmek için yukarıdan seç.")}</Note>}

      <View style={[kit.columns, isTablet && kit.columnsTablet]}>
        <View style={[kit.column, isTablet && kit.columnTablet]}>
          <Section title={t("MASA")}>
            <ChoiceRow icon="friends" label={t("Oyuncu sayısı")} value={options.playerCount} choices={[2, 3, 4, 5, 6].map(value => ({ value, label: String(value) }))} onChange={value => update('playerCount', value)} />
            <ChoiceRow icon="stats" label={t("Rakip seviyesi")} value={options.difficulty} choices={[{ value: 'easy', label: t("Kolay") }, { value: 'normal', label: t("Normal") }, { value: 'hard', label: t("Zor") }]} onChange={value => update('difficulty', value)} />
            <ChoiceRow icon="timer" label={t("Rakip oynama hızı")} value={options.speed} choices={[{ value: 'fast', label: t("Hızlı") }, { value: 'normal', label: t("Normal") }, { value: 'relaxed', label: t("Sakin") }]} onChange={value => update('speed', value)} last={contractMode && !rummy} />
            {!contractMode && <ChoiceRow icon="cards" label={t("Oyun uzunluğu")} value={options.length} choices={[{ value: 'mini', label: t("Mini"), caption: t("{0} el", [rounds('mini')]) }, { value: 'quick', label: t("Hızlı"), caption: t("{0} el", [rounds('quick')]) }, { value: 'full', label: t("Tam"), caption: t("{0} el", [rounds('full')]) }]} onChange={value => update('length', value)} last={!rummy} />}
            {rummy && <ChoiceRow icon="score" label={t("İlk açılış barajı")} value={options.openingMinPoints} choices={RUMMY_OPENING_POINTS.map(value => ({ value, label: value ? t("{0} puan", [value]) : t("Yok") }))} onChange={value => update('openingMinPoints', value)} last />}
          </Section>
        </View>

        <View style={[kit.column, isTablet && kit.columnTablet]}>
          <Section title={t("KURALLAR VE YARDIMCILAR")}>
            <Row icon="more" label={t("Gelişmiş ayarlar")} detail={rummy ? t("Başlangıç ve yardımcılar") : contractMode ? t("May I?, deste kesme ve yardımcılar") : t("Teklif, cezalar, Joker ve yardımcılar")}
              onPress={() => setAdvanced(value => !value)} last={!advanced}
              accessory={<View style={advanced && s.flipped}><AppIcon name="expand" size={18} color={p.muted} /></View>} />
            {advanced && <>
              {contractMode && <>
                <ToggleRow icon="friends" label={t("May I? (sıra dışı kart alma)")} detail={claimsPossible ? t("Desteden çekilince açık kartı isteyen alır ve 1 ceza kartı çeker; sınır yok.") : t("İki kişilik oyunda kullanılmaz.")} value={options.claimsEnabled && claimsPossible} disabled={!claimsPossible} onPress={() => update('claimsEnabled', !options.claimsEnabled)} />
                {options.claimsEnabled && claimsPossible && claimSeconds}
                <ToggleRow icon="cards" label={t("Deste kesme bonusu (Liverpool)")} detail={t("Dağıtımdan önce desteyi kesen oyuncu tam dağıtılacak sayıda kart keserse puanından 50 düşülür.")} value={options.cutBonus} onPress={() => update('cutBonus', !options.cutBonus)} />
              </>}
              {!rummy && !contractMode && <>
                <ToggleRow icon="friends" label={t("Açık kart teklifi")} detail={claimsPossible ? t("Desteden çekilince açık kart diğer oyunculara cezalı sunulur.") : t("İki kişilik oyunda kullanılmaz.")} value={options.claimsEnabled && claimsPossible} disabled={!claimsPossible} onPress={() => update('claimsEnabled', !options.claimsEnabled)} />
                {options.claimsEnabled && claimsPossible && claimSeconds}
                <ToggleRow icon="score" label={t("İşlek kart cezası")} detail={t("Masadaki bir gruba uyabilecek kartı atmak +25 puan yazar.")} value={options.playableDiscardPenalty} onPress={() => update('playableDiscardPenalty', !options.playableDiscardPenalty)} />
                <ChoiceRow icon="star" label={t("Açılışta Joker yasağı")} value={options.jokerOpeningRestrictionRounds} choices={[{ value: 0, label: t("Kapalı") }, { value: 4, label: t("İlk 4 el") }, { value: 5, label: t("İlk 5 el") }]} onChange={value => update('jokerOpeningRestrictionRounds', value)} />
              </>}
              <ToggleRow icon="restore" label={t("Son hamleyi geri al")} detail={t("Rakibin oynamadan önce yaptığın son hamleyi geri alabilirsin.")} value={options.undoEnabled} onPress={() => update('undoEnabled', !options.undoEnabled)} />
              <ChoiceRow icon="person" label={t("İlk başlayan")} value={options.starter} choices={[{ value: 'random', label: t("Rastgele") }, { value: 'you', label: t("Sen") }]} onChange={value => update('starter', value)} />
              <ChoiceRow icon="rules" label={t("Yeni el açıklaması")} value={options.roundIntro} choices={[{ value: 'off', label: t("Kapalı") }, { value: 'short', label: t("Kısa") }, { value: 'detailed', label: t("Detaylı") }]} onChange={value => update('roundIntro', value)} last />
            </>}
          </Section>

          <Note icon="rules">{contractMode
            ? t("7 el boyunca her elin kontratını aç: küt türden bağımsız en az 3 kart, seri aynı türde en az 4 kart. Açtıktan sonra yalnızca masaya kart işlersin. Son elde bütün kartlarını tek seferde seri olarak açıp bitirirsin.")
            : rummy
              ? t("Görev yok: istediğin küt ve serilerle açarsın. İlk açılıştaki grupların toplamı barajı geçmeli; sonra masadaki gruplara kart işleyebilirsin. Elini tek turda bitirirsen Rummy olur ve rakiplerin cezası ikiye katlanır.")
              : t("Bir oyuncu kapalı desteden çekerse yerdeki açık kart diğer oyunculara sırayla sorulur. Alan oyuncu açık kartın yanında bir ceza kartı da çeker; normal sırası değişmez.")}</Note>
        </View>
      </View>
    </ScrollView>
    <View style={s.bottomBar}>
      <PrimaryButton icon="play" label={t("Masayı Kur")} caption={t("{0} rakip · {1} el", [options.playerCount - 1, rounds(options.length)])} onPress={start} style={[s.start, isTablet && s.startTablet]} />
    </View>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  flipped: { transform: [{ rotate: '180deg' }] },
  bottomBar: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, borderTopColor: p.line, backgroundColor: p.canvas },
  start: { width: '100%', maxWidth: 580, alignSelf: 'center' },
  startTablet: { maxWidth: 972 },
});
