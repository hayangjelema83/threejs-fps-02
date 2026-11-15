// World: turns MAP into three.js meshes, colliders and line-of-sight. One job: the
// static scene. Movement code asks it for colliders and LOS, nothing else.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP } from './mapdata.js';

const _ray = new THREE.Raycaster();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _dir = new THREE.Vector3();

function letterTexture(letter, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = color;
  ctx.font = 'bold 180px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 128, 140);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

export function createWorld(scene) {
  const colliders = [];
  const wallMeshes = [];
  const materials = new Map();
  const materialFor = (key) => {
    if (!materials.has(key)) {
      materials.set(key, new THREE.MeshStandardMaterial({ color: PALETTE[key], roughness: 0.9, metalness: 0.05 }));
    }
    return materials.get(key);
  };

  // Ground: two-tone sand with a darker centre strip.
  const groundMat = new THREE.MeshStandardMaterial({ color: PALETTE.ground, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(58, 46), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 46),
    new THREE.MeshStandardMaterial({ color: PALETTE.groundDark, roughness: 1 }),
  );
  strip.rotation.x = -Math.PI / 2;
  strip.position.y = 0.01;
  strip.receiveShadow = true;
  scene.add(strip);

  // Map boxes: one shared BoxGeometry, scaled per box.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const box of MAP.boxes) {
    const mesh = new THREE.Mesh(boxGeo, materialFor(box.c));
    mesh.position.set(box.x, box.h / 2, box.z);
    mesh.scale.set(box.w, box.h, box.d);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    wallMeshes.push(mesh);
    colliders.push({
      minX: box.x - box.w / 2, maxX: box.x + box.w / 2,
      minZ: box.z - box.d / 2, maxZ: box.z + box.d / 2,
      maxY: box.h,
    });
  }

  // Site floor decals: a coloured ring and a big letter, so each site reads at a glance.
  for (const key of ['A', 'B']) {
    const site = MAP.sites[key];
    const cx = (site.x0 + site.x1) / 2;
    const cz = (site.z0 + site.z1) / 2;
    const w = site.x1 - site.x0;
    const d = site.z1 - site.z0;
    const ring = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({ color: PALETTE[site.color], transparent: true, opacity: 0.16, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, 0.02, cz);
    scene.add(ring);
    const letter = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 4),
      new THREE.MeshBasicMaterial({
        map: letterTexture(site.label, key === 'A' ? '#d99a2b' : '#2e7f7a'),
        transparent: true, opacity: 0.9, depthWrite: false,
      }),
    );
    letter.rotation.x = -Math.PI / 2;
    letter.position.set(cx, 0.03, cz);
    scene.add(letter);
  }

  // Props: barrels and light poles. Pure decoration, no collision of their own
  // (barrels sit against walls; poles are thin and out of the lanes).
  const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.1, 12);
  const barrelMat = new THREE.MeshStandardMaterial({ color: PALETTE.rust, roughness: 0.7, metalness: 0.4 });
  const barrelSpots = [[-26, -20], [-25, 18], [26, 18], [26, -20], [-12, 20], [12, 20], [-26, 12], [26, -4]];
  for (const [x, z] of barrelSpots) {
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.position.set(x, 0.55, z);
    barrel.castShadow = true;
    scene.add(barrel);
  }
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.5, 8);
  const poleMat = new THREE.MeshStandardMaterial({ color: PALETTE.steel, roughness: 0.6, metalness: 0.6 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe6a8, emissive: 0xffc861, emissiveIntensity: 1.6 });
  const lampGeo = new THREE.SphereGeometry(0.28, 10, 8);
  for (const [x, z] of [[-14, 14], [14, 14], [-14, -10], [14, -10], [0, 12], [0, -16]]) {
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(x, 2.75, z);
    pole.castShadow = true;
    scene.add(pole);
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(x, 5.6, z);
    scene.add(lamp);
  }

  // Dusk light: low amber sun plus a cool sky fill.
  const sun = new THREE.DirectionalLight(0xffc98a, 2.7);
  sun.position.set(-30, 34, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -34;
  sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 100;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x8fa3bd, 0x5a4632, 1.15));

  // Move a circle (x, z) with radius r by (dx, dz), sliding along AABBs. Returns the
  // new position in the out array; axis-separated so corners slide instead of sticking.
  function moveCircle(x, z, dx, dz, radius, out) {
    let nx = x + dx;
    let nz = z + dz;
    const b = MAP.bounds;
    nx = Math.max(b.minX + radius, Math.min(b.maxX - radius, nx));
    nz = Math.max(b.minZ + radius, Math.min(b.maxZ - radius, nz));
    for (const c of colliders) {
      if (nz + radius > c.minZ && nz - radius < c.maxZ && nx + radius > c.minX && nx - radius < c.maxX) {
        if (dx > 0) nx = c.minX - radius; else if (dx < 0) nx = c.maxX + radius;
      }
    }
    for (const c of colliders) {
      if (nx + radius > c.minX && nx - radius < c.maxX && nz + radius > c.minZ && nz - radius < c.maxZ) {
        if (dz > 0) nz = c.minZ - radius; else if (dz < 0) nz = c.maxZ + radius;
      }
    }
    out[0] = nx;
    out[1] = nz;
    return out;
  }

  // True when nothing solid stands between a and b (eye-height segment). Smoke is
  // handled by the caller, which passes smokes to test as extra blockers.
  function hasLineOfSight(ax, ay, az, bx, by, bz, smokes) {
    _from.set(ax, ay, az);
    _to.set(bx, by, bz);
    _dir.subVectors(_to, _from);
    const distance = _dir.length();
    if (distance < 0.01) return true;
    _dir.multiplyScalar(1 / distance);
    _ray.set(_from, _dir);
    _ray.far = distance;
    if (_ray.intersectObjects(wallMeshes, false).length > 0) return false;
    if (smokes) {
      for (const smoke of smokes) {
        // Segment-sphere test against the smoke cloud.
        const cx = smoke.x - ax;
        const cy = smoke.y - ay;
        const cz = smoke.z - az;
        const t = Math.max(0, Math.min(distance, cx * _dir.x + cy * _dir.y + cz * _dir.z));
        const px = ax + _dir.x * t - smoke.x;
        const py = ay + _dir.y * t - smoke.y;
        const pz = az + _dir.z * t - smoke.z;
        if (px * px + py * py + pz * pz < smoke.radius * smoke.radius) return false;
      }
    }
    return true;
  }

  return { colliders, wallMeshes, moveCircle, hasLineOfSight };
}
