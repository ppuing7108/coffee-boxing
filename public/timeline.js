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
