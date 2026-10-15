// 베팅 규칙 — 순수 함수. bets = { red: [playerId], blue: [playerId] } (배열 순서 = 수락 순서)
export const SIDES = ['red', 'blue'];

export function emptyBets() {
  return { red: [], blue: [] };
}

// 한쪽 최대 인원 = 올림(생존자 수 / 2). 5명이면 3:3 자리 → 최소 3:2로 갈린다
export function sideCap(activeCount) {
  return Math.ceil(activeCount / 2);
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
