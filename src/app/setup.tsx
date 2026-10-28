import { useTranslations } from '@/i18n/language';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { kit, Note, PrimaryButton, ScreenHeader, Section, Segmented } from '@/components/screen-kit';
import { palette as p } from '@/constants/palette';
import { normalizeGameRules, roundCountForGame } from '@/game/game-rules';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { selectedVariant, useGameSettings } from '@/settings/game-settings';

const GAME_NAMES = { amerikano: 'Amerikano', rummy: 'Klasik Rummy', contract: 'Contract Rummy' } as const;

export default function SetupScreen() {
  const { t } = useTranslations();
  const { isTablet } = useResponsiveLayout();
  const { settings } = useGameSettings();
  const variant = selectedVariant(settings);
  const [names, setNames] = useState([t("Oyuncu 1"), t("Oyuncu 2"), t("Oyuncu 3"), t("Oyuncu 4")]);
  // Same-device games use each game's default rules, so its full deal count.
  const deals = roundCountForGame({ rules: normalizeGameRules({ variant }) });

  function resizePlayers(count: number) {
    setNames((current) =>
      Array.from({ length: count }, (_, i) => current[i] ?? t("Oyuncu {0}", [i + 1])),
    );
  }

  function start() {
    const cleanNames = names.map((name, index) => name.trim().replaceAll('|', '') || t("Oyuncu {0}", [index + 1]));
    router.push({ pathname: '/game', params: { players: cleanNames.join('|'), mode: 'local', variant } });
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={kit.page}>
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={[kit.content, isTablet && kit.contentTablet]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <ScreenHeader title={t("Aynı cihazda")} subtitle={t("Telefon her tur sıradaki oyuncuya geçecek. Elini göstermeden önce yalnız olduğundan emin ol.")} />

        <Segmented label={t("Oyuncu sayısı")} value={names.length} onChange={resizePlayers}
          choices={[3, 4, 5, 6].map(count => ({ value: count, label: t("{0} oyuncu", [count]) }))} />

        <Section title={t("MASADA KİMLER VAR?")}>
          {names.map((name, index) => (
            <View key={index} style={[s.playerRow, index < names.length - 1 && s.divider]}>
              <Text style={s.seat}>{index + 1}</Text>
              <TextInput
                accessibilityLabel={t("{0}. oyuncunun adı", [index + 1])}
                autoCapitalize="words"
                maxLength={18}
                onChangeText={(value) => setNames((current) => current.map((item, itemIndex) => itemIndex === index ? value : item))}
                placeholder={t("Oyuncu adı")}
                placeholderTextColor="#809487"
                returnKeyType="done"
                style={s.input}
                value={name}
              />
            </View>
          ))}
        </Section>

        <Note icon="rules">{t("{0} · {1} el. İki deste ve joker kullanılır; kurallar oyunun klasik ayarlarıdır.", [t(GAME_NAMES[variant]), deals])}</Note>
      </KeyboardAwareScrollView>

      <View style={s.bottomBar}>
        <PrimaryButton icon="play" label={t("Masayı Kur")} caption={t("{0} oyuncu · {1} el", [names.length, deals])} onPress={start} style={[s.start, isTablet && s.startTablet]} />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  playerRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: p.line },
  seat: { width: 22, color: p.gold, fontSize: 15, fontWeight: '900', textAlign: 'center' },
  input: { flex: 1, color: p.cream, fontSize: 16, fontWeight: '700', paddingVertical: 12 },
  bottomBar: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, borderTopColor: p.line, backgroundColor: p.canvas },
  start: { width: '100%', maxWidth: 580, alignSelf: 'center' },
  startTablet: { maxWidth: 972 },
});
