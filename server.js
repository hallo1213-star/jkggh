import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
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
  const files = { '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'], '/public.js': ['public.js', 'text/javascript; charset=utf-8'] };
  const file = files[pathname];
  if (!file) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  try {
    const body = await readFile(join(root, file[0]));
    response.writeHead(200, { 'content-type': file[1], 'cache-control': 'no-store' });
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
  return room.players.map(({ id, name, score }) => ({ id, name, score }));
}

function broadcast(room, message) {
  for (const player of room.players) send(clients.get(player.id), message);
}

function queueUpdate() {
  const live = waiting.filter((client) => client.ws.readyState === WebSocket.OPEN);
  for (const client of live) send(client, { type: 'queue', waiting: live.length });
}

function joinQueue(client, data) {
  if (client.name) return;
  const name = String(data.name || '').trim().slice(0, 18);
  if (name.length < 2) {
    send(client, { type: 'error', message: 'Bitte gib einen Namen mit mindestens zwei Zeichen ein.' });
    return;
  }
  client.name = name;
  client.questions = Array.isArray(data.questions)
    ? [...new Set(data.questions.map((q) => String(q).slice(0, 180)).filter(Boolean))].slice(0, 300)
    : [];
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
  broadcast(room, { type: 'round_start', round: room.round, question: room.currentQuestion, players: publicPlayers(room) });
  room.timer = setTimeout(() => finishRound(room), 90_000);
}

function vote(client, targetId) {
  const room = rooms.get(client.roomId);
  if (!room || room.phase !== 'voting' || room.votes.has(client.id)) return;
  if (!room.players.some((player) => player.id === targetId) || targetId === client.id) return;
  room.votes.set(client.id, targetId);
  broadcast(room, { type: 'vote_count', count: room.votes.size, total: room.players.length });
  if (room.votes.size >= room.players.length) finishRound(room);
}

function finishRound(room) {
  if (room.phase !== 'voting') return;
  clearTimeout(room.timer);
  room.phase = 'result';
  const counts = Object.fromEntries(room.players.map((player) => [player.id, 0]));
  for (const targetId of room.votes.values()) counts[targetId] += 1;
  const highest = Math.max(...Object.values(counts));
  const leaders = room.players.filter((player) => counts[player.id] === highest);
  const winner = leaders[Math.floor(Math.random() * leaders.length)];
  winner.score += 1;
  broadcast(room, {
    type: 'round_result',
    round: room.round,
    winnerId: winner.id,
    tied: leaders.length > 1,
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
    if (room) {
      const player = room.players.find((entry) => entry.id === client.id);
      room.players = room.players.filter((entry) => entry.id !== client.id);
      room.votes.delete(client.id);
      if (room.players.length < 3) closeRoom(room);
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
