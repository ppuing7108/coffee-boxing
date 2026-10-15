import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io as connect } from 'socket.io-client';
import { createGameServer } from '../server/index.js';

const clients = [];
let server;

after(async () => {
  for (const c of clients) c.disconnect();
  await server?.close();
});

const call = (c, event, payload) => new Promise((resolve) => c.emit(event, payload, resolve));

test('게임이 끝나면 최종 패배자가 한 줄 기록되고, 통산 횟수와 API에 반영된다', async () => {
  const file = join(await mkdtemp(join(tmpdir(), 'hof-')), 'coffee-log.tsv');
  // 타이머를 즉시 실행: 베팅 마감 → 경기 → 종료가 바로 진행된다
  server = createGameServer({ hallOfFameFile: file, timers: { set: (fn) => setImmediate(fn), clear: clearImmediate } });
  const port = await server.listen(0);
  const url = `http://localhost:${port}`;
  const [a, b] = [0, 1].map(() => {
    const c = connect(url, { forceNew: true, transports: ['websocket'] });
    clients.push(c);
    return c;
  });
  const host = await call(a, 'room:create', { nickname: '철수' });
  await call(b, 'room:join', { code: host.code, nickname: '영희' });

  const finished = new Promise((resolve) => a.on('room:state', (s) => {
    if (s.phase === 'FINISHED' && s.loserTotal) resolve(s);
  }));
  await call(a, 'game:start');
  const state = await finished;
  const loserName = state.players.find((p) => p.id === state.loser).nickname;
  assert.equal(state.loserTotal, 1);

  const lines = (await readFile(file, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 1);
  assert.match(lines[0], new RegExp(`^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}\\t${loserName}$`));

  const summary = await (await fetch(`${url}/api/hall-of-fame`)).json();
  assert.deepEqual(summary.all, [{ rank: 1, nickname: loserName, count: 1 }]);
  assert.deepEqual(summary.month, summary.all);
  assert.equal(summary.recent[0].nickname, loserName);
});
