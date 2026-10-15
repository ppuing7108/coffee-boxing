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
