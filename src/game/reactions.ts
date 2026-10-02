export type Reaction = { id: string; kind: 'emoji' | 'phrase'; text: string };

// Only these fixed ids travel over the wire, so nobody can send free text.
export const REACTIONS: readonly Reaction[] = [
  { id: 'clap', kind: 'emoji', text: '👏' },
  { id: 'laugh', kind: 'emoji', text: '😂' },
  { id: 'wow', kind: 'emoji', text: '😮' },
  { id: 'angry', kind: 'emoji', text: '😡' },
  { id: 'fire', kind: 'emoji', text: '🔥' },
  { id: 'like', kind: 'emoji', text: '👍' },
  { id: 'sad', kind: 'emoji', text: '😢' },
  { id: 'cool', kind: 'emoji', text: '😎' },
  { id: 'good-game', kind: 'phrase', text: 'İyi oyundu!' },
  { id: 'nice-move', kind: 'phrase', text: 'Güzel hamle!' },
  { id: 'hurry', kind: 'phrase', text: 'Hadi, sıra sende!' },
  { id: 'oops', kind: 'phrase', text: 'Eyvah!' },
  { id: 'thanks', kind: 'phrase', text: 'Teşekkürler' },
  { id: 'wait', kind: 'phrase', text: 'Bir saniye…' },
  { id: 'unlucky', kind: 'phrase', text: 'Bu el şansım yok' },
  { id: 'congrats', kind: 'phrase', text: 'Tebrikler!' },
];

export const REACTION_COOLDOWN_MS = 2_000;
export const REACTION_VISIBLE_MS = 4_000;

export function reactionById(id: unknown): Reaction | undefined {
  return typeof id === 'string' ? REACTIONS.find(reaction => reaction.id === id) : undefined;
}

/** A sender may post again once the cooldown has passed since their previous reaction. */
export function cooldownPassed(lastAt: number | undefined, now: number): boolean {
  return lastAt === undefined || now - lastAt >= REACTION_COOLDOWN_MS;
}
