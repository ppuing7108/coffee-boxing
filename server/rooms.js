import { Room } from './room.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 I, O, 0, 1 제외

export class RoomManager {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.rooms = new Map();
  }

  create() {
    let code;
    do {
      code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(this.rng() * CODE_CHARS.length)]).join('');
    } while (this.rooms.has(code));
    const room = new Room(code, this.rng);
    this.rooms.set(code, room);
    return room;
  }

  get(code) {
    return this.rooms.get(String(code ?? '').toUpperCase());
  }

  delete(code) {
    this.rooms.delete(code);
  }

  // 지금 들어갈 수 있는 방: 로비 상태이고 접속 중인 사람이 있는 방, 최근에 만든 방부터
  joinableRooms() {
    return [...this.rooms.values()]
      .filter((room) => room.phase === 'LOBBY' && room.players.some((p) => p.connected))
      .reverse()
      .map((room) => ({
        code: room.code,
        host: room.getPlayer(room.hostId)?.nickname ?? '',
        players: room.players.length,
      }));
  }
}
