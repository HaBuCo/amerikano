import { GameAction } from '../game/types';
import { PrivateGameView } from '../game/view';

export type RoomView = {
  code: string;
  hostId: string;
  status: 'waiting' | 'playing' | 'finished';
  visibility: 'private' | 'public';
  you: string;
  revision: number;
  entryFee: number;
  coinPot: number;
  myPrize: number;
  coinSettled: boolean;
  startsAt?: number;
  botFillAvailableAt?: number;
  serverNow?: number;
  members: {
    id: string; name: string; connected: boolean; ready: boolean;
    avatarKey: string; level: number; gamesPlayed: number; wins: number;
    missedTurns: number; botControlled: boolean; isBot: boolean;
  }[];
  game: PrivateGameView | null;
};
export type ClientMessage =
  | { type: 'create'; name: string; entryFee?: number; economyVersion?: 1 }
  | { type: 'join'; code: string; name: string; economyVersion?: 1 }
  | { type: 'matchmake'; name: string; entryFee?: number; economyVersion?: 1 }
  // Kept while the legacy self-hosted server remains available as a fallback.
  | { type: 'resume'; code: string; token: string }
  | { type: 'ready'; ready: boolean }
  | { type: 'add-bot' }
  | { type: 'remove-bot' }
  | { type: 'fill-bots' }
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
