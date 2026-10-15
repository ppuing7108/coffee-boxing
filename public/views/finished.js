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
  $('loser-total').textContent = state.loserTotal ? `명예의 전당 통산 ${state.loserTotal}잔째` : '';
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
