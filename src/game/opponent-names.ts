import type { Language } from '../i18n/translate.ts';

export const OPPONENT_NAME_POOL = [
  'Ada', 'Arda', 'Aslı', 'Baran', 'Bora', 'Can', 'Cem', 'Defne', 'Deniz', 'Duru',
  'Ece', 'Efe', 'Ekin', 'Elif', 'İpek', 'Kerem', 'Lale', 'Mert', 'Naz', 'Ozan',
  'Selin', 'Sude', 'Umut', 'Yağız', 'Zeynep',
];

// Players on the English app meet bots with English names.
export const ENGLISH_OPPONENT_NAME_POOL = [
  'Alex', 'Amelia', 'Ben', 'Charlie', 'Chloe', 'Daisy', 'Emily', 'Ethan', 'Grace', 'Harry',
  'Isla', 'Jack', 'Jake', 'Leo', 'Lily', 'Lucy', 'Max', 'Mia', 'Noah', 'Oliver',
  'Olivia', 'Ruby', 'Sam', 'Sophie', 'Tom',
];

export function opponentNamePool(language: Language) {
  return language === 'en' ? ENGLISH_OPPONENT_NAME_POOL : OPPONENT_NAME_POOL;
}

export function pickOpponentNames(count: number, random = Math.random, excluded: string[] = [], language: Language = 'tr'): string[] {
  const blocked = new Set(excluded.map(name => name.toLocaleLowerCase('tr-TR')));
  const available = opponentNamePool(language).filter(name => !blocked.has(name.toLocaleLowerCase('tr-TR')));
  for (let index = available.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [available[index], available[swapIndex]] = [available[swapIndex], available[index]];
  }
  return available.slice(0, Math.max(0, Math.min(count, available.length)));
}
