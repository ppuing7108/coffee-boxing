import { createRng, pick } from './rng.js';

export const MOVES = ['JAB', 'HOOK', 'UPPERCUT', 'BLOCK', 'DODGE'];
export const MAX_HP = 100;
export const MIN_DURATION = 7;
export const MAX_DURATION = 30;
export const MAX_ATTEMPTS = 50;

// BASE_DAMAGE[내 기술][상대 기술] = 상대에게 주는 기본 데미지 (설계 4.2의 시작값 × 1.7)
export const BASE_DAMAGE = {
  JAB:      { JAB: 10, HOOK: 10, UPPERCUT: 0,  BLOCK: 0,  DODGE: 10 },
  HOOK:     { JAB: 0,  HOOK: 20, UPPERCUT: 20, BLOCK: 5,  DODGE: 0 },
  UPPERCUT: { JAB: 34, HOOK: 0,  UPPERCUT: 34, BLOCK: 34, DODGE: 0 },
  BLOCK:    { JAB: 0,  HOOK: 0,  UPPERCUT: 0,  BLOCK: 0,  DODGE: 0 },
  DODGE:    { JAB: 0,  HOOK: 10, UPPERCUT: 10, BLOCK: 0,  DODGE: 0 },
};

export const EXCHANGE_DURATION = { STANDOFF: 0.8, NORMAL: 1.0, HEAVY: 1.2 };
const HEAVY_DAMAGE = 30;
const CRIT_CHANCE = 0.2;
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
