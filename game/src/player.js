// Player: first-person movement with acceleration, friction, crouch, jump and
// AABB collision through world.moveCircle. Fixed-step only: step(dt, keys).
import { clamp } from './rng.js';

const RADIUS = 0.38;
const EYE_STAND = 1.62;
const EYE_CROUCH = 1.05;
const WALK_SPEED = 4.6;
const CROUCH_SPEED = 2.3;
const GRAVITY = 22;
const JUMP_SPEED = 7.2;

export function createPlayer(world) {
  const state = {
    position: { x: 0, y: 0, z: 18 },
    velocity: { x: 0, z: 0 },
    vy: 0,
    yaw: 0,
    pitch: 0,
    eye: EYE_STAND,
    crouched: false,
    grounded: true,
    recoilPitch: 0,
    recoilYaw: 0,
  };
  const out = [0, 0];

  function look(dx, dy) {
    state.yaw -= dx * 0.0021;
    state.pitch = clamp(state.pitch - dy * 0.0021, -1.45, 1.45);
  }

  function step(dt, keys) {
    // Recoil decays back to zero.
    state.recoilPitch *= Math.pow(0.0001, dt);
    state.recoilYaw *= Math.pow(0.0001, dt);

    const wantCrouch = keys.has('ControlLeft') || keys.has('KeyC');
    state.crouched = wantCrouch;
    const targetEye = wantCrouch ? EYE_CROUCH : EYE_STAND;
    state.eye += (targetEye - state.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const speed = wantCrouch ? CROUCH_SPEED : WALK_SPEED;
    const sin = Math.sin(state.yaw);
    const cos = Math.cos(state.yaw);
    // Forward is -Z rotated by yaw; strafe is perpendicular.
    let wishX = (-sin * forward + cos * strafe) * speed;
    let wishZ = (-cos * forward - sin * strafe) * speed;
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > speed) {
      wishX = (wishX / wishLen) * speed;
      wishZ = (wishZ / wishLen) * speed;
    }
    // Exponential approach to the wish velocity: snappy but never instant, so
    // stopping to aim is a real choice and strafing has weight.
    const blend = 1 - Math.exp(-(wishLen > 0.01 ? 10 : 12) * dt);
    state.velocity.x += (wishX - state.velocity.x) * blend;
    state.velocity.z += (wishZ - state.velocity.z) * blend;

    world.moveCircle(state.position.x, state.position.z, state.velocity.x * dt, state.velocity.z * dt, RADIUS, out);
    state.position.x = out[0];
    state.position.z = out[1];

    if (keys.has('Space') && state.grounded) {
      state.vy = JUMP_SPEED;
      state.grounded = false;
    }
    if (!state.grounded) {
      state.vy -= GRAVITY * dt;
      state.position.y += state.vy * dt;
      if (state.position.y <= 0) {
        state.position.y = 0;
        state.vy = 0;
        state.grounded = true;
      }
    }
  }

  function groundSpeed() {
    return Math.hypot(state.velocity.x, state.velocity.z);
  }

  function recoil(pitchKick, yawKick) {
    state.recoilPitch += pitchKick;
    state.recoilYaw += yawKick;
    state.pitch = clamp(state.pitch + pitchKick, -1.45, 1.45);
  }

  function reset(x, z, yaw) {
    state.position.x = x;
    state.position.y = 0;
    state.position.z = z;
    state.velocity.x = 0;
    state.velocity.z = 0;
    state.vy = 0;
    state.yaw = yaw;
    state.pitch = 0;
    state.eye = EYE_STAND;
    state.crouched = false;
    state.grounded = true;
    state.recoilPitch = 0;
    state.recoilYaw = 0;
  }

  return { state, look, step, groundSpeed, recoil, reset };
}
