import AsyncStorage from '@react-native-async-storage/async-storage';

const TUTORIAL_KEY = 'amerikano:first-game-tutorial:v1';

export async function hasSeenFirstGameTutorial() {
  try {
    return await AsyncStorage.getItem(TUTORIAL_KEY) === 'seen';
  } catch {
    return false;
  }
}

export async function markFirstGameTutorialSeen() {
  try {
    await AsyncStorage.setItem(TUTORIAL_KEY, 'seen');
  } catch {
    // Tutorial persistence must never prevent the game from opening.
  }
}
