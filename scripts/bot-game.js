// 봇 4명으로 게임 한 판을 끝까지 돌려 본다 (실제 타이머 사용, 약 1분). 사용: npm run bot-game
import { io as connect } from 'socket.io-client';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameServer } from '../server/index.js';
// 봇 결과가 실제 명예의 전당에 남지 않게 임시 파일 사용
const server = createGameServer({ hallOfFameFile: join(tmpdir(), `bot-game-${process.pid}.tsv`) });
const port = await server.listen(0);
const url = `http://localhost:${port}`;
const call = (c, e, p) => new Promise((r) => c.emit(e, p, r));
const bots = ['봇1', '봇2', '봇3', '봇4'].map(() => connect(url, { transports: ['websocket'] }));
const host = await call(bots[0], 'room:create', { nickname: '봇1' });
for (let i = 1; i < 4; i++) await call(bots[i], 'room:join', { code: host.code, nickname: `봇${i + 1}` });
const t0 = Date.now();
bots[0].on('fight:script', (f) => console.log(`+${((Date.now()-t0)/1000).toFixed(1)}s fight ${f.duration}s, ko=${f.ko}, exchanges=${f.script.length}`));
const done = new Promise((resolve) => bots[0].on('room:state', (s) => {
  if (s.phase === 'BETTING' && !s.bets.red.length && !s.bets.blue.length) {
    console.log(`+${((Date.now()-t0)/1000).toFixed(1)}s stage ${s.stage}, active ${s.players.filter(p=>p.status==='active').length}`);
    // 첫 번째 생존자만 직접 고르고 나머지는 시간 초과 대신 방장이 바로 진행
    setTimeout(() => call(bots[0], 'bet:closeNow'), 300);
  }
  if (s.phase === 'FINISHED') resolve(s);
}));
await call(bots[0], 'game:start');
const s = await done;
console.log('FINISHED loser=', s.players.find((p) => p.id === s.loser).nickname, 'history', s.history.length);
bots.forEach((b) => b.disconnect());
await server.close();
process.exit(0);
