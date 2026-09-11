import { GameAction } from '../game/types';
import { PrivateGameView } from '../game/view';

export type RoomView = {
  code: string;
  hostId: string;
  you: string;
  revision: number;
  members: { id: string; name: string; connected: boolean; ready: boolean }[];
  game: PrivateGameView | null;
};
export type ClientMessage =
  | { type: 'create'; name: string }
  | { type: 'join'; code: string; name: string }
  | { type: 'resume'; code: string; token: string }
  | { type: 'ready'; ready: boolean }
  | { type: 'start' }
  | { type: 'leave' }
  | { type: 'action'; requestId: string; revision: number; action: GameAction };
export type ServerMessage =
  | { type: 'session'; token: string; code: string }
  | { type: 'state'; room: RoomView }
  | { type: 'error'; message: string }
  | { type: 'left' };
