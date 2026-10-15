# 🥊 커피 복싱 ☕

진 선수에 건 사람이 계속 살아남는(?) 커피 내기 복싱 베팅 게임.

## 실행

```bash
npm install
npm start          # http://localhost:3000
```

같은 네트워크의 다른 사람은 `http://<내 IP>:3000` 으로 접속 (`ipconfig getifaddr en0` 로 IP 확인).

## 테스트

```bash
npm test           # 단위·통합 테스트
npm run bot-game   # 봇 4명으로 한 판 끝까지 (약 1분)
```

## 리소스

`docs/superpowers/specs/2026-10-15-boxing-assets-spec.md` 규격대로 `public/assets/`에 넣으면 자동 적용된다.
없으면 임시 박스로 표시된다.
