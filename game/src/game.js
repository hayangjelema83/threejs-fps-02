// Game: the match itself. Rounds, the economy, the spike, the buy menu and win
// conditions live here; the player and the bots are just actors it directs.
// Vanguard (the player) attacks; Jackals defend. First to 5 rounds wins the match.
import * as THREE from 'three';
import { MAP } from './mapdata.js';
import { createBot } from './bots.js';
import { WEAPONS, ARMOR_PRICE, FRAG_PRICE, SMOKE_PRICE } from './weapons.js';
import { pick } from './rng.js';

const FREEZE_SECONDS = 12;
const ROUND_SECONDS = 100;
const BOMB_SECONDS = 40;
const WIN_ROUNDS = 5;
const MAX_ROUNDS = 9;
const PLANT_SECONDS = 4;
const DEFUSE_SECONDS = 5;
const KILL_REWARD = 300;
const WIN_REWARD = 3250;
const LOSS_REWARD = 1900;
const LOSS_STREAK_BONUS = 500;

const VANGUARD_NAMES = ['Rook', 'Sable', 'Iris', 'Moss'];
const JACKAL_NAMES = ['Vex', 'Hound', 'Brick', 'Fable', 'Zero'];

export function createGame(deps) {
  const { scene, world, combat, player, weapon, hud, audio, random } = deps;

  const state = {
    phase: 'menu', // menu | freeze | live | roundEnd | matchEnd
    round: 1,
    vanguardRounds: 0,
    jackalRounds: 0,
    timer: ROUND_SECONDS,
    freezeLeft: 0,
    roundEndLeft: 0,
    money: 800,
    health: 100,
    armor: 0,
    frags: 0,
    smokes: 0,
    lossStreak: 0,
    playerAlive: true,
    hasSpike: true,
    spikePlanted: false,
    spikeSite: null,
    spikePos: null,
    bombLeft: 0,
    plantLeft: 0,
    defuseLeft: 0,
    kills: 0,
    deaths: 0,
    elapsed: 0,
  };

  // --- Actors ---------------------------------------------------------------
  const botWrappers = [];
  const botByState = new Map();
  const playerTarget = {
    position: player.state.position,
    alive: true,
    isPlayer: true,
    eyeY: 1.62,
    moving: false,
    team: 'vanguard',
    name: 'You',
  };

  function spawnBots() {
    const defs = [];
    for (let i = 0; i < 4; i += 1) {
      defs.push({ team: 'vanguard', name: VANGUARD_NAMES[i], index: i });
    }
    for (let i = 0; i < 5; i += 1) {
      defs.push({ team: 'jackal', name: JACKAL_NAMES[i], index: i });
    }
    for (const def of defs) {
      const wrapper = createBot(scene, world, combat, {
        id: botWrappers.length,
        name: def.name,
        team: def.team,
        random,
        weaponId: 'rifle',
        onShoot: (bot, hit) => {
          audio.distantShot();
          revealEnemy(bot.id);
        },
        onHeardShot: (x, z) => {
          // Nearby bots investigate gunfire they hear.
          for (const other of botWrappers) {
            const b = other.bot;
            if (!b.alive || b.mode === 'engage' || b.mode === 'plant' || b.mode === 'defuse') continue;
            const d = Math.hypot(x - b.position.x, z - b.position.z);
            if (d < 14 && Math.hypot(x - b.position.x, z - b.position.z) > 3) {
              other.goTo([x + (random() - 0.5) * 2, z + (random() - 0.5) * 2]);
            }
          }
        },
      });
      botWrappers.push(wrapper);
      botByState.set(wrapper.bot, wrapper);
    }
  }
  spawnBots();

  const revealedEnemies = new Set();
  const revealTimers = new Map();
  function revealEnemy(id) {
    revealedEnemies.add(id);
    window.clearTimeout(revealTimers.get(id));
    revealTimers.set(id, window.setTimeout(() => revealedEnemies.delete(id), 2500));
  }

  function aliveBots(team) {
    return botWrappers.filter((w) => w.bot.team === team && w.bot.alive);
  }
  function aliveCount(team) {
    if (team === 'vanguard') return aliveBots('vanguard').length + (state.playerAlive ? 1 : 0);
    return aliveBots('jackal').length;
  }

  // --- Damage ---------------------------------------------------------------
  function damagePlayer(amount, part, attacker) {
    if (!state.playerAlive) return 0;
    let dealt = amount;
    if (state.armor > 0) {
      const absorbed = Math.min(state.armor, dealt * 0.5);
      state.armor -= absorbed;
      dealt -= absorbed;
    }
    state.health -= dealt;
    audio.hurt();
    const dx = attacker.position.x - player.state.position.x;
    const dz = attacker.position.z - player.state.position.z;
    const angle = (Math.atan2(dx, dz) - player.state.yaw) * (180 / Math.PI);
    hud.damageFlash(angle);
    hud.setHealth(state.health, state.armor);
    if (state.health <= 0) {
      state.health = 0;
      state.playerAlive = false;
      playerTarget.alive = false;
      state.deaths += 1;
      hud.killfeedAdd(`${attacker.name} ▸ You`, false);
      hud.showBanner('You were eliminated', 'Your squad fights on — the round continues.', 'bad');
      if (state.hasSpike) {
        state.hasSpike = false;
        passSpikeToBot();
      }
    }
    return dealt;
  }

  function passSpikeToBot() {
    const carriers = aliveBots('vanguard');
    if (carriers.length === 0) return;
    const carrier = pick(random, carriers);
    carrier.bot.hasSpike = true;
    carrier.bot.spikeSiteTarget = pick(random, ['A', 'B']);
    carrier.goTo([0, 6]);
    state.spikePos = { x: carrier.bot.position.x, z: carrier.bot.position.z };
    hud.killfeedAdd(`${carrier.bot.name} picked up the spike`, true);
  }

  function onBotHit(botState, amount, part, attacker) {
    const wrapper = botByState.get(botState);
    if (!wrapper) return 0;
    const dealt = wrapper.damage(amount, part);
    if (botState.team === 'jackal') revealEnemy(botState.id);
    if (!botState.alive) {
      const killer = attacker.isPlayer ? 'You' : attacker.name;
      hud.killfeedAdd(`${killer} ▸ ${botState.name}${part === 'head' ? ' (headshot)' : ''}`, attacker.isPlayer);
      if (attacker.isPlayer) {
        state.kills += 1;
        state.money += KILL_REWARD;
        hud.setMoney(state.money);
        audio.kill();
      }
      if (botState.hasSpike) {
        botState.hasSpike = false;
        passSpikeToBot();
      }
    } else if (attacker.isPlayer) {
      audio.hit();
    }
    hud.setAlive(aliveCount('vanguard'), aliveCount('jackal'));
    return dealt;
  }

  function onPlayerHit(amount, part, attacker) {
    return damagePlayer(amount, part, attacker.bot ?? attacker);
  }

  // --- Grenade splash -------------------------------------------------------
  function grenadeDamage(at, radius, maxDamage, minDamage) {
    const targets = [];
    if (state.playerAlive) targets.push(playerTarget);
    for (const w of botWrappers) if (w.bot.alive) targets.push(w.bot);
    for (const target of targets) {
      const dx = target.position.x - at.x;
      const dz = target.position.z - at.z;
      const dist = Math.hypot(dx, dz);
      if (dist > radius) continue;
      const eyeY = target.isPlayer ? 1.4 : 1.5;
      if (!world.hasLineOfSight(at.x, at.y + 0.3, at.z, target.position.x, eyeY, target.position.z, combat.smokes)) continue;
      const falloff = 1 - (dist / radius) * 0.8;
      const damage = Math.max(minDamage, maxDamage * falloff);
      if (target.isPlayer) damagePlayer(damage, 'torso', { name: 'Frag', position: at });
      else onBotHit(target, damage, 'torso', { isPlayer: false, name: 'Frag' });
    }
    audio.explosion();
  }

  // --- Rounds ---------------------------------------------------------------
  function botWeaponForRound(round) {
    if (round <= 1) return pick(random, ['pistol', 'smg']);
    if (round === 2) return pick(random, ['smg', 'rifle', 'shotgun']);
    return pick(random, ['rifle', 'rifle', 'rifle', 'sniper', 'shotgun', 'smg']);
  }

  function startRound() {
    state.phase = 'freeze';
    state.freezeLeft = FREEZE_SECONDS;
    state.timer = ROUND_SECONDS;
    state.spikePlanted = false;
    state.spikeSite = null;
    state.spikePos = null;
    state.bombLeft = 0;
    state.plantLeft = 0;
    state.defuseLeft = 0;
    state.playerAlive = true;
    state.hasSpike = true;
    state.health = 100;
    state.armor = state.armor > 0 ? 50 : 0; // vest carries half into the next round
    playerTarget.alive = true;
    combat.reset();
    weapon.refill();
    // Player spawns facing north (yaw 0 looks down -Z, towards mid), spike in hand.
    const spawn = MAP.spawns.vanguard[2];
    player.reset(spawn[0], spawn[1], 0);
    playerTarget.eyeY = 1.62;
    // Bots to their spawns.
    const vSpawns = MAP.spawns.vanguard;
    const jSpawns = MAP.spawns.jackal;
    let vi = 0;
    let ji = 0;
    for (const wrapper of botWrappers) {
      const spawnPoint = wrapper.bot.team === 'vanguard' ? vSpawns[vi++] : jSpawns[ji++];
      wrapper.revive(spawnPoint[0], spawnPoint[1], wrapper.bot.team === 'vanguard' ? Math.PI : 0, botWeaponForRound(state.round));
      wrapper.bot.hasSpike = false;
    }
    // Defenders walk to holds; attackers wait for the freeze to lift.
    const holds = [...MAP.defenderHolds];
    for (const wrapper of aliveBots('jackal')) {
      const holdName = holds.splice(Math.floor(random() * holds.length), 1)[0];
      wrapper.goTo(MAP.waypoints[holdName]);
    }
    hud.setHealth(state.health, state.armor);
    hud.setAmmo(weapon.state.mag, weapon.state.reserve);
    hud.setWeaponName(weapon.state.def.name);
    hud.setMoney(state.money);
    hud.setScore(state.vanguardRounds, state.jackalRounds, state.round);
    hud.setAlive(5, 5);
    hud.setBomb(null);
    hud.setTimer(ROUND_SECONDS);
    hud.showBuy(state.money, ownedItems());
    hud.showBanner(`Round ${state.round}`, 'Buy phase — press B to open the shop, E to plant the spike.', '');
  }

  function ownedItems() {
    const owned = new Set();
    owned.add(weapon.state.def.id);
    if (state.armor > 0) owned.add('armor');
    if (state.frags > 0) owned.add('frag');
    if (state.smokes > 0) owned.add('smoke');
    return owned;
  }

  function buy(itemId) {
    if (state.phase !== 'freeze') return false;
    const prices = { armor: ARMOR_PRICE, frag: FRAG_PRICE, smoke: SMOKE_PRICE };
    if (WEAPONS[itemId]) {
      const def = WEAPONS[itemId];
      if (state.money < def.price) return false;
      state.money -= def.price;
      weapon.swap(itemId);
      hud.setWeaponName(def.name);
      hud.setAmmo(weapon.state.mag, weapon.state.reserve);
    } else if (itemId === 'armor') {
      if (state.money < ARMOR_PRICE || state.armor >= 100) return false;
      state.money -= ARMOR_PRICE;
      state.armor = 100;
      hud.setHealth(state.health, state.armor);
    } else if (itemId === 'frag') {
      if (state.money < FRAG_PRICE || state.frags >= 2) return false;
      state.money -= FRAG_PRICE;
      state.frags += 1;
    } else if (itemId === 'smoke') {
      if (state.money < SMOKE_PRICE || state.smokes >= 2) return false;
      state.money -= SMOKE_PRICE;
      state.smokes += 1;
    } else {
      return false;
    }
    audio.buy();
    hud.setMoney(state.money);
    hud.renderBuy(state.money, ownedItems());
    return true;
  }

  function endRound(winner, reason) {
    if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
    state.phase = 'roundEnd';
    state.roundEndLeft = 4.5;
    if (winner === 'vanguard') {
      state.vanguardRounds += 1;
      state.money += WIN_REWARD;
      state.lossStreak = 0;
      audio.roundWin();
      hud.showBanner('Vanguard takes the round', reason, 'good');
    } else {
      state.jackalRounds += 1;
      state.money += Math.min(3400, LOSS_REWARD + state.lossStreak * LOSS_STREAK_BONUS);
      state.lossStreak += 1;
      audio.roundLose();
      hud.showBanner('Jackals take the round', reason, 'bad');
    }
    hud.setMoney(state.money);
    hud.setScore(state.vanguardRounds, state.jackalRounds, state.round);
    hud.hideBuy();
    hud.setBomb(null);
  }

  function checkRoundEnd() {
    if (state.phase !== 'live') return;
    const vanguardAlive = aliveCount('vanguard');
    const jackalAlive = aliveCount('jackal');
    if (jackalAlive === 0) {
      endRound('vanguard', state.spikePlanted ? 'Spike detonated — the yard is ours.' : 'Jackals eliminated.');
      return;
    }
    if (vanguardAlive === 0) {
      if (state.spikePlanted) {
        // Spike still ticks: defenders must defuse before it blows.
        return;
      }
      endRound('jackal', 'Vanguard eliminated.');
    }
  }

  function plantSpike(siteKey, byBot) {
    state.spikePlanted = true;
    state.spikeSite = siteKey;
    state.bombLeft = BOMB_SECONDS;
    const site = MAP.sites[siteKey];
    state.spikePos = { x: (site.x0 + site.x1) / 2, z: (site.z0 + site.z1) / 2 };
    if (byBot) byBot.hasSpike = false;
    else {
      state.hasSpike = false;
      state.money += KILL_REWARD;
      hud.setMoney(state.money);
    }
    hud.setBomb('planted', BOMB_SECONDS);
    hud.showBanner('Spike planted', `Detonation in ${BOMB_SECONDS}s — Jackals must defuse.`, 'good');
    audio.plantBeep();
  }

  function defuseSpike() {
    state.spikePlanted = false;
    endRound('jackal', 'Spike defused.');
  }

  // --- Player actions -------------------------------------------------------
  function tryPlant(dt, holding) {
    if (!state.playerAlive || state.spikePlanted || !state.hasSpike) return;
    const site = siteAt(player.state.position.x, player.state.position.z);
    if (!site) {
      state.plantLeft = 0;
      return;
    }
    if (!holding) {
      state.plantLeft = 0;
      return;
    }
    state.plantLeft += dt;
    hud.setBomb('planting');
    if (state.plantLeft >= PLANT_SECONDS) {
      state.plantLeft = 0;
      plantSpike(site, false);
    }
  }

  function siteAt(x, z) {
    for (const key of ['A', 'B']) {
      const s = MAP.sites[key];
      if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return key;
    }
    return null;
  }

  function throwGrenade(kind, origin, dir) {
    if (kind === 'frag' && state.frags <= 0) return;
    if (kind === 'smoke' && state.smokes <= 0) return;
    if (kind === 'frag') state.frags -= 1; else state.smokes -= 1;
    combat.throwGrenade(kind, origin, dir, (at, radius, maxDamage, minDamage) => grenadeDamage(at, radius, maxDamage, minDamage));
    audio.click();
  }

  // --- Main step ------------------------------------------------------------
  function step(dt, input) {
    state.elapsed += dt;
    const now = state.elapsed;

    if (state.phase === 'freeze') {
      state.freezeLeft -= dt;
      hud.setTimer(state.freezeLeft);
      hud.drawMinimap(player.state, botWrappers.map((w) => w.bot), revealedEnemies, null);
      if (state.freezeLeft <= 0) {
        state.phase = 'live';
        hud.hideBuy();
        hud.showBanner('Go!', 'Plant the spike or eliminate the Jackals.', '');
      }
      return;
    }
    if (state.phase === 'roundEnd') {
      state.roundEndLeft -= dt;
      // Bots keep moving during the breather so the scene stays alive.
      stepBots(dt, now);
      if (state.roundEndLeft <= 0) {
        if (state.vanguardRounds >= WIN_ROUNDS || state.jackalRounds >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
          endMatch();
        } else {
          state.round += 1;
          startRound();
        }
      }
      return;
    }
    if (state.phase !== 'live') return;

    // Timer and bomb.
    state.timer -= dt;
    if (state.spikePlanted) {
      state.bombLeft -= dt;
      hud.setBomb('planted', state.bombLeft);
      if (state.bombLeft <= 0) {
        endRound('vanguard', 'Spike detonated.');
        return;
      }
    } else {
      hud.setTimer(state.timer);
      if (state.timer <= 0) {
        endRound('jackal', 'Time expired — the spike was never planted.');
        return;
      }
    }

    // Planting (player holds E inside a site).
    tryPlant(dt, input.state.keys.has('KeyE'));

    // Grenade throws.
    if (input.state.keys.has('KeyQ')) {
      input.state.keys.delete('KeyQ');
      const dir = new THREE.Vector3(0, 0, 0);
      throwGrenade('frag', cameraEye(), playerLookDir(dir));
    }
    if (input.state.keys.has('KeyG')) {
      input.state.keys.delete('KeyG');
      const dir = new THREE.Vector3(0, 0, 0);
      throwGrenade('smoke', cameraEye(), playerLookDir(dir));
    }

    playerTarget.moving = player.groundSpeed() > 0.5;
    playerTarget.eyeY = player.state.position.y + player.state.eye;
    stepBots(dt, now);
    combat.step(dt);
    checkRoundEnd();
  }

  function cameraEye() {
    return new THREE.Vector3(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
  }

  function playerLookDir(out) {
    const yaw = player.state.yaw;
    const pitch = player.state.pitch;
    out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    return out;
  }

  function stepBots(dt, now) {
    const enemiesFor = (team) => {
      const list = [];
      for (const w of botWrappers) {
        if (w.bot.team !== team && w.bot.alive) list.push(w.bot);
      }
      if (team === 'jackal' && state.playerAlive) list.push(playerTarget);
      return list;
    };
    for (const wrapper of botWrappers) {
      if (!wrapper.bot.alive) continue;
      const team = wrapper.bot.team;
      wrapper.step(dt, now, {
        enemies: enemiesFor(team),
        smokes: combat.smokes,
        spikeSite: state.spikeSite,
        spikePlanted: state.spikePlanted,
        spikePos: state.spikePos,
        defenderHold: team === 'jackal',
        onPlanted: (bot) => plantSpike(bot.spikeSiteTarget ?? 'A', bot),
        onDefused: () => defuseSpike(),
        onBotHit,
        onPlayerHit,
        onWallHit: () => {},
      });
    }
    // Minimap refresh (cheap: 2D canvas, once per step is fine at 60 Hz for 9 bots).
    hud.drawMinimap(player.state, botWrappers.map((w) => w.bot), revealedEnemies, state.spikePlanted ? state.spikePos : null);
  }

  function endMatch() {
    state.phase = 'matchEnd';
    const won = state.vanguardRounds > state.jackalRounds;
    hud.showOverlay('match', {
      title: won ? 'Vanguard wins the match' : 'Jackals win the match',
      copy: `${state.vanguardRounds} — ${state.jackalRounds} after ${state.round} rounds. ${state.kills} eliminations, ${state.deaths} deaths.`,
    });
  }

  function restartMatch() {
    state.round = 1;
    state.vanguardRounds = 0;
    state.jackalRounds = 0;
    state.money = 800;
    state.kills = 0;
    state.deaths = 0;
    state.lossStreak = 0;
    state.frags = 0;
    state.smokes = 0;
    state.armor = 0;
    weapon.swap('pistol');
    startRound();
  }

  return {
    state, buy, startRound, restartMatch, step, endRound,
    botWrappers, playerTarget, revealedEnemies,
    cameraEye, playerLookDir, grenadeDamage,
    ownedItems,
    onBotHit, onPlayerHit,
  };
}
