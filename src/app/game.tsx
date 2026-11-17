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
import { contractForRound, contractIndexForRound, openingJokerRestricted, roundCountForGame, rulesForGame, validVariant } from '@/game/game-rules';
import { parseSingleGameOptions, rulesFromSingleOptions } from '@/game/single-game-options';
import type { SingleGameOptions } from '@/game/single-game-options';
import { pickOpponentNames } from '@/game/opponent-names';
import type { Language } from '@/i18n/translate';
import { recordSinglePlayerResult } from '@/game/single-stats';
import { registerRoundOver, showMatchEndInterstitial } from '@/ads/interstitial';
import { noteRoundFinished } from '@/review/store-review';
import { MODAL_ORIENTATIONS } from '@/constants/orientation';

function createSingleGame(options: SingleGameOptions, language: Language) {
  const names = ["Sen", ...pickOpponentNames(options.playerCount - 1, Math.random, ["Sen", "You"], language)];
  const game = createGame(names, options.starter === 'you' ? () => 0 : Math.random, rulesFromSingleOptions(options));
  return { ...game, botControlledPlayerIds: game.players.slice(1).map(player => player.id) };
}

export default function GameScreen() {
  const { t, language } = useTranslations();
  const params = useLocalSearchParams<{ players?: string; mode?: string; config?: string; variant?: string }>();
  const single = params.mode !== 'local';
  const requestedOptions = parseSingleGameOptions(params.config);
  const [game, setGame] = useState(() => single ? createSingleGame(requestedOptions, language) : createGame((params.players || 'Oyuncu 1|Oyuncu 2|Oyuncu 3').split('|').slice(0, 6), Math.random, { variant: validVariant(params.variant) }));
  const [visible, setVisible] = useState(single);
  const [error, setError] = useState('');
  const [savedGame, setSavedGame] = useState<typeof game | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'choice' | 'ready'>(single ? 'loading' : 'ready');
  const [tutorialChecked, setTutorialChecked] = useState(!single);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [introFinishedRound, setIntroFinishedRound] = useState<number | null>(null);
  const [debugEvents, setDebugEvents] = useState<string[]>([]);
  const [undoGame, setUndoGame] = useState<typeof game | null>(null);
  const resultRecorded = useRef(false);
  const adPending = useRef(false);
  const current = game.players.find(p => p.id === actingPlayerId(game))!;
  // A resumed game keeps its own variant; the saved game is only known after loading.
  const variant = rulesForGame(savedGame ?? game).variant;
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
    void hasSeenFirstGameTutorial(variant).then((seen) => {
      if (!active) return;
      setTutorialOpen(!seen);
      setTutorialChecked(true);
    });
    return () => { active = false; };
  }, [single, variant]);
  useEffect(() => {
    if (!single || loadState !== 'ready') return;
    if (game.phase === 'game-over') {
      void clearSingleGame();
      if (!resultRecorded.current) {
        resultRecorded.current = true;
        const score = game.players[0]?.score ?? 0;
        const winningScore = Math.min(...game.players.map(player => player.score));
        const won = score === winningScore;
        void recordSinglePlayerResult(score, won).catch(() => undefined);
      }
    } else void saveSingleGame(game);
  }, [game, loadState, single]);
  // Every finished round counts towards the review prompt; going out or winning the match is the moment to ask.
  const roundsSeen = useRef<number | null>(null);
  useEffect(() => {
    if (!single || loadState !== 'ready') return;
    const finished = game.scoreHistory?.length ?? 0;
    // The first look (a resumed game) and a fresh match only set the baseline.
    if (roundsSeen.current === null || finished < roundsSeen.current) { roundsSeen.current = finished; return; }
    if (finished === roundsSeen.current) return;
    roundsSeen.current = finished;
    const me = game.players[0];
    const matchWon = game.phase === 'game-over' && me.score === Math.min(...game.players.map(player => player.score));
    // Let the round's score settle on screen before the store sheet appears.
    noteRoundFinished(game.roundWinnerId === me.id || matchWon, 1_800);
  }, [game, loadState, single]);
  useEffect(() => {
    if (!single || loadState !== 'ready' || !tutorialChecked || tutorialOpen || introFinishedRound !== game.roundIndex || current.id === viewerId || !['draw', 'claim', 'play'].includes(game.phase)) return;
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
      // Keep actual card moves readable. Claim-only decisions still resolve
      // together so drawing does not wait separately for every opponent.
      if (speed === 'fast') return game.phase === 'claim' ? 120 : game.phase === 'draw' ? 500 : 550;
      if (speed === 'relaxed') return game.phase === 'claim' ? 450 : game.phase === 'draw' ? 1600 : 1800;
      return game.phase === 'claim' ? 220 : game.phase === 'draw' ? 1000 : 1100;
    })());
    return () => clearTimeout(timer);
  }, [appendDebugEvent, game, single, current.id, viewerId, loadState, tutorialChecked, tutorialOpen, introFinishedRound, t]);
  useEffect(() => {
    if (single && loadState === 'ready' && __DEV__) console.info(`[AMERİKANO CANLI DURUM]\n${debugText}`);
  }, [debugText, loadState, single]);
  function finishTutorial() {
    setTutorialOpen(false);
    void markFirstGameTutorialSeen(variant);
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
    if (action.type === 'next' && game.phase === 'round-over') {
      // Reklam açıkken masayı değiştirmek Android'de oyunu kilitleyebiliyor; el reklam kapanınca geçer.
      if (adPending.current) return;
      adPending.current = true;
      void registerRoundOver().then(() => { adPending.current = false; apply(action); });
      return;
    }
    apply(action);
  }
  function apply(action: GameAction) {
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
          <Text style={s.copy}>{t("El")} {savedGame ? savedGame.roundIndex + 1 : 1} / {roundCountForGame({ rules: savedGame?.rules ?? rulesFromSingleOptions(requestedOptions) })} {' '}{t("· Kaldığın hamleden devam edebilirsin.")}</Text>
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
    <GameTable key={game.roundIndex + ':' + viewerId} game={view} viewerId={viewerId} modeLabel={single ? "TEK OYUNCULU" : "AYNI CİHAZDA"} blocked={single && (tutorialOpen || introFinishedRound !== game.roundIndex)} onAction={act} error={error} debugText={single ? debugText : undefined} onOpenTutorial={single ? () => setTutorialOpen(true) : undefined} canUndo={Boolean(undoGame)} onUndo={single && rulesForGame(game).undoEnabled ? () => { if (undoGame) { setGame(undoGame); setUndoGame(null); setError(''); appendDebugEvent(t("Son hamle geri alındı.")); } } : undefined} onExit={() => { if (game.phase === 'game-over') void showMatchEndInterstitial().then(() => router.replace('/')); else router.replace('/'); }} />
    <RoundIntro roundIndex={game.roundIndex} contractIndex={contractIndexForRound(game)} contract={contractForRound(game)} roundCount={roundCountForGame(game)} starterName={view.players[game.startingPlayerIndex]?.name ?? t("Oyuncu")} cutBonusName={view.players.find(player => player.id === game.cutBonus?.playerId)?.name} jokerRestricted={openingJokerRestricted(game)} mode={rulesForGame(game).roundIntro} enabled={single ? tutorialChecked && !tutorialOpen : visible} onComplete={single ? setIntroFinishedRound : undefined} />
    {single && <GameTutorial visible={tutorialOpen} onDone={finishTutorial} variant={variant} openingMinPoints={rulesForGame(game).openingMinPoints} roundCount={roundCountForGame(game)} claimsEnabled={rulesForGame(game).claimsEnabled && game.players.length > 2} claimSeconds={rulesForGame(game).claimTimeoutMs / 1000} jokerRestrictionRounds={rulesForGame(game).jokerOpeningRestrictionRounds} playableDiscardPenalty={rulesForGame(game).playableDiscardPenalty} />}
    <Modal supportedOrientations={MODAL_ORIENTATIONS} visible={!single && !visible && !['round-over', 'game-over'].includes(game.phase)} animationType="none" onRequestClose={() => router.replace('/')}>
      <View style={s.curtain}><Text style={s.eyebrow}>{t("TELEFONU VER")}</Text><Text style={s.name}>{current.name}</Text><Text style={s.copy}>{t("Hazır olduğunda kartlarını göster.")}</Text><Pressable accessibilityRole="button" onPress={() => setVisible(true)} style={s.button}><Text style={s.buttonText}>{t("Elimi göster")}</Text></Pressable></View>
    </Modal>
  </View>;
}
const s = StyleSheet.create({
  gameRoot: { flex: 1, backgroundColor: '#072a22' },
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
