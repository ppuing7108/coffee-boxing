import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, pick } from '../server/rng.js';

test('같은 시드는 같은 수열을 만든다', () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
});

test('값은 0 이상 1 미만이다', () => {
  const rng = createRng(1);
  for (let i = 0; i < 10000; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1);
  }
});

test('pick은 목록 안의 값을 고른다', () => {
  const rng = createRng(7);
  for (let i = 0; i < 100; i++) assert.ok(['a', 'b', 'c'].includes(pick(rng, ['a', 'b', 'c'])));
});
