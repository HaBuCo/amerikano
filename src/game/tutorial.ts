import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GameVariant } from './types.ts';

// Each game has its own first-game guide; Amerikano keeps its original key.
const tutorialKey = (variant: GameVariant) => variant === 'rummy'
  ? 'amerikano:first-game-tutorial:rummy:v1'
  : variant === 'contract'
    ? 'amerikano:first-game-tutorial:contract:v1'
    : 'amerikano:first-game-tutorial:v2';

export async function hasSeenFirstGameTutorial(variant: GameVariant = 'amerikano') {
  try {
    return await AsyncStorage.getItem(tutorialKey(variant)) === 'seen';
  } catch {
    return false;
  }
}

export async function markFirstGameTutorialSeen(variant: GameVariant = 'amerikano') {
  try {
    await AsyncStorage.setItem(tutorialKey(variant), 'seen');
  } catch {
    // Tutorial persistence must never prevent the game from opening.
  }
}
