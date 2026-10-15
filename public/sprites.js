// 스프라이트 시트 재생. 리소스가 없으면 같은 크기의 임시 박스(동작 이름 표시)로 대체한다.
const DEFAULT_MANIFEST = {
  frameSize: 256,
  fps: 12,
  actions: {
    idle: { frames: 6, loop: true },
    jab: { frames: 4, loop: false, impactFrame: 2 },
    hook: { frames: 6, loop: false, impactFrame: 3 },
    uppercut: { frames: 7, loop: false, impactFrame: 4 },
    block: { frames: 4, loop: false, hold: true },
    dodge: { frames: 5, loop: false },
    hit: { frames: 3, loop: false },
    hit_heavy: { frames: 5, loop: false },
    ko: { frames: 10, loop: false, hold: true },
    victory: { frames: 6, loop: true },
  },
  effects: {
    hit_spark: { frames: 5, size: 128 },
    crit_spark: { frames: 6, size: 192 },
    block_spark: { frames: 4, size: 128 },
    whoosh: { frames: 4, size: 128 },
  },
};

let manifest = DEFAULT_MANIFEST;
const images = new Map(); // url → Promise<HTMLImageElement | null> (해독까지 끝난 이미지, 없으면 null)

export async function loadManifest() {
  try {
    const res = await fetch('assets/manifest.json');
    if (res.ok) manifest = await res.json();
  } catch {
    // 리소스 도착 전: 기본 규격 사용
  }
  return manifest;
}

// 다운로드 + 해독까지 끝낸 이미지. 해독 전 이미지를 그리면 빈 프레임이 깜빡이므로 decode()를 기다린다.
export function loadImage(url) {
  if (!images.has(url)) {
    const img = new Image();
    img.src = url;
    images.set(url, img.decode().then(() => img, () => null));
  }
  return images.get(url);
}

export async function imageExists(url) {
  return (await loadImage(url)) !== null;
}

const sheetUrl = (skin, corner, action) => `assets/fighters/${skin}/${corner}/${action}.png`;

// 한 선수의 모든 동작 시트를 미리 받아 둔다 (베팅 화면에서 호출 → 경기 중 첫 재생 지연 없음)
export function preloadFighter(skin, corner) {
  return Promise.all(Object.keys(manifest.actions).map((a) => loadImage(sheetUrl(skin, corner, a))));
}

export function preloadEffects() {
  return Promise.all(Object.keys(manifest.effects).map((n) => loadImage(`assets/effects/${n}.png`)));
}

const CANVAS_RES = 2;

// 캔버스는 다음 그림을 그리기 전까지 이전 프레임을 유지하므로 동작이 바뀔 때 빈 프레임이 생기지 않는다
export class Sprite {
  // el: 256×256 박스, corner: 'red'|'blue' (청코너는 좌우 반전)
  constructor(el, { skin, corner }) {
    this.el = el;
    this.skin = skin;
    this.corner = corner;
    this.timer = null;
    this.token = 0;
    const size = manifest.frameSize;
    el.classList.add('sprite', `corner-${corner}`);
    el.style.width = el.style.height = `${size}px`;
    el.style.setProperty('--flip', corner === 'blue' ? -1 : 1); // 청코너는 좌우 반전 (크기는 CSS .fighter)
    // 화면에서 확대해 보여주므로 캔버스 내부 해상도를 높여 고품질 보간으로 그린다
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = size * CANVAS_RES;
    this.canvas.style.width = this.canvas.style.height = `${size}px`;
    el.replaceChildren(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingQuality = 'high';
    this.ctx.scale(CANVAS_RES, CANVAS_RES);
  }

  async play(action) {
    const spec = manifest.actions[action];
    const token = ++this.token;
    clearInterval(this.timer);
    const img = await loadImage(sheetUrl(this.skin, this.corner, action));
    if (token !== this.token) return; // 그 사이 다른 동작이 시작됨

    this.el.classList.toggle('placeholder', !img);
    this.el.dataset.action = action;
    let frame = 0;
    const draw = () => drawFrame(this.ctx, img, frame, manifest.frameSize, `${action} ${frame + 1}/${spec.frames}`);
    draw();
    this.timer = setInterval(() => {
      frame += 1;
      if (frame >= spec.frames) {
        if (spec.loop) frame = 0;
        else {
          clearInterval(this.timer);
          if (!spec.hold) this.play('idle');
          return;
        }
      }
      draw();
    }, 1000 / manifest.fps);
  }

  stop() {
    this.token += 1;
    clearInterval(this.timer);
  }
}

// 시트의 frame번째 칸을 그린다. 이미지가 없으면 임시 박스 글자.
function drawFrame(ctx, img, frame, size, label) {
  ctx.clearRect(0, 0, size, size);
  if (img) {
    ctx.drawImage(img, frame * size, 0, size, size, 0, 0, size, size);
    return;
  }
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(label, size / 2, size / 2);
}

const EFFECT_FALLBACK = { block_spark: '🛡️', whoosh: '💨' };

// 이펙트 1회 재생 후 제거. (x, y)는 container 기준 중심 좌표
export async function spawnEffect(container, name, x, y) {
  const spec = manifest.effects[name];
  const img = await loadImage(`assets/effects/${name}.png`);
  const canvas = document.createElement('canvas');
  canvas.className = 'effect';
  canvas.width = canvas.height = spec.size;
  canvas.style.left = `${x - spec.size / 2}px`;
  canvas.style.top = `${y - spec.size / 2}px`;
  const ctx = canvas.getContext('2d');
  ctx.font = '64px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let frame = 0;
  const draw = () => {
    ctx.clearRect(0, 0, spec.size, spec.size);
    if (img) ctx.drawImage(img, frame * spec.size, 0, spec.size, spec.size, 0, 0, spec.size, spec.size);
    else ctx.fillText(EFFECT_FALLBACK[name] ?? '💥', spec.size / 2, spec.size / 2);
  };
  draw();
  container.appendChild(canvas);
  const timer = setInterval(() => {
    if (++frame >= spec.frames) {
      clearInterval(timer);
      canvas.remove();
      return;
    }
    draw();
  }, 1000 / manifest.fps);
}
