import { createGame, shuffle } from './engine.ts';

type RoomPlayer = { id: string; name: string; isBot: boolean };

/** Draw fresh seats for each match, preserving each player's identity. */
export function createSeatedRoomGame(members: RoomPlayer[], random: () => number) {
  const seats = shuffle(members, random);
  const game = createGame(seats.map(member => member.name), random);
  return {
    ...game,
    players: game.players.map((player, index) => ({ ...player, id: seats[index].id })),
    botControlledPlayerIds: seats.filter(member => member.isBot).map(member => member.id),
  };
}
