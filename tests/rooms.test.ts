import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { randomInt } from 'node:crypto';
import { WebSocket } from 'ws';
import { ServerMessage, ClientMessage, RoomView } from '../src/network/types';

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
    server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
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
  for (const r of [ga, gb, gc]) {
    assert.equal(r.game!.players.find(p => p.id === r.you)!.hand.length, r.you === ga.you ? 14 : 13);
    assert.ok(r.game!.players.filter(p => p.id !== r.you).every(p => !p.hand.length));
    assert.ok(!('stock' in r.game!));
  }
  assert.equal(ga.game!.phase, 'play');
  b.send({ type: 'action', requestId: 'out-of-turn', revision: gb.revision, action: { type: 'draw', source: 'stock' } });
  await b.wait(m => m.type === 'error');
  const aCard = ga.game!.players[0].hand[0].id;
  a.send({ type: 'action', requestId: 'first-discard', revision: ga.revision, action: { type: 'discard', cardId: aCard } });
  const cTurn = await c.room(r => r.game?.currentPlayerIndex === 2 && r.game.phase === 'draw');
  const command: ClientMessage = { type: 'action', requestId: 'draw-1', revision: cTurn.revision, action: { type: 'draw', source: 'stock' } };
  c.send(command);
  const offered = await b.room(r => r.game?.phase === 'claim');
  assert.equal(offered.game!.claim!.playerIds[0], gb.you);
  c.send(command); // Repeating a successful request cannot draw twice.
  const repeated = await c.room(r => r.revision === offered.revision);
  assert.equal(repeated.game!.handCounts[gc.you], 13);
  c.send({ type: 'action', requestId: 'stale', revision: cTurn.revision, action: { type: 'draw', source: 'stock' } });
  await c.wait(m => m.type === 'error' && m.message.includes('güncellendi'));
  a.send({ type: 'action', requestId: 'bad-priority', revision: offered.revision, action: { type: 'claim', take: true } });
  await a.wait(m => m.type === 'error');
  const claimCommand: ClientMessage = { type: 'action', requestId: 'claim-1', revision: offered.revision, action: { type: 'claim', take: true } };
  b.send(claimCommand);
  const taken = await b.room(r => r.revision > offered.revision && r.game?.phase === 'play');
  const cDrawn = await c.room(r => r.revision === taken.revision);
  assert.equal(taken.game!.handCounts[gb.you], 15);
  assert.equal(taken.game!.handCounts[gc.you], 14);
  const beforeIds = new Set(gb.game!.players[1].hand.map(c => c.id));
  const penalty = taken.game!.players[1].hand.find(c => !beforeIds.has(c.id) && c.id !== aCard)!;
  assert.ok(penalty);
  assert.ok(!JSON.stringify(cDrawn).includes('"' + penalty.id + '"'));
  b.send(claimCommand);
  const repeatClaim = await b.room(r => r.revision === taken.revision);
  assert.equal(repeatClaim.game!.handCounts[gb.you], 15);
  const closed = once(b.ws, 'close'); b.ws.close(); await closed;
  const resumed = await connect();
  resumed.send({ type: 'resume', code, token: bs.token });
  const recovered = await resumed.room(r => !!r.game);
  assert.equal(recovered.you, gb.you);
  assert.deepEqual(recovered.game!.players[1].hand, taken.game!.players[1].hand);
  // Persist a live claim, restart the server, and let its authoritative timer pass.
  const cLatest = await c.room(r => r.revision === recovered.revision);
  c.send({ type: 'action', requestId: 'c-discard', revision: cLatest.revision, action: { type: 'discard', cardId: cLatest.game!.players[2].hand[0].id } });
  const bTurn = await resumed.room(r => r.game?.currentPlayerIndex === 1 && r.game.phase === 'draw');
  resumed.send({ type: 'action', requestId: 'b-draw', revision: bTurn.revision, action: { type: 'draw', source: 'stock' } });
  const saved = await resumed.room(r => r.game?.phase === 'claim');
  assert.equal(saved.game!.claim!.playerIds[0], ga.you);
  peers.forEach(p => p.ws.terminate());
  await stop();
  await start();
  const afterRestart = await connect();
  afterRestart.send({ type: 'resume', code, token: bs.token });
  const disk = await afterRestart.room(r => !!r.game);
  assert.equal(disk.game!.currentPlayerIndex, 1);
  assert.equal(disk.you, recovered.you);
  assert.deepEqual(disk.game!.players[1].hand, recovered.game!.players[1].hand);
  assert.deepEqual(disk.game!.claim, saved.game!.claim);
  const expired = await afterRestart.room(r => r.game?.claim?.playerIds[0] === gc.you);
  assert.equal(expired.game!.claim!.playerIds.length, 1);
  const cResumed = await connect();
  cResumed.send({ type: 'resume', code, token: cs.token });
  const cResume = await cResumed.room(r => !!r.game);
  cResumed.send({ type: 'action', requestId: 'last-pass', revision: cResume.revision, action: { type: 'claim', take: false } });
  const completed = await afterRestart.room(r => r.game?.phase === 'play');
  assert.equal(completed.game!.handCounts[gb.you], 16);
});
