import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { randomInt } from 'node:crypto';
import { WebSocket } from 'ws';
import type { ServerMessage, ClientMessage, RoomView } from '../src/network/types.ts';

class Peer {
  ws: WebSocket;
  messages: ServerMessage[] = [];
  constructor(port: number) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}`);
    this.ws.on('message', raw => this.messages.push(JSON.parse(String(raw))));
  }
  send(m: ClientMessage) { this.ws.send(JSON.stringify(m)); }
  async wait(predicate: (m: ServerMessage) => boolean): Promise<ServerMessage> {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      const index = this.messages.findIndex(predicate);
      if (index >= 0) return this.messages.splice(index, 1)[0];
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Expected server event was not received');
  }
  async room(predicate: (r: RoomView) => boolean) {
    const m = await this.wait(m => m.type === 'state' && predicate(m.room));
    assert.equal(m.type, 'state'); return m.room;
  }
}

test('three real clients: rooms, authority, privacy, deduplication, reconnect and disk recovery', { timeout: 45000 }, async t => {
  const port = randomInt(19000, 29000);
  const data = join(mkdtempSync(join(tmpdir(), 'amerikano-test-')), 'rooms.sqlite');
  let server: ChildProcess;
  const peers: Peer[] = [];
  const start = async () => {
    server = spawn(process.execPath, ['server/index.ts'], {
      cwd: process.cwd(), env: { ...process.env, PORT: String(port), ROOM_DB: data }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server startup timeout')), 8000);
      server.stdout!.on('data', chunk => { if (String(chunk).includes('Amerikano rooms:')) { clearTimeout(timeout); resolve(); } });
      server.once('error', reject);
      server.once('exit', code => { clearTimeout(timeout); if (code) reject(new Error('Server exited ' + code)); });
    });
  };
  const stop = async () => { const exited = once(server, 'exit'); server.kill(); await exited; };
  t.after(async () => { peers.forEach(p => p.ws.terminate()); if (server && server.exitCode === null) await stop(); });
  await start();
  const connect = async () => { const p = new Peer(port); peers.push(p); await once(p.ws, 'open'); return p; };
  const a = await connect();
  a.send({ type: 'create', name: 'Ayşe' });
  const as = await a.wait(m => m.type === 'session'); assert.equal(as.type, 'session');
  const code = as.code;
  const b = await connect(), c = await connect();
  b.send({ type: 'join', code, name: 'Bora' });
  const bs = await b.wait(m => m.type === 'session'); assert.equal(bs.type, 'session');
  c.send({ type: 'join', code, name: 'Cem' });
  const cs = await c.wait(m => m.type === 'session'); assert.equal(cs.type, 'session');
  b.send({ type: 'ready', ready: true }); c.send({ type: 'ready', ready: true });
  const lobby = await a.room(r => r.members.length === 3 && r.members.every(m => m.ready));
  assert.ok(!JSON.stringify(lobby).includes(as.token));
  b.send({ type: 'start' });
  await b.wait(m => m.type === 'error' && m.message.includes('oda sahibi'));
  a.send({ type: 'start' });
  const ga = await a.room(r => !!r.game);
  const gb = await b.room(r => !!r.game);
  const gc = await c.room(r => !!r.game);
  const participants = [
    { peer: a, room: ga, token: as.token },
    { peer: b, room: gb, token: bs.token },
    { peer: c, room: gc, token: cs.token },
  ];
  const startIndex = ga.game!.startingPlayerIndex;
  const drawIndex = (startIndex + 2) % 3;
  const claimIndex = (startIndex + 1) % 3;
  const participantAt = (index: number) => {
    const playerId = ga.game!.players[index].id;
    return participants.find(participant => participant.room.you === playerId)!;
  };
  const starter = participantAt(startIndex);
  const drawer = participantAt(drawIndex);
  const claimant = participantAt(claimIndex);
  for (const r of [ga, gb, gc]) {
    const ownIndex = r.game!.players.findIndex(player => player.id === r.you);
    assert.equal(r.game!.players[ownIndex].hand.length, ownIndex === startIndex ? 14 : 13);
    assert.ok(r.game!.players.filter(p => p.id !== r.you).every(p => !p.hand.length));
    assert.ok(!('stock' in r.game!));
  }
  assert.equal(ga.game!.phase, 'play');
  claimant.peer.send({ type: 'action', requestId: 'out-of-turn', revision: claimant.room.revision, action: { type: 'draw', source: 'stock' } });
  await claimant.peer.wait(m => m.type === 'error');
  const firstCard = starter.room.game!.players[startIndex].hand[0].id;
  starter.peer.send({ type: 'action', requestId: 'first-discard', revision: starter.room.revision, action: { type: 'discard', cardId: firstCard } });
  const drawTurn = await drawer.peer.room(r => r.game?.currentPlayerIndex === drawIndex && r.game.phase === 'draw');
  const command: ClientMessage = { type: 'action', requestId: 'draw-1', revision: drawTurn.revision, action: { type: 'draw', source: 'stock' } };
  drawer.peer.send(command);
  const offered = await claimant.peer.room(r => r.game?.phase === 'claim');
  assert.equal(offered.game!.claim!.playerIds[0], claimant.room.you);
  drawer.peer.send(command); // Repeating a successful request cannot draw twice.
  const repeated = await drawer.peer.room(r => r.revision === offered.revision);
  assert.equal(repeated.game!.handCounts[drawer.room.you], 13);
  drawer.peer.send({ type: 'action', requestId: 'stale', revision: drawTurn.revision, action: { type: 'draw', source: 'stock' } });
  await drawer.peer.wait(m => m.type === 'error' && m.message.includes('güncellendi'));
  starter.peer.send({ type: 'action', requestId: 'bad-priority', revision: offered.revision, action: { type: 'claim', take: true } });
  await starter.peer.wait(m => m.type === 'error');
  const claimCommand: ClientMessage = { type: 'action', requestId: 'claim-1', revision: offered.revision, action: { type: 'claim', take: true } };
  claimant.peer.send(claimCommand);
  const taken = await claimant.peer.room(r => r.revision > offered.revision && r.game?.phase === 'play');
  const drawnView = await drawer.peer.room(r => r.revision === taken.revision);
  assert.equal(taken.game!.handCounts[claimant.room.you], 15);
  assert.equal(taken.game!.handCounts[drawer.room.you], 14);
  const beforeIds = new Set(claimant.room.game!.players[claimIndex].hand.map(card => card.id));
  const penalty = taken.game!.players[claimIndex].hand.find(card => !beforeIds.has(card.id) && card.id !== firstCard)!;
  assert.ok(penalty);
  assert.ok(!JSON.stringify(drawnView).includes('"' + penalty.id + '"'));
  claimant.peer.send(claimCommand);
  const repeatClaim = await claimant.peer.room(r => r.revision === taken.revision);
  assert.equal(repeatClaim.game!.handCounts[claimant.room.you], 15);
  const closed = once(claimant.peer.ws, 'close'); claimant.peer.ws.close(); await closed;
  const resumed = await connect();
  resumed.send({ type: 'resume', code, token: claimant.token });
  const recovered = await resumed.room(r => !!r.game);
  assert.equal(recovered.you, claimant.room.you);
  assert.deepEqual(recovered.game!.players[claimIndex].hand, taken.game!.players[claimIndex].hand);
  // Persist a live claim, restart the server, and let its authoritative timer pass.
  const drawerLatest = await drawer.peer.room(r => r.revision === recovered.revision);
  drawer.peer.send({ type: 'action', requestId: 'drawer-discard', revision: drawerLatest.revision, action: { type: 'discard', cardId: drawerLatest.game!.players[drawIndex].hand[0].id } });
  const claimantTurn = await resumed.room(r => r.game?.currentPlayerIndex === claimIndex && r.game.phase === 'draw');
  resumed.send({ type: 'action', requestId: 'claimant-draw', revision: claimantTurn.revision, action: { type: 'draw', source: 'stock' } });
  const saved = await resumed.room(r => r.game?.phase === 'claim');
  assert.equal(saved.game!.claim!.playerIds[0], starter.room.you);
  peers.forEach(p => p.ws.terminate());
  await stop();
  await start();
  const afterRestart = await connect();
  afterRestart.send({ type: 'resume', code, token: claimant.token });
  const disk = await afterRestart.room(r => !!r.game);
  assert.equal(disk.game!.currentPlayerIndex, claimIndex);
  assert.equal(disk.you, recovered.you);
  assert.deepEqual(disk.game!.players[claimIndex].hand, recovered.game!.players[claimIndex].hand);
  assert.deepEqual(disk.game!.claim, saved.game!.claim);
  const completed = await afterRestart.room(r => r.game?.phase === 'play' && !r.game.claim);
  assert.equal(completed.game!.handCounts[claimant.room.you], 16);
});
