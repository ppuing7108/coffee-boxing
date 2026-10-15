import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { RoomManager } from './rooms.js';
import { HallOfFame } from './hall-of-fame.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));
const DEFAULT_HALL_FILE = process.env.HALL_OF_FAME_FILE
  ?? fileURLToPath(new URL('../data/coffee-log.tsv', import.meta.url));
const SWEEP_MS = 10000;

// timers: 테스트에서 즉시 실행으로 바꿔 끼울 수 있게 주입받는다
export function createGameServer({
  now = Date.now,
  rng = Math.random,
  hallOfFameFile = DEFAULT_HALL_FILE,
  timers: { set: setTimer, clear: clearTimer_ } = { set: setTimeout, clear: clearTimeout },
} = {}) {
  const app = express();
  const hall = new HallOfFame(hallOfFameFile);
  app.use(express.static(PUBLIC_DIR));
  app.get('/api/hall-of-fame', async (_req, res) => {
    try {
      res.json(await hall.summary());
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'HALL_OF_FAME_UNAVAILABLE' });
    }
  });
  const httpServer = createServer(app);
  const io = new Server(httpServer);
  const manager = new RoomManager(rng);
  const timers = new Map(); // code → 현재 phase의 타이머

  const LOBBY_WATCHERS = 'lobby-watchers'; // 입장 화면에서 방 목록을 보는 소켓들
  const broadcastLobby = () => io.to(LOBBY_WATCHERS).emit('lobby:list', manager.joinableRooms());

  // 방 상태가 바뀌면 그 방과 로비 목록을 함께 갱신한다
  const broadcast = (room) => {
    io.to(room.code).emit('room:state', room.toState());
    broadcastLobby();
  };

  function clearTimer(code) {
    clearTimer_(timers.get(code));
    timers.delete(code);
  }

  // 최종 패배자를 명예의 전당에 한 줄 기록하고, 통산 횟수를 방 상태에 실어 보낸다
  async function recordLoser(room) {
    const loser = room.getPlayer(room.loser);
    try {
      room.loserTotal = await hall.record(loser.nickname, new Date(now()));
    } catch (err) {
      console.error('명예의 전당 기록 실패', err);
      return;
    }
    broadcast(room);
    io.to(LOBBY_WATCHERS).emit('hall:updated');
  }

  // phase에 맞는 타이머를 건다: BETTING → 마감, FIGHTING → 경기 종료
  function schedule(room) {
    clearTimer(room.code);
    if (room.phase === 'BETTING') {
      timers.set(room.code, setTimer(() => closeBetting(room), Math.max(0, room.deadline - now())));
    } else if (room.phase === 'FIGHTING') {
      timers.set(room.code, setTimer(() => {
        room.finishFight(now());
        schedule(room);
        broadcast(room);
        if (room.phase === 'FINISHED') recordLoser(room);
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

  // 소켓이 붙어 있던 방에서 빠진다. 같은 사람이 다른 소켓으로 남아 있으면 끊김 처리하지 않는다.
  function release(socket) {
    const room = manager.get(socket.data?.code);
    if (!room) return;
    const { playerId } = socket.data;
    socket.leave(room.code);
    socket.data = {};
    const stillHere = [...(io.sockets.adapter.rooms.get(room.code) ?? [])]
      .some((id) => io.sockets.sockets.get(id)?.data?.playerId === playerId);
    if (stillHere) return;
    room.disconnect(playerId, now());
    broadcast(room);
  }

  function enter(socket, room, player) {
    if (socket.data?.playerId !== player.id) release(socket);
    socket.leave(LOBBY_WATCHERS);
    socket.data = { code: room.code, playerId: player.id };
    socket.join(room.code);
    broadcast(room);
    if (room.phase === 'FIGHTING') socket.emit('fight:script', room.fightPayload());
  }

  // 클라이언트가 보낸 값은 믿지 않는다: payload는 객체로, ack는 함수로 맞추고 예외가 서버를 죽이지 않게 한다
  const safe = (handler) => (payload, ack) => {
    const p = payload && typeof payload === 'object' ? payload : {};
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      handler(p, reply);
    } catch (err) {
      console.error(err);
      reply({ ok: false, error: 'SERVER_ERROR' });
    }
  };

  // 방에 들어간 소켓만 처리하는 핸들러를 만든다
  const inRoom = (socket, handler) => safe((payload, ack) => {
    const room = manager.get(socket.data?.code);
    if (!room) return ack({ ok: false, error: 'ROOM_NOT_FOUND' });
    handler(room, socket.data.playerId, payload, ack);
  });

  io.on('connection', (socket) => {
    socket.on('time:sync', safe((_payload, ack) => ack({ serverNow: now() })));

    socket.on('lobby:watch', safe((_payload, ack) => {
      socket.join(LOBBY_WATCHERS);
      ack({ ok: true, rooms: manager.joinableRooms() });
    }));

    socket.on('room:create', safe(({ nickname }, ack) => {
      const room = manager.create();
      const result = room.addPlayer(nickname, now());
      if (!result.ok) {
        manager.delete(room.code);
        return ack(result);
      }
      ack({ ok: true, code: room.code, token: result.player.token, playerId: result.player.id });
      enter(socket, room, result.player);
    }));

    socket.on('room:join', safe(({ code, nickname }, ack) => {
      const room = manager.get(code);
      if (!room) return ack({ ok: false, error: 'ROOM_NOT_FOUND' });
      const result = room.addPlayer(nickname, now());
      if (!result.ok) return ack(result);
      ack({ ok: true, code: room.code, token: result.player.token, playerId: result.player.id });
      enter(socket, room, result.player);
    }));

    socket.on('room:rejoin', safe(({ code, token }, ack) => {
      const room = manager.get(code);
      if (!room) return ack({ ok: false, error: 'ROOM_NOT_FOUND' });
      const result = room.reconnect(token);
      if (!result.ok) return ack(result);
      ack({ ok: true, code: room.code, token, playerId: result.player.id });
      enter(socket, room, result.player);
    }));

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

    socket.on('disconnect', () => release(socket));
  });

  const sweeper = setInterval(() => {
    for (const room of manager.rooms.values()) {
      if (room.isAbandoned(now())) {
        clearTimer(room.code);
        manager.delete(room.code);
        broadcastLobby();
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
