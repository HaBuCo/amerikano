import AsyncStorage from '@react-native-async-storage/async-storage';
import { Card } from './types';

const prefix = 'amerikano-hand-order-v1:';

export async function loadHandOrder(key: string) {
  try {
    const value = await AsyncStorage.getItem(prefix + key);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) && parsed.every((id) => typeof id === 'string') ? parsed as string[] : [];
  } catch {
    return [];
  }
}

export async function saveHandOrder(key: string, order: string[]) {
  await AsyncStorage.setItem(prefix + key, JSON.stringify(order));
}

export function reconcileHandOrder(order: string[], cards: Card[]) {
  const available = new Set(cards.map((card) => card.id));
  const kept = order.filter((id, index) => available.has(id) && order.indexOf(id) === index);
  const known = new Set(kept);
  return [...kept, ...cards.map((card) => card.id).filter((id) => !known.has(id))];
}

export function arrangeHand(cards: Card[], order: string[]) {
  const byId = new Map(cards.map((card) => [card.id, card]));
  return reconcileHandOrder(order, cards).map((id) => byId.get(id)!);
}

export function moveCardToIndex(order: string[], movingId: string, targetIndex: number) {
  const next = order.filter((id) => id !== movingId);
  next.splice(Math.max(0, Math.min(targetIndex, next.length)), 0, movingId);
  return next;
}
