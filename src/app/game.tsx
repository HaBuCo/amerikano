import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GameTable } from '@/components/game-table';
import { actingPlayerId, applyAction, createGame } from '@/game/engine';
import { botAction } from '@/game/bot';
import { clearSingleGame, loadSingleGame, saveSingleGame } from '@/game/local-save';
import { projectGame } from '@/game/view';
import { GameAction } from '@/game/types';
import { palette as p } from '@/constants/palette';

export default function GameScreen() {
  const params = useLocalSearchParams<{ players?: string; mode?: string }>();
  const single = params.mode !== 'local';
  const [game, setGame] = useState(() => createGame(single ? ['Sen', 'Defne', 'Efe', 'Ada'] : (params.players || 'Oyuncu 1|Oyuncu 2|Oyuncu 3').split('|').slice(0, 6)));
  const [visible, setVisible] = useState(single);
  const [error, setError] = useState('');
  const [savedGame, setSavedGame] = useState<typeof game | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'choice' | 'ready'>(single ? 'loading' : 'ready');
  const current = game.players.find(p => p.id === actingPlayerId(game))!;
  const viewerId = single ? game.players[0].id : current.id;
  useEffect(() => {
    if (!single) return;
    let active = true;
    void loadSingleGame().then(saved => {
      if (!active) return;
      if (saved) { setSavedGame(saved); setLoadState('choice'); }
      else setLoadState('ready');
    });
    return () => { active = false; };
  }, [single]);
  useEffect(() => {
    if (!single || loadState !== 'ready') return;
    if (game.phase === 'game-over') void clearSingleGame();
    else void saveSingleGame(game);
  }, [game, loadState, single]);
  useEffect(() => {
    if (!single || loadState !== 'ready' || current.id === viewerId || !['draw', 'claim', 'play'].includes(game.phase)) return;
    const timer = setTimeout(() => {
      const action = botAction(game);
      if (action) setGame(applyAction(game, current.id, action));
    }, game.phase === 'draw' ? 800 : 550);
    return () => clearTimeout(timer);
  }, [game, single, current.id, viewerId, loadState]);
  function startFresh() {
    void clearSingleGame();
    setSavedGame(null);
    setGame(createGame(['Sen', 'Defne', 'Efe', 'Ada']));
    setLoadState('ready');
  }
  function resume() {
    if (savedGame) setGame(savedGame);
    setSavedGame(null);
    setLoadState('ready');
  }
  function act(action: GameAction) {
    const next = applyAction(game, viewerId, action);
    if (next === game) {
      setError('Görevi ve joker kuralını kontrol et. Açtığın turda ek grup veya işleme yapamazsın. Bitiş için bir kart ayır.');
      return;
    }
    setError(''); setGame(next);
    if (!single && (actingPlayerId(next) !== actingPlayerId(game) || action.type === 'next')) setVisible(false);
  }

  if (single && loadState !== 'ready') {
    return <SafeAreaView style={s.resumePage}>
      <View style={s.resumeSheet}>
        {loadState === 'loading' ? <>
          <Text style={s.eyebrow}>OYUNUN HAZIRLANIYOR</Text>
          <Text style={s.resumeTitle}>Masa kuruluyor.</Text>
          <Text style={s.copy}>Kayıt kontrol ediliyor…</Text>
        </> : <>
          <Text style={s.eyebrow}>YARIM KALAN OYUN</Text>
          <Text style={s.resumeTitle}>Masadaki yerin duruyor.</Text>
          <Text style={s.copy}>El {savedGame ? savedGame.roundIndex + 1 : 1} / 12 · Kaldığın hamleden devam edebilirsin.</Text>
          <Pressable accessibilityRole="button" onPress={resume} style={s.button}><Text style={s.buttonText}>Oyuna devam et</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={startFresh} style={s.outlineButton}><Text style={s.outlineText}>Yeni oyun başlat</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/')}><Text style={s.menuText}>Ana menüye dön</Text></Pressable>
        </>}
      </View>
    </SafeAreaView>;
  }

  return <>
    <GameTable key={game.roundIndex + ':' + viewerId} game={projectGame(game, viewerId)} viewerId={viewerId} modeLabel={single ? 'TEK OYUNCULU · BOT MASASI' : 'AYNI CİHAZDA'} onAction={act} error={error} onExit={() => router.replace('/')} />
    <Modal visible={!single && !visible && !['round-over', 'game-over'].includes(game.phase)} animationType="none" onRequestClose={() => router.replace('/')}>
      <View style={s.curtain}><Text style={s.eyebrow}>TELEFONU VER</Text><Text style={s.name}>{current.name}</Text><Text style={s.copy}>Hazır olduğunda kartlarını göster.</Text><Pressable accessibilityRole="button" onPress={() => setVisible(true)} style={s.button}><Text style={s.buttonText}>Elimi göster</Text></Pressable></View>
    </Modal>
  </>;
}
const s = StyleSheet.create({
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
