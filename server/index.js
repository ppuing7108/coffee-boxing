import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { RoomManager } from './rooms.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));
const SWEEP_MS = 10000;

export function createGameServer({ now = Date.now, rng = Math.random } = {}) {
  const app = express();
  app.use(express.static(PUBLIC_DIR));
  const httpServer = createServer(app);
  const io = new Server(httpServer);
  const manager = new RoomManager(rng);
  const timers = new Map(); // code → 현재 phase의 타이머

  const broadcast = (room) => io.to(room.code).emit('room:state', room.toState());

  function clearTimer(code) {
    clearTimeout(timers.get(code));
    timers.delete(code);
  }

  // phase에 맞는 타이머를 건다: BETTING → 마감, FIGHTING → 경기 종료
  function schedule(room) {
    clearTimer(room.code);
    if (room.phase === 'BETTING') {
      timers.set(room.code, setTimeout(() => closeBetting(room), Math.max(0, room.deadline - now())));
    } else if (room.phase === 'FIGHTING') {
      timers.set(room.code, setTimeout(() => {
        room.finishFight(now());
        schedule(room);
        broadcast(room);
      }, Math.max(0, room.fight.endsAt - now())));
    }
  }

  // 자동 배정된 베팅이 화면에 먼저 반영되도록 room:state → fight:script 순서로 보낸다
  function closeBetting(room) {
    room.closeBetting(now());
    schedule(room);
    broadcast(room);
    io.to(room.code).emit('fight:script', room.fightPayload());
  }

  function enter(socket, room, player) {
    socket.data = { code: room.code, playerId: player.id };
    socket.join(room.code);
    broadcast(room);
    if (room.phase === 'FIGHTING') socket.emit('fight:script', room.fightPayload());
  }

  // 방에 들어간 소켓만 처리하는 핸들러를 만든다
  const inRoom = (socket, handler) => (payload, ack = () => {}) => {
    const room = manager.get(socket.data?.code);
    if (!room) return ack({ ok: false, error: 'ROOM_NOT_FOUND' });
    handler(room, socket.data.playerId, payload ?? {}, ack);
  };

  io.on('connection', (socket) => {
    socket.on('time:sync', (_payload, ack = () => {}) => ack({ serverNow: now() }));

    socket.on('room:create', ({ nickname } = {}, ack = () => {}) => {
      const room = manager.create();
      const result = room.addPlayer(nickname, now());
      if (!result.ok) {
        manager.delete(room.code);
        return ack(result);
      }
      ack({ ok: true, code: room.code, token: result.player.token, playerId: result.player.id });
      enter(socket, room, result.player);
    });

    socket.on('room:join', ({ code, nickname } = {}, ack = () => {}) => {
      const room = manager.get(code);
      if (!room) return ack({ ok: false, error: 'ROOM_NOT_FOUND' });
      const result = room.addPlayer(nickname, now());
      if (!result.ok) return ack(result);
      ack({ ok: true, code: room.code, token: result.player.token, playerId: result.player.id });
      enter(socket, room, result.player);
    });

    socket.on('room:rejoin', ({ code, token } = {}, ack = () => {}) => {
      const room = manager.get(code);
      if (!room) return ack({ ok: false, error: 'ROOM_NOT_FOUND' });
      const result = room.reconnect(token);
      if (!result.ok) return ack(result);
      ack({ ok: true, code: room.code, token, playerId: result.player.id });
      enter(socket, room, result.player);
    });

    socket.on('game:start', inRoom(socket, (room, playerId, _p, ack) => {
      const result = room.start(playerId, now());
      ack(result);
      if (result.ok) { schedule(room); broadcast(room); }
    }));

    socket.on('bet:place', inRoom(socket, (room, playerId, { side }, ack) => {
      const result = room.placeBet(playerId, side);
      ack(result.ok ? { ok: true } : result);
      if (!result.ok) return;
      if (result.allIn) closeBetting(room);
      else broadcast(room);
    }));

    socket.on('bet:closeNow', inRoom(socket, (room, playerId, _p, ack) => {
      if (playerId !== room.hostId) return ack({ ok: false, error: 'NOT_HOST' });
      if (room.phase !== 'BETTING') return ack({ ok: false, error: 'NOT_BETTING_PHASE' });
      ack({ ok: true });
      closeBetting(room);
    }));

    socket.on('game:restart', inRoom(socket, (room, playerId, _p, ack) => {
      const result = room.restart(playerId);
      ack(result);
      if (result.ok) { schedule(room); broadcast(room); }
    }));

    socket.on('disconnect', () => {
      const room = manager.get(socket.data?.code);
      if (!room) return;
      // 같은 사람이 다른 탭으로 이미 다시 붙어 있으면 끊김 처리하지 않는다
      const stillHere = [...(io.sockets.adapter.rooms.get(room.code) ?? [])]
        .some((id) => io.sockets.sockets.get(id)?.data?.playerId === socket.data.playerId);
      if (stillHere) return;
      room.disconnect(socket.data.playerId, now());
      broadcast(room);
    });
  });

  const sweeper = setInterval(() => {
    for (const room of manager.rooms.values()) {
      if (room.isAbandoned(now())) {
        clearTimer(room.code);
        manager.delete(room.code);
        continue;
      }
      const before = room.players.length;
      room.dropStaleLobbyPlayers(now());
      if (room.players.length !== before) broadcast(room);
    }
  }, SWEEP_MS);

  return {
    httpServer,
    io,
    manager,
    listen(port) {
      return new Promise((resolve) => httpServer.listen(port, () => resolve(httpServer.address().port)));
    },
    close() {
      clearInterval(sweeper);
      for (const code of timers.keys()) clearTimer(code);
      return new Promise((resolve) => io.close(() => resolve()));
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  createGameServer().listen(port).then((p) => console.log(`🥊 http://localhost:${p}`));
}
