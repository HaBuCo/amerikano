export const OPPONENT_NAME_POOL = [
  'Ada', 'Arda', 'Aslı', 'Baran', 'Bora', 'Can', 'Cem', 'Defne', 'Deniz', 'Duru',
  'Ece', 'Efe', 'Ekin', 'Elif', 'İpek', 'Kerem', 'Lale', 'Mert', 'Naz', 'Ozan',
  'Selin', 'Sude', 'Umut', 'Yağız', 'Zeynep',
];

export function pickOpponentNames(count: number, random = Math.random, excluded: string[] = []): string[] {
  const blocked = new Set(excluded.map(name => name.toLocaleLowerCase('tr-TR')));
  const available = OPPONENT_NAME_POOL.filter(name => !blocked.has(name.toLocaleLowerCase('tr-TR')));
  for (let index = available.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [available[index], available[swapIndex]] = [available[swapIndex], available[index]];
  }
  return available.slice(0, Math.max(0, Math.min(count, available.length)));
}
