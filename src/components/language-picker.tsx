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
      return <Pressable key={language} accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => { feedback(); updateSettings({ language }); }} style={[s.choice, light && s.choiceLight, active && s.active]}>
        <Text style={[s.text, light && s.textLight, active && s.activeText]}>{language === 'tr' ? 'Türkçe' : 'English'}</Text>
      </Pressable>;
    })}
  </View>;
}

const s = StyleSheet.create({
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, maxWidth: 170 },
  choice: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: p.line },
  choiceLight: { borderColor: '#142c2233' },
  active: { backgroundColor: p.gold, borderColor: p.gold },
  text: { color: p.cream, fontSize: 12, fontWeight: '800' },
  textLight: { color: p.ink },
  activeText: { color: p.ink },
});
