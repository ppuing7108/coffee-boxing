import { $, call, saveSession, me, toast } from '../app.js';

export function setupEntry() {
  const enter = (res) => {
    if (!res.ok) return toast(res.error);
    me.playerId = res.playerId;
    saveSession({ code: res.code, token: res.token });
  };
  $('btn-create').onclick = async () => enter(await call('room:create', { nickname: $('nickname').value }));
  $('btn-join').onclick = async () =>
    enter(await call('room:join', { code: $('join-code').value.trim().toUpperCase(), nickname: $('nickname').value }));
}
