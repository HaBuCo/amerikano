import { Pressable, StyleSheet, Text, View } from 'react-native';
import { palette as p } from '@/constants/palette';
import { useTranslations } from '@/i18n/language';
import { useGameSettings } from '@/settings/game-settings';

export function LanguagePicker({ light = false }: { light?: boolean }) {
  const { t } = useTranslations();
  const { settings, updateSettings, feedback } = useGameSettings();
  return <View accessibilityRole="radiogroup" accessibilityLabel={t('Dil')} style={s.choices}>
    {(['tr', 'en'] as const).map(language => {
      const active = settings.language === language;
      return <Pressable key={language} accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => { feedback(); updateSettings({ language }); }} style={[s.choice, light && s.choiceLight, active && (light ? s.activeLight : s.active)]}>
        <Text style={[s.text, light && s.textLight, active && s.activeText]}>{language === 'tr' ? 'Türkçe' : 'English'}</Text>
      </Pressable>;
    })}
  </View>;
}

const s = StyleSheet.create({
  // The same pill switch as the rest of the app's segmented choices.
  choices: { flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: '#0000002e' },
  choice: { minHeight: 36, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 9 },
  choiceLight: { backgroundColor: 'transparent' },
  active: { backgroundColor: p.cream },
  // On the cream table sheets a cream pill would vanish; gold stays visible.
  activeLight: { backgroundColor: p.gold },
  text: { color: p.muted, fontSize: 12, fontWeight: '800' },
  textLight: { color: p.ink },
  activeText: { color: p.ink },
});
