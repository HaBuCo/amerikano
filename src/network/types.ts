import { GameAction } from '../game/types';
import { PrivateGameView } from '../game/view';

export type RoomView = {
  code: string;
  hostId: string;
  status: 'waiting' | 'playing' | 'finished';
  visibility: 'private' | 'public';
  you: string;
  revision: number;
  startsAt?: number;
  members: {
    id: string; name: string; connected: boolean; ready: boolean;
    avatarKey: string; level: number; gamesPlayed: number; wins: number;
    missedTurns: number; botControlled: boolean;
  }[];
  game: PrivateGameView | null;
};
export type ClientMessage =
  | { type: 'create'; name: string }
  | { type: 'join'; code: string; name: string }
  | { type: 'matchmake'; name: string }
  // Kept while the legacy self-hosted server remains available as a fallback.
  | { type: 'resume'; code: string; token: string }
  | { type: 'ready'; ready: boolean }
  | { type: 'start' }
  | { type: 'rematch' }
  | { type: 'reclaim' }
  | { type: 'leave' }
  | { type: 'forfeit' }
  | { type: 'action'; requestId: string; revision: number; action: GameAction };
export type ServerMessage =
  | { type: 'session'; token: string; code: string }
  | { type: 'state'; room: RoomView }
  | { type: 'error'; message: string }
  | { type: 'left' };
