import { createServer } from 'node:http';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { actingPlayerId, applyAction, armTurnTimer, createGame, expireTurn, MIN_GAME_PLAYERS, reclaimBotSeat, resetMissedTurns, RULESET_ID } from '../src/game/engine';
import { botAction } from '../src/game/bot';
import { GameState } from '../src/game/types';
import { projectGame } from '../src/game/view';
import { ClientMessage, ServerMessage } from '../src/network/types';

type Member = { id: string; name: string; token: string; ready: boolean };
type Room = { ruleset: string; code: string; hostId: string; members: Member[]; game: GameState | null; revision: number; updated: number; requests: string[] };
const port = Number(process.env.PORT || 8090);
const dbPath = process.env.ROOM_DB || 'work/rooms.sqlite';
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, body TEXT NOT NULL)');
const rooms = new Map<string, Room>();
const sockets = new Map<WebSocket, { code: string; id: string }>();
for (const row of db.prepare('SELECT body FROM rooms').all()) {
  const room: Room = JSON.parse(String(row.body));
  if (room.ruleset !== RULESET_ID) continue; // Preserve older saves on disk, never reinterpret a live hand.
  if (room.updated > Date.now() - 86400000) rooms.set(room.code, room);
  else db.prepare('DELETE FROM rooms WHERE code = ?').run(room.code);
}
const save = (room: Room) => {
  room.updated = Date.now();
  db.prepare('INSERT OR REPLACE INTO rooms VALUES (?, ?)').run(room.code, JSON.stringify(room));
};
const secureRandom = () => randomInt(0, 0x100000000) / 0x100000000;
const send = (ws: WebSocket, data: ServerMessage) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
const connected = (code: string, id: string) => [...sockets.entries()].some(([ws, s]) => ws.readyState === WebSocket.OPEN && s.code === code && s.id === id);
function advanceBots(state: GameState) {
  let current = state;
  for (let step = 0; step < 50; step++) {
    if (current.phase === 'round-over' || current.phase === 'game-over') break;
    const actorId = actingPlayerId(current);
    if (!current.botControlledPlayerIds?.includes(actorId)) break;
    const action = botAction(current);
    if (!action) break;
    const next = applyAction(current, actorId, action, secureRandom);
    if (next === current) break;
    current = armTurnTimer(next);
  }
  return current;
}
function publish(room: Room) {
  for (const [ws, s] of sockets) {
    if (s.code !== room.code) continue;
    send(ws, { type: 'state', room: {
      code: room.code, hostId: room.hostId, you: s.id, revision: room.revision,
      status: !room.game ? 'waiting' : room.game.phase === 'game-over' ? 'finished' : 'playing',
      visibility: 'private',
      members: room.members.map(m => ({ id: m.id, name: m.name, ready: m.ready, connected: connected(room.code, m.id), avatarKey: 'emerald', level: 1, gamesPlayed: 0, wins: 0, missedTurns: room.game?.missedTurns?.[m.id] ?? 0, botControlled: room.game?.botControlledPlayerIds?.includes(m.id) ?? false })),
      game: room.game ? projectGame(room.game, s.id) : null,
    } });
  }
}
function promote(room: Room) {
  if (!connected(room.code, room.hostId)) {
    room.hostId = room.members.find(m => connected(room.code, m.id))?.id ?? room.hostId;
  }
}
function expireRoomTurn(room: Room) {
  if (!room.game) return;
  const next = advanceBots(expireTurn(room.game, Date.now(), secureRandom));
  if (next !== room.game) { room.game = next; room.revision++; save(room); publish(room); }
}
function nameOf(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 18) throw new Error('1–18 karakterlik bir ad yaz.');
  return value.trim();
}
function roomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code: string;
  do { code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join(''); } while (rooms.has(code));
  return code;
}
const http = createServer((req, res) => {
  res.writeHead(req.url === '/health' ? 200 : 404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: req.url === '/health' }));
});
const wss = new WebSocketServer({ server: http, maxPayload: 8192 });
// Reject foreign browser origins when configured. Native clients do not send Origin.
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',');
const attempts = new Map<string, { n: number; until: number }>();
wss.on('connection', (ws, req) => {
  if (allowedOrigins && req.headers.origin && !allowedOrigins.includes(req.headers.origin)) return ws.close(1008, 'Origin');
  const ip = req.socket.remoteAddress || 'unknown';
  if ([...wss.clients].length > 500) return ws.close(1013, 'Capacity');
  let budget = 0, windowStart = Date.now(), alive = true;
  ws.on('pong', () => { alive = true; });
  const heartbeat = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false; ws.ping();
  }, 15000);
  ws.on('message', raw => {
    try {
      if (Date.now() - windowStart > 10000) { budget = 0; windowStart = Date.now(); }
      if (++budget > 40) throw new Error('Çok hızlı işlem yapıyorsun. Biraz bekle.');
      const msg = JSON.parse(raw.toString()) as ClientMessage;
      if (!msg || typeof msg.type !== 'string') throw new Error('Geçersiz istek.');
      const session = sockets.get(ws);
      if (['create', 'join', 'resume'].includes(msg.type)) {
        if (session) throw new Error('Önce mevcut odadan ayrıl.');
        let counter = attempts.get(ip);
        if (!counter || counter.until < Date.now()) { counter = { n: 0, until: Date.now() + 60000 }; attempts.set(ip, counter); }
        if (++counter.n > 40) throw new Error('Katılma sınırı aşıldı; bir dakika bekle.');
        let room: Room, member: Member;
        if (msg.type === 'create') {
          if (rooms.size >= 1000) throw new Error('Odalar dolu. Daha sonra dene.');
          member = { id: 'player-1', name: nameOf(msg.name), token: randomBytes(32).toString('hex'), ready: true };
          room = { ruleset: RULESET_ID, code: roomCode(), hostId: member.id, members: [member], game: null, revision: 0, updated: Date.now(), requests: [] };
          rooms.set(room.code, room);
        } else if (msg.type === 'join' || msg.type === 'resume') {
          room = rooms.get(String(msg.code).toUpperCase())!;
          if (!room) throw new Error('Oda bulunamadı veya süresi doldu.');
          if (msg.type === 'resume') {
            member = room.members.find(m => m.token === msg.token)!;
            if (!member) throw new Error('Oturum bulunamadı. Odaya yeniden katıl.');
            for (const [other, s] of sockets) {
              if (s.code === room.code && s.id === member.id) { sockets.delete(other); other.close(4001, 'Session replaced'); }
            }
          } else {
            if (room.game) throw new Error('Oyun başladı. Yeni oyun için bekle.');
            if (room.members.length >= 6) throw new Error('Oda dolu (6 oyuncu).');
            member = { id: randomUUID(), name: nameOf(msg.name), token: randomBytes(32).toString('hex'), ready: false };
            room.members.push(member);
          }
        } else return;
        sockets.set(ws, { code: room.code, id: member.id });
        promote(room); room.revision++; save(room);
        send(ws, { type: 'session', token: member.token, code: room.code });
        publish(room); return;
      }
      if (!session) throw new Error('Önce odaya katıl.');
      const room = rooms.get(session.code)!;
      if (!room) throw new Error('Oda süresi doldu.');
      if (msg.type === 'leave') {
        if (room.game && room.game.phase !== 'game-over') throw new Error('Oyun sürüyor. Bağlantını kapatıp aynı oturumla dönebilirsin.');
        room.members = room.members.filter(m => m.id !== session.id);
        sockets.delete(ws); promote(room); room.revision++; save(room); publish(room);
        send(ws, { type: 'left' }); return;
      }
      if (msg.type === 'ready') {
        if (room.game || typeof msg.ready !== 'boolean') throw new Error('Hazırlık aşaması bitti.');
        room.members.find(m => m.id === session.id)!.ready = msg.ready;
      } else if (msg.type === 'start') {
        if (room.hostId !== session.id) throw new Error('Oyunu oda sahibi başlatabilir.');
        if (room.game) throw new Error('Oyun zaten başladı.');
        if (room.members.length < MIN_GAME_PLAYERS || room.members.some(m => !m.ready || !connected(room.code, m.id))) throw new Error('En az 2 oyuncu bağlı ve hazır olmalı.');
        room.game = armTurnTimer(createGame(room.members.map(m => m.name), secureRandom));
        room.game.players = room.game.players.map((p, i) => ({ ...p, id: room.members[i].id }));
      } else if (msg.type === 'rematch') {
        if (room.hostId !== session.id && !room.game?.botControlledPlayerIds?.includes(room.hostId)) throw new Error('Yeni maçı oda sahibi başlatabilir.');
        if (room.game?.phase !== 'game-over') throw new Error('Maç henüz tamamlanmadı.');
        room.game = armTurnTimer(createGame(room.members.map(m => m.name), secureRandom));
        room.game.players = room.game.players.map((p, i) => ({ ...p, id: room.members[i].id }));
      } else if (msg.type === 'reclaim') {
        if (!room.game) throw new Error('Oyun henüz başlamadı.');
        const next = reclaimBotSeat(room.game, session.id);
        if (next === room.game) throw new Error('Koltuğun zaten sende.');
        room.game = next;
      } else if (msg.type === 'action') {
        expireRoomTurn(room);
        if (!room.game || !msg.action || typeof msg.requestId !== 'string' || msg.requestId.length > 100) throw new Error('Geçersiz hamle.');
        const requestKey = session.id + ':' + msg.requestId;
        if (room.requests.includes(requestKey)) { publish(room); return; }
        if (msg.revision !== room.revision) { publish(room); throw new Error('Masa güncellendi; hamleni yeniden seç.'); }
        if (msg.action.type === 'next' && room.hostId !== session.id && !room.game.botControlledPlayerIds?.includes(room.hostId)) throw new Error('Sonraki eli oda sahibi başlatır.');
        if (room.game.botControlledPlayerIds?.includes(session.id)) throw new Error('Önce koltuğunu bottan geri al.');
        const next = applyAction(room.game, session.id, msg.action, secureRandom);
        if (next === room.game) throw new Error('Hamle geçersiz: sıranı, kartlarını ve el görevini kontrol et.');
        room.game = advanceBots(armTurnTimer(resetMissedTurns(next, session.id)));
        room.requests.push(requestKey);
        room.requests = room.requests.slice(-256);
      } else throw new Error('Bilinmeyen işlem.');
      room.revision++; save(room); publish(room);
    } catch (error) {
      send(ws, { type: 'error', message: error instanceof Error && !(error instanceof TypeError) && !(error instanceof SyntaxError) ? error.message : 'Geçersiz istek.' });
    }
  });
  ws.on('error', () => ws.terminate());
  ws.on('close', () => {
    clearInterval(heartbeat);
    const session = sockets.get(ws);
    sockets.delete(ws);
    if (session) {
      const room = rooms.get(session.code);
      if (room) { promote(room); room.revision++; save(room); publish(room); }
    }
  });
});
const cleanup = setInterval(() => {
  for (const [ip, item] of attempts) if (item.until < Date.now()) attempts.delete(ip);
  for (const [code, room] of rooms) {
    if (room.updated < Date.now() - 86400000 && !room.members.some(m => connected(code, m.id))) {
      rooms.delete(code); db.prepare('DELETE FROM rooms WHERE code = ?').run(code);
    }
  }
}, 60000);
cleanup.unref();
const claimClock = setInterval(() => { for (const room of rooms.values()) expireRoomTurn(room); }, 250);
claimClock.unref();
http.listen(port, '0.0.0.0', () => console.log(`Amerikano rooms: port ${port}`));
