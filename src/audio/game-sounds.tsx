import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioPlayer } from 'expo-audio';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

export type GameSound = 'tap' | 'draw' | 'place' | 'meld' | 'joker' | 'shuffle' | 'win';
type SoundContextValue = { enabled: boolean; toggle: () => void; play: (sound: GameSound) => void };
const SoundContext = createContext<SoundContextValue | null>(null);
const storageKey = 'amerikano-sound-enabled-v1';

export function GameSoundsProvider({ children }: PropsWithChildren) {
  const [enabled, setEnabled] = useState(true);
  const tap = useAudioPlayer(require('../../assets/sounds/tap.wav'));
  const draw = useAudioPlayer(require('../../assets/sounds/card-draw.wav'));
  const place = useAudioPlayer(require('../../assets/sounds/card-place.wav'));
  const meld = useAudioPlayer(require('../../assets/sounds/meld.wav'));
  const joker = useAudioPlayer(require('../../assets/sounds/joker.wav'));
  const shuffle = useAudioPlayer(require('../../assets/sounds/shuffle.wav'));
  const win = useAudioPlayer(require('../../assets/sounds/win.wav'));

  const players = useMemo(() => ({ tap, draw, place, meld, joker, shuffle, win }), [tap, draw, place, meld, joker, shuffle, win]);

  useEffect(() => {
    void AsyncStorage.getItem(storageKey).then((saved) => {
      if (saved !== null) setEnabled(saved === 'true');
    });
  }, []);

  const value = useMemo<SoundContextValue>(() => ({
    enabled,
    toggle: () => setEnabled((current) => {
      const next = !current;
      void AsyncStorage.setItem(storageKey, String(next));
      return next;
    }),
    play: (sound) => {
      if (!enabled) return;
      const player = players[sound];
      try {
        void player.seekTo(0);
        player.play();
      } catch { /* Audio should never block a game action. */ }
    },
  }), [enabled, players]);

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useGameSounds() {
  const value = useContext(SoundContext);
  if (!value) throw new Error('useGameSounds must be used inside GameSoundsProvider.');
  return value;
}
