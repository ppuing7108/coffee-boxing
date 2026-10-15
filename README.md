# 🥊 커피 복싱 ☕

진 선수에 건 사람이 계속 살아남는(?) 커피 내기 복싱 베팅 게임.

## 요구 사항

- **Node.js 18 이상** (권장: 22 LTS. Node 18은 2025-04 공식 지원 종료)
  - 18.20 / 20.20 / 22.22에서 테스트와 서버 실행을 확인했다.
  - 16 이하는 지원하지 않는다 (내장 테스트 실행기 `node:test`, 내장 `fetch` 사용).
- 데이터베이스 불필요. 방 상태는 서버 메모리, 커피 기록만 파일 하나(`data/coffee-log.tsv`)에 남는다.

## 실행

```bash
npm install
npm start          # http://localhost:3000
```

같은 네트워크의 다른 사람은 `http://<내 IP>:3000` 으로 접속 (macOS: `ipconfig getifaddr en0` 로 IP 확인).

| 환경 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `3000` | 서버 포트 |
| `HALL_OF_FAME_FILE` | `data/coffee-log.tsv` | 커피 명예의 전당 기록 파일 (`시각<TAB>닉네임` 한 줄씩) |

## 테스트

```bash
npm test           # 단위·통합 테스트 + 리소스 검사
npm run bot-game   # 봇 4명으로 한 판 끝까지 (약 1분, 기록 파일은 건드리지 않음)
```

## Ubuntu 서버 배포 (nginx + systemd)

Ubuntu 22.04 / 24.04 기준. 도메인은 `coffee.example.com`, 설치 경로는 `/opt/coffee-boxing`으로 예를 든다.

### 1. Node.js 설치

Ubuntu 기본 저장소의 Node는 버전이 낮을 수 있으니 NodeSource로 22 LTS를 설치한다.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx git
node -v            # v18 이상인지 확인
```

### 2. 앱 설치

```bash
sudo useradd --system --home /opt/coffee-boxing --shell /usr/sbin/nologin coffee
sudo git clone https://github.com/ppuing7108/coffee-boxing.git /opt/coffee-boxing
cd /opt/coffee-boxing
sudo npm ci --omit=dev
sudo mkdir -p /var/lib/coffee-boxing
sudo chown -R coffee:coffee /opt/coffee-boxing /var/lib/coffee-boxing
```

### 3. systemd 서비스

`/etc/systemd/system/coffee-boxing.service`

```ini
[Unit]
Description=Coffee Boxing game server
After=network.target

[Service]
Type=simple
User=coffee
WorkingDirectory=/opt/coffee-boxing
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HALL_OF_FAME_FILE=/var/lib/coffee-boxing/coffee-log.tsv
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now coffee-boxing
sudo systemctl status coffee-boxing     # active (running) 확인
curl -I http://127.0.0.1:3000/          # 200 OK
```

기록 파일을 앱 폴더 밖(`/var/lib/coffee-boxing`)에 두면 `git pull`로 업데이트해도 기록이 안전하다.

### 4. nginx 설정

정적 파일(`index.html`, 이미지)과 Socket.IO, API를 모두 Node가 처리하므로 nginx는 **전부 Node로 넘기는 리버스 프록시**로 두는 것이 가장 단순하다. `index` 지시어나 `root`는 필요 없다 (`/` 요청에 Express가 `public/index.html`을 돌려준다).

핵심은 **WebSocket 업그레이드 헤더**다. 빠지면 Socket.IO가 느린 롱폴링으로 떨어지거나 접속이 끊긴다.

`/etc/nginx/sites-available/coffee-boxing`

```nginx
# WebSocket 업그레이드 요청이면 Connection: upgrade, 아니면 close
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name coffee.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 1h;   # 오래 열려 있는 WebSocket이 60초에 끊기지 않게
        proxy_send_timeout 1h;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/coffee-boxing /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default    # 기본 사이트가 80번을 잡고 있으면
sudo nginx -t && sudo systemctl reload nginx
```

<details>
<summary>선택: 정적 파일은 nginx가 직접 서빙하기</summary>

이미지(약 20MB)를 nginx가 직접 보내고 캐시 헤더를 붙이고 싶을 때. 이때는 `root`와 `index`를 쓰고, Socket.IO와 API만 Node로 넘긴다.

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name coffee.example.com;

    root /opt/coffee-boxing/public;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        expires 7d;
        add_header Cache-Control "public";
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 1h;
        proxy_send_timeout 1h;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

nginx 사용자(`www-data`)가 `/opt/coffee-boxing/public`을 읽을 수 있어야 한다 (`sudo chmod -R o+rX /opt/coffee-boxing/public`). 리소스를 바꾼 뒤 브라우저에 옛 이미지가 남으면 `expires`를 줄이거나 강력 새로고침한다.
</details>

### 5. HTTPS (선택)

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d coffee.example.com
```

certbot이 `listen 443 ssl`과 인증서를 위 server 블록에 추가해 준다. WebSocket 설정은 그대로 유지된다 (`wss://`로 자동 전환).

### 6. 방화벽

Node는 모든 인터페이스의 3000번에서 듣는다. 외부에는 nginx만 열어 둔다.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable              # 3000번은 열지 않는다
```

### 운영 시 주의

- **프로세스는 하나만** 띄운다. 방 상태가 메모리에 있어서 pm2 cluster나 여러 인스턴스 + 로드밸런서로 띄우면 같은 방 사람들이 서로 다른 프로세스에 붙어 게임이 깨진다.
- 서버를 재시작하면 **진행 중인 방은 사라진다** (접속자는 자동으로 입장 화면으로 돌아감). 커피 기록은 파일이라 남는다.
- **하위 경로(`example.com/boxing/`) 배포는 지원하지 않는다.** 클라이언트가 `/socket.io/`, `/api/` 절대 경로를 쓰므로 도메인 루트나 서브도메인에 배포한다.
- 백업 대상은 `HALL_OF_FAME_FILE` 하나뿐이다.

업데이트:

```bash
cd /opt/coffee-boxing
sudo -u coffee git pull
sudo -u coffee npm ci --omit=dev
sudo systemctl restart coffee-boxing
```

## 리소스

`docs/superpowers/specs/2026-10-15-boxing-assets-spec.md` 규격대로 `public/assets/`에 넣으면 자동 적용된다.
없으면 임시 박스로 표시된다.
