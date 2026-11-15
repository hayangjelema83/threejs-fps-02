// Bots: teammates and enemies with one shared brain. A bot picks a route on the
// waypoint graph, walks it, holds a position, or pushes a site; when it can see an
// enemy it stops, aims with a reaction time and an error that shrinks while it
// stands still, and fires in bursts. It also hears nearby gunfire and investigates,
// plants the spike when it carries it, and defuses when one is planted.
import * as THREE from 'three';
import { MAP } from './mapdata.js';
import { WEAPONS } from './weapons.js';

const EYE = 1.5;
const BODY_HEIGHT = 1.7;
const WALK_SPEED = 3.1;
const REACT_MIN = 0.35;
const REACT_MAX = 0.8;

// Breadth-first route on the waypoint graph, from the nearest node to `from`
// to the node nearest `to`. Returns node names.
export function findRoute(from, to) {
  const names = Object.keys(MAP.waypoints);
  const nearest = (point) => {
    let best = names[0];
    let bestDist = Infinity;
    for (const name of names) {
      const wp = MAP.waypoints[name];
      const d = (wp[0] - point[0]) ** 2 + (wp[1] - point[1]) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = name;
      }
    }
    return best;
  };
  const start = nearest(from);
  const goal = nearest(to);
  if (start === goal) return [goal];
  const prev = { [start]: null };
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const next of MAP.edges[current] ?? []) {
      if (!(next in prev)) {
        prev[next] = current;
        if (next === goal) {
          const route = [goal];
          let node = goal;
          while (prev[node] !== null) {
            node = prev[node];
            route.unshift(node);
          }
          return route;
        }
        queue.push(next);
      }
    }
  }
  return [goal];
}

function buildBody(scene, teamColor) {
  const group = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89a72, roughness: 0.8 });
  const parts = {};
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), suit);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);
  parts.torso = torso;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  parts.head = head;
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.38), dark);
  helmet.position.y = 1.78;
  group.add(helmet);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.78, 0.22), dark);
  legL.position.set(-0.14, 0.39, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.14;
  group.add(legR);
  parts.legL = legL;
  parts.legR = legR;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.55, 0.17), suit);
  armL.position.set(-0.33, 1.15, 0.08);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.33;
  group.add(armR);
  // Rifle held across the body.
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.72), dark);
  gun.position.set(0.12, 1.28, 0.3);
  group.add(gun);
  parts.gun = gun;
  // Team ring on the ground so the eye finds a bot at a glance.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.5, 24),
    new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  group.add(ring);
  scene.add(group);
  return { group, parts };
}

export function createBot(scene, world, combat, options) {
  const { id, name, team, random, onShoot, onHeardShot } = options;
  const teamColor = team === 'vanguard' ? 0x3f7fd9 : 0xd94f2e;
  const { group, parts } = buildBody(scene, teamColor);
  const weaponDef = WEAPONS[options.weaponId ?? 'rifle'];

  const bot = {
    id, name, team,
    alive: true,
    health: 100,
    armor: 0,
    position: { x: 0, y: 0, z: 0 },
    yaw: 0,
    speed: WALK_SPEED,
    weaponDef,
    // AI state
    mode: 'route', // route | hold | engage | plant | defuse | investigate | dead
    route: [],
    routeIndex: 0,
    routeGoal: null, // the [x, z] goTo was last asked for
    holdUntil: 0,
    target: null,
    aimError: 0.05,
    reactLeft: 0,
    burstLeft: 0,
    fireCooldown: 0,
    lastShotAt: -99,
    lastSeenAt: -99,
    lastSeenPos: { x: 0, y: 0, z: 0 },
    hasSpike: false,
    plantLeft: 0,
    defuseLeft: 0,
    walkPhase: 0,
    group,
    parts,
  };

  // Hit meshes: the raycaster reads userData.bot / userData.part.
  for (const [part, mesh] of [['head', parts.head], ['torso', parts.torso], ['legs', parts.legL], ['legs', parts.legR]]) {
    mesh.userData.bot = bot;
    mesh.userData.part = part;
    combat.addShootable(mesh);
  }

  function setPosition(x, z, yaw) {
    bot.position.x = x;
    bot.position.z = z;
    bot.yaw = yaw;
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
  }

  function goTo(point, randomize) {
    bot.route = findRoute([bot.position.x, bot.position.z], point);
    bot.routeGoal = point;
    if (randomize && bot.route.length > 2) bot.route.splice(1, 1); // vary the path a little
    bot.routeIndex = 0;
    bot.mode = 'route';
  }

  function hold(seconds, now) {
    bot.mode = 'hold';
    bot.holdUntil = now + seconds;
  }

  // Can this bot see the point (eye height), through walls and smoke?
  function canSee(point, smokes) {
    return world.hasLineOfSight(
      bot.position.x, EYE, bot.position.z,
      point.x, point.y, point.z, smokes,
    );
  }

  function damage(amount, part) {
    if (!bot.alive) return 0;
    let dealt = amount;
    if (bot.armor > 0) {
      const absorbed = Math.min(bot.armor, dealt * 0.5);
      bot.armor -= absorbed;
      dealt -= absorbed;
    }
    bot.health -= dealt;
    if (bot.health <= 0) {
      bot.health = 0;
      bot.alive = false;
      bot.mode = 'dead';
      group.rotation.x = -Math.PI / 2;
      group.position.y = 0.25;
      for (const mesh of [parts.head, parts.torso, parts.legL, parts.legR]) combat.removeShootable(mesh);
    }
    return dealt;
  }

  function revive(x, z, yaw, weaponId) {
    bot.alive = true;
    bot.health = 100;
    bot.armor = 0;
    bot.mode = 'route';
    bot.route = [];
    bot.routeGoal = null;
    bot.target = null;
    bot.hasSpike = false;
    bot.plantLeft = 0;
    bot.defuseLeft = 0;
    group.rotation.x = 0;
    group.position.y = 0;
    setPosition(x, z, yaw);
    bot.weaponDef = WEAPONS[weaponId ?? 'rifle'];
    for (const mesh of [parts.head, parts.torso, parts.legL, parts.legR]) combat.addShootable(mesh);
  }

  function step(dt, now, ctx) {
    if (!bot.alive) return;
    const { enemies, smokes, spikeSite, spikePlanted, spikePos } = ctx;
    bot.fireCooldown -= dt;

    // --- Pick what to look at: nearest visible enemy, else route direction.
    let visible = null;
    let visibleDist = Infinity;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.position.x - bot.position.x;
      const dz = enemy.position.z - bot.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 55) continue;
      const eyeY = enemy.isPlayer ? enemy.eyeY : EYE;
      if (canSee({ x: enemy.position.x, y: eyeY - 0.25, z: enemy.position.z }, smokes)) {
        if (dist < visibleDist) {
          visibleDist = dist;
          visible = enemy;
        }
      }
    }
    if (visible) {
      bot.lastSeenAt = now;
      bot.lastSeenPos.x = visible.position.x;
      bot.lastSeenPos.z = visible.position.z;
      if (bot.target !== visible) {
        bot.target = visible;
        bot.reactLeft = REACT_MIN + random() * (REACT_MAX - REACT_MIN);
        bot.aimError = 0.06 + visibleDist * 0.0012;
        bot.burstLeft = 0;
      }
    } else if (bot.target && now - bot.lastSeenAt > 1.6) {
      bot.target = null;
    }

    // --- Objective behaviour overrides movement when the spike is in play.
    if (bot.mode !== 'engage' && bot.mode !== 'plant' && bot.mode !== 'defuse') {
      if (spikePlanted && bot.team === 'jackal') {
        // Defenders push the planted site to defuse, abandoning whatever
        // route they were on: the spike is the whole round now.
        if (bot.mode !== 'defuse' && spikeSite) {
          const site = MAP.sites[spikeSite];
          const cx = (site.x0 + site.x1) / 2;
          const cz = (site.z0 + site.z1) / 2;
          const d = Math.hypot(cx - bot.position.x, cz - bot.position.z);
          const headingThere = bot.routeGoal && Math.hypot(bot.routeGoal[0] - cx, bot.routeGoal[1] - cz) < 1.5;
          if (d < 2.2) {
            bot.mode = 'defuse';
            bot.defuseLeft = 5;
          } else if (!headingThere || bot.route.length === 0) {
            goTo([cx, cz]);
          }
        }
      } else if (bot.hasSpike && bot.team === 'vanguard' && !spikePlanted) {
        const site = MAP.sites[bot.spikeSiteTarget ?? 'A'];
        const cx = (site.x0 + site.x1) / 2;
        const cz = (site.z0 + site.z1) / 2;
        const d = Math.hypot(cx - bot.position.x, cz - bot.position.z);
        const headingThere = bot.routeGoal && Math.hypot(bot.routeGoal[0] - cx, bot.routeGoal[1] - cz) < 1.5;
        if (d < 2.4 && !visible) {
          bot.mode = 'plant';
          bot.plantLeft = 4;
        } else if (!headingThere || bot.route.length === 0) {
          goTo([cx, cz]);
        }
      }
    }

    // --- Planting / defusing channels (broken by taking damage or seeing an enemy).
    if (bot.mode === 'plant') {
      if (visible || bot.plantLeft <= 0) {
        if (bot.plantLeft <= 0) ctx.onPlanted(bot);
        else bot.mode = 'route';
        bot.plantLeft = 0;
        return;
      }
      bot.plantLeft -= dt;
      facePoint(bot, spikePos ?? { x: bot.position.x, z: bot.position.z });
      return;
    }
    if (bot.mode === 'defuse') {
      if (visible || bot.defuseLeft <= 0) {
        if (bot.defuseLeft <= 0) ctx.onDefused(bot);
        else bot.mode = 'route';
        bot.defuseLeft = 0;
        return;
      }
      bot.defuseLeft -= dt;
      facePoint(bot, spikePos ?? { x: bot.position.x, z: bot.position.z });
      return;
    }

    // --- Engage: stand, aim, fire in bursts.
    if (bot.target) {
      bot.mode = 'engage';
      const t = bot.target;
      const tx = t.position.x;
      const tz = t.position.z;
      facePoint(bot, { x: tx, z: tz });
      // Aim error shrinks while standing still and the target stays visible.
      bot.aimError = Math.max(0.008, bot.aimError - dt * 0.03);
      if (bot.reactLeft > 0) {
        bot.reactLeft -= dt;
      } else if (bot.fireCooldown <= 0) {
        if (bot.burstLeft <= 0) bot.burstLeft = 3 + Math.floor(random() * 3);
        bot.burstLeft -= 1;
        bot.fireCooldown = bot.weaponDef.fireInterval * (1.6 + random() * 0.8);
        bot.lastShotAt = now;
        const eyeY = t.isPlayer ? t.eyeY : EYE;
        const hit = fireAt(bot, tx, eyeY - 0.2, tz, visibleDist, random, ctx);
        if (hit) onShoot(bot, hit);
        if (bot.burstLeft <= 0) bot.fireCooldown += 0.45 + random() * 0.5;
      }
      return;
    }

    // --- Hold: stay put and scan.
    if (bot.mode === 'hold') {
      if (now >= bot.holdUntil) bot.mode = 'route';
      bot.yaw += Math.sin(now * 0.5 + bot.id * 2) * dt * 0.35;
      group.rotation.y = bot.yaw;
      return;
    }

    // --- Route: walk the waypoint list.
    if (bot.mode === 'route' && bot.route.length > 0) {
      const node = MAP.waypoints[bot.route[bot.routeIndex]];
      if (!node) {
        bot.route = [];
        return;
      }
      const dx = node[0] - bot.position.x;
      const dz = node[1] - bot.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.7) {
        bot.routeIndex += 1;
        if (bot.routeIndex >= bot.route.length) {
          bot.route = [];
          if (bot.team === 'jackal' && ctx.defenderHold) hold(4 + random() * 6, now);
        }
        return;
      }
      const stepLen = Math.min(dist, bot.speed * dt);
      const nx = bot.position.x + (dx / dist) * stepLen;
      const nz = bot.position.z + (dz / dist) * stepLen;
      const out = [0, 0];
      world.moveCircle(bot.position.x, bot.position.z, nx - bot.position.x, nz - bot.position.z, 0.38, out);
      bot.position.x = out[0];
      bot.position.z = out[1];
      bot.yaw = Math.atan2(dx, dz);
      group.position.set(bot.position.x, 0, bot.position.z);
      group.rotation.y = bot.yaw;
      // Walk cycle: legs swing, body bobs.
      bot.walkPhase += dt * 9;
      const swing = Math.sin(bot.walkPhase) * 0.45;
      parts.legL.rotation.x = swing;
      parts.legR.rotation.x = -swing;
      group.position.y = Math.abs(Math.sin(bot.walkPhase)) * 0.04;
      return;
    }

    // Idle: nothing to do, face the map centre.
    parts.legL.rotation.x = 0;
    parts.legR.rotation.x = 0;
  }

  function facePoint(b, point) {
    const dx = point.x - b.position.x;
    const dz = point.z - b.position.z;
    b.yaw = Math.atan2(dx, dz);
    group.rotation.y = b.yaw;
  }

  // Ray vs the player's vertical capsule (the player has no hit meshes). Returns
  // {part, mult, point, t} when the ray passes within the capsule radius before
  // any wall, else null. `wallDist` is the nearest wall hit along the same ray.
  function rayPlayerCapsule(origin, dir, target, wallDist) {
    const px = target.position.x;
    const pz = target.position.z;
    const py = target.position.y;
    // Closest points between the ray (as a segment of length wallDist) and the
    // player's spine segment (py .. py + 1.7). Both segments are near-vertical
    // apart, so a sampled approach is stable and cheap: step along the ray.
    let bestT = 0;
    let bestD = Infinity;
    const maxT = Math.min(wallDist, 90);
    for (let t = 0; t <= maxT; t += 0.25) {
      const x = origin.x + dir.x * t;
      const y = origin.y + dir.y * t;
      const z = origin.z + dir.z * t;
      const cy = Math.max(py, Math.min(py + 1.7, y));
      const dx = x - px;
      const dy = y - cy;
      const dz = z - pz;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) {
        bestD = d;
        bestT = t;
      }
    }
    if (bestD > 0.42 * 0.42) return null;
    const hitY = origin.y + dir.y * bestT;
    const part = hitY > py + 1.35 ? 'head' : hitY < py + 0.75 ? 'legs' : 'torso';
    return {
      part,
      mult: part === 'head' ? 3 : part === 'torso' ? 1 : 0.75,
      point: new THREE.Vector3(origin.x + dir.x * bestT, hitY, origin.z + dir.z * bestT),
      t: bestT,
    };
  }

  // Fire one shot at a world point. Error grows with distance and target motion;
  // a hit applies damage through ctx.onBotHit / ctx.onPlayerHit and returns the
  // hit for tracers and sound.
  function fireAt(b, tx, ty, tz, distance, random, ctx) {
    const err = b.aimError + distance * 0.0009 + (b.target.moving ? 0.02 : 0);
    const dir = new THREE.Vector3(
      tx - b.position.x + (random() * 2 - 1) * err * distance,
      ty - EYE + (random() * 2 - 1) * err * distance * 0.5,
      tz - b.position.z + (random() * 2 - 1) * err * distance,
    ).normalize();
    const origin = new THREE.Vector3(b.position.x, EYE, b.position.z);
    const def = b.weaponDef;
    const hit = combat.shoot(origin, dir, def.range);
    if (hit && hit.bot) {
      if (hit.bot.team === b.team) return { hit, dealt: 0, from: origin };
      const partMult = hit.part === 'head' ? def.headMult : hit.part === 'torso' ? 1 : 0.75;
      const dealt = ctx.onBotHit(hit.bot, def.damage * partMult, hit.part, b);
      return { hit, dealt, from: origin };
    }
    if (b.target.isPlayer) {
      const wallDist = hit && hit.point ? hit.distance : Infinity;
      const capsule = rayPlayerCapsule(origin, dir, b.target, wallDist);
      if (capsule) {
        const dealt = ctx.onPlayerHit(def.damage * capsule.mult, capsule.part, b);
        return { hit: { point: capsule.point }, dealt, from: origin };
      }
    }
    if (hit && hit.point) {
      ctx.onWallHit?.(hit.point);
    }
    onHeardShot?.(b.position.x, b.position.z);
    return { hit, dealt: 0, from: origin };
  }

  return { bot, setPosition, goTo, hold, damage, revive, step, canSee };
}
