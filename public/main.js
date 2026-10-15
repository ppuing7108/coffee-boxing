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
