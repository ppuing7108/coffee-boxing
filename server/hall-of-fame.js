import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// 커피 명예의 전당: 커피 당첨 기록을 "시각<TAB>닉네임" 한 줄씩 파일에 쌓고, 읽어서 순위를 낸다.
export const TOP_N = 10;
export const RECENT_N = 10;

const pad = (n) => String(n).padStart(2, '0');

// 서버 현지 시각 'YYYY-MM-DD HH:mm:ss'
export function formatTimestamp(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatMonth(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

// 탭·줄바꿈이 섞이면 한 줄 형식이 깨지므로 공백으로 바꾼다
export function formatLine(date, nickname) {
  const name = String(nickname).replace(/[\t\r\n]+/g, ' ').trim();
  return `${formatTimestamp(date)}\t${name}\n`;
}

const LINE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\t(.+)$/;

export function parseLog(text) {
  const records = [];
  for (const line of text.split('\n')) {
    const m = LINE.exec(line.trimEnd());
    if (m) records.push({ at: m[1], nickname: m[2] });
  }
  return records;
}

// 닉네임별 횟수 순위 (대소문자 무시, 표시는 가장 최근 표기). month = 'YYYY-MM'이면 그 달만.
export function ranking(records, { month = null, limit = Infinity } = {}) {
  const byName = new Map();
  for (const r of records) {
    if (month && !r.at.startsWith(month)) continue;
    const key = r.nickname.toLowerCase();
    const entry = byName.get(key) ?? { nickname: r.nickname, count: 0 };
    entry.nickname = r.nickname;
    entry.count += 1;
    byName.set(key, entry);
  }
  const sorted = [...byName.values()].sort(
    (a, b) => b.count - a.count || a.nickname.localeCompare(b.nickname, 'ko'),
  );
  // 같은 횟수는 공동 순위 (1, 1, 3 …)
  return sorted.slice(0, limit).map((e) => ({
    rank: sorted.findIndex((x) => x.count === e.count) + 1,
    nickname: e.nickname,
    count: e.count,
  }));
}

export class HallOfFame {
  constructor(file) {
    this.file = file;
  }

  async read() {
    try {
      return parseLog(await readFile(this.file, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  // 기록 한 줄 추가, 이 사람의 누적 횟수를 돌려준다
  async record(nickname, date = new Date()) {
    await mkdir(dirname(this.file), { recursive: true });
    await appendFile(this.file, formatLine(date, nickname));
    const key = String(nickname).trim().toLowerCase();
    return (await this.read()).filter((r) => r.nickname.toLowerCase() === key).length;
  }

  async summary(now = new Date()) {
    const records = await this.read();
    const monthLabel = formatMonth(now);
    return {
      monthLabel,
      all: ranking(records, { limit: TOP_N }),
      month: ranking(records, { month: monthLabel, limit: TOP_N }),
      recent: records.slice(-RECENT_N).reverse(),
    };
  }
}
