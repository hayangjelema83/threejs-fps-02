// Combat: hitscan resolution, tracers, impact dust, frag and smoke grenades.
// Hits are checked against bot body parts (head pays most) and the world; the
// nearest hit wins. Grenade damage needs line of sight from the blast.
import * as THREE from 'three';

const TRACER_COUNT = 24;
const PARTICLE_COUNT = 240;
const GRAVITY = 12;

export function createCombat(scene, world) {
  const raycaster = new THREE.Raycaster();
  const shootables = [];
  const direction = new THREE.Vector3();

  // --- Tracers: a fixed pool of two-point lines, reused, never allocated per shot.
  const tracers = [];
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  // --- Impact dust: one Points cloud, preallocated, dead particles parked below.
  const particleGeo = new THREE.BufferGeometry();
  const particlePos = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i += 1) particlePos[i * 3 + 1] = -100;
  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
  const particles = new THREE.Points(particleGeo, new THREE.PointsMaterial({
    color: 0xcbb28a, size: 0.14, transparent: true, opacity: 0.85, depthWrite: false,
  }));
  particles.frustumCulled = false;
  scene.add(particles);
  const particleVel = new Float32Array(PARTICLE_COUNT * 3);
  const particleLife = new Float32Array(PARTICLE_COUNT);
  let particleIndex = 0;

  // --- Explosion flash: one reusable sphere.
  const boomGeo = new THREE.SphereGeometry(1, 16, 12);
  const boomMat = new THREE.MeshBasicMaterial({ color: 0xff9a3d, transparent: true, opacity: 0, depthWrite: false });
  const boom = new THREE.Mesh(boomGeo, boomMat);
  boom.visible = false;
  scene.add(boom);
  let boomLife = 0;

  const grenades = [];
  const smokes = [];
  const smokeGeo = new THREE.IcosahedronGeometry(1, 1);
  const smokeMat = new THREE.MeshStandardMaterial({
    color: 0x9aa0a4, transparent: true, opacity: 0.32, roughness: 1, depthWrite: false,
  });

  function addShootable(mesh) {
    shootables.push(mesh);
  }
  function removeShootable(mesh) {
    const index = shootables.indexOf(mesh);
    if (index !== -1) shootables.splice(index, 1);
  }

  function spawnTracer(from, to, color) {
    const tracer = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % TRACER_COUNT;
    const pos = tracer.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    tracer.line.material.color.setHex(color);
    tracer.line.material.opacity = 0.9;
    tracer.life = 0.09;
  }

  function spawnDust(point, count, speed) {
    for (let n = 0; n < count; n += 1) {
      const i = particleIndex;
      particleIndex = (particleIndex + 1) % PARTICLE_COUNT;
      particlePos[i * 3] = point.x;
      particlePos[i * 3 + 1] = point.y;
      particlePos[i * 3 + 2] = point.z;
      particleVel[i * 3] = (Math.random() * 2 - 1) * speed;
      particleVel[i * 3 + 1] = Math.random() * speed * 0.8;
      particleVel[i * 3 + 2] = (Math.random() * 2 - 1) * speed;
      particleLife[i] = 0.5 + Math.random() * 0.3;
    }
    particleGeo.attributes.position.needsUpdate = true;
  }

  // One hitscan shot. Returns {bot, part, point, distance} or {point, distance} for
  // a wall hit, or null when nothing was hit within range.
  function shoot(origin, dir, range, excludeMeshes) {
    direction.copy(dir).normalize();
    raycaster.set(origin, direction);
    raycaster.far = range;
    const hits = raycaster.intersectObjects(shootables, false);
    const wallHits = raycaster.intersectObjects(world.wallMeshes, false);
    const firstBot = hits.length > 0 ? hits[0] : null;
    const firstWall = wallHits.length > 0 ? wallHits[0] : null;
    let end;
    let result = null;
    if (firstBot && (!firstWall || firstBot.distance < firstWall.distance)) {
      end = firstBot.point;
      result = { bot: firstBot.object.userData.bot, part: firstBot.object.userData.part, point: firstBot.point.clone(), distance: firstBot.distance };
    } else if (firstWall) {
      end = firstWall.point;
      result = { point: firstWall.point.clone(), distance: firstWall.distance };
      spawnDust(firstWall.point, 6, 1.6);
    } else {
      end = origin.clone().addScaledVector(direction, range);
    }
    spawnTracer(origin, end, 0xffd34d);
    return result;
  }

  function throwGrenade(kind, from, dir, onExplode) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 10, 8),
      new THREE.MeshStandardMaterial({ color: kind === 'frag' ? 0x3d5a2e : 0x8a8f94, roughness: 0.6 }),
    );
    mesh.position.copy(from);
    scene.add(mesh);
    grenades.push({
      kind, mesh,
      vel: new THREE.Vector3(dir.x * 14 + (Math.random() - 0.5), 4.5 + dir.y * 6, dir.z * 14),
      fuse: kind === 'frag' ? 1.6 : 0.9,
      bounced: false,
      onExplode,
    });
  }

  function explodeFrag(at, onDamage) {
    boom.position.copy(at);
    boom.scale.setScalar(0.5);
    boom.visible = true;
    boomLife = 0.35;
    spawnDust(at, 40, 6);
    onDamage(at, 7.5, 120, 20);
  }

  function deploySmoke(at) {
    const group = new THREE.Group();
    for (let i = 0; i < 3; i += 1) {
      const puff = new THREE.Mesh(smokeGeo, smokeMat);
      puff.position.set((Math.random() - 0.5) * 2.5, 1.1 + Math.random() * 0.8, (Math.random() - 0.5) * 2.5);
      puff.scale.setScalar(2.2 + Math.random() * 1.2);
      group.add(puff);
    }
    group.position.copy(at);
    scene.add(group);
    smokes.push({ x: at.x, y: 1.2, z: at.z, radius: 4.2, life: 14, group });
  }

  function step(dt) {
    for (const tracer of tracers) {
      if (tracer.life > 0) {
        tracer.life -= dt;
        tracer.line.material.opacity = Math.max(0, tracer.life / 0.09) * 0.9;
      }
    }
    let anyParticle = false;
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      if (particleLife[i] > 0) {
        anyParticle = true;
        particleLife[i] -= dt;
        particleVel[i * 3 + 1] -= 6 * dt;
        particlePos[i * 3] += particleVel[i * 3] * dt;
        particlePos[i * 3 + 1] += particleVel[i * 3 + 1] * dt;
        particlePos[i * 3 + 2] += particleVel[i * 3 + 2] * dt;
        if (particlePos[i * 3 + 1] < 0.05 || particleLife[i] <= 0) {
          particleLife[i] = 0;
          particlePos[i * 3 + 1] = -100;
        }
      }
    }
    if (anyParticle) particleGeo.attributes.position.needsUpdate = true;
    if (boomLife > 0) {
      boomLife -= dt;
      boom.scale.setScalar(0.5 + (0.35 - boomLife) * 22);
      boomMat.opacity = Math.max(0, boomLife / 0.35) * 0.75;
      if (boomLife <= 0) boom.visible = false;
    }
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.fuse -= dt;
      g.vel.y -= GRAVITY * dt;
      const prev = g.mesh.position.clone();
      g.mesh.position.addScaledVector(g.vel, dt);
      const p = g.mesh.position;
      if (p.y < 0.12) {
        p.y = 0.12;
        g.vel.y = Math.abs(g.vel.y) * 0.4;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
        g.bounced = true;
      }
      // Wall bounce: step back out of any collider and reflect the axis we hit.
      for (const c of world.colliders) {
        if (p.y < c.maxY && p.x > c.minX && p.x < c.maxX && p.z > c.minZ && p.z < c.maxZ) {
          p.copy(prev);
          if (Math.abs(g.vel.x) > Math.abs(g.vel.z)) g.vel.x *= -0.45; else g.vel.z *= -0.45;
          g.bounced = true;
        }
      }
      if (g.fuse <= 0) {
        const at = g.mesh.position.clone();
        scene.remove(g.mesh);
        grenades.splice(i, 1);
        if (g.kind === 'frag') explodeFrag(at, g.onExplode);
        else deploySmoke(at);
      }
    }
    for (let i = smokes.length - 1; i >= 0; i -= 1) {
      const s = smokes[i];
      s.life -= dt;
      if (s.life <= 0) {
        scene.remove(s.group);
        smokes.splice(i, 1);
      }
    }
  }

  function reset() {
    for (const g of grenades) scene.remove(g.mesh);
    grenades.length = 0;
    for (const s of smokes) scene.remove(s.group);
    smokes.length = 0;
    boom.visible = false;
    boomLife = 0;
  }

  return { addShootable, removeShootable, shoot, throwGrenade, spawnDust, step, reset, smokes, grenades };
}
