import AsyncStorage from '@react-native-async-storage/async-storage';

import { isScoreSheet, ScoreSheet } from './score-keeper';

const SCORE_SHEET_KEY = 'amerikano:score-keeper:v1';

export async function loadScoreSheet(): Promise<ScoreSheet | null> {
  try {
    const raw = await AsyncStorage.getItem(SCORE_SHEET_KEY);
    if (!raw) return null;
    const sheet: unknown = JSON.parse(raw);
    if (isScoreSheet(sheet)) return sheet;
    await AsyncStorage.removeItem(SCORE_SHEET_KEY);
    return null;
  } catch {
    return null;
  }
}

export async function saveScoreSheet(sheet: ScoreSheet | null) {
  try {
    if (sheet) await AsyncStorage.setItem(SCORE_SHEET_KEY, JSON.stringify(sheet));
    else await AsyncStorage.removeItem(SCORE_SHEET_KEY);
  } catch { /* Kayıt başarısız olsa da cetvel bu oturumda çalışmaya devam eder. */ }
}
