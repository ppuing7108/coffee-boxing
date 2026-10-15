import { socket, $, call, me, syncClock, loadSession, clearSession, showScreen } from './app.js';
import { loadManifest } from './sprites.js';
import { setupEntry, watchLobby } from './views/entry.js';
import { setupHall, loadHall } from './views/hall.js';
import { setupLobby, renderLobby } from './views/lobby.js';
import { setupBetting, renderBetting, leaveBetting } from './views/betting.js';
import { startFight, updateFightState, leaveFight } from './views/fight.js';
import { setupFinished, renderFinished } from './views/finished.js';

setupEntry();
setupHall();
loadHall();
setupLobby();
setupBetting();
setupFinished();
loadManifest();
showScreen('entry');

let phase = null;

// 입장 화면: 방 목록 구독 + 명예의 전당 새로 고침
function enterLobbyScreen() {
  watchLobby();
  loadHall();
}

socket.on('connect', async () => {
  await syncClock();
  const session = loadSession();
  if (!session) return enterLobbyScreen();
  const res = await call('room:rejoin', session);
  if (res.ok) {
    me.playerId = res.playerId;
    return;
  }
  // 방이 사라졌으면(서버 재시작 등) 입장 화면으로
  clearSession();
  showScreen('entry');
  enterLobbyScreen();
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
