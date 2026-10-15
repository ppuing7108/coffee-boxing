import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, BET_TIME_MS, LOBBY_DROP_MS, ABANDON_MS } from '../server/room.js';
import { createRng } from '../server/rng.js';

function roomWith(names, now = 0, seed = 1) {
  const room = new Room('ABCD', createRng(seed));
  const players = names.map((n, i) => room.addPlayer(n, now + i).player);
  return { room, players };
}

test('첫 입장자가 방장, 닉네임 검증', () => {
  const { room, players } = roomWith(['철수', '영희']);
  assert.equal(room.hostId, players[0].id);
  assert.equal(room.addPlayer('  ', 0).error, 'INVALID_NICKNAME');
  assert.equal(room.addPlayer('a'.repeat(13), 0).error, 'INVALID_NICKNAME');
  assert.equal(room.addPlayer(' 철수 ', 0).error, 'NICKNAME_TAKEN');
  assert.equal(room.addPlayer('Kim', 0).ok, true);
  assert.equal(room.addPlayer('kim', 0).error, 'NICKNAME_TAKEN');
});

test('시작: 방장만, 2명 이상, 시작 후 입장 불가', () => {
  const solo = roomWith(['혼자']);
  assert.equal(solo.room.start(solo.players[0].id, 0).error, 'NOT_ENOUGH_PLAYERS');

  const { room, players } = roomWith(['a', 'b', 'c']);
  assert.equal(room.start(players[1].id, 0).error, 'NOT_HOST');
  assert.ok(room.start(players[0].id, 1000).ok);
  assert.equal(room.phase, 'BETTING');
  assert.equal(room.stage, 1);
  assert.equal(room.deadline, 1000 + BET_TIME_MS);
  assert.ok(room.toState().fighters.red.name && room.toState().fighters.blue.skin);
  assert.equal(room.addPlayer('d', 0).error, 'GAME_IN_PROGRESS');
});

test('시작 시 로비에서 끊긴 사람은 빠진다', () => {
  const { room, players } = roomWith(['a', 'b', 'c']);
  room.disconnect(players[2].id, 0);
  room.start(players[0].id, 0);
  assert.deepEqual(room.activeIds(), [players[0].id, players[1].id]);
});

test('전원 베팅하면 allIn, 3명 모두 홍이면 3번째는 SIDE_FULL', () => {
  const { room, players: [a, b, c] } = roomWith(['a', 'b', 'c']);
  room.start(a.id, 0);
  assert.deepEqual(room.placeBet(a.id, 'red'), { ok: true, allIn: false });
  assert.deepEqual(room.placeBet(b.id, 'red'), { ok: true, allIn: false });
  assert.equal(room.placeBet(c.id, 'red').error, 'SIDE_FULL');
  assert.deepEqual(room.placeBet(c.id, 'blue'), { ok: true, allIn: true });
});

test('closeBetting: 미선택자 배정, 대본 생성, FIGHTING', () => {
  const { room, players: [a] } = roomWith(['a', 'b', 'c']);
  room.start(a.id, 0);
  room.placeBet(a.id, 'red');
  room.closeBetting(5000);
  assert.equal(room.phase, 'FIGHTING');
  assert.equal(room.bets.red.length + room.bets.blue.length, 3);
  assert.equal(room.fight.startAt, 6500);
  assert.ok(room.fight.endsAt > room.fight.startAt + 7000);
  assert.ok(room.fight.script.length > 0);
  assert.deepEqual(room.fightPayload().fighters, room.toState().fighters);
});

test('closeNow는 방장만', () => {
  const { room, players: [a, b] } = roomWith(['a', 'b']);
  room.start(a.id, 0);
  assert.equal(room.closeNow(b.id, 0).error, 'NOT_HOST');
  assert.ok(room.closeNow(a.id, 0).ok);
  assert.equal(room.closeNow(a.id, 0).error, 'NOT_BETTING_PHASE');
});

function forceFight(room, bets, ko) {
  room.bets = bets;
  room.phase = 'FIGHTING';
  room.fight = { ko };
}

test('진 쪽 2명 이상 → 다음 스테이지, 이긴 쪽은 관전자', () => {
  const { room, players: [a, b, c, d] } = roomWith(['a', 'b', 'c', 'd']);
  room.start(a.id, 0);
  forceFight(room, { red: [a.id, b.id, c.id], blue: [d.id] }, 'red');
  room.finishFight(100);
  assert.equal(room.phase, 'BETTING');
  assert.equal(room.stage, 2);
  assert.deepEqual(room.activeIds(), [a.id, b.id, c.id]);
  assert.equal(room.getPlayer(d.id).status, 'spectator');
  assert.equal(room.placeBet(d.id, 'red').error, 'NOT_ACTIVE');
  assert.equal(room.history[0].winner, 'blue');
});

test('진 쪽 1명 → FINISHED, 최종 패배자', () => {
  const { room, players: [a, b, c] } = roomWith(['a', 'b', 'c']);
  room.start(a.id, 0);
  forceFight(room, { red: [a.id, b.id], blue: [c.id] }, 'blue');
  room.finishFight(100);
  assert.equal(room.phase, 'FINISHED');
  assert.equal(room.loser, c.id);
});

test('전체 게임은 항상 한 명의 패배자로 끝난다', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const names = Array.from({ length: 2 + (seed % 7) }, (_, i) => `p${i}`);
    const { room, players } = roomWith(names, 0, seed);
    room.start(players[0].id, 0);
    let guard = 0;
    while (room.phase !== 'FINISHED' && guard++ < 20) {
      room.closeBetting(0); // 아무도 안 고름 → 전원 자동 배정
      room.finishFight(0);
    }
    assert.equal(room.phase, 'FINISHED');
    assert.ok(room.getPlayer(room.loser));
  }
});

test('방장이 끊기면 접속 중인 다음 입장자에게, 재접속해도 안 돌아감', () => {
  const { room, players: [a, b, c] } = roomWith(['a', 'b', 'c']);
  room.start(a.id, 0);
  room.disconnect(b.id, 0);
  room.disconnect(a.id, 0);
  assert.equal(room.hostId, c.id);
  room.reconnect(a.token);
  assert.equal(room.hostId, c.id);
  assert.ok(room.closeNow(c.id, 0).ok);
});

test('일반 참가자가 끊겨도 생존자로 남는다', () => {
  const { room, players: [a, b] } = roomWith(['a', 'b']);
  room.start(a.id, 0);
  room.disconnect(b.id, 0);
  assert.deepEqual(room.activeIds(), [a.id, b.id]);
});

test('재접속은 토큰으로', () => {
  const { room, players: [a] } = roomWith(['a']);
  room.disconnect(a.id, 0);
  assert.equal(room.reconnect('nope').error, 'INVALID_TOKEN');
  const r = room.reconnect(a.token);
  assert.ok(r.ok && r.player.connected);
});

test('로비에서 60초 넘게 끊긴 사람 제거, 방장이면 이전', () => {
  const { room, players: [a, b] } = roomWith(['a', 'b']);
  room.disconnect(a.id, 0);
  room.dropStaleLobbyPlayers(LOBBY_DROP_MS - 1);
  assert.equal(room.players.length, 2);
  room.dropStaleLobbyPlayers(LOBBY_DROP_MS);
  assert.deepEqual(room.players.map((p) => p.id), [b.id]);
  assert.equal(room.hostId, b.id);
});

test('전원 10분 넘게 끊기면 버려진 방', () => {
  const { room, players: [a, b] } = roomWith(['a', 'b']);
  room.disconnect(a.id, 0);
  room.disconnect(b.id, 1000);
  assert.equal(room.isAbandoned(ABANDON_MS), false);
  assert.equal(room.isAbandoned(ABANDON_MS + 1000), true);
});

test('다시하기: 방장만, FINISHED에서만, 전원 active로 LOBBY', () => {
  const { room, players: [a, b] } = roomWith(['a', 'b']);
  assert.equal(room.restart(a.id).error, 'NOT_FINISHED');
  room.start(a.id, 0);
  forceFight(room, { red: [a.id], blue: [b.id] }, 'red');
  room.finishFight(0);
  assert.equal(room.restart(b.id).error, 'NOT_HOST');
  assert.ok(room.restart(a.id).ok);
  assert.equal(room.phase, 'LOBBY');
  assert.deepEqual(room.activeIds(), [a.id, b.id]);
  assert.equal(room.addPlayer('c', 0).ok, true);
});

test('toState에 token이 없다', () => {
  const { room } = roomWith(['a']);
  assert.ok(!JSON.stringify(room.toState()).includes(room.players[0].token));
});
