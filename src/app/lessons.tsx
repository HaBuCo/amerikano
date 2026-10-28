import { useTranslations } from '@/i18n/language';
import { Href, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chevron, kit, ScreenHeader, SecondaryButton, Segmented } from '@/components/screen-kit';
import { palette as p } from '@/constants/palette';
import { useLessonsDone } from '@/game/lesson-progress';
import { lessonsFor } from '@/game/lessons';
import { validVariant } from '@/game/game-rules';
import type { GameVariant } from '@/game/types';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { selectedVariant, useGameSettings } from '@/settings/game-settings';

export default function LessonsScreen() {
  const { t } = useTranslations();
  const { isTablet } = useResponsiveLayout();
  const { settings } = useGameSettings();
  const params = useLocalSearchParams<{ variant?: string; first?: string }>();
  // Opened by itself on a player's first visit: say why, and make skipping easy.
  const firstVisit = params.first === '1';
  // Settings load asynchronously: follow the chosen game until a tab is tapped.
  const [picked, setPicked] = useState<GameVariant | null>(params.variant ? validVariant(params.variant) : null);
  const variant = picked ?? selectedVariant(settings);
  const done = useLessonsDone();
  const lessons = lessonsFor(variant);
  const finished = lessons.filter(lesson => done.has(lesson.id)).length;
  const next = lessons.find(lesson => !done.has(lesson.id)) ?? lessons[0];

  return <SafeAreaView edges={['top', 'bottom']} style={kit.page}>
    <ScrollView contentContainerStyle={[kit.content, isTablet && kit.contentTablet, s.content]} showsVerticalScrollIndicator={false}>
      <ScreenHeader title={t("Eğitim")} subtitle={firstVisit
        ? t("Hoş geldin! Birkaç kısa dersle kuralları oynayarak öğren. İstersen geç, sonra ana sayfadan açabilirsin.")
        : t("Her ders tek bir kuralı, kartlar elindeyken öğretir.")} />
      <Segmented label={t("Oyun türü")} value={variant} onChange={setPicked} choices={[
        { value: 'amerikano', label: t("Amerikano") }, { value: 'rummy', label: t("Rummy") }, { value: 'contract', label: t("Contract") },
      ]} />
      <Text style={s.progress}>{t("{0} / {1} ders tamam", [finished, lessons.length])}</Text>
      <View style={s.group}>
        {lessons.map((lesson, index) => {
          const complete = done.has(lesson.id);
          const upNext = lesson.id === next.id && !complete;
          return <Pressable key={lesson.id} accessibilityRole="button"
            accessibilityLabel={`${index + 1}. ${t(lesson.title)}${complete ? ', ' + t("tamamlandı") : ''}`}
            onPress={() => router.push(`/lesson?id=${lesson.id}` as Href)}
            style={({ pressed }) => [s.row, index < lessons.length - 1 && s.divider, pressed && kit.pressed]}>
            <View style={[s.badge, complete && s.badgeDone, upNext && s.badgeNext]}>
              <Text style={[s.badgeText, (complete || upNext) && s.badgeTextOn]}>{complete ? '✓' : index + 1}</Text>
            </View>
            <View style={s.copy}>
              <Text style={s.title}>{t(lesson.title)}</Text>
              <Text style={s.summary}>{t(lesson.summary)}</Text>
            </View>
            <Chevron />
          </Pressable>;
        })}
      </View>
      {firstVisit && <SecondaryButton label={t("Şimdilik geç")} onPress={() => router.back()} />}
      <Text style={s.note}>{t("Dersler kısa ve hazır dağıtılmış ellerdir; puan ya da coin yazılmaz. İstediğin kadar tekrar oynayabilirsin.")}</Text>
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  content: { gap: 14 },
  progress: { color: p.gold, fontSize: 11, fontWeight: '900', letterSpacing: 1.5, marginLeft: 4, marginTop: 4 },
  group: { borderRadius: 18, backgroundColor: p.surface, borderWidth: 1, borderColor: p.line, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16 },
  divider: { borderBottomWidth: 1, borderBottomColor: p.line },
  badge: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: p.line },
  badgeDone: { backgroundColor: '#7BE4A5', borderColor: '#7BE4A5' },
  badgeNext: { backgroundColor: p.gold, borderColor: p.gold },
  badgeText: { color: p.muted, fontSize: 15, fontWeight: '900' },
  badgeTextOn: { color: p.ink },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  title: { color: p.cream, fontSize: 16, fontWeight: '900' },
  summary: { color: p.muted, fontSize: 12, lineHeight: 17 },
  note: { color: p.muted, fontSize: 12, lineHeight: 18, marginHorizontal: 4 },
});
