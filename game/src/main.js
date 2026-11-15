// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. ?shot=start|play|end with &seed=N sets up a deterministic
// frame for a capture, renders it twice, then freezes it and sets
// window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon } from './weapons.js';
import { createCombat } from './combat.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createGame } from './game.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(shot ? seed : (Date.now() % 2147483647));

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 30, 85);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const combat = createCombat(scene, world);
const audio = createAudio();
const player = createPlayer(world);
const weapon = createWeapon('pistol');
const hud = createHud({
  onPlay,
  onBuy: (itemId) => game.buy(itemId),
  onBuyClose: () => {
    hud.hideBuy();
    if (!shot) input.requestLock();
  },
});
const game = createGame({ scene, world, combat, player, weapon, hud, audio, random });
const input = createInput(renderer.domElement, onLockChange);

// --- Viewmodel rifle --------------------------------------------------------
const viewmodel = new THREE.Group();
const gunMetal = new THREE.MeshStandardMaterial({ color: 0x2c2f34, roughness: 0.45, metalness: 0.7 });
const gunAccent = new THREE.MeshStandardMaterial({ color: PALETTE.rust, roughness: 0.6, metalness: 0.3 });
function box(w, h, d, x, y, z, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat ?? gunMetal);
  mesh.position.set(x, y, z);
  viewmodel.add(mesh);
  return mesh;
}
box(0.09, 0.11, 0.62, 0, 0, 0, gunMetal); // receiver
box(0.05, 0.05, 0.34, 0, 0.02, -0.42, gunMetal); // barrel
box(0.07, 0.16, 0.1, 0, -0.1, 0.08, gunAccent); // grip
box(0.06, 0.1, 0.16, 0, -0.08, -0.18, gunMetal); // foregrip
box(0.08, 0.05, 0.2, 0, 0.08, -0.05, gunMetal); // sight rail
const muzzle = new THREE.Object3D();
muzzle.position.set(0, 0.02, -0.62);
viewmodel.add(muzzle);
const flash = new THREE.Mesh(
  new THREE.PlaneGeometry(0.22, 0.22),
  new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
);
flash.position.set(0, 0.02, -0.66);
viewmodel.add(flash);
const flashLight = new THREE.PointLight(0xffc861, 0, 6);
flashLight.position.set(0, 0, -0.6);
viewmodel.add(flashLight);
viewmodel.position.set(0.26, -0.24, -0.5);
camera.add(viewmodel);

const shootDir = new THREE.Vector3();
const shootOrigin = new THREE.Vector3();
const flashTimer = { value: 0 };
let prevFiring = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let fov = 74;

function onPlay() {
  if (shot) return;
  audio.unlock();
  const phase = game.state.phase;
  if (phase === 'menu' || phase === 'matchEnd') {
    game.restartMatch();
    hud.hideOverlay();
    input.requestLock();
  } else if (phase === 'roundEnd') {
    hud.hideOverlay();
    input.requestLock();
  } else {
    hud.hideOverlay();
    input.requestLock();
  }
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    hud.hideOverlay();
    audio.unlock();
  } else if (game.state.phase === 'live' || game.state.phase === 'freeze') {
    if (game.state.playerAlive) hud.showOverlay('paused');
  }
}

function syncCamera() {
  const body = player.state;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const body = player.state;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function playerShoot() {
  const def = weapon.state.def;
  const spread = weapon.spread(player.groundSpeed(), player.state.crouched, input.state.aiming);
  camera.getWorldDirection(shootDir);
  shootDir.x += (random() * 2 - 1) * spread;
  shootDir.y += (random() * 2 - 1) * spread;
  shootDir.z += (random() * 2 - 1) * spread;
  shootDir.normalize();
  shootOrigin.copy(camera.position);
  const pellets = def.pellets ?? 1;
  let anyHit = false;
  let anyKill = false;
  for (let p = 0; p < pellets; p += 1) {
    const dir = shootDir.clone();
    if (pellets > 1) {
      dir.x += (random() * 2 - 1) * spread * 2;
      dir.y += (random() * 2 - 1) * spread * 2;
      dir.normalize();
    }
    const hit = combat.shoot(shootOrigin, dir, def.range);
    if (hit && hit.bot) {
      const mult = hit.part === 'head' ? def.headMult : hit.part === 'torso' ? 1 : 0.75;
      const before = hit.bot.health;
      game.onBotHit(hit.bot, def.damage * mult, hit.part, { isPlayer: true, name: 'You' });
      anyHit = true;
      if (before > 0 && hit.bot.health <= 0) anyKill = true;
    }
  }
  weapon.takeRound();
  if (anyHit) hud.hitMarker(anyKill);
  audio.shot(def.id);
  player.recoil(def.recoil * (0.9 + random() * 0.2), (random() * 2 - 1) * def.recoil * 0.4);
  flash.material.opacity = 0.95;
  flashLight.intensity = 2.2;
  flashTimer.value = 0.045;
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
}

function step(dt) {
  const phase = game.state.phase;
  if (phase === 'live' && game.state.playerAlive) {
    player.step(dt, input.state.keys);
  } else if (phase === 'freeze' && game.state.playerAlive) {
    player.step(dt, input.state.keys);
  }
  weapon.step(dt);
  if (flashTimer.value > 0) {
    flashTimer.value -= dt;
    if (flashTimer.value <= 0) {
      flash.material.opacity = 0;
      flashLight.intensity = 0;
    }
  }
  game.step(dt, input);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    const phase = game.state.phase;
    const canAct = (phase === 'live' || phase === 'freeze') && game.state.playerAlive;
    if (canAct) {
      const firing = input.state.firing;
      const wantShot = weapon.state.def.auto ? firing : firing && !prevFiring;
      if (wantShot) {
        if (weapon.ready()) playerShoot();
        else if (weapon.state.mag === 0 && weapon.state.reloadLeft <= 0) audio.dryFire();
      }
      prevFiring = firing;
      if (input.state.keys.has('KeyR')) weapon.reload();
      // Buy menu keys (edge-triggered: consumed on use).
      if (hud.isBuyOpen()) {
        for (const code of [...input.state.keys]) {
          if (code.startsWith('Digit') || code.startsWith('Numpad')) {
            hud.handleBuyKey(code, game.state.money, game.ownedItems());
            input.state.keys.delete(code);
          }
        }
      }
      if (input.state.keys.has('KeyB') && phase === 'freeze') {
        input.state.keys.delete('KeyB');
        if (hud.isBuyOpen()) hud.hideBuy();
        else hud.showBuy(game.state.money, game.ownedItems());
      }
      if (input.state.keys.has('KeyM')) {
        input.state.keys.delete('KeyM');
        audio.toggleMute();
      }
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    // ADS: narrow the field of view and centre the rifle.
    const targetFov = input.state.aiming && canAct ? 55 : 74;
    fov += (targetFov - fov) * Math.min(1, dt * 10);
    camera.fov = fov;
    camera.updateProjectionMatrix();
    const ads = input.state.aiming && canAct ? 1 : 0;
    viewmodel.position.x += ((ads ? 0 : 0.26) - viewmodel.position.x) * Math.min(1, dt * 12);
    viewmodel.position.y += ((ads ? -0.155 : -0.24) - viewmodel.position.y) * Math.min(1, dt * 12);
    // Walk bob.
    const speed = player.groundSpeed();
    const bob = Math.min(1, speed / 4.6) * 0.012;
    viewmodel.position.y += Math.sin(performance.now() * 0.011) * bob;
    // Crosshair gap follows the live spread.
    const spread = weapon.spread(speed, player.state.crouched, input.state.aiming);
    hud.setCrosshairSpread(spread * 900);
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  if (name === 'start') {
    // Menu frame: from mid-north looking south-west into the sunlit sand, so
    // the yard reads behind the panel.
    game.restartMatch();
    hud.hideBanner();
    player.reset(6, -10, 2.6);
    settle(30);
    aimAt(new THREE.Vector3(-8, 1.0, 12));
    hud.showOverlay('start');
    hud.hideBuy();
  } else if (name === 'play') {
    // Mid-round frame: rifle out, a Jackal in the sights up the east side of
    // mid (clear of the silo), HUD live, no banner in the way.
    game.restartMatch();
    hud.hideBuy();
    hud.hideBanner();
    game.state.phase = 'live';
    game.state.timer = 82;
    game.state.money = 2650;
    weapon.swap('rifle');
    weapon.refill();
    hud.setWeaponName('Rifle');
    hud.setMoney(2650);
    player.reset(3.5, 8.5, 0);
    settle(10);
    const jackals = game.botWrappers.filter((w) => w.bot.team === 'jackal');
    jackals[0].bot.alive = true;
    jackals[0].setPosition(4.6, -6.5, Math.PI * 0.9);
    jackals[1].setPosition(-3.5, -9, Math.PI * 1.05);
    jackals[2].setPosition(-4.5, -12, Math.PI);
    settle(24);
    aimAt(new THREE.Vector3(4.6, 1.35, -6.5));
    playerShoot();
    settle(6);
    aimAt(new THREE.Vector3(4.6, 1.35, -6.5));
    settle(2);
    hud.setScore(2, 1, 4);
    hud.setAlive(5, 4);
    hud.setTimer(82);
  } else {
    // Buy-phase frame: round won, shop open, money in hand.
    game.restartMatch();
    game.state.vanguardRounds = 4;
    game.state.jackalRounds = 2;
    game.state.round = 7;
    game.state.money = 5150;
    game.state.frags = 1;
    weapon.swap('rifle');
    weapon.refill();
    hud.setWeaponName('Rifle');
    hud.setMoney(5150);
    hud.setScore(4, 2, 7);
    player.reset(-3, 17.5, 0.35);
    settle(30);
    aimAt(new THREE.Vector3(0, 1.6, -6));
    hud.hideBanner();
    hud.showBuy(5150, game.ownedItems());
  }
  hud.setHealth(game.state.health, game.state.armor);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
if (shot) {
  runShot(shot);
} else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
