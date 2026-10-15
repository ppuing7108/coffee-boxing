import { $, call, socket, saveSession, saveNickname, loadNickname, me, toast } from '../app.js';

export function setupEntry() {
  $('nickname').value = loadNickname();
  $('btn-create').onclick = () => enter('room:create', {});
  $('btn-join').onclick = () => enter('room:join', { code: $('join-code').value.trim().toUpperCase() });
  socket.on('lobby:list', renderRoomList);
}

// 요청 중에는 버튼을 막아 두 번 눌러 방이 두 개 생기지 않게 한다
let pending = false;
async function enter(event, payload) {
  if (pending) return;
  const nickname = $('nickname').value;
  if (!nickname.trim()) {
    $('nickname').focus();
    return toast('INVALID_NICKNAME');
  }
  pending = true;
  const res = await call(event, { ...payload, nickname });
  pending = false;
  if (!res.ok) return toast(res.error);
  me.playerId = res.playerId;
  saveNickname(nickname);
  saveSession({ code: res.code, token: res.token });
}

// 입장 화면에 있는 동안 방 목록을 실시간으로 받는다
export async function watchLobby() {
  const res = await call('lobby:watch');
  if (res.ok) renderRoomList(res.rooms);
}

function renderRoomList(rooms) {
  const ul = $('room-list');
  ul.innerHTML = '';
  if (rooms.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '열린 방이 없어요. 새로 만들어 보세요!';
    ul.appendChild(li);
    return;
  }
  for (const room of rooms) {
    const li = document.createElement('li');
    const info = document.createElement('span');
    const code = document.createElement('span');
    code.className = 'code';
    code.textContent = room.code;
    info.append(code, ` · 👑 ${room.host} · ${room.players}명`);
    const btn = document.createElement('button');
    btn.textContent = '입장';
    btn.onclick = () => enter('room:join', { code: room.code });
    li.append(info, btn);
    ul.appendChild(li);
  }
}
