import { $, socket } from '../app.js';

let summary = null;
let tab = 'all';

export function setupHall() {
  $('hall-tab-all').onclick = () => selectTab('all');
  $('hall-tab-month').onclick = () => selectTab('month');
  socket.on('hall:updated', loadHall); // 다른 방에서 게임이 끝나면 다시 불러온다
}

export async function loadHall() {
  try {
    const res = await fetch('/api/hall-of-fame');
    if (!res.ok) return;
    summary = await res.json();
    render();
  } catch {
    // 서버가 잠깐 안 될 때는 이전 표시 유지
  }
}

function selectTab(next) {
  tab = next;
  render();
}

function emptyItem(text) {
  const li = document.createElement('li');
  li.className = 'empty';
  li.textContent = text;
  return li;
}

function render() {
  if (!summary) return;
  const month = Number(summary.monthLabel.slice(5));
  $('hall-tab-month').textContent = `이번 달 (${month}월)`;
  $('hall-tab-all').classList.toggle('active', tab === 'all');
  $('hall-tab-month').classList.toggle('active', tab === 'month');

  const ol = $('hall-ranking');
  const rows = summary[tab];
  ol.replaceChildren(...(rows.length ? rows.map(rankItem) : [emptyItem('아직 커피를 산 사람이 없어요')]));

  const ul = $('hall-recent');
  ul.replaceChildren(...(summary.recent.length ? summary.recent.map(recentItem) : [emptyItem('기록 없음')]));
}

function rankItem({ rank, nickname, count }) {
  const li = document.createElement('li');
  const r = document.createElement('span');
  r.className = 'rank';
  r.textContent = rank === 1 ? '👑 1' : `${rank}`;
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = nickname;
  const c = document.createElement('span');
  c.textContent = `${count}잔`;
  li.append(r, name, c);
  return li;
}

function recentItem({ at, nickname }) {
  const li = document.createElement('li');
  const time = document.createElement('span');
  time.textContent = at;
  const name = document.createElement('span');
  name.textContent = `☕ ${nickname}`;
  li.append(time, name);
  return li;
}
