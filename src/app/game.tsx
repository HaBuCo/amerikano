import { useTranslations } from '@/i18n/language';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GameTable } from '@/components/game-table';
import { GameTutorial } from '@/components/game-tutorial';
import { RoundIntro } from '@/components/round-intro';
import { actingPlayerId, applyAction, createGame, explainInvalidAction } from '@/game/engine';
import { botAction, resolveBotClaimChain } from '@/game/bot';
import { clearSingleGame, loadSingleGame, saveSingleGame } from '@/game/local-save';
import { projectGame } from '@/game/view';
import { GameAction } from '@/game/types';
import { palette as p } from '@/constants/palette';
import { hasSeenFirstGameTutorial, markFirstGameTutorialSeen } from '@/game/tutorial';
import { describeDebugAction, formatSingleGameDebug } from '@/game/debug-state';
import { contractIndexForRound, openingJokerRestricted, roundCountForGame, rulesForGame } from '@/game/game-rules';
import { parseSingleGameOptions, rulesFromSingleOptions } from '@/game/single-game-options';
import type { SingleGameOptions } from '@/game/single-game-options';
import { pickOpponentNames } from '@/game/opponent-names';
import { recordSinglePlayerResult } from '@/game/single-stats';
import { registerRoundOver, showMatchEndInterstitial } from '@/ads/interstitial';
import { recordSinglePlayerXp } from '@/network/client';
import { maybeRequestReview } from '@/review/store-review';

function createSingleGame(options: SingleGameOptions) {
  const names = ["Sen", ...pickOpponentNames(options.playerCount - 1, Math.random, ["Sen"])];
  const game = createGame(names, options.starter === 'you' ? () => 0 : Math.random, rulesFromSingleOptions(options));
  return { ...game, botControlledPlayerIds: game.players.slice(1).map(player => player.id) };
}

export default function GameScreen() {
  const { t } = useTranslations();
  const params = useLocalSearchParams<{ players?: string; mode?: string; config?: string }>();
  const single = params.mode !== 'local';
  const requestedOptions = parseSingleGameOptions(params.config);
  const [game, setGame] = useState(() => single ? createSingleGame(requestedOptions) : createGame((params.players || 'Oyuncu 1|Oyuncu 2|Oyuncu 3').split('|').slice(0, 6)));
  const [visible, setVisible] = useState(single);
  const [error, setError] = useState('');
  const [savedGame, setSavedGame] = useState<typeof game | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'choice' | 'ready'>(single ? 'loading' : 'ready');
  const [tutorialChecked, setTutorialChecked] = useState(!single);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [debugEvents, setDebugEvents] = useState<string[]>([]);
  const [undoGame, setUndoGame] = useState<typeof game | null>(null);
  const resultRecorded = useRef(false);
  const current = game.players.find(p => p.id === actingPlayerId(game))!;
  const viewerId = single ? game.players[0].id : current.id;
  const appendDebugEvent = useCallback((message: string) => {
    setDebugEvents(events => [message, ...events].slice(0, 16));
  }, []);
  const debugText = useMemo(() => formatSingleGameDebug(game, debugEvents), [debugEvents, game]);
  useEffect(() => {
    if (!single) return;
    let active = true;
    if (params.config) {
      void clearSingleGame().then(() => { if (active) setLoadState('ready'); });
    } else {
      void loadSingleGame().then(saved => {
        if (!active) return;
        if (saved) { setSavedGame(saved); setLoadState('choice'); }
        else router.replace('/single-setup');
      });
    }
    return () => { active = false; };
  }, [params.config, single]);
  useEffect(() => {
    if (!single) return;
    let active = true;
    void hasSeenFirstGameTutorial().then((seen) => {
      if (!active) return;
      setTutorialOpen(!seen);
      setTutorialChecked(true);
    });
    return () => { active = false; };
  }, [single]);
  useEffect(() => {
    if (!single || loadState !== 'ready') return;
    if (game.phase === 'game-over') {
      void clearSingleGame();
      if (!resultRecorded.current) {
        resultRecorded.current = true;
        const score = game.players[0]?.score ?? 0;
        const winningScore = Math.min(...game.players.map(player => player.score));
        const won = score === winningScore;
        void recordSinglePlayerResult(score, won).then((stats) => {
          // Let the final score settle on screen before the store sheet appears.
          setTimeout(() => { void maybeRequestReview(won, stats.gamesPlayed); }, 1_500);
        }).catch(() => undefined);
        void recordSinglePlayerXp(won);
      }
    } else void saveSingleGame(game);
  }, [game, loadState, single]);
  useEffect(() => {
    if (!single || loadState !== 'ready' || tutorialOpen || current.id === viewerId || !['draw', 'claim', 'play'].includes(game.phase)) return;
    const timer = setTimeout(() => {
      setUndoGame(null);
      let next = game;
      if (next.phase === 'claim') {
        // A stock draw can ask several bots about the same discard. Resolve
        // consecutive bot answers together so the human draw never waits once
        // per bot, but stop immediately if a real player must answer.
        next = resolveBotClaimChain(next, viewerId);
        if (next !== game) appendDebugEvent(t("Rakiplerin açık kart kararları işlendi."));
      } else {
        const action = botAction(next);
        if (action) {
          const description = describeDebugAction(next, current.id, action);
          next = applyAction(next, current.id, action);
          if (next !== game) appendDebugEvent(description);
        }
      }
      if (next !== game) setGame(next);
    }, (() => {
      const speed = rulesForGame(game).botSpeed;
      if (speed === 'fast') return game.phase === 'claim' ? 40 : game.phase === 'draw' ? 170 : 130;
      if (speed === 'relaxed') return game.phase === 'claim' ? 350 : game.phase === 'draw' ? 950 : 760;
      return game.phase === 'claim' ? 60 : game.phase === 'draw' ? 320 : 240;
    })());
    return () => clearTimeout(timer);
  }, [appendDebugEvent, game, single, current.id, viewerId, loadState, tutorialOpen, t]);
  useEffect(() => {
    if (single && loadState === 'ready' && __DEV__) console.info(`[AMERİKANO CANLI DURUM]\n${debugText}`);
  }, [debugText, loadState, single]);
  function finishTutorial() {
    setTutorialOpen(false);
    void markFirstGameTutorialSeen();
  }
  function startFresh() {
    router.replace('/single-setup');
  }
  function resume() {
    if (savedGame) setGame(savedGame);
    appendDebugEvent(t("Kayıtlı single oyuna devam edildi."));
    setSavedGame(null);
    setLoadState('ready');
  }
  function act(action: GameAction) {
    if (action.type === 'next' && game.phase === 'round-over') registerRoundOver();
    const description = describeDebugAction(game, viewerId, action);
    const next = applyAction(game, viewerId, action);
    if (next === game) {
      const reason = explainInvalidAction(game, viewerId, action);
      setError(reason);
      if (single) appendDebugEvent(t("Reddedildi · {0} · {1}", [description, reason]));
      return;
    }
    if (single) appendDebugEvent(description);
    if (single && rulesForGame(game).undoEnabled && action.type !== 'next') setUndoGame(game);
    setError(''); setGame(next);
    if (!single && (actingPlayerId(next) !== actingPlayerId(game) || action.type === 'next')) setVisible(false);
  }

  if (single && (loadState !== 'ready' || !tutorialChecked)) {
    return <SafeAreaView style={s.resumePage}>
      <View style={s.resumeSheet}>
        {loadState === 'loading' ? <>
          <Text style={s.eyebrow}>{t("OYUNUN HAZIRLANIYOR")}</Text>
          <Text style={s.resumeTitle}>{t("Masa kuruluyor.")}</Text>
          <Text style={s.copy}>{t("Kayıt kontrol ediliyor…")}</Text>
        </> : <>
          <Text style={s.eyebrow}>{t("YARIM KALAN OYUN")}</Text>
          <Text style={s.resumeTitle}>{t("Masadaki yerin duruyor.")}</Text>
          <Text style={s.copy}>{t("El")} {savedGame ? savedGame.roundIndex + 1 : 1} / {savedGame ? roundCountForGame(savedGame) : rulesFromSingleOptions(requestedOptions).contractSequence.length} {' '}{t("· Kaldığın hamleden devam edebilirsin.")}</Text>
          <Pressable accessibilityRole="button" onPress={resume} style={s.button}><Text style={s.buttonText}>{t("Oyuna devam et")}</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={startFresh} style={s.outlineButton}><Text style={s.outlineText}>{t("Yeni oyun başlat")}</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/')}><Text style={s.menuText}>{t("Ana menüye dön")}</Text></Pressable>
        </>}
      </View>
    </SafeAreaView>;
  }

  const view = projectGame(game, viewerId);
  if (single) view.players = view.players.map(player => player.id === viewerId ? { ...player, name: t('Sen') } : player);
  return <View style={s.gameRoot}>
    <GameTable key={game.roundIndex + ':' + viewerId} game={view} viewerId={viewerId} modeLabel={single ? "TEK OYUNCULU" : "AYNI CİHAZDA"} onAction={act} error={error} debugText={single ? debugText : undefined} onOpenTutorial={single ? () => setTutorialOpen(true) : undefined} canUndo={Boolean(undoGame)} onUndo={single && rulesForGame(game).undoEnabled ? () => { if (undoGame) { setGame(undoGame); setUndoGame(null); setError(''); appendDebugEvent(t("Son hamle geri alındı.")); } } : undefined} onExit={() => { if (game.phase === 'game-over') showMatchEndInterstitial(); router.replace('/'); }} />
    <RoundIntro roundIndex={game.roundIndex} contractIndex={contractIndexForRound(game)} roundCount={roundCountForGame(game)} starterName={view.players[game.startingPlayerIndex]?.name ?? t("Oyuncu")} jokerRestricted={openingJokerRestricted(game)} mode={rulesForGame(game).roundIntro} enabled={single ? !tutorialOpen : visible} />
    {single && <GameTutorial visible={tutorialOpen} onDone={finishTutorial} roundCount={roundCountForGame(game)} claimsEnabled={rulesForGame(game).claimsEnabled && game.players.length > 2} claimSeconds={rulesForGame(game).claimTimeoutMs / 1000} jokerRestrictionRounds={rulesForGame(game).jokerOpeningRestrictionRounds} playableDiscardPenalty={rulesForGame(game).playableDiscardPenalty} />}
    <Modal visible={!single && !visible && !['round-over', 'game-over'].includes(game.phase)} animationType="none" onRequestClose={() => router.replace('/')}>
      <View style={s.curtain}><Text style={s.eyebrow}>{t("TELEFONU VER")}</Text><Text style={s.name}>{current.name}</Text><Text style={s.copy}>{t("Hazır olduğunda kartlarını göster.")}</Text><Pressable accessibilityRole="button" onPress={() => setVisible(true)} style={s.button}><Text style={s.buttonText}>{t("Elimi göster")}</Text></Pressable></View>
    </Modal>
  </View>;
}
const s = StyleSheet.create({
  gameRoot: { flex: 1, backgroundColor: '#09271e' },
  curtain: { flex: 1, backgroundColor: '#071d17', padding: 32, justifyContent: 'center', alignItems: 'center', gap: 20 },
  eyebrow: { color: p.gold, letterSpacing: 3, fontSize: 11 }, name: { color: p.cream, fontSize: 34, fontWeight: '800' }, copy: { color: p.muted },
  button: { width: '100%', maxWidth: 400, backgroundColor: p.gold, padding: 18, borderRadius: 14, alignItems: 'center' }, buttonText: { color: p.ink, fontWeight: '800', fontSize: 17 },
  resumePage: { flex: 1, backgroundColor: '#071d17', padding: 24, justifyContent: 'center' },
  resumeSheet: { width: '100%', maxWidth: 430, alignSelf: 'center', backgroundColor: '#0d3327', borderWidth: 1, borderColor: p.line, borderRadius: 22, padding: 25, gap: 17 },
  resumeTitle: { color: p.cream, fontSize: 27, lineHeight: 33, fontWeight: '800' },
  outlineButton: { width: '100%', maxWidth: 400, borderWidth: 1, borderColor: p.line, padding: 17, borderRadius: 14, alignItems: 'center' },
  outlineText: { color: p.cream, fontWeight: '800', fontSize: 16 },
  menuText: { color: p.muted, textAlign: 'center', paddingVertical: 6, fontWeight: '700' },
});
