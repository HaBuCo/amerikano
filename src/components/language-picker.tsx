import { Pressable, StyleSheet, Text, View } from 'react-native';
import { palette as p } from '@/constants/palette';
import { useTranslations } from '@/i18n/language';
import { useGameSettings } from '@/settings/game-settings';

export function LanguagePicker({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  const { t } = useTranslations();
  const { settings, updateSettings, feedback } = useGameSettings();
  // The first screen wants a quiet switch: two short codes, the chosen one in gold.
  if (compact) {
    return <View accessibilityRole="radiogroup" accessibilityLabel={t('Dil')} style={s.compact}>
      {(['tr', 'en'] as const).map((language, index) => {
        const active = settings.language === language;
        return <View key={language} style={s.compactItem}>
          {index > 0 && <View style={s.compactDivider} />}
          <Pressable accessibilityRole="radio" accessibilityLabel={language === 'tr' ? 'Türkçe' : 'English'} accessibilityState={{ checked: active }} hitSlop={6}
            onPress={() => { feedback(); updateSettings({ language }); }} style={s.compactChoice}>
            <Text style={[s.compactText, active && s.compactActive]}>{language.toUpperCase()}</Text>
          </Pressable>
        </View>;
      })}
    </View>;
  }
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
  compact: { flexDirection: 'row', alignItems: 'center', height: 32, paddingHorizontal: 4, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(232,190,112,0.28)', backgroundColor: 'rgba(0,0,0,0.18)' },
  compactItem: { flexDirection: 'row', alignItems: 'center' },
  compactDivider: { width: 1, height: 12, backgroundColor: 'rgba(232,190,112,0.3)' },
  compactChoice: { paddingHorizontal: 10, height: 30, justifyContent: 'center' },
  compactText: { color: p.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  compactActive: { color: p.gold },
});
