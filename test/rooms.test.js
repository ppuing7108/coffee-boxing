import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../server/rooms.js';
import { createRng } from '../server/rng.js';

test('참가 가능한 방 목록: 로비 상태이고 접속자가 있는 방만, 최근 방부터', () => {
  const manager = new RoomManager(createRng(1));
  const older = manager.create();
  older.addPlayer('철수', 0);
  older.addPlayer('영희', 0);
  const newer = manager.create();
  newer.addPlayer('민수', 0);
  const started = manager.create();
  const [a] = [started.addPlayer('a', 0).player, started.addPlayer('b', 0).player];
  started.start(a.id, 0);
  const empty = manager.create();
  const ghost = empty.addPlayer('유령', 0).player;
  empty.disconnect(ghost.id, 0);

  assert.deepEqual(manager.joinableRooms(), [
    { code: newer.code, host: '민수', players: 1 },
    { code: older.code, host: '철수', players: 2 },
  ]);
});
