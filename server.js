import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8787);
const clients = new Map();
const waiting = [];
const rooms = new Map();
const defaultQuestions = [
  '… würde im Spukhaus als Erstes „Hallo?“ rufen?',
  '… würde sich vor einer Spielzeugpuppe am meisten fürchten?',
  '… würde als Geist am überzeugendsten spuken?',
  '… würde an Halloween das beste Kostüm tragen?',
  '… würde die Süßigkeiten schon vor Halloween aufessen?'
];

const httpServer = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ ok: true, waiting: waiting.length, rooms: rooms.size }));
    return;
  }
  const files = {
    '/': ['index.html', 'text/html; charset=utf-8'],
    '/index.html': ['index.html', 'text/html; charset=utf-8'],
    '/public.js': ['public.js', 'text/javascript; charset=utf-8'],
    '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json; charset=utf-8'],
    '/sw.js': ['sw.js', 'text/javascript; charset=utf-8'],
    '/icon.svg': ['icon.svg', 'image/svg+xml; charset=utf-8']
  };
  const file = files[pathname];
  if (!file) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  try {
    const body = await readFile(join(root, file[0]));
    response.writeHead(200, {
      'content-type': file[1],
      'cache-control': pathname === '/sw.js' || pathname === '/manifest.webmanifest' ? 'no-cache' : 'no-store',
      ...(pathname === '/sw.js' ? { 'service-worker-allowed': '/' } : {})
    });
    response.end(body);
  } catch {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Could not load game files');
  }
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 });
httpServer.on('upgrade', (request, socket, head) => {
  if (new URL(request.url, 'http://localhost').pathname !== '/ws') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
});

function send(client, message) {
  if (client?.ws.readyState === WebSocket.OPEN) client.ws.send(JSON.stringify(message));
}

function publicPlayers(room) {
  return room.players.map(({ id, name, score }) => ({ id, name, score, host: id === room.hostId }));
}

function broadcast(room, message) {
  for (const player of room.players) send(clients.get(player.id), message);
}

function setPlayerDetails(client, data) {
  client.name = String(data.name || '').trim().slice(0, 18);
  client.questions = Array.isArray(data.questions)
    ? [...new Set(data.questions.map((q) => String(q).slice(0, 180)).filter(Boolean))].slice(0, 300)
    : [];
}

function makeInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = [...randomBytes(6)].map((byte) => alphabet[byte % alphabet.length]).join('');
  } while (rooms.has(code));
  return code;
}

function broadcastPrivateLobby(room) {
  for (const player of room.players) {
    send(clients.get(player.id), {
      type: 'room_lobby', roomId: room.id, playerId: player.id,
      hostId: room.hostId, players: publicPlayers(room), minPlayers: 3, maxPlayers: 8
    });
  }
}

function queueUpdate() {
  const live = waiting.filter((client) => client.ws.readyState === WebSocket.OPEN);
  for (const client of live) send(client, { type: 'queue', waiting: live.length });
}

function joinQueue(client, data) {
  if (client.name || client.roomId) return;
  const name = String(data.name || '').trim().slice(0, 18);
  if (name.length < 2) {
    send(client, { type: 'error', message: 'Bitte gib einen Namen mit mindestens zwei Zeichen ein.' });
    return;
  }
  setPlayerDetails(client, { ...data, name });
  waiting.push(client);
  queueUpdate();
  matchPlayers();
}

function matchPlayers() {
  while (waiting.filter((client) => client.ws.readyState === WebSocket.OPEN).length >= 3) {
    const ready = waiting.filter((client) => client.ws.readyState === WebSocket.OPEN).slice(0, 8);
    for (const client of ready) {
      const index = waiting.indexOf(client);
      if (index >= 0) waiting.splice(index, 1);
    }
    const room = {
      id: randomUUID().slice(0, 8).toUpperCase(),
      players: ready.map((client) => ({ id: client.id, name: client.name, score: 0 })),
      questions: ready[0].questions.length ? ready[0].questions : defaultQuestions,
      used: new Set(),
      round: 0,
      votes: new Map(),
      private: false,
      phase: 'starting',
      timer: null
    };
    rooms.set(room.id, room);
    for (const client of ready) {
      client.roomId = room.id;
      send(client, { type: 'room_start', roomId: room.id, playerId: client.id, players: publicPlayers(room) });
    }
    startRound(room);
  }
  queueUpdate();
}

function createPrivateRoom(client, data) {
  if (client.name || client.roomId) return;
  const name = String(data.name || '').trim().slice(0, 18);
  if (name.length < 2) {
    send(client, { type: 'error', message: 'Bitte gib einen Namen mit mindestens zwei Zeichen ein.' });
    return;
  }
  setPlayerDetails(client, { ...data, name });
  const room = {
    id: makeInviteCode(),
    players: [{ id: client.id, name: client.name, score: 0 }],
    hostId: client.id,
    questions: client.questions.length ? client.questions : defaultQuestions,
    used: new Set(),
    round: 0,
    votes: new Map(),
    private: true,
    phase: 'lobby',
    timer: null
  };
  rooms.set(room.id, room);
  client.roomId = room.id;
  broadcastPrivateLobby(room);
}

function joinPrivateRoom(client, data) {
  if (client.name || client.roomId) return;
  const name = String(data.name || '').trim().slice(0, 18);
  if (name.length < 2) {
    send(client, { type: 'error', message: 'Bitte gib einen Namen mit mindestens zwei Zeichen ein.' });
    return;
  }
  const code = String(data.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const room = rooms.get(code);
  if (!room || !room.private || room.phase !== 'lobby') {
    send(client, { type: 'error', message: 'Der Einladungscode ist falsch oder der Raum wurde schon gestartet.' });
    return;
  }
  if (room.players.length >= 8) {
    send(client, { type: 'error', message: 'Dieser Raum ist schon voll (maximal 8 Personen).' });
    return;
  }
  setPlayerDetails(client, { ...data, name });
  client.roomId = room.id;
  room.players.push({ id: client.id, name: client.name, score: 0 });
  broadcastPrivateLobby(room);
}

function startPrivateRoom(client) {
  const room = rooms.get(client.roomId);
  if (!room || !room.private || room.phase !== 'lobby' || room.hostId !== client.id) return;
  if (room.players.length < 3) {
    send(client, { type: 'error', message: 'Zum Starten braucht ihr mindestens 3 Spieler.' });
    return;
  }
  room.phase = 'starting';
  for (const player of room.players) {
    send(clients.get(player.id), {
      type: 'room_start', roomId: room.id, playerId: player.id,
      players: publicPlayers(room), private: true
    });
  }
  startRound(room);
}

function nextQuestion(room) {
  let fresh = room.questions.filter((question) => !room.used.has(question));
  if (!fresh.length) {
    room.used.clear();
    fresh = room.questions;
  }
  const question = fresh[Math.floor(Math.random() * fresh.length)] || defaultQuestions[0];
  room.used.add(question);
  return question;
}

function startRound(room) {
  if (!rooms.has(room.id)) return;
  if (room.players.length < 3) {
    closeRoom(room);
    return;
  }
  room.round += 1;
  room.phase = 'voting';
  room.votes = new Map();
  room.currentQuestion = nextQuestion(room);
  broadcast(room, { type: 'round_start', round: room.round, bonusRound: room.round % 5 === 0, question: room.currentQuestion, players: publicPlayers(room) });
  room.timer = setTimeout(() => finishRound(room), 90_000);
}

function vote(client, targetId) {
  const room = rooms.get(client.roomId);
  if (!room || room.phase !== 'voting' || room.votes.has(client.id)) return;
  if (!room.players.some((player) => player.id === targetId) || targetId === client.id) return;
  room.votes.set(client.id, targetId);
  broadcast(room, { type: 'vote_count', count: room.votes.size, total: room.players.length });
  if (room.votes.size >= room.players.length) beginReveal(room);
}

function beginReveal(room) {
  if (room.phase !== 'voting') return;
  clearTimeout(room.timer);
  room.phase = 'revealing';
  broadcast(room, { type: 'reveal_countdown', round: room.round });
  room.timer = setTimeout(() => finishRound(room), 2700);
}

function finishRound(room) {
  if (room.phase !== 'voting' && room.phase !== 'revealing') return;
  clearTimeout(room.timer);
  room.phase = 'result';
  const counts = Object.fromEntries(room.players.map((player) => [player.id, 0]));
  for (const targetId of room.votes.values()) counts[targetId] += 1;
  const highest = Math.max(...Object.values(counts));
  const leaders = room.players.filter((player) => counts[player.id] === highest);
  const winner = leaders[Math.floor(Math.random() * leaders.length)];
  const pointsAwarded = room.round % 5 === 0 ? 2 : 1;
  winner.score += pointsAwarded;
  broadcast(room, {
    type: 'round_result',
    round: room.round,
    winnerId: winner.id,
    tied: leaders.length > 1,
    pointsAwarded,
    counts,
    total: room.votes.size,
    players: publicPlayers(room)
  });
  room.timer = setTimeout(() => startRound(room), 9000);
}

function closeRoom(room) {
  clearTimeout(room.timer);
  broadcast(room, { type: 'room_closed' });
  for (const player of room.players) {
    const client = clients.get(player.id);
    if (client) client.roomId = null;
  }
  rooms.delete(room.id);
}

function removeClient(client) {
  const queueIndex = waiting.indexOf(client);
  if (queueIndex >= 0) waiting.splice(queueIndex, 1);
  if (client.roomId) {
    const room = rooms.get(client.roomId);
    const previousRoomId = client.roomId;
    client.roomId = null;
    if (room) {
      const player = room.players.find((entry) => entry.id === client.id);
      room.players = room.players.filter((entry) => entry.id !== client.id);
      room.votes.delete(client.id);
      if (room.private && room.phase === 'lobby') {
        if (room.hostId === client.id && room.players.length) room.hostId = room.players[0].id;
        if (!room.players.length) rooms.delete(previousRoomId);
        else broadcastPrivateLobby(room);
      } else if (room.players.length < 3) closeRoom(room);
      else {
        broadcast(room, { type: 'player_left', name: player?.name || 'Ein Spieler', players: publicPlayers(room) });
        if (room.phase === 'voting' && room.votes.size >= room.players.length) finishRound(room);
      }
    }
  }
  clients.delete(client.id);
  queueUpdate();
}

wss.on('connection', (ws) => {
  const client = { id: randomUUID(), ws, name: '', questions: [], roomId: null };
  clients.set(client.id, client);
  ws.on('error', () => {});
  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw.toString()); } catch { return; }
    if (data.type === 'join') joinQueue(client, data);
    else if (data.type === 'create_private') createPrivateRoom(client, data);
    else if (data.type === 'join_private') joinPrivateRoom(client, data);
    else if (data.type === 'start_private') startPrivateRoom(client);
    else if (data.type === 'vote') vote(client, String(data.targetId || ''));
    else if (data.type === 'leave') {
      removeClient(client);
      if (ws.readyState === WebSocket.OPEN) ws.close();
    } else if (data.type === 'voice_signal') {
      const room = rooms.get(client.roomId);
      const target = room?.players.find((player) => player.id === data.targetId);
      if (target && client.id !== target.id) send(clients.get(target.id), { type: 'voice_signal', fromId: client.id, signal: data.signal });
    }
  });
  ws.on('close', () => removeClient(client));
});

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Freundschafts-Multiversum läuft auf Port ${port}`);
});
