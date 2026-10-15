# 복싱 베팅 게임 — 리소스 제작 규격

이 문서만 보고 리소스를 만들 수 있도록 작성했다. 결과물은 `public/assets/` 아래에 이 규격대로 넣는다.
게임은 브라우저에서 CSS `background-position`으로 스프라이트 시트를 프레임 단위로 넘겨 재생한다.

## 1. 공통 규칙

- 포맷: **PNG, RGBA(투명 배경)**. 사운드는 MP3.
- 스타일: 2D 카툰/픽셀 아트 중 하나로 **전체 통일**. 굵은 외곽선, 밝은 색, 과장된 동작(코믹한 분위기).
- 시트 방식: 동작 하나 = PNG 파일 하나, 프레임을 **왼쪽→오른쪽 가로 한 줄**로 배치, 프레임 사이 여백 없음.
- 프레임 크기: **256 × 256 px**. 따라서 시트 크기 = `(프레임 수 × 256) × 256`.
- 재생 속도: **12 fps** (프레임당 약 83ms).
- 파일명: 소문자, 하이픈/언더스코어만 사용.

## 2. 선수 (fighters)

### 2.1 구성
- 스킨 **4종**: `fighter-a`, `fighter-b`, `fighter-c`, `fighter-d`
  - 체형/헤어/피부톤/얼굴로 구분되는 서로 다른 복서 4명 (예: 근육질 대머리, 장발 날렵형, 통통한 아저씨, 콧수염 베테랑).
- 코너 변형 **2종**: `red`, `blue` — 트렁크와 글러브 색만 다름
  - red: 트렁크 `#D32F2F`, 글러브 `#B71C1C`
  - blue: 트렁크 `#1976D2`, 글러브 `#0D47A1`
  - 나머지 픽셀은 red/blue 동일해야 함 (색 치환 스크립트로 만들어도 됨).

### 2.2 방향과 기준점
- 모든 그림은 **오른쪽(상대 방향)을 바라보게** 그린다. 청코너는 게임에서 좌우 반전해 쓴다.
- **발 기준점**: 프레임 안 `(128, 240)` — 두 발 사이 중앙이 이 점에 오게. 모든 프레임에서 고정(피하기·KO도 이 점 기준으로 움직임 표현).
- 캐릭터 키(서 있을 때)는 약 200px. 펀치 시 팔이 프레임 오른쪽 끝(x≈250)까지 뻗을 수 있음.
- 프레임 밖으로 잘리는 부분이 없어야 함.

### 2.3 동작 목록

| action | 프레임 | 길이 | 반복 | impactFrame | 설명 |
|---|---|---|---|---|---|
| `idle` | 6 | 0.50s | 반복 | – | 가드 올리고 스텝 밟기 (바운스) |
| `jab` | 4 | 0.33s | 1회 | 2 | 앞손 빠르게 직선 |
| `hook` | 6 | 0.50s | 1회 | 3 | 옆으로 크게 휘두름 |
| `uppercut` | 7 | 0.58s | 1회 | 4 | 몸 숙였다가 아래에서 위로 |
| `block` | 4 | 0.33s | 1회(마지막 유지) | – | 양팔로 얼굴 가드 |
| `dodge` | 5 | 0.42s | 1회 | – | 상체 뒤/옆으로 젖혀 피함, 마지막 프레임은 원위치 |
| `hit` | 3 | 0.25s | 1회 | – | 얼굴 맞고 살짝 휘청 |
| `hit_heavy` | 5 | 0.42s | 1회 | – | 크게 젖혀지며 뒤로 밀림 |
| `ko` | 10 | 0.83s | 1회(마지막 유지) | – | 비틀 → 쓰러져 바닥에 누움. 마지막 프레임은 누운 상태 |
| `victory` | 6 | 0.50s | 반복 | – | 글러브 들어 올리고 환호 |

- `impactFrame`(0부터 셈): 주먹이 상대에 닿는 프레임. 게임이 이 순간에 타격 이펙트와 상대 `hit` 동작을 맞춘다.
- `idle`의 첫 프레임과 마지막 프레임이 자연스럽게 이어져야 함.
- 공격 동작의 마지막 프레임은 `idle` 첫 프레임과 비슷한 자세로 끝낼 것(자연스러운 복귀).

### 2.4 파일 경로
```
public/assets/fighters/{skin}/{corner}/{action}.png
예) public/assets/fighters/fighter-a/red/hook.png   (6 × 256 = 1536 × 256)
```
총 4 스킨 × 2 코너 × 10 동작 = **80개 PNG**.

### 2.5 썸네일 (베팅 화면 카드용)
```
public/assets/fighters/{skin}/{corner}/portrait.png   256 × 256, 상반신 정면 3/4, 투명 배경
```

## 3. 이펙트 (effects)

| 파일 | 프레임 | 크기 | 설명 |
|---|---|---|---|
| `hit_spark.png` | 5 | 128×128 | 일반 타격 별/충격파 (노랑·흰색) |
| `crit_spark.png` | 6 | 192×192 | 크리티컬 — 더 크고 붉은 폭발 |
| `block_spark.png` | 4 | 128×128 | 가드 막힘 — 파란 실드 파편 |
| `whoosh.png` | 4 | 128×128 | 헛스윙/피하기 바람 자국 |

- 경로: `public/assets/effects/{name}.png`, 12fps, 1회 재생, 중심 기준.

## 4. UI / 배경

| 파일 | 크기 | 설명 |
|---|---|---|
| `ui/ring.png` | 1280×720 | 링 배경. 바닥선(선수 발 위치)이 y≈600. 좌측 빨간 코너 포스트, 우측 파란 코너 포스트. 관중석은 어둡게 |
| `ui/ko.png` | 768×256 | "K.O.!" 큰 글자 (금색, 금 간 효과) |
| `ui/fight.png` | 768×256 | "FIGHT!" 시작 글자 |
| `ui/coffee.png` | 512×512 | 최종 패배자 화면용 커피잔 일러스트 (김 나는, 약간 비꼬는 느낌) |
| `ui/corner_red.png` / `ui/corner_blue.png` | 256×96 | 베팅 버튼 배경 (홍코너/청코너 글자 포함 X, 장식만) |

- 경로: `public/assets/ui/…`

## 5. 사운드 (선택)

있으면 사용, 없어도 게임 동작. `public/assets/sfx/{name}.mp3`, 각 1초 이내(bell은 2초 이내).
`bell`, `punch_light`, `punch_heavy`, `block`, `whoosh`, `ko`, `crowd_cheer`

## 6. manifest.json

`public/assets/manifest.json` — 게임은 이 파일만 읽고 리소스를 로드한다. 규격과 실제 파일이 반드시 일치해야 함.

```json
{
  "frameSize": 256,
  "fps": 12,
  "skins": ["fighter-a", "fighter-b", "fighter-c", "fighter-d"],
  "corners": ["red", "blue"],
  "actions": {
    "idle":      { "frames": 6,  "loop": true },
    "jab":       { "frames": 4,  "loop": false, "impactFrame": 2 },
    "hook":      { "frames": 6,  "loop": false, "impactFrame": 3 },
    "uppercut":  { "frames": 7,  "loop": false, "impactFrame": 4 },
    "block":     { "frames": 4,  "loop": false, "hold": true },
    "dodge":     { "frames": 5,  "loop": false },
    "hit":       { "frames": 3,  "loop": false },
    "hit_heavy": { "frames": 5,  "loop": false },
    "ko":        { "frames": 10, "loop": false, "hold": true },
    "victory":   { "frames": 6,  "loop": true }
  },
  "effects": {
    "hit_spark":   { "frames": 5, "size": 128 },
    "crit_spark":  { "frames": 6, "size": 192 },
    "block_spark": { "frames": 4, "size": 128 },
    "whoosh":      { "frames": 4, "size": 128 }
  }
}
```

## 7. 납품 전 체크리스트

- [ ] 모든 선수 PNG의 크기가 `프레임 수 × 256` × `256`과 정확히 일치
- [ ] 이펙트 PNG의 크기가 `프레임 수 × size` × `size`와 일치
- [ ] 모든 PNG가 투명 배경(RGBA)
- [ ] 모든 선수 프레임에서 발 기준점 (128, 240) 유지, 오른쪽을 바라봄
- [ ] red/blue는 트렁크·글러브 색 외 픽셀 동일
- [ ] 80개 동작 PNG + 8개 portrait + 이펙트 4개 + UI 6개 존재
- [ ] `manifest.json`의 프레임 수와 실제 파일 일치
- [ ] 크기·프레임 수를 검사하는 스크립트(`scripts/check-assets.js` 등)를 함께 제공하면 좋음

## 8. 프레임 간 일관성 (2026-10-15 추가)

게임에서 재생해 보니 동작이 바뀔 때 캐릭터 크기·체형이 튀었다. 아래 기준을 추가한다.

### 8.1 규칙
- **한 캐릭터는 모든 동작·프레임에서 같은 축척과 체형**이다. 머리 크기와 몸통 폭이 `idle` 0번 프레임과 같아야 한다.
- **프레임마다 따로 생성하지 말 것.** `idle` 0번 프레임을 기준 이미지로 삼아 팔·몸의 포즈만 바꿔 만든다.
- **프레임에 맞춰 줄이거나 키우지 말 것.** 팔을 뻗어 프레임(256px)을 넘을 것 같으면 캐릭터를 축소하지 말고 몸을 뒤로 빼거나 팔을 덜 뻗는다.
- **모든 프레임은 같은 시점**(오른쪽을 보는 측면 3/4)이다. 등을 보이는 프레임은 금지한다.
- **타격 섬광·별·충격선을 선수 프레임에 그려 넣지 말 것.** 게임이 `effects/`를 따로 띄운다.

### 8.2 자동 검사 (`scripts/check-assets.js`에 추가)
몸 면적 = 프레임에서 alpha > 128인 픽셀 수. 기준 = 같은 스킨의 `idle` 0번 프레임.

| 동작 | 허용 범위 |
|---|---|
| `idle`, `jab`, `hook`, `uppercut`, `block`, `dodge`, `hit`, `victory` | 기준의 0.88 ~ 1.15 |
| `hit_heavy`, `ko` | 기준의 0.80 ~ 1.25 |

추가로 머리 폭(위쪽 25% 영역의 불투명 픽셀 가로 폭)이 기준과 ±8% 이내여야 한다.

### 8.3 현재 위반 (2026-10-15 측정, 몸 면적 비율)
- `fighter-c`: jab1 0.75, jab2 0.78, hook2 0.72, hook3 0.72 (작고 날씬해지고 hook은 등을 보임), uppercut2·4 1.20
- `fighter-d`: hook2~4 1.33~1.43, uppercut1~5 1.26~1.37, block 1.15~1.31, dodge1~3 1.18~1.22 (`idle`만 작게 그려짐)
- 섬광이 그려진 프레임: `fighter-d` jab2, hook3, uppercut3·4, hit0, hit_heavy0 / `fighter-c` hook2·3, uppercut2·4, hit0, hit_heavy0
- `fighter-a`, `fighter-b`는 기준 이내(재확인만)
