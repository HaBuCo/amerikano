export type RoomLatency = { command: string; totalMs: number; serverMs?: number; ok: boolean };
const samples: RoomLatency[] = [];

/** Local diagnostic timings only; never store room IDs, tokens or card data. */
export function recordRoomLatency(sample: RoomLatency) {
  samples.push(sample);
  if (samples.length > 100) samples.shift();
}

export function roomLatencySummary(command?: string) {
  const selected = samples.filter(sample => sample.ok && (!command || sample.command === command));
  const sorted = selected.map(sample => sample.totalMs).sort((a, b) => a - b);
  const percentile = (fraction: number) => sorted.length ? sorted[Math.ceil(sorted.length * fraction) - 1] : null;
  return { count: sorted.length, p50Ms: percentile(0.5), p95Ms: percentile(0.95), latest: selected.at(-1) ?? null };
}
