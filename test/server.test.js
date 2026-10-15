import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createGameServer } from '../server/index.js';

let server;
let url;
const clients = [];

before(async () => {
  server = createGameServer();
  const port = await server.listen(0);
  url = `http://localhost:${port}`;
});

after(async () => {
  for (const c of clients) c.disconnect();
  await server.close();
});

function client() {
  const c = connect(url, { forceNew: true, transports: ['websocket'] });
  clients.push(c);
  return c;
}

const call = (c, event, payload) => new Promise((resolve) => c.emit(event, payload, resolve));
const once = (c, event) => new Promise((resolve) => c.once(event, resolve));

async function setupRoom(names) {
  const sockets = names.map(() => client());
  const host = await call(sockets[0], 'room:create', { nickname: names[0] });
  const joins = [host];
  for (let i = 1; i < names.length; i++) {
    joins.push(await call(sockets[i], 'room:join', { code: host.code, nickname: names[i] }));
  }
  return { sockets, code: host.code, joins };
}

test('방 만들기와 입장, 시작 후 신규 입장 거절', async () => {
  const { sockets, code, joins } = await setupRoom(['a', 'b']);
  assert.ok(joins.every((j) => j.ok && j.token));
  assert.equal((await call(sockets[1], 'game:start')).error, 'NOT_HOST');
  assert.ok((await call(sockets[0], 'game:start')).ok);
  const late = await call(client(), 'room:join', { code, nickname: 'c' });
  assert.equal(late.error, 'GAME_IN_PROGRESS');
});

test('3명이 동시에 홍을 누르면 2명만 수락', async () => {
  const { sockets } = await setupRoom(['a', 'b', 'c']);
  await call(sockets[0], 'game:start');
  const results = await Promise.all(sockets.map((s) => call(s, 'bet:place', { side: 'red' })));
  assert.equal(results.filter((r) => r.ok).length, 2);
  assert.equal(results.filter((r) => r.error === 'SIDE_FULL').length, 1);
});

test('전원 베팅하면 fight:script 방송, 경기 중 재접속하면 대본을 다시 받는다', async () => {
  const { sockets, code, joins } = await setupRoom(['a', 'b']);
  await call(sockets[0], 'game:start');
  const scriptP = once(sockets[0], 'fight:script');
  await call(sockets[0], 'bet:place', { side: 'red' });
  await call(sockets[1], 'bet:place', { side: 'blue' });
  const fight = await scriptP;
  assert.ok(fight.startAt > Date.now() && fight.script.length > 0);

  sockets[1].disconnect();
  const again = client();
  const replayP = once(again, 'fight:script');
  const r = await call(again, 'room:rejoin', { code, token: joins[1].token });
  assert.ok(r.ok);
  assert.deepEqual((await replayP).script, fight.script);
});

test('방장이 끊기면 다음 사람이 방장이 되어 바로 진행할 수 있다', async () => {
  const { sockets, joins } = await setupRoom(['a', 'b', 'c']);
  await call(sockets[0], 'game:start');
  const stateP = new Promise((resolve) => sockets[1].on('room:state', (s) => s.hostId === joins[1].playerId && resolve(s)));
  sockets[0].disconnect();
  await stateP;
  const scriptP = once(sockets[1], 'fight:script');
  assert.ok((await call(sockets[1], 'bet:closeNow')).ok);
  await scriptP;
});

test('잘못된 payload나 ack가 와도 서버가 죽지 않는다', async () => {
  const c = client();
  const res = await call(c, 'room:create', null);
  assert.equal(res.error, 'INVALID_NICKNAME');
  c.emit('bet:place', { side: 'red' }, 'not-a-function');
  c.emit('room:join', 'garbage', 42);
  const sync = await call(c, 'time:sync', null);
  assert.ok(sync.serverNow > 0);
});

test('같은 소켓이 방을 두 번 만들면 이전 방에서는 끊김 처리된다', async () => {
  const c = client();
  const first = await call(c, 'room:create', { nickname: '중복' });
  const second = await call(c, 'room:create', { nickname: '중복' });
  assert.notEqual(first.code, second.code);
  const old = server.manager.get(first.code);
  assert.equal(old.getPlayer(first.playerId).connected, false);
});
