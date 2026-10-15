import { $, call, me, toast, serverNow, renderPlayers } from '../app.js';
import { preloadFighter, preloadEffects } from '../sprites.js';

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
  preloadEffects();
  for (const side of ['red', 'blue']) {
    const f = state.fighters[side];
    preloadFighter(f.skin, side);
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
    const left = Math.max(0, Math.round((state.deadline - serverNow()) / 1000));
    $('bet-timer').textContent = `${left}초`;
  };
  tick();
  timer = setInterval(tick, 250);
}

export function leaveBetting() {
  clearInterval(timer);
}
