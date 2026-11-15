// HUD: every DOM readout. The sim never touches the DOM; it calls these setters
// and the HUD paints. Includes the buy menu, the minimap and the round banners.
import { MAP } from './mapdata.js';
import { WEAPONS, BUY_ORDER, ARMOR_PRICE, FRAG_PRICE, SMOKE_PRICE } from './weapons.js';

const $ = (id) => document.getElementById(id);

export function createHud(callbacks) {
  const minimap = $('minimap');
  const mapCtx = minimap.getContext('2d');
  const crosshair = $('crosshair');
  let buyOpen = false;
  let lastTimerSecond = -1;

  function setHealth(hp, armor) {
    $('health-value').textContent = String(Math.max(0, Math.ceil(hp)));
    $('armor-value').textContent = String(Math.max(0, Math.ceil(armor)));
    $('health-bar').style.width = `${Math.max(0, Math.min(100, hp))}%`;
    $('health').classList.toggle('low', hp <= 30);
  }

  function setAmmo(mag, reserve) {
    $('ammo-mag').textContent = String(mag);
    $('ammo-reserve').textContent = `/ ${reserve}`;
    $('ammo').classList.toggle('empty', mag === 0);
  }

  function setMoney(money) {
    $('money-value').textContent = `$${money}`;
  }

  function setWeaponName(name) {
    $('weapon-name').textContent = name;
  }

  function setTimer(seconds) {
    const whole = Math.max(0, Math.ceil(seconds));
    if (whole === lastTimerSecond) return;
    lastTimerSecond = whole;
    const minutes = Math.floor(whole / 60);
    const secs = whole % 60;
    $('timer-value').textContent = `${minutes}:${String(secs).padStart(2, '0')}`;
    $('timer').classList.toggle('urgent', whole <= 10 && whole > 0);
  }

  function setScore(vanguardRounds, jackalRounds, roundNumber) {
    $('score-vanguard').textContent = String(vanguardRounds);
    $('score-jackal').textContent = String(jackalRounds);
    $('round-label').textContent = `ROUND ${roundNumber} / 9`;
  }

  function setAlive(vanguardAlive, jackalAlive) {
    $('alive-vanguard').textContent = '●'.repeat(vanguardAlive) + '○'.repeat(5 - vanguardAlive);
    $('alive-jackal').textContent = '●'.repeat(jackalAlive) + '○'.repeat(5 - jackalAlive);
  }

  function setBomb(status, seconds) {
    const el = $('bomb-status');
    if (!status) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    if (status === 'planted') {
      el.textContent = `SPIKE PLANTED — ${Math.max(0, Math.ceil(seconds))}s`;
      el.className = 'bomb planted';
    } else if (status === 'planting') {
      el.textContent = 'PLANTING SPIKE…';
      el.className = 'bomb planting';
    } else if (status === 'defusing') {
      el.textContent = 'SPIKE BEING DEFUSED…';
      el.className = 'bomb defusing';
    }
  }

  function setCrosshairSpread(pixels) {
    const gap = 5 + Math.min(26, pixels);
    crosshair.style.setProperty('--gap', `${gap}px`);
  }

  function hitMarker(kill) {
    const el = $('hitmarker');
    el.classList.toggle('kill', kill);
    el.classList.add('on');
    window.clearTimeout(hitMarker.timer);
    hitMarker.timer = window.setTimeout(() => el.classList.remove('on'), kill ? 220 : 110);
  }

  function damageFlash(fromAngle) {
    const el = $('damage');
    el.style.setProperty('--angle', `${fromAngle}deg`);
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
  }

  function killfeedAdd(text, friendly) {
    const feed = $('killfeed');
    const line = document.createElement('div');
    line.className = friendly ? 'feed-friendly' : 'feed-enemy';
    line.textContent = text;
    feed.prepend(line);
    while (feed.children.length > 5) feed.removeChild(feed.lastChild);
    window.setTimeout(() => line.classList.add('fade'), 4200);
  }

  function showBanner(title, subtitle, tone) {
    const el = $('banner');
    $('banner-title').textContent = title;
    $('banner-sub').textContent = subtitle;
    el.className = `banner show ${tone ?? ''}`;
    window.clearTimeout(showBanner.timer);
    showBanner.timer = window.setTimeout(() => el.classList.remove('show'), 3400);
  }

  function hideBanner() {
    window.clearTimeout(showBanner.timer);
    $('banner').classList.remove('show');
  }

  function showOverlay(kind, data) {
    const overlay = $('overlay');
    const title = $('overlay-title');
    const copy = $('overlay-copy');
    const play = $('play');
    overlay.hidden = false;
    if (kind === 'start') {
      title.textContent = 'KESTREL YARD';
      copy.textContent = 'Vanguard attacks. Plant the spike at A or B, or wipe out the Jackals. First to 5 rounds takes the yard.';
      play.textContent = 'Deploy — click to play';
    } else if (kind === 'paused') {
      title.textContent = 'Paused';
      copy.textContent = 'Click to rejoin the round.';
      play.textContent = 'Resume';
    } else if (kind === 'round') {
      title.textContent = data.title;
      copy.textContent = data.copy;
      play.textContent = data.nextRound ? 'Next round' : 'See the result';
    } else if (kind === 'match') {
      title.textContent = data.title;
      copy.textContent = data.copy;
      play.textContent = 'Play again';
    }
  }

  function hideOverlay() {
    $('overlay').hidden = true;
  }

  // --- Buy menu -------------------------------------------------------------
  const buyItems = [
    ...BUY_ORDER.map((id, i) => ({ key: String(i + 1), id, label: WEAPONS[id].name, price: WEAPONS[id].price })),
    { key: '6', id: 'armor', label: 'Kevlar vest', price: ARMOR_PRICE },
    { key: '7', id: 'frag', label: 'Frag grenade', price: FRAG_PRICE },
    { key: '8', id: 'smoke', label: 'Smoke grenade', price: SMOKE_PRICE },
  ];

  function renderBuy(money, owned) {
    const list = $('buy-list');
    list.innerHTML = '';
    for (const item of buyItems) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'buy-row';
      const have = owned.has(item.id);
      row.disabled = have || money < item.price;
      row.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.label}</span><span class="buy-price">$${item.price}</span>`;
      row.addEventListener('click', () => callbacks.onBuy(item.id));
      list.appendChild(row);
    }
    $('buy-money').textContent = `$${money}`;
  }

  function showBuy(money, owned) {
    buyOpen = true;
    renderBuy(money, owned);
    $('buy').hidden = false;
  }

  function hideBuy() {
    buyOpen = false;
    $('buy').hidden = true;
  }

  function handleBuyKey(code, money, owned) {
    if (!buyOpen) return false;
    const digit = code.replace('Digit', '').replace('Numpad', '');
    const item = buyItems.find((entry) => entry.key === digit);
    if (!item) return false;
    if (owned.has(item.id) || money < item.price) return false;
    callbacks.onBuy(item.id);
    return true;
  }

  // --- Minimap --------------------------------------------------------------
  function drawMinimap(player, bots, revealedEnemies, spikePos) {
    const w = minimap.width;
    const h = minimap.height;
    const b = MAP.bounds;
    const sx = w / (b.maxX - b.minX);
    const sz = h / (b.maxZ - b.minZ);
    const toX = (x) => (x - b.minX) * sx;
    const toY = (z) => (z - b.minZ) * sz;
    mapCtx.clearRect(0, 0, w, h);
    mapCtx.fillStyle = 'rgba(20, 24, 28, 0.72)';
    mapCtx.fillRect(0, 0, w, h);
    mapCtx.fillStyle = '#5a5148';
    for (const box of MAP.boxes) {
      if (box.h < 2) continue;
      mapCtx.fillRect(toX(box.x - box.w / 2), toY(box.z - box.d / 2), Math.max(1, box.w * sx), Math.max(1, box.d * sz));
    }
    mapCtx.font = 'bold 11px system-ui, sans-serif';
    mapCtx.textAlign = 'center';
    mapCtx.fillStyle = '#d99a2b';
    mapCtx.fillText('A', toX(-19), toY(-13) + 4);
    mapCtx.fillStyle = '#2e7f7a';
    mapCtx.fillText('B', toX(19), toY(-13) + 4);
    if (spikePos) {
      mapCtx.fillStyle = '#ff5a3c';
      mapCtx.beginPath();
      mapCtx.arc(toX(spikePos.x), toY(spikePos.z), 4, 0, Math.PI * 2);
      mapCtx.fill();
    }
    const dot = (x, z, color, radius) => {
      mapCtx.fillStyle = color;
      mapCtx.beginPath();
      mapCtx.arc(toX(x), toY(z), radius, 0, Math.PI * 2);
      mapCtx.fill();
    };
    for (const bot of bots) {
      if (!bot.alive) continue;
      if (bot.team === 'vanguard') dot(bot.position.x, bot.position.z, '#3f7fd9', 3);
      else if (revealedEnemies.has(bot.id)) dot(bot.position.x, bot.position.z, '#d94f2e', 3);
    }
    // Player arrow.
    mapCtx.save();
    mapCtx.translate(toX(player.position.x), toY(player.position.z));
    mapCtx.rotate(Math.atan2(Math.sin(player.yaw), Math.cos(player.yaw)) + Math.PI);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.beginPath();
    mapCtx.moveTo(0, -5);
    mapCtx.lineTo(3.5, 4);
    mapCtx.lineTo(-3.5, 4);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();
  }

  $('play').addEventListener('click', () => callbacks.onPlay());
  $('buy-close').addEventListener('click', () => callbacks.onBuyClose());

  return {
    setHealth, setAmmo, setMoney, setWeaponName, setTimer, setScore, setAlive,
    setBomb, setCrosshairSpread, hitMarker, damageFlash, killfeedAdd,
    showBanner, hideBanner, showOverlay, hideOverlay,
    showBuy, hideBuy, renderBuy, handleBuyKey,
    drawMinimap,
    isBuyOpen: () => buyOpen,
  };
}
