import { randomUUID } from 'node:crypto';
import { emptyBets, placeBet as applyBet, allBet, autoAssign, sideCap } from './betting.js';
import { generateFight, pickFighters } from './fight.js';

export const BET_TIME_MS = 15000;
export const FIGHT_LEAD_MS = 1500;   // 대본 방송 후 경기 시작까지 로딩 여유
export const KO_MS = 3000;           // KO 연출
export const RESULT_MS = 3000;       // 스테이지 결과 표시
export const LOBBY_DROP_MS = 60000;  // 로비에서 끊긴 사람 제거
export const ABANDON_MS = 600000;    // 전원 끊긴 방 삭제
export const NICKNAME_MAX = 12;

// 방 하나의 상태와 규칙. 소켓·타이머를 모르고, 시간(now)은 인자로, 난수(rng)는 생성자로 받는다.
export class Room {
  constructor(code, rng = Math.random) {
    this.code = code;
    this.rng = rng;
    this.players = []; // 입장 순서대로 { id, token, nickname, connected, status, joinedAt, disconnectedAt }
    this.hostId = null;
    this.phase = 'LOBBY';
    this.stage = 0;
    this.bets = emptyBets();
    this.deadline = null;
    this.fighters = null; // 이번 스테이지 선수 { red: {skin, name}, blue: {skin, name} }
    this.fight = null; // { startAt, endsAt, script, duration, ko }
    this.history = [];
    this.loser = null;
  }

  getPlayer(id) {
    return this.players.find((p) => p.id === id);
  }

  activeIds() {
    return this.players.filter((p) => p.status === 'active').map((p) => p.id);
  }

  addPlayer(rawNickname, now) {
    const nickname = String(rawNickname ?? '').trim();
    if (nickname.length < 1 || nickname.length > NICKNAME_MAX) return { ok: false, error: 'INVALID_NICKNAME' };
    if (this.phase !== 'LOBBY') return { ok: false, error: 'GAME_IN_PROGRESS' };
    if (this.players.some((p) => p.nickname.toLowerCase() === nickname.toLowerCase())) {
      return { ok: false, error: 'NICKNAME_TAKEN' };
    }
    const player = {
      id: randomUUID(),
      token: randomUUID(),
      nickname,
      connected: true,
      status: 'active',
      joinedAt: now,
      disconnectedAt: null,
    };
    this.players.push(player);
    if (!this.hostId) this.hostId = player.id;
    return { ok: true, player };
  }

  reconnect(token) {
    const player = this.players.find((p) => p.token === token);
    if (!player) return { ok: false, error: 'INVALID_TOKEN' };
    player.connected = true;
    player.disconnectedAt = null;
    // 넘길 사람이 없어 끊긴 방장에게 묶여 있었다면 지금 접속 중인 사람에게 넘긴다
    if (!this.getPlayer(this.hostId)?.connected) this.transferHost();
    return { ok: true, player };
  }

  disconnect(playerId, now) {
    const player = this.getPlayer(playerId);
    if (!player) return;
    player.connected = false;
    player.disconnectedAt = now;
    if (this.hostId === playerId) this.transferHost();
  }

  // 접속 중인 사람 중 가장 먼저 들어온 사람에게 방장 이전. 아무도 없으면 유지.
  transferHost() {
    const next = this.players.find((p) => p.connected && p.id !== this.hostId);
    if (next) this.hostId = next.id;
  }

  // 로비에서 60초 넘게 끊긴 사람 제거
  dropStaleLobbyPlayers(now) {
    if (this.phase !== 'LOBBY') return;
    this.players = this.players.filter((p) => p.connected || now - p.disconnectedAt < LOBBY_DROP_MS);
    if (!this.getPlayer(this.hostId)) {
      this.hostId = null;
      const next = this.players.find((p) => p.connected) ?? this.players[0];
      if (next) this.hostId = next.id;
    }
  }

  isAbandoned(now) {
    if (this.players.length === 0) return true;
    return this.players.every((p) => !p.connected && now - p.disconnectedAt >= ABANDON_MS);
  }

  start(playerId, now) {
    if (playerId !== this.hostId) return { ok: false, error: 'NOT_HOST' };
    if (this.phase !== 'LOBBY') return { ok: false, error: 'GAME_IN_PROGRESS' };
    // 로비에서 이미 나간 사람은 게임에 넣지 않는다
    this.players = this.players.filter((p) => p.connected);
    if (this.players.length < 2) return { ok: false, error: 'NOT_ENOUGH_PLAYERS' };
    for (const p of this.players) p.status = 'active';
    this.stage = 1;
    this.history = [];
    this.loser = null;
    this.beginBetting(now);
    return { ok: true };
  }

  beginBetting(now) {
    this.phase = 'BETTING';
    this.bets = emptyBets();
    this.deadline = now + BET_TIME_MS;
    this.fighters = pickFighters(this.rng);
    this.fight = null;
  }

  // 반환 allIn=true면 호출 측이 바로 closeBetting 해야 한다
  placeBet(playerId, side) {
    if (this.phase !== 'BETTING') return { ok: false, error: 'NOT_BETTING_PHASE' };
    const ids = this.activeIds();
    const result = applyBet(this.bets, ids, playerId, side);
    if (!result.ok) return result;
    this.bets = result.bets;
    return { ok: true, allIn: allBet(this.bets, ids) };
  }

  closeNow(playerId, now) {
    if (playerId !== this.hostId) return { ok: false, error: 'NOT_HOST' };
    if (this.phase !== 'BETTING') return { ok: false, error: 'NOT_BETTING_PHASE' };
    this.closeBetting(now);
    return { ok: true };
  }

  // 미선택자 자동 배정 → 경기 대본 생성 → FIGHTING
  closeBetting(now) {
    if (this.phase !== 'BETTING') return;
    this.bets = autoAssign(this.bets, this.activeIds(), this.rng);
    const fight = generateFight(Math.floor(this.rng() * 2 ** 31));
    const startAt = now + FIGHT_LEAD_MS;
    this.fight = {
      startAt,
      endsAt: startAt + fight.duration * 1000 + KO_MS + RESULT_MS,
      script: fight.script,
      duration: fight.duration,
      ko: fight.ko,
    };
    this.phase = 'FIGHTING';
    this.deadline = null;
  }

  // 진 선수에 건 사람 → 다음 생존자. 1명이면 최종 패배자.
  finishFight(now) {
    if (this.phase !== 'FIGHTING') return;
    const loserCorner = this.fight.ko;
    const winnerCorner = loserCorner === 'red' ? 'blue' : 'red';
    const survivors = this.bets[loserCorner];
    this.history.push({ stage: this.stage, winner: winnerCorner, bets: this.bets });
    for (const id of this.bets[winnerCorner]) this.getPlayer(id).status = 'spectator';
    if (survivors.length === 1) {
      this.phase = 'FINISHED';
      this.loser = survivors[0];
      this.fight = null;
      this.fighters = null;
      return;
    }
    this.stage += 1;
    this.beginBetting(now);
  }

  restart(playerId) {
    if (playerId !== this.hostId) return { ok: false, error: 'NOT_HOST' };
    if (this.phase !== 'FINISHED') return { ok: false, error: 'NOT_FINISHED' };
    for (const p of this.players) p.status = 'active';
    this.phase = 'LOBBY';
    this.stage = 0;
    this.bets = emptyBets();
    this.history = [];
    this.loser = null;
    return { ok: true };
  }

  // 클라이언트에 보내는 상태 (token 제외)
  toState() {
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      stage: this.stage,
      players: this.players.map(({ id, nickname, connected, status, joinedAt }) => ({
        id, nickname, connected, status, joinedAt,
      })),
      bets: this.bets,
      cap: sideCap(this.activeIds().length),
      deadline: this.deadline,
      fighters: this.fighters,
      history: this.history,
      loser: this.loser,
    };
  }

  fightPayload() {
    if (!this.fight) return null;
    const { startAt, script, duration, ko } = this.fight;
    return { startAt, fighters: this.fighters, script, duration, ko };
  }
}
