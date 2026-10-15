import { Sprite, spawnEffect, imageExists, preloadFighter, preloadEffects } from './sprites.js';
import { exchangeIndexAt, impactTime, hpAt, moveAction, hitAction, describe } from './timeline.js';

const KO_MS = 3000;
// 링(1280×720) 기준 선수 발 위치와 화면 확대 배율 (리소스는 256px 그대로, 그릴 때만 키움)
const FEET = { red: { x: 460, y: 650 }, blue: { x: 820, y: 650 } };
const FIGHTER_SCALE = 1.7;
// 발 기준 높이(원본 px × 배율): 타격 이펙트는 얼굴 근처, 데미지 숫자는 머리 위
const HIT_Y = 170 * FIGHTER_SCALE;
const TEXT_Y = 230 * FIGHTER_SCALE;

// payload: fight:script, serverNow: () => 서버 시각(ms), els: 화면 요소들, onResult: KO 연출 후 호출
export function playFight(payload, serverNow, els, onResult) {
  const { script, fighters, startAt, duration, ko } = payload;
  preloadFighter(fighters.red.skin, 'red');
  preloadFighter(fighters.blue.skin, 'blue');
  preloadEffects();
  const sprites = {
    red: new Sprite(els.red, { skin: fighters.red.skin, corner: 'red' }),
    blue: new Sprite(els.blue, { skin: fighters.blue.skin, corner: 'blue' }),
  };
  els.ring.style.setProperty('--fighter-scale', FIGHTER_SCALE);
  for (const c of ['red', 'blue']) {
    els[c].style.setProperty('--feet-x', `${FEET[c].x}px`);
    els[c].style.setProperty('--feet-y', `${FEET[c].y}px`);
    els.names[c].textContent = fighters[c].name;
    sprites[c].play('idle');
  }

  const elapsedNow = () => (serverNow() - startAt) / 1000;
  // 재접속으로 중간부터 보는 경우 이미 지난 장면은 건너뛴다
  let started = exchangeIndexAt(script, elapsedNow());
  let impacted = started;
  if (started >= 0 && impactTime(script[started]) > elapsedNow()) impacted = started - 1;
  let finished = false;
  let raf = 0;

  const setHp = (hp) => {
    for (const c of ['red', 'blue']) els.hp[c].style.width = `${hp[c]}%`;
  };
  setHp(hpAt(script, elapsedNow()));
  els.caption.textContent = elapsedNow() < 0 ? '준비…' : '';
  if (elapsedNow() < 0) flash(els.banner, 'FIGHT!', 'fight');

  function onStart(ex) {
    sprites.red.play(moveAction(ex.red));
    sprites.blue.play(moveAction(ex.blue));
  }

  function onImpact(ex) {
    setHp(ex.hp);
    els.caption.textContent = describe(ex) + (ex.crit ? ' 크리티컬!' : '');
    for (const c of ['red', 'blue']) {
      const hit = hitAction(ex.dmg[c], ex.crit);
      if (hit) {
        sprites[c].play(hit);
        spawnEffect(els.ring, ex.crit ? 'crit_spark' : 'hit_spark', FEET[c].x, FEET[c].y - HIT_Y);
        floatText(els.ring, `-${ex.dmg[c]}`, FEET[c].x, FEET[c].y - TEXT_Y);
      }
    }
    if (ex.crit || hitAction(ex.dmg.red, false) === 'hit_heavy' || hitAction(ex.dmg.blue, false) === 'hit_heavy') {
      els.ringWrap.classList.remove('shake');
      void els.ringWrap.offsetWidth; // 애니메이션 재시작
      els.ringWrap.classList.add('shake');
    }
    if (ex.result === 'RED_BLOCK' || ex.result === 'BLUE_BLOCK') {
      const c = ex.result === 'RED_BLOCK' ? 'red' : 'blue';
      spawnEffect(els.ring, 'block_spark', FEET[c].x, FEET[c].y - HIT_Y);
    }
    if (ex.ko) showKo();
  }

  function showKo() {
    finished = true;
    const winner = ko === 'red' ? 'blue' : 'red';
    sprites[ko].play('ko');
    sprites[winner].play('victory');
    flash(els.banner, 'K.O.!', 'ko');
    setTimeout(() => onResult(winner), KO_MS);
  }

  function tick() {
    const elapsed = elapsedNow();
    while (started + 1 < script.length && script[started + 1].t <= elapsed) {
      started += 1;
      onStart(script[started]);
    }
    while (impacted < started && impactTime(script[impacted + 1]) <= elapsed) {
      impacted += 1;
      onImpact(script[impacted]);
    }
    if (!finished) raf = requestAnimationFrame(tick);
  }

  if (elapsedNow() > duration) {
    // 경기는 이미 끝남: 결과 상태로 바로 표시
    finished = true;
    setHp(script.at(-1).hp);
    const winner = ko === 'red' ? 'blue' : 'red';
    sprites[ko].play('ko');
    sprites[winner].play('victory');
    onResult(winner);
  } else {
    raf = requestAnimationFrame(tick);
  }

  return function stop() {
    cancelAnimationFrame(raf);
    sprites.red.stop();
    sprites.blue.stop();
  };
}

// ui/fight.png, ui/ko.png가 있으면 이미지, 없으면 글자
async function flash(el, text, kind) {
  const url = `assets/ui/${kind}.png`;
  el.innerHTML = '';
  if (await imageExists(url)) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = text;
    el.appendChild(img);
  } else {
    el.textContent = text;
  }
  el.className = `banner show ${kind}`;
  setTimeout(() => { el.className = 'banner'; }, 1500);
}

function floatText(container, text, x, y) {
  const el = document.createElement('div');
  el.className = 'float-text';
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 900);
}
