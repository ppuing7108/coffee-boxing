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
const available = new Map(); // url → Promise<boolean>

export async function loadManifest() {
  try {
    const res = await fetch('assets/manifest.json');
    if (res.ok) manifest = await res.json();
  } catch {
    // 리소스 도착 전: 기본 규격 사용
  }
  return manifest;
}

export function imageExists(url) {
  if (!available.has(url)) {
    available.set(url, new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    }));
  }
  return available.get(url);
}

export class Sprite {
  // el: 256×256 박스, corner: 'red'|'blue' (청코너는 좌우 반전)
  constructor(el, { skin, corner }) {
    this.el = el;
    this.skin = skin;
    this.corner = corner;
    this.timer = null;
    this.token = 0;
    el.classList.add('sprite', `corner-${corner}`);
    el.style.width = el.style.height = `${manifest.frameSize}px`;
    el.style.transform = corner === 'blue' ? 'scaleX(-1)' : '';
  }

  async play(action) {
    const spec = manifest.actions[action];
    const url = `assets/fighters/${this.skin}/${this.corner}/${action}.png`;
    const token = ++this.token;
    clearInterval(this.timer);
    const hasImage = await imageExists(url);
    if (token !== this.token) return; // 그 사이 다른 동작이 시작됨

    this.el.classList.toggle('placeholder', !hasImage);
    this.el.dataset.action = action;
    this.el.style.backgroundImage = hasImage ? `url(${url})` : '';
    let frame = 0;
    const draw = () => {
      if (hasImage) this.el.style.backgroundPosition = `-${frame * manifest.frameSize}px 0`;
      else this.el.textContent = `${action} ${frame + 1}/${spec.frames}`;
    };
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

// 이펙트 1회 재생 후 제거. (x, y)는 container 기준 중심 좌표
export async function spawnEffect(container, name, x, y) {
  const spec = manifest.effects[name];
  const url = `assets/effects/${name}.png`;
  const el = document.createElement('div');
  el.className = 'effect';
  el.style.width = el.style.height = `${spec.size}px`;
  el.style.left = `${x - spec.size / 2}px`;
  el.style.top = `${y - spec.size / 2}px`;
  container.appendChild(el);
  const hasImage = await imageExists(url);
  if (hasImage) el.style.backgroundImage = `url(${url})`;
  else el.textContent = name === 'block_spark' ? '🛡️' : name === 'whoosh' ? '💨' : '💥';
  let frame = 0;
  const timer = setInterval(() => {
    if (hasImage) el.style.backgroundPosition = `-${frame * spec.size}px 0`;
    if (++frame >= spec.frames) {
      clearInterval(timer);
      el.remove();
    }
  }, 1000 / manifest.fps);
}
