import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exchangeIndexAt, hpAt, hitAction, moveAction, describe, impactTime } from '../public/timeline.js';

const script = [
  { t: 0, dur: 1.0, red: 'JAB', blue: 'HOOK', result: 'RED_HIT', dmg: { red: 0, blue: 6 }, hp: { red: 100, blue: 94 }, crit: false, ko: null },
  { t: 1.0, dur: 1.2, red: 'BLOCK', blue: 'UPPERCUT', result: 'BLUE_HIT', dmg: { red: 22, blue: 0 }, hp: { red: 78, blue: 94 }, crit: false, ko: null },
];

test('exchangeIndexAt', () => {
  assert.equal(exchangeIndexAt(script, -0.5), -1);
  assert.equal(exchangeIndexAt(script, 0), 0);
  assert.equal(exchangeIndexAt(script, 1.5), 1);
});

test('hpAt은 타격 시점 이후에만 반영', () => {
  assert.deepEqual(hpAt(script, 0.2), { red: 100, blue: 100 });
  assert.deepEqual(hpAt(script, impactTime(script[0])), { red: 100, blue: 94 });
  assert.deepEqual(hpAt(script, 99), { red: 78, blue: 94 });
});

test('동작 매핑', () => {
  assert.equal(moveAction('UPPERCUT'), 'uppercut');
  assert.equal(hitAction(0, false), null);
  assert.equal(hitAction(6, false), 'hit');
  assert.equal(hitAction(6, true), 'hit_heavy');
  assert.equal(hitAction(20, false), 'hit_heavy');
});

test('describe', () => {
  assert.equal(describe(script[1]), '청코너 어퍼컷 적중!');
});
