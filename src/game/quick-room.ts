export const QUICK_ROOM_TARGET = 4;
export const QUICK_ROOM_MINIMUM = 3;
export const QUICK_ROOM_BOT_WAIT_MS = 30_000;

export function localRoomDeadline(deadline: number | undefined, serverNow: number | undefined, receivedAt: number) {
  if (deadline === undefined) return undefined;
  return serverNow === undefined ? deadline : receivedAt + deadline - serverNow;
}

export function quickRoomStartsAt(connected: number, threeSince?: string | null, fourSince?: string | null) {
  if (connected < QUICK_ROOM_MINIMUM || !threeSince) return undefined;
  const threeDeadline = Date.parse(threeSince) + 20_000;
  const deadline = connected >= QUICK_ROOM_TARGET && fourSince
    ? Math.min(threeDeadline, Date.parse(fourSince) + 5_000) : threeDeadline;
  return Number.isFinite(deadline) ? deadline : undefined;
}
