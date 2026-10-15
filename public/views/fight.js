import { $, me, serverNow, nicknameOf, renderPlayers } from '../app.js';
import { playFight } from '../fight-player.js';

let stop = null;
let lastState = null;

export function updateFightState(state) {
  lastState = state;
  if (state.phase === 'FIGHTING') renderBettors(state);
}

// 코너별 베팅자 목록 (접속 상태가 바뀌면 room:state마다 다시 그림)
function renderBettors(state) {
  for (const side of ['red', 'blue']) renderPlayers($(`fight-bets-${side}`), state, state.bets[side]);
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
  if (lastState) renderBettors(lastState);
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
