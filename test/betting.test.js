import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyBets, sideCap, placeBet, allBet, autoAssign } from '../server/betting.js';
import { createRng } from '../server/rng.js';

const ids = ['a', 'b', 'c'];

test('상한은 올림(생존자 수 / 2)', () => {
  assert.equal(sideCap(2), 1);
  assert.equal(sideCap(3), 2);
  assert.equal(sideCap(4), 2);
  assert.equal(sideCap(5), 3);
});

test('5명이면 한쪽에 3명까지, 4번째는 SIDE_FULL', () => {
  const five = ['a', 'b', 'c', 'd', 'e'];
  let bets = emptyBets();
  for (const id of ['a', 'b', 'c']) bets = placeBet(bets, five, id, 'red').bets;
  assert.equal(placeBet(bets, five, 'd', 'red').error, 'SIDE_FULL');
});

test('3명이 모두 홍을 누르면 앞의 2명만 수락', () => {
  let bets = emptyBets();
  const r1 = placeBet(bets, ids, 'a', 'red'); bets = r1.bets;
  const r2 = placeBet(bets, ids, 'b', 'red'); bets = r2.bets;
  const r3 = placeBet(bets, ids, 'c', 'red');
  assert.ok(r1.ok && r2.ok);
  assert.deepEqual(r3, { ok: false, error: 'SIDE_FULL' });
  const r4 = placeBet(bets, ids, 'c', 'blue');
  assert.ok(r4.ok);
  assert.deepEqual(r4.bets, { red: ['a', 'b'], blue: ['c'] });
});

test('중복 베팅, 생존자 아님, 잘못된 코너는 거절', () => {
  const { bets } = placeBet(emptyBets(), ids, 'a', 'red');
  assert.equal(placeBet(bets, ids, 'a', 'blue').error, 'ALREADY_BET');
  assert.equal(placeBet(bets, ids, 'z', 'blue').error, 'NOT_ACTIVE');
  assert.equal(placeBet(bets, ids, 'b', 'green').error, 'INVALID_SIDE');
});

test('placeBet은 원래 bets를 바꾸지 않는다', () => {
  const bets = emptyBets();
  placeBet(bets, ids, 'a', 'red');
  assert.deepEqual(bets, emptyBets());
});

test('allBet', () => {
  assert.equal(allBet({ red: ['a', 'b'], blue: [] }, ids), false);
  assert.equal(allBet({ red: ['a', 'b'], blue: ['c'] }, ids), true);
});

test('자동 배정 후 전원 배정, 양쪽 최소 1명, 기존 베팅 유지', () => {
  for (let seed = 1; seed <= 500; seed++) {
    const rng = createRng(seed);
    const n = 2 + (seed % 6);
    const players = Array.from({ length: n }, (_, i) => `p${i}`);
    const pre = seed % 2 ? { red: ['p0'], blue: [] } : emptyBets();
    const out = autoAssign(pre, players, rng);
    assert.ok(allBet(out, players));
    assert.ok(out.red.length >= Math.floor(n / 2) && out.blue.length >= Math.floor(n / 2));
    assert.equal(out.red.length + out.blue.length, n);
    if (seed % 2) assert.ok(out.red.includes('p0'));
  }
});

test('2명 남았는데 아무도 안 고르면 1:1로 갈린다', () => {
  const out = autoAssign(emptyBets(), ['x', 'y'], createRng(3));
  assert.equal(out.red.length, 1);
  assert.equal(out.blue.length, 1);
});
