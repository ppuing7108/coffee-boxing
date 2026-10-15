import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatTimestamp, formatLine, parseLog, ranking, HallOfFame } from '../server/hall-of-fame.js';

const tempFile = async () => join(await mkdtemp(join(tmpdir(), 'hof-')), 'data', 'coffee-log.tsv');

test('시각은 서버 현지 시각 YYYY-MM-DD HH:mm:ss', () => {
  assert.equal(formatTimestamp(new Date(2026, 9, 5, 9, 3, 7)), '2026-10-05 09:03:07');
});

test('한 줄 = 시각 탭 닉네임, 닉네임의 탭·줄바꿈은 공백으로', () => {
  const at = new Date(2026, 9, 15, 14, 3, 22);
  assert.equal(formatLine(at, '철수'), '2026-10-15 14:03:22\t철수\n');
  assert.equal(formatLine(at, ' 김\t철\n수 '), '2026-10-15 14:03:22\t김 철 수\n');
});

test('로그 파싱: 빈 줄과 깨진 줄은 건너뛴다', () => {
  const text = '2026-10-15 14:03:22\t철수\n\n깨진줄\n2026-10-16 09:00:00\t영희\n';
  assert.deepEqual(parseLog(text), [
    { at: '2026-10-15 14:03:22', nickname: '철수' },
    { at: '2026-10-16 09:00:00', nickname: '영희' },
  ]);
});

const records = [
  { at: '2026-09-30 18:00:00', nickname: '철수' },
  { at: '2026-10-01 10:00:00', nickname: 'kim' },
  { at: '2026-10-02 10:00:00', nickname: '철수' },
  { at: '2026-10-03 10:00:00', nickname: 'Kim' },
  { at: '2026-10-04 10:00:00', nickname: '영희' },
  { at: '2026-10-05 10:00:00', nickname: '민수' },
];

test('순위: 많이 산 순, 대소문자 무시하고 같은 사람, 이름은 최근 표기, 공동 순위(한국어 정렬)', () => {
  assert.deepEqual(ranking(records), [
    { rank: 1, nickname: '철수', count: 2 },
    { rank: 1, nickname: 'Kim', count: 2 },
    { rank: 3, nickname: '민수', count: 1 },
    { rank: 3, nickname: '영희', count: 1 },
  ]);
});

test('이번 달 순위는 해당 월 기록만', () => {
  assert.deepEqual(ranking(records, { month: '2026-09' }), [{ rank: 1, nickname: '철수', count: 1 }]);
  assert.equal(ranking(records, { month: '2026-10' })[0].count, 2);
  assert.equal(ranking(records, { month: '2026-10' }).find((r) => r.nickname === '철수').count, 1);
});

test('순위는 최대 limit명', () => {
  assert.equal(ranking(records, { limit: 2 }).length, 2);
});

test('HallOfFame: 파일이 없으면 빈 기록, 기록하면 폴더까지 만들고 한 줄씩 쌓인다', async () => {
  const file = await tempFile();
  const hall = new HallOfFame(file);
  assert.deepEqual(await hall.read(), []);
  assert.equal(await hall.record('철수', new Date(2026, 9, 15, 14, 3, 22)), 1);
  assert.equal(await hall.record('철수', new Date(2026, 9, 16, 9, 0, 0)), 2);
  assert.equal(await readFile(file, 'utf8'), '2026-10-15 14:03:22\t철수\n2026-10-16 09:00:00\t철수\n');
});

test('HallOfFame.summary: 전체·이번 달 순위와 최근 기록(최신순 10개)', async () => {
  const file = await tempFile();
  const hall = new HallOfFame(file);
  await hall.record('x', new Date(2026, 8, 1, 0, 0, 0));
  for (let i = 1; i <= 11; i++) await hall.record(`p${i}`, new Date(2026, 9, i, 12, 0, 0));
  const s = await hall.summary(new Date(2026, 9, 20));
  assert.equal(s.monthLabel, '2026-10');
  assert.equal(s.all.length, 10);
  assert.ok(!s.month.some((r) => r.nickname === 'x'));
  assert.equal(s.recent.length, 10);
  assert.deepEqual(s.recent[0], { at: '2026-10-11 12:00:00', nickname: 'p11' });
});
