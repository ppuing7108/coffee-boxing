import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  simulate, generateFight, labelExchange, pickFighters,
  MIN_DURATION, MAX_DURATION, MAX_HP, SKINS,
} from '../server/fight.js';
import { createRng } from '../server/rng.js';

test('같은 시드면 같은 경기', () => {
  assert.deepEqual(simulate(123), simulate(123));
  assert.deepEqual(generateFight(456), generateFight(456));
});

test('시드 1만 개 전부 7~30초', () => {
  for (let seed = 1; seed <= 10000; seed++) {
    const { duration } = generateFight(seed);
    assert.ok(duration >= MIN_DURATION && duration <= MAX_DURATION, `seed ${seed}: ${duration}s`);
  }
});

test('홍코너 승률 50% ±2% (공정성)', () => {
  let redWins = 0;
  const N = 10000;
  for (let seed = 1; seed <= N; seed++) if (generateFight(seed).ko === 'blue') redWins++;
  const rate = redWins / N;
  assert.ok(rate > 0.48 && rate < 0.52, `red win rate ${rate}`);
});

test('체력은 0~100, ko는 마지막 exchange에만 있고 정확히 한쪽만 0', () => {
  for (let seed = 1; seed <= 2000; seed++) {
    const { script, ko } = generateFight(seed);
    script.forEach((ex, i) => {
      for (const c of ['red', 'blue']) assert.ok(ex.hp[c] >= 0 && ex.hp[c] <= MAX_HP);
      if (i < script.length - 1) assert.equal(ex.ko, null);
    });
    const last = script.at(-1);
    assert.equal(last.ko, ko);
    const other = ko === 'red' ? 'blue' : 'red';
    assert.equal(last.hp[ko], 0);
    assert.ok(last.hp[other] > 0);
  }
});

test('t는 이전 exchange의 t + dur', () => {
  const { script, duration } = generateFight(99);
  for (let i = 1; i < script.length; i++) {
    assert.ok(Math.abs(script[i].t - (script[i - 1].t + script[i - 1].dur)) < 0.05);
  }
  const last = script.at(-1);
  assert.ok(Math.abs(duration - (last.t + last.dur)) < 0.05);
});

test('상성 라벨', () => {
  assert.equal(labelExchange('JAB', 'JAB', 6, 6), 'TRADE');
  assert.equal(labelExchange('HOOK', 'DODGE', 6, 0), 'BLUE_COUNTER');
  assert.equal(labelExchange('BLOCK', 'HOOK', 3, 0), 'RED_BLOCK');
  assert.equal(labelExchange('BLOCK', 'UPPERCUT', 20, 0), 'BLUE_HIT');
  assert.equal(labelExchange('JAB', 'UPPERCUT', 20, 0), 'BLUE_HIT');
  assert.equal(labelExchange('BLOCK', 'DODGE', 0, 0), 'STANDOFF');
});

test('선수 외형: 스킨은 목록 안, 이름은 서로 다름', () => {
  const rng = createRng(5);
  for (let i = 0; i < 200; i++) {
    const f = pickFighters(rng);
    assert.ok(SKINS.includes(f.red.skin) && SKINS.includes(f.blue.skin));
    assert.notEqual(f.red.name, f.blue.name);
  }
});
