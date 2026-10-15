// 소켓, 세션, 서버 시각 등 화면들이 같이 쓰는 것
const SESSION_KEY = 'coffee-boxing-session';
const NICKNAME_KEY = 'coffee-boxing-nickname';

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

// 마지막으로 쓴 닉네임 (다음 접속 때 미리 채움)
export function saveNickname(nickname) {
  try { localStorage.setItem(NICKNAME_KEY, nickname.trim()); } catch {}
}

export function loadNickname() {
  try { return localStorage.getItem(NICKNAME_KEY) ?? ''; } catch { return ''; }
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
