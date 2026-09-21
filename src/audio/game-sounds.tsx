import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type GameSound = 'tap' | 'draw' | 'place' | 'meld' | 'joker' | 'shuffle' | 'win';
type SoundContextValue = { enabled: boolean; toggle: () => void; play: (sound: GameSound) => void };
const SoundContext = createContext<SoundContextValue | null>(null);
const storageKey = 'amerikano-sound-enabled-v1';

const sources: Record<GameSound, number> = {
  tap: require('../../assets/sounds/tap.wav'),
  draw: require('../../assets/sounds/card-draw.wav'),
  place: require('../../assets/sounds/card-place.wav'),
  meld: require('../../assets/sounds/meld.wav'),
  joker: require('../../assets/sounds/joker.wav'),
  shuffle: require('../../assets/sounds/shuffle.wav'),
  win: require('../../assets/sounds/win.wav'),
};

export function GameSoundsProvider({ children }: PropsWithChildren) {
  const [enabled, setEnabled] = useState(true);
  const players = useRef<Partial<Record<GameSound, AudioPlayer>>>({});

  useEffect(() => {
    void AsyncStorage.getItem(storageKey).then((saved) => {
      if (saved !== null) setEnabled(saved === 'true');
    });
  }, []);

  useEffect(() => {
    const created: AudioPlayer[] = [];
    (Object.keys(sources) as GameSound[]).forEach((key) => {
      try {
        const player = createAudioPlayer(sources[key]);
        created.push(player);
        players.current[key] = player;
      } catch {
        // Tablet emulators and some devices have no usable audio HAL.
      }
    });
    return () => {
      created.forEach((player) => {
        try { player.release(); } catch { /* ignore */ }
      });
      players.current = {};
    };
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
      const player = players.current[sound];
      if (!player) return;
      try {
        void player.seekTo(0);
        player.play();
      } catch { /* Audio should never block a game action. */ }
    },
  }), [enabled]);

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useGameSounds() {
  const value = useContext(SoundContext);
  if (!value) throw new Error('useGameSounds must be used inside GameSoundsProvider.');
  return value;
}
