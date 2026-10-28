import { useTranslations } from '@/i18n/language';
import { Href, Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GameTable } from '@/components/game-table';
import { palette as p } from '@/constants/palette';
import { botAction } from '@/game/bot';
import { actingPlayerId, applyAction, explainInvalidAction } from '@/game/engine';
import { markLessonDone } from '@/game/lesson-progress';
import { actionFor, buildLesson, highlightFor, lessonById, lessonsFor, matchesStep, nextBotMove, YOU, type Lesson } from '@/game/lessons';
import type { GameAction, GameState } from '@/game/types';
import { projectGame } from '@/game/view';

// Slow enough to follow what the opponents do.
const BOT_DELAY_MS = 1100;

export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const lesson = lessonById(id);
  if (!lesson) return <Redirect href={'/lessons' as Href} />;
  // A new lesson starts from its own deal.
  return <LessonPlayer key={lesson.id} lesson={lesson} />;
}

function LessonPlayer({ lesson }: { lesson: Lesson }) {
  const { t, localizeMessage } = useTranslations();
  const safeArea = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // A sideways phone keeps the piles in the middle of a short screen: the coach moves to the side.
  const sideways = width > height && height < 520;
  const [game, setGame] = useState<GameState>(() => buildLesson(lesson));
  const [stepIndex, setStepIndex] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [hint, setHint] = useState('');
  const step = lesson.steps[stepIndex];
  const finished = !step;
  const actor = actingPlayerId(game);
  const yourMove = actor === YOU && game.phase !== 'round-over' && game.phase !== 'game-over';
  const waitingForInfo = step?.expect.type === 'info';
  const siblings = lessonsFor(lesson.variant);
  const nextLesson = siblings[siblings.findIndex(item => item.id === lesson.id) + 1];

  useEffect(() => {
    if (finished) void markLessonDone(lesson.id);
  }, [finished, lesson.id]);

  // Scripted opponents move on their own, one card move at a time.
  useEffect(() => {
    if (finished || waitingForInfo || yourMove || game.phase === 'round-over' || game.phase === 'game-over') return;
    const timer = setTimeout(() => {
      const scripted = nextBotMove(game, lesson.bot, cursor);
      const action = scripted?.action ?? botAction(game);
      if (!action) return;
      const next = applyAction(game, actingPlayerId(game), action);
      if (next === game) return;
      if (scripted) setCursor(scripted.cursor);
      setGame(next);
    }, game.phase === 'claim' ? 400 : BOT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [cursor, finished, game, lesson.bot, waitingForInfo, yourMove]);

  const play = (action: GameAction) => {
    if (!step || step.expect.type === 'info' || action.type === 'next') return;
    if (!matchesStep(game, action, step.expect)) {
      // A legal but different move would take the lesson off its script.
      const reason = explainInvalidAction(game, YOU, action);
      setHint(reason ? localizeMessage(reason) : t(step.hint ?? "Bu derste şimdi yukarıdaki adımı yapalım."));
      return;
    }
    const next = applyAction(game, YOU, action);
    if (next === game) { setHint(localizeMessage(explainInvalidAction(game, YOU, action))); return; }
    setGame(next);
    setHint('');
    setStepIndex(index => index + 1);
  };
  const showMe = () => {
    if (!step) return;
    const action = actionFor(game, step.expect);
    if (action) play(action);
  };

  const view = useMemo(() => {
    const projected = projectGame(game, YOU);
    return { ...projected, players: projected.players.map(player => player.id === YOU ? { ...player, name: t('Sen') } : player) };
  }, [game, t]);
  const highlight = useMemo(() => yourMove && step ? highlightFor(game, step.expect) : [], [game, step, yourMove]);
  const actorName = game.players.find(player => player.id === actor)?.name ?? '';
  const stepCount = lesson.steps.length;

  return <View style={s.root}>
    <GameTable game={view} viewerId={YOU} modeLabel="EĞİTİM" blocked={finished || waitingForInfo || !yourMove}
      canAdvance={false} hideResults highlightCardIds={highlight} onAction={play} onExit={() => router.back()} />

    {!finished && <View style={[s.coachLayer, { pointerEvents: 'box-none' }, sideways ? { top: safeArea.top + 56, right: 12 + safeArea.right, width: Math.min(320, width * 0.36) } : { top: safeArea.top + 62, left: 12 + safeArea.left, right: 12 + safeArea.right }]}>
      <View style={s.coach}>
        <View style={s.coachHead}>
          <Text style={s.eyebrow} numberOfLines={1}>{t(lesson.title).toLocaleUpperCase()}</Text>
          <View style={s.dots}>{lesson.steps.map((_, index) => <View key={index} style={[s.dot, index < stepIndex && s.dotDone, index === stepIndex && s.dotNow]} />)}</View>
        </View>
        <Text style={[s.coachText, sideways && s.coachTextSmall]}>{waitingForInfo || yourMove ? t(step.coach) : t("{0} oynuyor…", [actorName])}</Text>
        {!!hint && <Text style={s.hint}>{hint}</Text>}
        {waitingForInfo
          ? <Pressable accessibilityRole="button" onPress={() => setStepIndex(index => index + 1)} style={({ pressed }) => [s.primary, pressed && s.pressed]}>
            <Text style={s.primaryText}>{stepIndex === 0 ? t("Başla") : t("Devam")}</Text>
          </Pressable>
          : yourMove && <Pressable accessibilityRole="button" onPress={showMe} hitSlop={6} style={({ pressed }) => [s.showMe, pressed && s.pressed]}>
            <Text style={s.showMeText}>{t("Benim yerime yap")}</Text>
          </Pressable>}
        <Text style={s.counter}>{t("Adım {0} / {1}", [Math.min(stepIndex + 1, stepCount), stepCount])}</Text>
      </View>
    </View>}

    {finished && <View style={s.finishLayer}>
      <View style={s.finish}>
        <View style={s.tick}><Text style={s.tickText}>✓</Text></View>
        <Text style={s.finishEyebrow}>{t("DERS TAMAM")}</Text>
        <Text style={s.finishTitle}>{t(lesson.title)}</Text>
        <Text style={s.finishText}>{t(lesson.done)}</Text>
        {nextLesson
          ? <Pressable accessibilityRole="button" onPress={() => router.replace(`/lesson?id=${nextLesson.id}` as Href)} style={({ pressed }) => [s.primary, pressed && s.pressed]}>
            <Text style={s.primaryText}>{t("Sonraki ders: {0}", [t(nextLesson.title)])}</Text>
          </Pressable>
          : <Pressable accessibilityRole="button" onPress={() => router.replace(`/single-setup` as Href)} style={({ pressed }) => [s.primary, pressed && s.pressed]}>
            <Text style={s.primaryText}>{t("Gerçek bir oyun başlat")}</Text>
          </Pressable>}
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [s.secondary, pressed && s.pressed]}>
          <Text style={s.secondaryText}>{t("Derslere dön")}</Text>
        </Pressable>
      </View>
    </View>}
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: p.felt },
  coachLayer: { position: 'absolute', alignItems: 'center' },
  coach: {
    width: '100%', maxWidth: 520, borderRadius: 18, padding: 14, gap: 8,
    backgroundColor: '#0B2419F2', borderWidth: 1, borderColor: '#7BE4A566', boxShadow: '0 12px 30px rgba(0,0,0,0.45)',
  },
  coachHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eyebrow: { flex: 1, color: '#7BE4A5', fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F8F1DF33' },
  dotDone: { backgroundColor: '#7BE4A5' },
  dotNow: { width: 16, backgroundColor: p.gold },
  coachText: { color: p.cream, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  coachTextSmall: { fontSize: 13, lineHeight: 18 },
  hint: { color: '#FFD7B0', fontSize: 13, lineHeight: 18, fontWeight: '700' },
  primary: { minHeight: 44, alignSelf: 'stretch', borderRadius: 13, backgroundColor: p.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 2 },
  primaryText: { color: p.ink, fontSize: 15, fontWeight: '900', textAlign: 'center' },
  showMe: { alignSelf: 'flex-start', paddingVertical: 2 },
  showMeText: { color: p.gold, fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' },
  counter: { color: p.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  finishLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#03110bcc', alignItems: 'center', justifyContent: 'center', padding: 24 },
  finish: { width: '100%', maxWidth: 440, borderRadius: 24, padding: 24, gap: 10, alignItems: 'center', backgroundColor: p.surface, borderWidth: 1, borderColor: p.line },
  tick: {
    width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#7BE4A5',
    boxShadow: '0 0 0 6px #7BE4A533, 0 10px 24px rgba(0,0,0,0.35)',
  },
  tickText: { color: p.ink, fontSize: 32, fontWeight: '900', marginTop: -2 },
  finishEyebrow: { color: '#7BE4A5', fontSize: 11, fontWeight: '900', letterSpacing: 2, marginTop: 6 },
  finishTitle: { color: p.cream, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  finishText: { color: '#C8D7CD', fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 6 },
  secondary: { minHeight: 42, alignSelf: 'stretch', borderRadius: 13, borderWidth: 1, borderColor: p.line, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: p.cream, fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.8 },
});
