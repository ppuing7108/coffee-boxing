# 커피 복싱 (복싱 베팅 게임) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 여러 명이 접속해 홍/청 코너에 베팅하고, AI 복서 경기에서 진 쪽에 건 사람들끼리 계속 겨뤄 최종 커피 당첨자 1명을 뽑는 로컬 웹 게임을 만든다.

**Architecture:** Node.js 서버(Express + Socket.IO)가 방 상태와 모든 판정(베팅 선착순, 경기 대본 생성)을 가진다. 규칙은 소켓을 모르는 순수 모듈(`betting.js`, `fight.js`, `room.js`)에 두고, `index.js`는 이벤트·타이머 연결만 한다. 클라이언트는 빌드 없는 Vanilla JS로 `room:state`를 그대로 렌더링하고, `fight:script` 대본을 서버 시각에 맞춰 스프라이트로 재생한다.

**Tech Stack:** Node.js 22 (ESM, `node:test`), express 4, socket.io 4, socket.io-client 4(테스트용), Vanilla JS + CSS

**Spec:** `docs/superpowers/specs/2026-10-15-boxing-betting-design.md`, 리소스 규격 `docs/superpowers/specs/2026-10-15-boxing-assets-spec.md`

> 이 계획의 서버 코드와 테스트는 작성 시점에 임시 폴더에서 실제로 실행해 검증했다 (테스트 41개 통과, 봇 4명 전체 게임 완주).

## Global Constraints

- 런타임: Node.js 22 이상, `"type": "module"`, 테스트는 `node --test` (외부 테스트 프레임워크 없음)
- 의존성: `express`, `socket.io` / dev: `socket.io-client` — 이외 추가 금지
- 프론트엔드: 빌드 도구 없음, `public/`을 Express가 그대로 서빙
- 포트: 기본 3000 (`PORT` 환경변수로 변경)
- 베팅 제한시간 15초, 한쪽 상한 = 생존자 수 − 1, 베팅 변경 불가
- 경기 길이 7~30초, 대본 방송 후 1.5초 뒤 시작, KO 연출 3초 + 결과 표시 3초
- 로비에서 끊긴 사람 60초 후 제거, 전원 끊긴 방 10분 후 삭제
- 닉네임 1~12자 (앞뒤 공백 제거, 대소문자 무시 중복 금지)
- 리소스 경로·크기는 리소스 규격 문서를 따르며, 리소스가 없으면 임시 박스로 대체되어야 한다
- 화면 문구는 한국어

## Review Focus

- **동시 클릭**: 3명이 같은 순간 홍코너를 누르면 정확히 2명만 수락되고 1명은 `SIDE_FULL` → Task 5 `3명이 동시에 홍을 누르면 2명만 수락`
- **경기 중 새로고침/재접속**: 같은 토큰으로 돌아오면 같은 대본을 다시 받고 중간부터 이어 본다 → Task 5 재접속 테스트, Task 6 `hpAt` 테스트
- **베팅 중 방장 이탈**: 다음 입장자가 방장이 되어 "바로 진행"을 쓸 수 있다 → Task 5 방장 이탈 테스트
- **닉네임 입력**: 공백만, 13자 이상, 대소문자만 다른 중복은 거절 → Task 4 `첫 입장자가 방장, 닉네임 검증`
- **로비에서 나간 사람·무응답 2명**: 시작 시 로비 이탈자는 빠지고, 2명 남아 둘 다 안 고르면 1:1로 갈린다 → Task 4 `시작 시 로비에서 끊긴 사람은 빠진다`, Task 3 `2명 남았는데…`

## 파일 구조

| 파일 | 책임 |
|---|---|
| `server/rng.js` | 시드 난수 (mulberry32), `pick` |
| `server/fight.js` | 상성표, `simulate(seed)`, `generateFight(seed)` (7~30초 보장), `pickFighters(rng)` |
| `server/betting.js` | 베팅 순수 함수: `placeBet`, `autoAssign`, `sideCap`, `allBet` |
| `server/room.js` | `Room` 클래스: 입장/재접속/방장/상태 흐름/스냅샷 |
| `server/rooms.js` | `RoomManager`: 방 코드 발급, 조회, 삭제 |
| `server/index.js` | Express + Socket.IO 연결, phase 타이머, 정리 주기 |
| `public/timeline.js` | 대본 재생 계산 (DOM 없음, node 테스트) |
| `public/sprites.js` | 스프라이트 시트 재생, 리소스 없을 때 임시 박스 |
| `public/fight-player.js` | 대본을 서버 시각에 맞춰 화면에 재생 |
| `public/app.js` | 소켓, 세션, 시계 보정, 공용 렌더 도우미 |
| `public/views/*.js` | 화면별 렌더링 (entry, lobby, betting, fight, finished) |
| `public/main.js` | 화면 전환 라우팅 |
| `scripts/bot-game.js` | 봇 4명 전체 게임 스모크 테스트 |

---

### Task 1: 프로젝트 셋업과 시드 난수

**Files:**
- Create: `package.json`, `.gitignore`, `server/rng.js`
- Test: `test/rng.test.js`

**Interfaces:**
- Produces: `createRng(seed: number) => () => number` (0 이상 1 미만), `pick(rng, list) => item`

- [ ] **Step 1: package.json과 .gitignore 작성 후 설치**

```json
{
  "name": "boxing-betting",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server/index.js",
    "test": "node --test",
    "bot-game": "node scripts/bot-game.js"
  },
  "dependencies": {
    "express": "^4.21.2",
    "socket.io": "^4.8.1"
  },
  "devDependencies": {
    "socket.io-client": "^4.8.1"
  }
}
```

```
node_modules/
.DS_Store
```

Run: `npm install`
Expected: `node_modules/` 생성, 에러 없음

- [ ] **Step 2: 실패하는 테스트 작성** — `test/rng.test.js`

```js
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
```

- [ ] **Step 3: 실패 확인**

Run: `node --test test/rng.test.js`
Expected: FAIL — `Cannot find module '.../server/rng.js'`

- [ ] **Step 4: 구현** — `server/rng.js`

```js
// 시드 기반 난수 (mulberry32). 같은 시드면 같은 수열을 돌려준다.
export function createRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}
```

- [ ] **Step 5: 통과 확인**

Run: `node --test test/rng.test.js`
Expected: PASS (3 tests)

- [ ] **Step 6: 커밋**

```bash
git add package.json package-lock.json .gitignore server/rng.js test/rng.test.js
git commit -m "chore: 프로젝트 셋업과 시드 난수"
```

---

### Task 2: 전투 시뮬레이션

**Files:**
- Create: `server/fight.js`
- Test: `test/fight.test.js`

**Interfaces:**
- Consumes: `createRng`, `pick` (Task 1)
- Produces:
  - `simulate(seed) => { seed, script: Exchange[], duration: number, ko: 'red'|'blue' }`
  - `generateFight(seed)` — 같은 형태, `duration`이 7~30초인 대본 (seed, seed+1, … 최대 50번)
  - `pickFighters(rng) => { red: {skin, name}, blue: {skin, name} }`
  - `Exchange = { t, dur, red, blue, result, dmg: {red, blue}, hp: {red, blue}, crit, ko }` — `dmg.red` = 홍코너가 **받은** 데미지, `ko`는 마지막 exchange에만 `'red'|'blue'`
  - `result` ∈ `TRADE | RED_HIT | BLUE_HIT | RED_BLOCK | BLUE_BLOCK | RED_COUNTER | BLUE_COUNTER | STANDOFF | WHIFF`
  - 상수: `MOVES`, `MAX_HP`, `MIN_DURATION`, `MAX_DURATION`, `SKINS`, `FIGHTER_NAMES`

설계 메모: 시작값(HP 100, 잽 6/훅 12/어퍼컷 20)으로 2만 번 시뮬레이션한 결과 평균 18초, 범위 밖 1%, 홍 승률 49.9% — 재생성으로 충분히 보장된다. 동시에 쓰러지면 체력이 더 깎인 쪽이 KO, 같으면 동전 던지기, 생존자 체력은 1로 둔다.

- [ ] **Step 1: 실패하는 테스트 작성** — `test/fight.test.js`

```js
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
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/fight.test.js`
Expected: FAIL — `Cannot find module '.../server/fight.js'`

- [ ] **Step 3: 구현** — `server/fight.js`

```js
import { createRng, pick } from './rng.js';

export const MOVES = ['JAB', 'HOOK', 'UPPERCUT', 'BLOCK', 'DODGE'];
export const MAX_HP = 100;
export const MIN_DURATION = 7;
export const MAX_DURATION = 30;
export const MAX_ATTEMPTS = 50;

// BASE_DAMAGE[내 기술][상대 기술] = 상대에게 주는 기본 데미지 (설계 4.2)
export const BASE_DAMAGE = {
  JAB:      { JAB: 6,  HOOK: 6,  UPPERCUT: 0,  BLOCK: 0,  DODGE: 6 },
  HOOK:     { JAB: 0,  HOOK: 12, UPPERCUT: 12, BLOCK: 3,  DODGE: 0 },
  UPPERCUT: { JAB: 20, HOOK: 0,  UPPERCUT: 20, BLOCK: 20, DODGE: 0 },
  BLOCK:    { JAB: 0,  HOOK: 0,  UPPERCUT: 0,  BLOCK: 0,  DODGE: 0 },
  DODGE:    { JAB: 0,  HOOK: 6,  UPPERCUT: 6,  BLOCK: 0,  DODGE: 0 },
};

export const EXCHANGE_DURATION = { STANDOFF: 0.8, NORMAL: 1.0, HEAVY: 1.2 };
const HEAVY_DAMAGE = 18;
const CRIT_CHANCE = 0.1;
const CRIT_MULTIPLIER = 1.5;

export const SKINS = ['fighter-a', 'fighter-b', 'fighter-c', 'fighter-d'];
export const FIGHTER_NAMES = [
  '강펀치 김씨', '모래주먹 박씨', '번개발 이씨', '돌머리 최씨',
  '철턱 정씨', '카페인 한씨', '야근왕 윤씨', '월급루팡 조씨',
];

function rollDamage(rng, base) {
  if (base === 0) return { dmg: 0, crit: false };
  const crit = rng() < CRIT_CHANCE;
  const dmg = Math.max(1, Math.round(base * (0.8 + 0.4 * rng()) * (crit ? CRIT_MULTIPLIER : 1)));
  return { dmg, crit };
}

const isAttack = (m) => m === 'JAB' || m === 'HOOK' || m === 'UPPERCUT';

// toRed/toBlue = 각 코너가 받은 데미지
export function labelExchange(red, blue, toRed, toBlue) {
  if (toRed > 0 && toBlue > 0) return 'TRADE';
  if (red === 'DODGE' && toBlue > 0) return 'RED_COUNTER';
  if (blue === 'DODGE' && toRed > 0) return 'BLUE_COUNTER';
  if (red === 'BLOCK' && (blue === 'JAB' || blue === 'HOOK')) return 'RED_BLOCK';
  if (blue === 'BLOCK' && (red === 'JAB' || red === 'HOOK')) return 'BLUE_BLOCK';
  if (toBlue > 0) return 'RED_HIT';
  if (toRed > 0) return 'BLUE_HIT';
  if (!isAttack(red) && !isAttack(blue)) return 'STANDOFF';
  return 'WHIFF';
}

// 시드 하나로 KO까지 경기 전체를 계산한다.
export function simulate(seed) {
  const rng = createRng(seed);
  const hp = { red: MAX_HP, blue: MAX_HP };
  const script = [];
  let t = 0;
  for (;;) {
    const red = pick(rng, MOVES);
    const blue = pick(rng, MOVES);
    const toBlue = rollDamage(rng, BASE_DAMAGE[red][blue]);
    const toRed = rollDamage(rng, BASE_DAMAGE[blue][red]);
    hp.red -= toRed.dmg;
    hp.blue -= toBlue.dmg;
    const crit = toRed.crit || toBlue.crit;
    const dur =
      toRed.dmg === 0 && toBlue.dmg === 0 ? EXCHANGE_DURATION.STANDOFF
      : crit || toRed.dmg >= HEAVY_DAMAGE || toBlue.dmg >= HEAVY_DAMAGE ? EXCHANGE_DURATION.HEAVY
      : EXCHANGE_DURATION.NORMAL;

    let ko = null;
    if (hp.red <= 0 || hp.blue <= 0) {
      if (hp.red <= 0 && hp.blue <= 0) {
        // 동시에 쓰러지면 체력이 더 깎인 쪽이 KO, 같으면 공정하게 동전 던지기
        ko = hp.red < hp.blue ? 'red' : hp.blue < hp.red ? 'blue' : rng() < 0.5 ? 'red' : 'blue';
        const survivor = ko === 'red' ? 'blue' : 'red';
        hp[survivor] = 1;
      } else {
        ko = hp.red <= 0 ? 'red' : 'blue';
      }
      hp[ko] = 0;
    }

    script.push({
      t: Math.round(t * 10) / 10,
      dur,
      red,
      blue,
      result: labelExchange(red, blue, toRed.dmg, toBlue.dmg),
      dmg: { red: toRed.dmg, blue: toBlue.dmg },
      hp: { red: hp.red, blue: hp.blue },
      crit,
      ko,
    });
    t += dur;
    if (ko) return { seed, script, duration: Math.round(t * 10) / 10, ko };
  }
}

// 7~30초 대본이 나올 때까지 seed, seed+1, ... 순으로 최대 50번 시도.
// 모두 벗어나면 범위에 가장 가까운 대본을 쓴다.
export function generateFight(seed) {
  let best = null;
  let bestGap = Infinity;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const fight = simulate((seed + i) >>> 0);
    if (fight.duration >= MIN_DURATION && fight.duration <= MAX_DURATION) return fight;
    const gap = fight.duration < MIN_DURATION ? MIN_DURATION - fight.duration : fight.duration - MAX_DURATION;
    if (gap < bestGap) { best = fight; bestGap = gap; }
  }
  return best;
}

export function pickFighters(rng) {
  const redName = pick(rng, FIGHTER_NAMES);
  let blueName = pick(rng, FIGHTER_NAMES);
  while (blueName === redName) blueName = pick(rng, FIGHTER_NAMES);
  return {
    red: { skin: pick(rng, SKINS), name: redName },
    blue: { skin: pick(rng, SKINS), name: blueName },
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/fight.test.js`
Expected: PASS (7 tests). 1만 시드 테스트 포함 1초 이내.

- [ ] **Step 5: 커밋**

```bash
git add server/fight.js test/fight.test.js
git commit -m "feat: 전투 시뮬레이션과 7~30초 대본 생성"
```

---

### Task 3: 베팅 규칙

**Files:**
- Create: `server/betting.js`
- Test: `test/betting.test.js`

**Interfaces:**
- Consumes: `createRng` (테스트에서만)
- Produces (모두 순수 함수, 입력을 바꾸지 않음):
  - `emptyBets() => { red: [], blue: [] }`
  - `sideCap(activeCount) => activeCount - 1`
  - `placeBet(bets, activeIds, playerId, side) => { ok: true, bets } | { ok: false, error: 'INVALID_SIDE'|'NOT_ACTIVE'|'ALREADY_BET'|'SIDE_FULL' }`
  - `allBet(bets, activeIds) => boolean`
  - `autoAssign(bets, activeIds, rng) => bets` — 미선택자를 자리 남은 쪽에 랜덤 배정

- [ ] **Step 1: 실패하는 테스트 작성** — `test/betting.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyBets, sideCap, placeBet, allBet, autoAssign } from '../server/betting.js';
import { createRng } from '../server/rng.js';

const ids = ['a', 'b', 'c'];

test('상한은 생존자 수 - 1', () => {
  assert.equal(sideCap(2), 1);
  assert.equal(sideCap(5), 4);
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
    assert.ok(out.red.length >= 1 && out.blue.length >= 1);
    assert.equal(out.red.length + out.blue.length, n);
    if (seed % 2) assert.ok(out.red.includes('p0'));
  }
});

test('2명 남았는데 아무도 안 고르면 1:1로 갈린다', () => {
  const out = autoAssign(emptyBets(), ['x', 'y'], createRng(3));
  assert.equal(out.red.length, 1);
  assert.equal(out.blue.length, 1);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/betting.test.js`
Expected: FAIL — `Cannot find module '.../server/betting.js'`

- [ ] **Step 3: 구현** — `server/betting.js`

```js
// 베팅 규칙 — 순수 함수. bets = { red: [playerId], blue: [playerId] } (배열 순서 = 수락 순서)
export const SIDES = ['red', 'blue'];

export function emptyBets() {
  return { red: [], blue: [] };
}

// 한쪽 최대 인원 = 생존자 수 - 1 (모두 한쪽 금지)
export function sideCap(activeCount) {
  return activeCount - 1;
}

export function hasBet(bets, playerId) {
  return bets.red.includes(playerId) || bets.blue.includes(playerId);
}

export function placeBet(bets, activeIds, playerId, side) {
  if (!SIDES.includes(side)) return { ok: false, error: 'INVALID_SIDE' };
  if (!activeIds.includes(playerId)) return { ok: false, error: 'NOT_ACTIVE' };
  if (hasBet(bets, playerId)) return { ok: false, error: 'ALREADY_BET' };
  if (bets[side].length >= sideCap(activeIds.length)) return { ok: false, error: 'SIDE_FULL' };
  return { ok: true, bets: { ...bets, [side]: [...bets[side], playerId] } };
}

export function allBet(bets, activeIds) {
  return activeIds.every((id) => hasBet(bets, id));
}

// 미선택자를 자리가 남은 쪽에 랜덤 배정 (activeIds 순서대로)
export function autoAssign(bets, activeIds, rng) {
  const cap = sideCap(activeIds.length);
  let next = { red: [...bets.red], blue: [...bets.blue] };
  for (const id of activeIds) {
    if (hasBet(next, id)) continue;
    const open = SIDES.filter((s) => next[s].length < cap);
    const side = open.length === 1 ? open[0] : open[Math.floor(rng() * open.length)];
    next = { ...next, [side]: [...next[side], id] };
  }
  return next;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/betting.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add server/betting.js test/betting.test.js
git commit -m "feat: 베팅 상한과 자동 배정 규칙"
```

---

### Task 4: 방 상태 (Room)

**Files:**
- Create: `server/room.js`
- Test: `test/room.test.js`

**Interfaces:**
- Consumes: `emptyBets`, `placeBet`, `allBet`, `autoAssign`, `sideCap` (Task 3), `generateFight`, `pickFighters` (Task 2)
- Produces: `class Room(code, rng = Math.random)` — 시간은 메서드 인자 `now`(ms)로 받는다
  - `addPlayer(nickname, now) => { ok, player } | { ok: false, error: 'INVALID_NICKNAME'|'GAME_IN_PROGRESS'|'NICKNAME_TAKEN' }` — `player = { id, token, nickname, connected, status: 'active'|'spectator', joinedAt, disconnectedAt }`
  - `reconnect(token) => { ok, player } | { ok: false, error: 'INVALID_TOKEN' }`
  - `disconnect(playerId, now)` — 방장이면 `transferHost()`
  - `transferHost()`, `dropStaleLobbyPlayers(now)`, `isAbandoned(now) => boolean`
  - `start(playerId, now) => { ok } | error 'NOT_HOST'|'GAME_IN_PROGRESS'|'NOT_ENOUGH_PLAYERS'` — 로비 이탈자 제거 후 BETTING
  - `placeBet(playerId, side) => { ok: true, allIn: boolean } | { ok: false, error }` (+ `'NOT_BETTING_PHASE'`)
  - `closeNow(playerId, now) => { ok } | error 'NOT_HOST'|'NOT_BETTING_PHASE'`
  - `closeBetting(now)` — 자동 배정 + `this.fight = { startAt, endsAt, script, duration, ko }`, phase FIGHTING
  - `finishFight(now)` — 다음 스테이지 BETTING 또는 FINISHED(`loser` 지정)
  - `restart(playerId) => { ok } | error 'NOT_HOST'|'NOT_FINISHED'`
  - `toState()` — 설계 5장의 `room:state` (token 제외), `fightPayload() => { startAt, fighters, script, duration, ko } | null`
  - 필드: `code, players, hostId, phase, stage, bets, deadline, fighters, fight, history, loser`
  - 상수: `BET_TIME_MS, FIGHT_LEAD_MS, KO_MS, RESULT_MS, LOBBY_DROP_MS, ABANDON_MS, NICKNAME_MAX`

설계 메모: 선수 외형(`fighters`)은 베팅 카드에 보여야 하므로 `beginBetting`에서 정한다.

- [ ] **Step 1: 실패하는 테스트 작성** — `test/room.test.js`

```js
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
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/room.test.js`
Expected: FAIL — `Cannot find module '.../server/room.js'`

- [ ] **Step 3: 구현** — `server/room.js`

```js
import { randomUUID } from 'node:crypto';
import { emptyBets, placeBet as applyBet, allBet, autoAssign, sideCap } from './betting.js';
import { generateFight, pickFighters } from './fight.js';

export const BET_TIME_MS = 15000;
export const FIGHT_LEAD_MS = 1500;   // 대본 방송 후 경기 시작까지 로딩 여유
export const KO_MS = 3000;           // KO 연출
export const RESULT_MS = 3000;       // 스테이지 결과 표시
export const LOBBY_DROP_MS = 60000;  // 로비에서 끊긴 사람 제거
export const ABANDON_MS = 600000;    // 전원 끊긴 방 삭제
export const NICKNAME_MAX = 12;

// 방 하나의 상태와 규칙. 소켓·타이머를 모르고, 시간(now)은 인자로, 난수(rng)는 생성자로 받는다.
export class Room {
  constructor(code, rng = Math.random) {
    this.code = code;
    this.rng = rng;
    this.players = []; // 입장 순서대로 { id, token, nickname, connected, status, joinedAt, disconnectedAt }
    this.hostId = null;
    this.phase = 'LOBBY';
    this.stage = 0;
    this.bets = emptyBets();
    this.deadline = null;
    this.fighters = null; // 이번 스테이지 선수 { red: {skin, name}, blue: {skin, name} }
    this.fight = null; // { startAt, endsAt, script, duration, ko }
    this.history = [];
    this.loser = null;
  }

  getPlayer(id) {
    return this.players.find((p) => p.id === id);
  }

  activeIds() {
    return this.players.filter((p) => p.status === 'active').map((p) => p.id);
  }

  addPlayer(rawNickname, now) {
    const nickname = String(rawNickname ?? '').trim();
    if (nickname.length < 1 || nickname.length > NICKNAME_MAX) return { ok: false, error: 'INVALID_NICKNAME' };
    if (this.phase !== 'LOBBY') return { ok: false, error: 'GAME_IN_PROGRESS' };
    if (this.players.some((p) => p.nickname.toLowerCase() === nickname.toLowerCase())) {
      return { ok: false, error: 'NICKNAME_TAKEN' };
    }
    const player = {
      id: randomUUID(),
      token: randomUUID(),
      nickname,
      connected: true,
      status: 'active',
      joinedAt: now,
      disconnectedAt: null,
    };
    this.players.push(player);
    if (!this.hostId) this.hostId = player.id;
    return { ok: true, player };
  }

  reconnect(token) {
    const player = this.players.find((p) => p.token === token);
    if (!player) return { ok: false, error: 'INVALID_TOKEN' };
    player.connected = true;
    player.disconnectedAt = null;
    return { ok: true, player };
  }

  disconnect(playerId, now) {
    const player = this.getPlayer(playerId);
    if (!player) return;
    player.connected = false;
    player.disconnectedAt = now;
    if (this.hostId === playerId) this.transferHost();
  }

  // 접속 중인 사람 중 가장 먼저 들어온 사람에게 방장 이전. 아무도 없으면 유지.
  transferHost() {
    const next = this.players.find((p) => p.connected && p.id !== this.hostId);
    if (next) this.hostId = next.id;
  }

  // 로비에서 60초 넘게 끊긴 사람 제거
  dropStaleLobbyPlayers(now) {
    if (this.phase !== 'LOBBY') return;
    this.players = this.players.filter((p) => p.connected || now - p.disconnectedAt < LOBBY_DROP_MS);
    if (!this.getPlayer(this.hostId)) {
      this.hostId = null;
      const next = this.players.find((p) => p.connected) ?? this.players[0];
      if (next) this.hostId = next.id;
    }
  }

  isAbandoned(now) {
    if (this.players.length === 0) return true;
    return this.players.every((p) => !p.connected && now - p.disconnectedAt >= ABANDON_MS);
  }

  start(playerId, now) {
    if (playerId !== this.hostId) return { ok: false, error: 'NOT_HOST' };
    if (this.phase !== 'LOBBY') return { ok: false, error: 'GAME_IN_PROGRESS' };
    // 로비에서 이미 나간 사람은 게임에 넣지 않는다
    this.players = this.players.filter((p) => p.connected);
    if (this.players.length < 2) return { ok: false, error: 'NOT_ENOUGH_PLAYERS' };
    for (const p of this.players) p.status = 'active';
    this.stage = 1;
    this.history = [];
    this.loser = null;
    this.beginBetting(now);
    return { ok: true };
  }

  beginBetting(now) {
    this.phase = 'BETTING';
    this.bets = emptyBets();
    this.deadline = now + BET_TIME_MS;
    this.fighters = pickFighters(this.rng);
    this.fight = null;
  }

  // 반환 allIn=true면 호출 측이 바로 closeBetting 해야 한다
  placeBet(playerId, side) {
    if (this.phase !== 'BETTING') return { ok: false, error: 'NOT_BETTING_PHASE' };
    const ids = this.activeIds();
    const result = applyBet(this.bets, ids, playerId, side);
    if (!result.ok) return result;
    this.bets = result.bets;
    return { ok: true, allIn: allBet(this.bets, ids) };
  }

  closeNow(playerId, now) {
    if (playerId !== this.hostId) return { ok: false, error: 'NOT_HOST' };
    if (this.phase !== 'BETTING') return { ok: false, error: 'NOT_BETTING_PHASE' };
    this.closeBetting(now);
    return { ok: true };
  }

  // 미선택자 자동 배정 → 경기 대본 생성 → FIGHTING
  closeBetting(now) {
    if (this.phase !== 'BETTING') return;
    this.bets = autoAssign(this.bets, this.activeIds(), this.rng);
    const fight = generateFight(Math.floor(this.rng() * 2 ** 31));
    const startAt = now + FIGHT_LEAD_MS;
    this.fight = {
      startAt,
      endsAt: startAt + fight.duration * 1000 + KO_MS + RESULT_MS,
      script: fight.script,
      duration: fight.duration,
      ko: fight.ko,
    };
    this.phase = 'FIGHTING';
    this.deadline = null;
  }

  // 진 선수에 건 사람 → 다음 생존자. 1명이면 최종 패배자.
  finishFight(now) {
    if (this.phase !== 'FIGHTING') return;
    const loserCorner = this.fight.ko;
    const winnerCorner = loserCorner === 'red' ? 'blue' : 'red';
    const survivors = this.bets[loserCorner];
    this.history.push({ stage: this.stage, winner: winnerCorner, bets: this.bets });
    for (const id of this.bets[winnerCorner]) this.getPlayer(id).status = 'spectator';
    if (survivors.length === 1) {
      this.phase = 'FINISHED';
      this.loser = survivors[0];
      this.fight = null;
      this.fighters = null;
      return;
    }
    this.stage += 1;
    this.beginBetting(now);
  }

  restart(playerId) {
    if (playerId !== this.hostId) return { ok: false, error: 'NOT_HOST' };
    if (this.phase !== 'FINISHED') return { ok: false, error: 'NOT_FINISHED' };
    for (const p of this.players) p.status = 'active';
    this.phase = 'LOBBY';
    this.stage = 0;
    this.bets = emptyBets();
    this.history = [];
    this.loser = null;
    return { ok: true };
  }

  // 클라이언트에 보내는 상태 (token 제외)
  toState() {
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      stage: this.stage,
      players: this.players.map(({ id, nickname, connected, status, joinedAt }) => ({
        id, nickname, connected, status, joinedAt,
      })),
      bets: this.bets,
      cap: sideCap(this.activeIds().length),
      deadline: this.deadline,
      fighters: this.fighters,
      history: this.history,
      loser: this.loser,
    };
  }

  fightPayload() {
    if (!this.fight) return null;
    const { startAt, script, duration, ko } = this.fight;
    return { startAt, fighters: this.fighters, script, duration, ko };
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/room.test.js`
Expected: PASS (16 tests)

- [ ] **Step 5: 커밋**

```bash
git add server/room.js test/room.test.js
git commit -m "feat: 방 상태 흐름, 방장 이전, 재접속"
```

---

### Task 5: Socket.IO 서버

**Files:**
- Create: `server/rooms.js`, `server/index.js`, `public/index.html`(임시 한 줄, Task 8에서 교체)
- Test: `test/server.test.js`

**Interfaces:**
- Consumes: `Room` (Task 4)
- Produces:
  - `class RoomManager(rng)` — `create() => Room`, `get(code) => Room|undefined` (대소문자 무시), `delete(code)`, `rooms: Map`
  - `createGameServer({ now?, rng? }) => { httpServer, io, manager, listen(port) => Promise<port>, close() => Promise }`
  - 소켓 이벤트 (설계 5장): C→S `time:sync`, `room:create`, `room:join`, `room:rejoin`, `game:start`, `bet:place`, `bet:closeNow`, `game:restart` (모두 ack 콜백), S→C `room:state`, `fight:script`
  - 입장 ack: `{ ok: true, code, token, playerId }`
  - 순서 보장: 베팅 마감 시 `room:state`를 먼저, 그다음 `fight:script`

- [ ] **Step 1: 임시 정적 파일** — `public/index.html`

```html
<!doctype html>
```

- [ ] **Step 2: 실패하는 테스트 작성** — `test/server.test.js`

```js
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
```

- [ ] **Step 3: 실패 확인**

Run: `node --test test/server.test.js`
Expected: FAIL — `Cannot find module '.../server/index.js'`

- [ ] **Step 4: 구현** — `server/rooms.js`

```js
import { Room } from './room.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 I, O, 0, 1 제외

export class RoomManager {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.rooms = new Map();
  }

  create() {
    let code;
    do {
      code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(this.rng() * CODE_CHARS.length)]).join('');
    } while (this.rooms.has(code));
    const room = new Room(code, this.rng);
    this.rooms.set(code, room);
    return room;
  }

  get(code) {
    return this.rooms.get(String(code ?? '').toUpperCase());
  }

  delete(code) {
    this.rooms.delete(code);
  }
}
```

- [ ] **Step 5: 구현** — `server/index.js`

```js
import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { RoomManager } from './rooms.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));
const SWEEP_MS = 10000;

export function createGameServer({ now = Date.now, rng = Math.random } = {}) {
  const app = express();
  app.use(express.static(PUBLIC_DIR));
  const httpServer = createServer(app);
  const io = new Server(httpServer);
  const manager = new RoomManager(rng);
  const timers = new Map(); // code → 현재 phase의 타이머

  const broadcast = (room) => io.to(room.code).emit('room:state', room.toState());

  function clearTimer(code) {
    clearTimeout(timers.get(code));
    timers.delete(code);
  }

  // phase에 맞는 타이머를 건다: BETTING → 마감, FIGHTING → 경기 종료
  function schedule(room) {
    clearTimer(room.code);
    if (room.phase === 'BETTING') {
      timers.set(room.code, setTimeout(() => closeBetting(room), Math.max(0, room.deadline - now())));
    } else if (room.phase === 'FIGHTING') {
      timers.set(room.code, setTimeout(() => {
        room.finishFight(now());
        schedule(room);
        broadcast(room);
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

  function enter(socket, room, player) {
    socket.data = { code: room.code, playerId: player.id };
    socket.join(room.code);
    broadcast(room);
    if (room.phase === 'FIGHTING') socket.emit('fight:script', room.fightPayload());
  }

  // 방에 들어간 소켓만 처리하는 핸들러를 만든다
  const inRoom = (socket, handler) => (payload, ack = () => {}) => {
    const room = manager.get(socket.data?.code);
    if (!room) return ack({ ok: false, error: 'ROOM_NOT_FOUND' });
    handler(room, socket.data.playerId, payload ?? {}, ack);
  };

  io.on('connection', (socket) => {
    socket.on('time:sync', (_payload, ack = () => {}) => ack({ serverNow: now() }));

    socket.on('room:create', ({ nickname } = {}, ack = () => {}) => {
      const room = manager.create();
      const result = room.addPlayer(nickname, now());
      if (!result.ok) {
        manager.delete(room.code);
        return ack(result);
      }
      ack({ ok: true, code: room.code, token: result.player.token, playerId: result.player.id });
      enter(socket, room, result.player);
    });

    socket.on('room:join', ({ code, nickname } = {}, ack = () => {}) => {
      const room = manager.get(code);
      if (!room) return ack({ ok: false, error: 'ROOM_NOT_FOUND' });
      const result = room.addPlayer(nickname, now());
      if (!result.ok) return ack(result);
      ack({ ok: true, code: room.code, token: result.player.token, playerId: result.player.id });
      enter(socket, room, result.player);
    });

    socket.on('room:rejoin', ({ code, token } = {}, ack = () => {}) => {
      const room = manager.get(code);
      if (!room) return ack({ ok: false, error: 'ROOM_NOT_FOUND' });
      const result = room.reconnect(token);
      if (!result.ok) return ack(result);
      ack({ ok: true, code: room.code, token, playerId: result.player.id });
      enter(socket, room, result.player);
    });

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

    socket.on('disconnect', () => {
      const room = manager.get(socket.data?.code);
      if (!room) return;
      // 같은 사람이 다른 탭으로 이미 다시 붙어 있으면 끊김 처리하지 않는다
      const stillHere = [...(io.sockets.adapter.rooms.get(room.code) ?? [])]
        .some((id) => io.sockets.sockets.get(id)?.data?.playerId === socket.data.playerId);
      if (stillHere) return;
      room.disconnect(socket.data.playerId, now());
      broadcast(room);
    });
  });

  const sweeper = setInterval(() => {
    for (const room of manager.rooms.values()) {
      if (room.isAbandoned(now())) {
        clearTimer(room.code);
        manager.delete(room.code);
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
```

- [ ] **Step 6: 통과 확인**

Run: `node --test`
Expected: PASS (전체 37 tests), 프로세스가 멈추지 않고 종료

- [ ] **Step 7: 봇 스모크 스크립트** — `scripts/bot-game.js`

```js
// 봇 4명으로 게임 한 판을 끝까지 돌려 본다 (실제 타이머 사용, 약 1분). 사용: npm run bot-game
import { io as connect } from 'socket.io-client';
import { createGameServer } from '../server/index.js';
const server = createGameServer();
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
```

Run: `npm run bot-game`
Expected (약 30~70초, 숫자는 매번 다름):
```
+0.0s stage 1, active 4
+0.3s fight 20.6s, ko=blue, exchanges=20
+28.4s stage 2, active 2
...
FINISHED loser= 봇2 history 2
```

- [ ] **Step 8: 커밋**

```bash
git add server/rooms.js server/index.js public/index.html test/server.test.js scripts/bot-game.js
git commit -m "feat: Socket.IO 서버와 phase 타이머"
```

---

### Task 6: 경기 재생 계산 (timeline)

**Files:**
- Create: `public/timeline.js`
- Test: `test/timeline.test.js`

**Interfaces:**
- Consumes: Task 2의 `Exchange` 형태
- Produces: `IMPACT_RATIO`(0.35), `exchangeIndexAt(script, elapsedSec) => index|-1`, `impactTime(ex) => sec`, `hpAt(script, elapsedSec) => {red, blue}`, `moveAction(move) => 'jab'|...`, `hitAction(dmg, crit) => 'hit'|'hit_heavy'|null`, `describe(ex) => string`

- [ ] **Step 1: 실패하는 테스트 작성** — `test/timeline.test.js`

```js
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
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/timeline.test.js`
Expected: FAIL — `Cannot find module '.../public/timeline.js'`

- [ ] **Step 3: 구현** — `public/timeline.js`

```js
// 경기 대본 재생 계산 — DOM 없음 (node 테스트 가능)
export const IMPACT_RATIO = 0.35; // exchange 시작 후 dur × 0.35 지점에 타격
export const HEAVY_DAMAGE = 18;

// elapsed(초) 시점에 시작된 마지막 exchange 인덱스. 시작 전이면 -1.
export function exchangeIndexAt(script, elapsed) {
  let idx = -1;
  for (let i = 0; i < script.length; i++) if (script[i].t <= elapsed) idx = i;
  return idx;
}

export function impactTime(ex) {
  return ex.t + ex.dur * IMPACT_RATIO;
}

// elapsed 시점에 화면에 보여야 할 체력
export function hpAt(script, elapsed, maxHp = 100) {
  let hp = { red: maxHp, blue: maxHp };
  for (const ex of script) if (impactTime(ex) <= elapsed) hp = ex.hp;
  return hp;
}

const ACTION = { JAB: 'jab', HOOK: 'hook', UPPERCUT: 'uppercut', BLOCK: 'block', DODGE: 'dodge' };

export function moveAction(move) {
  return ACTION[move];
}

// 맞은 쪽 동작: 없으면 null
export function hitAction(dmg, crit) {
  if (dmg <= 0) return null;
  return dmg >= HEAVY_DAMAGE || crit ? 'hit_heavy' : 'hit';
}

const MOVE_LABEL = { JAB: '잽', HOOK: '훅', UPPERCUT: '어퍼컷', BLOCK: '막기', DODGE: '피하기' };
const CORNER_LABEL = { red: '홍코너', blue: '청코너' };

export function describe(ex) {
  const r = MOVE_LABEL[ex.red];
  const b = MOVE_LABEL[ex.blue];
  switch (ex.result) {
    case 'TRADE': return `맞불! ${r} ↔ ${b}`;
    case 'RED_HIT': return `${CORNER_LABEL.red} ${r} 적중!`;
    case 'BLUE_HIT': return `${CORNER_LABEL.blue} ${b} 적중!`;
    case 'RED_BLOCK': return `${CORNER_LABEL.red} 가드!`;
    case 'BLUE_BLOCK': return `${CORNER_LABEL.blue} 가드!`;
    case 'RED_COUNTER': return `${CORNER_LABEL.red} 피하고 카운터!`;
    case 'BLUE_COUNTER': return `${CORNER_LABEL.blue} 피하고 카운터!`;
    case 'STANDOFF': return '서로 노려본다…';
    default: return `${r} vs ${b}`;
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test`
Expected: PASS (전체 41 tests)

- [ ] **Step 5: 커밋**

```bash
git add public/timeline.js test/timeline.test.js
git commit -m "feat: 경기 대본 재생 계산"
```

---

### Task 7: 스프라이트와 경기 재생기

**Files:**
- Create: `public/sprites.js`, `public/fight-player.js`

**Interfaces:**
- Consumes: `public/timeline.js` (Task 6), 리소스 규격의 경로·`manifest.json`
- Produces:
  - `loadManifest() => Promise<manifest>` (없으면 내장 기본값), `imageExists(url) => Promise<boolean>`
  - `class Sprite(el, { skin, corner })` — `play(action)`, `stop()`. 비반복 동작이 끝나면 `idle`로 복귀, `hold` 동작은 마지막 프레임 유지
  - `spawnEffect(container, name, x, y)`
  - `playFight(payload, serverNow, els, onResult) => stop()` — `els = { ring, ringWrap, red, blue, names: {red, blue}, hp: {red, blue}, caption, banner }`, `onResult(winnerCorner)`는 KO 3초 후 호출

DOM 코드라 자동 테스트 대신 Task 8의 수동 확인에서 검증한다.

- [ ] **Step 1: 구현** — `public/sprites.js`

```js
// 스프라이트 시트 재생. 리소스가 없으면 같은 크기의 임시 박스(동작 이름 표시)로 대체한다.
const DEFAULT_MANIFEST = {
  frameSize: 256,
  fps: 12,
  actions: {
    idle: { frames: 6, loop: true },
    jab: { frames: 4, loop: false, impactFrame: 2 },
    hook: { frames: 6, loop: false, impactFrame: 3 },
    uppercut: { frames: 7, loop: false, impactFrame: 4 },
    block: { frames: 4, loop: false, hold: true },
    dodge: { frames: 5, loop: false },
    hit: { frames: 3, loop: false },
    hit_heavy: { frames: 5, loop: false },
    ko: { frames: 10, loop: false, hold: true },
    victory: { frames: 6, loop: true },
  },
  effects: {
    hit_spark: { frames: 5, size: 128 },
    crit_spark: { frames: 6, size: 192 },
    block_spark: { frames: 4, size: 128 },
    whoosh: { frames: 4, size: 128 },
  },
};

let manifest = DEFAULT_MANIFEST;
const available = new Map(); // url → Promise<boolean>

export async function loadManifest() {
  try {
    const res = await fetch('assets/manifest.json');
    if (res.ok) manifest = await res.json();
  } catch {
    // 리소스 도착 전: 기본 규격 사용
  }
  return manifest;
}

export function imageExists(url) {
  if (!available.has(url)) {
    available.set(url, new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    }));
  }
  return available.get(url);
}

export class Sprite {
  // el: 256×256 박스, corner: 'red'|'blue' (청코너는 좌우 반전)
  constructor(el, { skin, corner }) {
    this.el = el;
    this.skin = skin;
    this.corner = corner;
    this.timer = null;
    this.token = 0;
    el.classList.add('sprite', `corner-${corner}`);
    el.style.width = el.style.height = `${manifest.frameSize}px`;
    el.style.transform = corner === 'blue' ? 'scaleX(-1)' : '';
  }

  async play(action) {
    const spec = manifest.actions[action];
    const url = `assets/fighters/${this.skin}/${this.corner}/${action}.png`;
    const token = ++this.token;
    clearInterval(this.timer);
    const hasImage = await imageExists(url);
    if (token !== this.token) return; // 그 사이 다른 동작이 시작됨

    this.el.classList.toggle('placeholder', !hasImage);
    this.el.dataset.action = action;
    this.el.style.backgroundImage = hasImage ? `url(${url})` : '';
    let frame = 0;
    const draw = () => {
      if (hasImage) this.el.style.backgroundPosition = `-${frame * manifest.frameSize}px 0`;
      else this.el.textContent = `${action} ${frame + 1}/${spec.frames}`;
    };
    draw();
    this.timer = setInterval(() => {
      frame += 1;
      if (frame >= spec.frames) {
        if (spec.loop) frame = 0;
        else {
          clearInterval(this.timer);
          if (!spec.hold) this.play('idle');
          return;
        }
      }
      draw();
    }, 1000 / manifest.fps);
  }

  stop() {
    this.token += 1;
    clearInterval(this.timer);
  }
}

// 이펙트 1회 재생 후 제거. (x, y)는 container 기준 중심 좌표
export async function spawnEffect(container, name, x, y) {
  const spec = manifest.effects[name];
  const url = `assets/effects/${name}.png`;
  const el = document.createElement('div');
  el.className = 'effect';
  el.style.width = el.style.height = `${spec.size}px`;
  el.style.left = `${x - spec.size / 2}px`;
  el.style.top = `${y - spec.size / 2}px`;
  container.appendChild(el);
  const hasImage = await imageExists(url);
  if (hasImage) el.style.backgroundImage = `url(${url})`;
  else el.textContent = name === 'block_spark' ? '🛡️' : name === 'whoosh' ? '💨' : '💥';
  let frame = 0;
  const timer = setInterval(() => {
    if (hasImage) el.style.backgroundPosition = `-${frame * spec.size}px 0`;
    if (++frame >= spec.frames) {
      clearInterval(timer);
      el.remove();
    }
  }, 1000 / manifest.fps);
}
```

- [ ] **Step 2: 구현** — `public/fight-player.js`

```js
import { Sprite, spawnEffect, imageExists } from './sprites.js';
import { exchangeIndexAt, impactTime, hpAt, moveAction, hitAction, describe } from './timeline.js';

const KO_MS = 3000;
// 링(1280×720) 기준 선수 발 위치
const FEET = { red: { x: 470, y: 600 }, blue: { x: 810, y: 600 } };

// payload: fight:script, serverNow: () => 서버 시각(ms), els: 화면 요소들, onResult: KO 연출 후 호출
export function playFight(payload, serverNow, els, onResult) {
  const { script, fighters, startAt, duration, ko } = payload;
  const sprites = {
    red: new Sprite(els.red, { skin: fighters.red.skin, corner: 'red' }),
    blue: new Sprite(els.blue, { skin: fighters.blue.skin, corner: 'blue' }),
  };
  for (const c of ['red', 'blue']) {
    els.names[c].textContent = fighters[c].name;
    sprites[c].play('idle');
  }

  const elapsedNow = () => (serverNow() - startAt) / 1000;
  // 재접속으로 중간부터 보는 경우 이미 지난 장면은 건너뛴다
  let started = exchangeIndexAt(script, elapsedNow());
  let impacted = started;
  if (started >= 0 && impactTime(script[started]) > elapsedNow()) impacted = started - 1;
  let finished = false;
  let raf = 0;

  const setHp = (hp) => {
    for (const c of ['red', 'blue']) els.hp[c].style.width = `${hp[c]}%`;
  };
  setHp(hpAt(script, elapsedNow()));
  els.caption.textContent = elapsedNow() < 0 ? '준비…' : '';
  if (elapsedNow() < 0) flash(els.banner, 'FIGHT!', 'fight');

  function onStart(ex) {
    sprites.red.play(moveAction(ex.red));
    sprites.blue.play(moveAction(ex.blue));
  }

  function onImpact(ex) {
    setHp(ex.hp);
    els.caption.textContent = describe(ex) + (ex.crit ? ' 크리티컬!' : '');
    for (const c of ['red', 'blue']) {
      const hit = hitAction(ex.dmg[c], ex.crit);
      if (hit) {
        sprites[c].play(hit);
        spawnEffect(els.ring, ex.crit ? 'crit_spark' : 'hit_spark', FEET[c].x, FEET[c].y - 170);
        floatText(els.ring, `-${ex.dmg[c]}`, FEET[c].x, FEET[c].y - 230);
      }
    }
    if (ex.crit || hitAction(ex.dmg.red, false) === 'hit_heavy' || hitAction(ex.dmg.blue, false) === 'hit_heavy') {
      els.ringWrap.classList.remove('shake');
      void els.ringWrap.offsetWidth; // 애니메이션 재시작
      els.ringWrap.classList.add('shake');
    }
    if (ex.result === 'RED_BLOCK' || ex.result === 'BLUE_BLOCK') {
      const c = ex.result === 'RED_BLOCK' ? 'red' : 'blue';
      spawnEffect(els.ring, 'block_spark', FEET[c].x, FEET[c].y - 170);
    }
    if (ex.ko) showKo();
  }

  function showKo() {
    finished = true;
    const winner = ko === 'red' ? 'blue' : 'red';
    sprites[ko].play('ko');
    sprites[winner].play('victory');
    flash(els.banner, 'K.O.!', 'ko');
    setTimeout(() => onResult(winner), KO_MS);
  }

  function tick() {
    const elapsed = elapsedNow();
    while (started + 1 < script.length && script[started + 1].t <= elapsed) {
      started += 1;
      onStart(script[started]);
    }
    while (impacted < started && impactTime(script[impacted + 1]) <= elapsed) {
      impacted += 1;
      onImpact(script[impacted]);
    }
    if (!finished) raf = requestAnimationFrame(tick);
  }

  if (elapsedNow() > duration) {
    // 경기는 이미 끝남: 결과 상태로 바로 표시
    finished = true;
    setHp(script.at(-1).hp);
    const winner = ko === 'red' ? 'blue' : 'red';
    sprites[ko].play('ko');
    sprites[winner].play('victory');
    onResult(winner);
  } else {
    raf = requestAnimationFrame(tick);
  }

  return function stop() {
    cancelAnimationFrame(raf);
    sprites.red.stop();
    sprites.blue.stop();
  };
}

// ui/fight.png, ui/ko.png가 있으면 이미지, 없으면 글자
async function flash(el, text, kind) {
  const url = `assets/ui/${kind}.png`;
  el.innerHTML = '';
  if (await imageExists(url)) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = text;
    el.appendChild(img);
  } else {
    el.textContent = text;
  }
  el.className = `banner show ${kind}`;
  setTimeout(() => { el.className = 'banner'; }, 1500);
}

function floatText(container, text, x, y) {
  const el = document.createElement('div');
  el.className = 'float-text';
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 900);
}
```

- [ ] **Step 3: 문법 확인**

Run: `node --check public/sprites.js && node --check public/fight-player.js`
Expected: 출력 없음 (성공)

- [ ] **Step 4: 커밋**

```bash
git add public/sprites.js public/fight-player.js
git commit -m "feat: 스프라이트 재생과 경기 재생기 (리소스 없으면 임시 박스)"
```

---

### Task 8: 화면 (로비 · 베팅 · 경기 · 종료)

**Files:**
- Create: `public/style.css`, `public/app.js`, `public/main.js`, `public/views/entry.js`, `public/views/lobby.js`, `public/views/betting.js`, `public/views/fight.js`, `public/views/finished.js`
- Modify: `public/index.html` (Task 5의 임시 파일을 전체 교체)

**Interfaces:**
- Consumes: 소켓 이벤트 (Task 5), `playFight` (Task 7), `loadManifest` (Task 7)
- Produces (`app.js`): `socket`, `$`, `serverNow()`, `me.playerId`, `call(event, payload) => Promise<ack>`, `syncClock()`, `saveSession/loadSession/clearSession` (localStorage `coffee-boxing-session` = `{code, token}`), `toast(errorCode|text)`, `showScreen(name)`, `nicknameOf(state, id)`, `renderPlayers(ul, state, ids)`

- [ ] **Step 1: 마크업** — `public/index.html`

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>커피 복싱</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header><h1>🥊 커피 복싱 ☕</h1><div id="me"></div></header>

  <main>
    <section id="screen-entry" class="screen">
      <input id="nickname" maxlength="12" placeholder="닉네임 (최대 12자)" autocomplete="off">
      <div class="row">
        <button id="btn-create">방 만들기</button>
      </div>
      <div class="row">
        <input id="join-code" maxlength="4" placeholder="방 코드" autocomplete="off">
        <button id="btn-join">입장</button>
      </div>
    </section>

    <section id="screen-lobby" class="screen">
      <p>방 코드</p>
      <div id="room-code" class="room-code"></div>
      <ul id="lobby-players" class="players"></ul>
      <button id="btn-start" hidden>게임 시작</button>
      <p id="lobby-hint" class="hint"></p>
    </section>

    <section id="screen-betting" class="screen">
      <h2 id="bet-title"></h2>
      <div id="bet-timer" class="timer"></div>
      <div class="corners">
        <div class="corner red">
          <img id="bet-portrait-red" class="portrait" alt="">
          <div id="bet-name-red" class="fighter-name"></div>
          <button id="btn-bet-red" class="bet red">홍코너</button>
          <ul id="bets-red" class="players"></ul>
        </div>
        <div class="corner blue">
          <img id="bet-portrait-blue" class="portrait" alt="">
          <div id="bet-name-blue" class="fighter-name"></div>
          <button id="btn-bet-blue" class="bet blue">청코너</button>
          <ul id="bets-blue" class="players"></ul>
        </div>
      </div>
      <p id="bet-hint" class="hint"></p>
      <button id="btn-close-now" hidden>바로 진행</button>
    </section>

    <section id="screen-fight" class="screen">
      <div class="hud">
        <div class="hud-side red"><span id="name-red"></span><div class="hpbar"><div id="hp-red" class="hp"></div></div></div>
        <div class="hud-side blue"><span id="name-blue"></span><div class="hpbar"><div id="hp-blue" class="hp"></div></div></div>
      </div>
      <div id="ring-wrap" class="ring-wrap">
        <div id="ring" class="ring">
          <div id="sprite-red" class="fighter red"></div>
          <div id="sprite-blue" class="fighter blue"></div>
          <div id="banner" class="banner"></div>
        </div>
      </div>
      <div id="caption" class="caption"></div>
      <div id="my-bet" class="hint"></div>
      <div id="stage-result" class="stage-result" hidden></div>
    </section>

    <section id="screen-finished" class="screen">
      <img src="assets/ui/coffee.png" class="coffee" alt="" onerror="this.replaceWith('☕')">
      <h2 id="loser"></h2>
      <ol id="history" class="history"></ol>
      <button id="btn-restart" hidden>다시하기</button>
      <button id="btn-leave">나가기</button>
    </section>
  </main>

  <div id="toast" class="toast"></div>

  <script src="/socket.io/socket.io.js"></script>
  <script type="module" src="main.js"></script>
</body>
</html>
```

- [ ] **Step 2: 스타일** — `public/style.css`

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: #12121c; color: #f2f2f2; text-align: center; }
header { display: flex; justify-content: space-between; align-items: center; padding: 8px 16px; background: #000; }
header h1 { margin: 0; font-size: 24px; }
main { max-width: 1280px; margin: 0 auto; padding: 16px; }
.screen { display: none; }
.screen.active { display: block; }
.row { margin: 12px 0; }
input, button { font-size: 18px; padding: 10px 14px; border-radius: 8px; border: none; margin: 4px; }
button { background: #f5c518; color: #000; font-weight: bold; cursor: pointer; }
button:disabled { opacity: 0.35; cursor: not-allowed; }
.room-code { font-size: 64px; letter-spacing: 12px; font-weight: 900; color: #f5c518; }
.players { list-style: none; padding: 0; }
.players li { padding: 4px; }
.players li.offline { opacity: 0.4; }
.players li.me { font-weight: bold; color: #f5c518; }
.hint { color: #aaa; min-height: 1.4em; }
.timer { font-size: 48px; font-weight: 900; }
.corners { display: flex; gap: 16px; justify-content: center; }
.corner { flex: 1; max-width: 360px; padding: 12px; border-radius: 12px; }
.corner.red { background: #4a1414; }
.corner.blue { background: #142a4a; }
.portrait { width: 160px; height: 160px; object-fit: contain; }
.fighter-name { font-size: 20px; margin: 8px 0; }
button.bet { width: 100%; font-size: 24px; color: #fff; }
button.bet.red { background: #d32f2f; }
button.bet.blue { background: #1976d2; }
.hud { display: flex; gap: 24px; }
.hud-side { flex: 1; text-align: left; }
.hud-side.blue { text-align: right; }
.hpbar { height: 20px; background: #333; border-radius: 10px; overflow: hidden; }
.hud-side.blue .hpbar { transform: scaleX(-1); }
.hp { height: 100%; width: 100%; background: #4caf50; transition: width 0.25s; }
.ring-wrap { position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; margin-top: 8px; }
.ring { position: absolute; left: 0; top: 0; width: 1280px; height: 720px; transform-origin: 0 0;
  background: url(assets/ui/ring.png) center / cover, radial-gradient(#3a3a5a, #111); }
.fighter { position: absolute; top: 360px; } /* 발 기준점(128,240)이 바닥선 y=600에 오도록 */
.fighter.red { left: 342px; }
.fighter.blue { left: 682px; }
.sprite { background-repeat: no-repeat; }
.sprite.placeholder { display: flex; align-items: center; justify-content: center; border: 4px dashed #fff;
  font-size: 22px; font-weight: bold; color: #fff; }
.sprite.placeholder.corner-red { background: rgba(211, 47, 47, 0.6); }
.sprite.placeholder.corner-blue { background: rgba(25, 118, 210, 0.6); }
.sprite.placeholder.corner-blue { direction: rtl; }
.effect { position: absolute; background-repeat: no-repeat; font-size: 64px; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.float-text { position: absolute; font-size: 40px; font-weight: 900; color: #ff5252; animation: float-up 0.9s forwards; }
@keyframes float-up { to { transform: translateY(-60px); opacity: 0; } }
.banner { position: absolute; left: 0; right: 0; top: 200px; font-size: 140px; font-weight: 900; color: #f5c518;
  text-shadow: 0 0 20px #000; opacity: 0; transition: opacity 0.2s; pointer-events: none; }
.banner.show { opacity: 1; }
.banner img { max-width: 768px; }
.caption { font-size: 28px; font-weight: bold; min-height: 1.5em; margin-top: 8px; }
.ring-wrap.shake { animation: shake 0.25s; }
@keyframes shake { 25% { transform: translate(-6px, 3px); } 75% { transform: translate(6px, -3px); } }
.stage-result { font-size: 28px; padding: 12px; background: #000a; border-radius: 12px; }
.coffee { width: 240px; font-size: 160px; }
#loser { font-size: 48px; color: #ff5252; }
.history { text-align: left; display: inline-block; }
.toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: #000d; padding: 12px 20px;
  border-radius: 8px; opacity: 0; transition: opacity 0.2s; pointer-events: none; }
.toast.show { opacity: 1; }
@media (max-width: 600px) {
  .corners { flex-direction: column; align-items: center; }
  .room-code { font-size: 48px; }
}
```

- [ ] **Step 3: 공용 모듈** — `public/app.js`

```js
// 소켓, 세션, 서버 시각 등 화면들이 같이 쓰는 것
const SESSION_KEY = 'coffee-boxing-session';

export const socket = window.io();
export const $ = (id) => document.getElementById(id);

let clockOffset = 0; // 서버 시각 - 내 시각
export const serverNow = () => Date.now() + clockOffset;

export const me = { playerId: null };

export function call(event, payload = {}) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

export async function syncClock() {
  const t0 = Date.now();
  const { serverNow: s } = await call('time:sync');
  clockOffset = s - (t0 + Date.now()) / 2;
}

export function saveSession(session) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch {}
}

export function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}

export function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

const ERRORS = {
  INVALID_NICKNAME: '닉네임은 1~12자로 입력하세요.',
  NICKNAME_TAKEN: '이미 있는 닉네임이에요.',
  ROOM_NOT_FOUND: '방을 찾을 수 없어요.',
  GAME_IN_PROGRESS: '이미 시작된 게임이에요.',
  NOT_HOST: '방장만 할 수 있어요.',
  NOT_ENOUGH_PLAYERS: '2명 이상이어야 시작할 수 있어요.',
  SIDE_FULL: '그쪽은 꽉 찼어요! 반대쪽을 고르세요.',
  ALREADY_BET: '이미 골랐어요.',
  NOT_ACTIVE: '관전 중이에요.',
  NOT_BETTING_PHASE: '베팅 시간이 끝났어요.',
};

let toastTimer = 0;
export function toast(errorOrText) {
  const el = $('toast');
  el.textContent = ERRORS[errorOrText] ?? errorOrText;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

export function showScreen(name) {
  for (const el of document.querySelectorAll('.screen')) el.classList.toggle('active', el.id === `screen-${name}`);
}

export function nicknameOf(state, id) {
  return state.players.find((p) => p.id === id)?.nickname ?? '?';
}

// 참가자 목록 렌더링 (👑 방장, 흐리게 = 접속 끊김, 노랑 = 나)
export function renderPlayers(ul, state, ids) {
  ul.innerHTML = '';
  for (const id of ids) {
    const p = state.players.find((x) => x.id === id);
    if (!p) continue;
    const li = document.createElement('li');
    li.textContent = `${p.id === state.hostId ? '👑 ' : ''}${p.nickname}${p.connected ? '' : ' (끊김)'}`;
    li.classList.toggle('offline', !p.connected);
    li.classList.toggle('me', p.id === me.playerId);
    ul.appendChild(li);
  }
}
```

- [ ] **Step 4: 입장 화면** — `public/views/entry.js`

```js
import { $, call, saveSession, me, toast } from '../app.js';

export function setupEntry() {
  const enter = (res) => {
    if (!res.ok) return toast(res.error);
    me.playerId = res.playerId;
    saveSession({ code: res.code, token: res.token });
  };
  $('btn-create').onclick = async () => enter(await call('room:create', { nickname: $('nickname').value }));
  $('btn-join').onclick = async () =>
    enter(await call('room:join', { code: $('join-code').value.trim().toUpperCase(), nickname: $('nickname').value }));
}
```

- [ ] **Step 5: 로비 화면** — `public/views/lobby.js`

```js
import { $, call, me, toast, renderPlayers } from '../app.js';

export function setupLobby() {
  $('btn-start').onclick = async () => {
    const res = await call('game:start');
    if (!res.ok) toast(res.error);
  };
}

export function renderLobby(state) {
  $('room-code').textContent = state.code;
  renderPlayers($('lobby-players'), state, state.players.map((p) => p.id));
  const isHost = state.hostId === me.playerId;
  const ready = state.players.filter((p) => p.connected).length >= 2;
  $('btn-start').hidden = !isHost;
  $('btn-start').disabled = !ready;
  $('lobby-hint').textContent = isHost
    ? (ready ? '모두 들어왔으면 시작하세요.' : '2명 이상 모이면 시작할 수 있어요.')
    : '방장이 시작하길 기다리는 중…';
}
```

- [ ] **Step 6: 베팅 화면** — `public/views/betting.js`

```js
import { $, call, me, toast, serverNow, renderPlayers } from '../app.js';

let timer = 0;

export function setupBetting() {
  for (const side of ['red', 'blue']) {
    $(`btn-bet-${side}`).onclick = async () => {
      const res = await call('bet:place', { side });
      if (!res.ok) toast(res.error);
    };
  }
  $('btn-close-now').onclick = async () => {
    const res = await call('bet:closeNow');
    if (!res.ok) toast(res.error);
  };
}

export function renderBetting(state) {
  const self = state.players.find((p) => p.id === me.playerId);
  const active = self?.status === 'active';
  const myBet = ['red', 'blue'].find((s) => state.bets[s].includes(me.playerId));
  const survivors = state.players.filter((p) => p.status === 'active').length;

  $('bet-title').textContent = `스테이지 ${state.stage} · 생존자 ${survivors}명`;
  for (const side of ['red', 'blue']) {
    const f = state.fighters[side];
    $(`bet-name-${side}`).textContent = f.name;
    const img = $(`bet-portrait-${side}`);
    img.src = `assets/fighters/${f.skin}/${side}/portrait.png`;
    img.onerror = () => { img.removeAttribute('src'); img.alt = '🥊'; };
    renderPlayers($(`bets-${side}`), state, state.bets[side]);
    const full = state.bets[side].length >= state.cap;
    const btn = $(`btn-bet-${side}`);
    btn.disabled = !active || Boolean(myBet) || full;
    btn.textContent = `${side === 'red' ? '홍코너' : '청코너'}${full ? ' (가득 참)' : ''} ${state.bets[side].length}/${state.cap}`;
  }
  $('bet-hint').textContent = !active ? '관전 중 — 이번 판은 구경만 해요.'
    : myBet ? `${myBet === 'red' ? '홍코너' : '청코너'}에 걸었어요. 다른 사람을 기다리는 중…`
    : '진 선수에 건 사람이 다음 판으로! 이긴 쪽에 걸면 탈출.';
  $('btn-close-now').hidden = state.hostId !== me.playerId;

  clearInterval(timer);
  const tick = () => {
    const left = Math.max(0, Math.ceil((state.deadline - serverNow()) / 1000));
    $('bet-timer').textContent = `${left}초`;
  };
  tick();
  timer = setInterval(tick, 250);
}

export function leaveBetting() {
  clearInterval(timer);
}
```

- [ ] **Step 7: 경기 화면** — `public/views/fight.js`

```js
import { $, me, serverNow, nicknameOf } from '../app.js';
import { playFight } from '../fight-player.js';

let stop = null;
let lastState = null;

export function updateFightState(state) {
  lastState = state;
}

// 1280×720 링을 화면 폭에 맞춰 축소
function fitRing() {
  $('ring').style.transform = `scale(${$('ring-wrap').clientWidth / 1280})`;
}
window.addEventListener('resize', fitRing);

export function startFight(payload) {
  stop?.();
  fitRing();
  $('stage-result').hidden = true;
  const myBet = lastState && ['red', 'blue'].find((s) => lastState.bets[s].includes(me.playerId));
  $('my-bet').textContent = myBet ? `내 선택: ${myBet === 'red' ? '🔴 홍코너' : '🔵 청코너'} — 지는 쪽이 커피에 가까워져요` : '관전 중';
  stop = playFight(payload, serverNow, {
    ring: $('ring'),
    ringWrap: $('ring-wrap'),
    red: freshSprite('sprite-red'),
    blue: freshSprite('sprite-blue'),
    names: { red: $('name-red'), blue: $('name-blue') },
    hp: { red: $('hp-red'), blue: $('hp-blue') },
    caption: $('caption'),
    banner: $('banner'),
  }, (winner) => showStageResult(winner));
}

// 이전 경기의 Sprite 상태를 지우기 위해 요소를 새로 만든다
function freshSprite(id) {
  const old = $(id);
  const el = document.createElement('div');
  el.id = id;
  el.className = old.className.split(' ').filter((c) => c === 'fighter' || c === 'red' || c === 'blue').join(' ');
  old.replaceWith(el);
  return el;
}

function showStageResult(winner) {
  if (!lastState) return;
  const loserSide = winner === 'red' ? 'blue' : 'red';
  const next = lastState.bets[loserSide].map((id) => nicknameOf(lastState, id));
  const el = $('stage-result');
  el.hidden = false;
  el.textContent = next.length === 1
    ? `${winner === 'red' ? '홍코너' : '청코너'} 승! … 진 쪽에 건 사람은 단 한 명…`
    : `${winner === 'red' ? '홍코너' : '청코너'} 승! 다음 판 진출: ${next.join(', ')}`;
}

export function leaveFight() {
  stop?.();
  stop = null;
}
```

- [ ] **Step 8: 종료 화면** — `public/views/finished.js`

```js
import { $, call, me, toast, nicknameOf, clearSession } from '../app.js';

export function setupFinished() {
  $('btn-restart').onclick = async () => {
    const res = await call('game:restart');
    if (!res.ok) toast(res.error);
  };
  $('btn-leave').onclick = () => {
    clearSession();
    location.reload();
  };
}

export function renderFinished(state) {
  $('loser').textContent = `☕ ${nicknameOf(state, state.loser)} 커피 사와라!`;
  const ol = $('history');
  ol.innerHTML = '';
  for (const h of state.history) {
    const li = document.createElement('li');
    const names = (side) => h.bets[side].map((id) => nicknameOf(state, id)).join(', ');
    li.textContent = `스테이지 ${h.stage}: ${h.winner === 'red' ? '홍' : '청'} 승 — 홍[${names('red')}] 청[${names('blue')}]`;
    ol.appendChild(li);
  }
  $('btn-restart').hidden = state.hostId !== me.playerId;
}
```

- [ ] **Step 9: 라우팅** — `public/main.js`

```js
import { socket, $, call, me, syncClock, loadSession, clearSession, showScreen } from './app.js';
import { loadManifest } from './sprites.js';
import { setupEntry } from './views/entry.js';
import { setupLobby, renderLobby } from './views/lobby.js';
import { setupBetting, renderBetting, leaveBetting } from './views/betting.js';
import { startFight, updateFightState, leaveFight } from './views/fight.js';
import { setupFinished, renderFinished } from './views/finished.js';

setupEntry();
setupLobby();
setupBetting();
setupFinished();
loadManifest();
showScreen('entry');

let phase = null;

socket.on('connect', async () => {
  await syncClock();
  const session = loadSession();
  if (!session) return;
  const res = await call('room:rejoin', session);
  if (res.ok) me.playerId = res.playerId;
  else clearSession();
});

socket.on('room:state', (state) => {
  const self = state.players.find((p) => p.id === me.playerId);
  $('me').textContent = self ? `${self.nickname} · 방 ${state.code}` : '';
  updateFightState(state);
  if (state.phase !== phase) {
    if (phase === 'BETTING') leaveBetting();
    if (phase === 'FIGHTING') leaveFight();
    phase = state.phase;
  }
  if (state.phase === 'LOBBY') { showScreen('lobby'); renderLobby(state); }
  if (state.phase === 'BETTING') { showScreen('betting'); renderBetting(state); }
  if (state.phase === 'FIGHTING') showScreen('fight');
  if (state.phase === 'FINISHED') { showScreen('finished'); renderFinished(state); }
});

socket.on('fight:script', (payload) => {
  showScreen('fight');
  startFight(payload);
});
```

- [ ] **Step 10: 문법 확인과 전체 테스트**

Run: `for f in public/*.js public/views/*.js; do node --check $f; done && node --test`
Expected: `--check` 출력 없음, 테스트 41개 PASS

- [ ] **Step 11: 수동 확인** — `npm start` 후 브라우저 창 3개(일반 1 + 시크릿 2, 또는 다른 브라우저)로 `http://localhost:3000`

체크리스트:
1. 창 A에서 닉네임 입력 → 방 만들기 → 4자리 코드와 👑 표시
2. 창 B, C에서 코드로 입장 → 모든 창 목록에 3명. B·C에는 시작 버튼 없음
3. 창 A 시작 → 세 창 모두 베팅 화면, 15초 카운트다운, 선수 이름 2개, 초상화 자리는 🥊
4. A·B가 홍을 누르면 C의 홍 버튼이 "(가득 참) 2/2"로 비활성화
5. C가 청을 누르면 바로 경기: 임시 박스(빨강/파랑 점선)에 동작 이름이 바뀌고, HP바가 줄고, 데미지 숫자가 뜨고, 7~30초 안에 "K.O.!" 표시
6. KO 3초 뒤 "홍/청 승! 다음 판 진출: …" → 3초 뒤 다음 베팅 또는 종료 화면
7. 경기 중 창 B 새로고침 → 같은 경기의 중간부터 이어짐 (HP가 현재값으로)
8. 베팅 중 창 A(방장) 닫기 → B에 👑, B에 "바로 진행" 버튼이 생기고 누르면 경기 시작
9. 종료 화면 "☕ ○○ 커피 사와라!", 스테이지 기록, 방장에게만 "다시하기" → 누르면 로비로
10. 폰 폭(개발자도구 375px)에서 베팅 카드가 세로로 쌓이고 가로 스크롤 없음

- [ ] **Step 12: 커밋**

```bash
git add public/
git commit -m "feat: 로비·베팅·경기·종료 화면"
```

---

### Task 9: 실행 안내

**Files:**
- Create: `README.md`

- [ ] **Step 1: 작성** — `README.md`

````markdown
# 🥊 커피 복싱 ☕

진 선수에 건 사람이 계속 살아남는(?) 커피 내기 복싱 베팅 게임.

## 실행

```bash
npm install
npm start          # http://localhost:3000
```

같은 네트워크의 다른 사람은 `http://<내 IP>:3000` 으로 접속 (`ipconfig getifaddr en0` 로 IP 확인).

## 테스트

```bash
npm test           # 단위·통합 테스트
npm run bot-game   # 봇 4명으로 한 판 끝까지 (약 1분)
```

## 리소스

`docs/superpowers/specs/2026-10-15-boxing-assets-spec.md` 규격대로 `public/assets/`에 넣으면 자동 적용된다.
없으면 임시 박스로 표시된다.
````

- [ ] **Step 2: 커밋**

```bash
git add README.md
git commit -m "docs: 실행 안내"
```
