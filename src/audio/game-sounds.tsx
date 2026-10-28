import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { nextTake } from './takes';

export type GameSound = 'tap' | 'draw' | 'place' | 'meld' | 'joker' | 'shuffle' | 'win' | 'turn' | 'error' | 'tick' | 'penalty' | 'lose' | 'deal' | 'victory' | 'coins';
type SoundContextValue = { enabled: boolean; toggle: () => void; play: (sound: GameSound) => void };
const SoundContext = createContext<SoundContextValue | null>(null);
const storageKey = 'amerikano-sound-enabled-v1';

// Card sounds are recordings (scripts/import-card-sounds.mjs) with several
// takes each, so repeated draws and discards never sound identical.
const sources: Record<GameSound, number[]> = {
  tap: [require('../../assets/sounds/tap.wav')],
  draw: [
    require('../../assets/sounds/card-draw-1.wav'), require('../../assets/sounds/card-draw-2.wav'),
    require('../../assets/sounds/card-draw-3.wav'), require('../../assets/sounds/card-draw-4.wav'),
  ],
  place: [
    require('../../assets/sounds/card-place-1.wav'), require('../../assets/sounds/card-place-2.wav'),
    require('../../assets/sounds/card-place-3.wav'), require('../../assets/sounds/card-place-4.wav'),
  ],
  meld: [require('../../assets/sounds/meld-1.wav'), require('../../assets/sounds/meld-2.wav')],
  joker: [require('../../assets/sounds/joker.wav')],
  shuffle: [require('../../assets/sounds/shuffle.wav')],
  win: [require('../../assets/sounds/win.wav')],
  turn: [require('../../assets/sounds/turn.wav')],
  error: [require('../../assets/sounds/error.wav')],
  tick: [require('../../assets/sounds/tick.wav')],
  penalty: [require('../../assets/sounds/penalty.wav')],
  lose: [require('../../assets/sounds/lose.wav')],
  deal: [require('../../assets/sounds/deal.wav')],
  victory: [require('../../assets/sounds/victory.wav')],
  coins: [require('../../assets/sounds/coins.wav')],
};


export function GameSoundsProvider({ children }: PropsWithChildren) {
  const [enabled, setEnabled] = useState(true);
  const players = useRef<Partial<Record<GameSound, AudioPlayer[]>>>({});
  const lastTake = useRef<Partial<Record<GameSound, number>>>({});

  useEffect(() => {
    void AsyncStorage.getItem(storageKey).then((saved) => {
      if (saved !== null) setEnabled(saved === 'true');
    });
  }, []);

  useEffect(() => {
    const created: AudioPlayer[] = [];
    (Object.keys(sources) as GameSound[]).forEach((key) => {
      const takes: AudioPlayer[] = [];
      for (const source of sources[key]) {
        try {
          const player = createAudioPlayer(source);
          created.push(player);
          takes.push(player);
        } catch {
          // Tablet emulators and some devices have no usable audio HAL.
        }
      }
      if (takes.length) players.current[key] = takes;
    });
    return () => {
      created.forEach((player) => {
        try { player.release(); } catch { /* ignore */ }
      });
      players.current = {};
      lastTake.current = {};
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
      const takes = players.current[sound];
      if (!takes?.length) return;
      const take = nextTake(takes.length, lastTake.current[sound]);
      lastTake.current[sound] = take;
      const player = takes[take];
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
