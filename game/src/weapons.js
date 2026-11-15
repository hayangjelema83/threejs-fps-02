// Weapons: the buy-menu catalogue and the per-weapon state machine. Spread grows
// with movement, with holding the trigger, and shrinks when crouched or aiming down
// sights, so stopping to aim pays. Damage is per body part, head paying most.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', price: 300, auto: false,
    damage: 34, headMult: 3.0, mag: 12, reserve: 36, reloadTime: 1.4,
    fireInterval: 0.16, baseSpread: 0.006, moveSpread: 0.02, recoil: 0.011,
    range: 60, tracer: 0xffe08a,
  },
  smg: {
    id: 'smg', name: 'VK-9 Ripper', price: 1200, auto: true,
    damage: 26, headMult: 3.0, mag: 28, reserve: 84, reloadTime: 1.9,
    fireInterval: 0.075, baseSpread: 0.011, moveSpread: 0.03, recoil: 0.008,
    range: 55, tracer: 0xffe08a,
  },
  rifle: {
    id: 'rifle', name: 'AR-77 Longshot', price: 2700, auto: true,
    damage: 34, headMult: 4.0, mag: 30, reserve: 90, reloadTime: 2.4,
    fireInterval: 0.1, baseSpread: 0.004, moveSpread: 0.026, recoil: 0.014,
    range: 90, tracer: 0xffd34d,
  },
  shotgun: {
    id: 'shotgun', name: 'M12 Breacher', price: 1050, auto: false,
    damage: 13, headMult: 2.0, pellets: 8, mag: 6, reserve: 24, reloadTime: 2.8,
    fireInterval: 0.85, baseSpread: 0.045, moveSpread: 0.03, recoil: 0.05,
    range: 28, tracer: 0xffb84d,
  },
  sniper: {
    id: 'sniper', name: 'LW-50 Deadeye', price: 4750, auto: false,
    damage: 110, headMult: 2.5, mag: 5, reserve: 15, reloadTime: 3.1,
    fireInterval: 1.25, baseSpread: 0.001, moveSpread: 0.09, recoil: 0.09,
    range: 120, tracer: 0x9fd8ff,
  },
};

export const BUY_ORDER = ['pistol', 'smg', 'shotgun', 'rifle', 'sniper'];
export const ARMOR_PRICE = 650;
export const FRAG_PRICE = 300;
export const SMOKE_PRICE = 200;

export function createWeapon(defId) {
  const def = WEAPONS[defId];
  const state = {
    def,
    mag: def.mag,
    reserve: def.reserve,
    cooldown: 0,
    reloadLeft: 0,
    bloom: 0, // 0..1, grows while firing, decays while not
    shotsFired: 0,
  };

  function ready() {
    return state.cooldown <= 0 && state.reloadLeft <= 0 && state.mag > 0;
  }

  function takeRound() {
    if (!ready()) return false;
    state.mag -= 1;
    state.cooldown = state.def.fireInterval;
    state.bloom = Math.min(1, state.bloom + (state.def.auto ? 0.09 : 0.05));
    state.shotsFired += 1;
    return true;
  }

  function reload() {
    if (state.reloadLeft > 0 || state.mag >= state.def.mag || state.reserve <= 0) return false;
    state.reloadLeft = state.def.reloadTime;
    return true;
  }

  // Spread in radians: base + movement + bloom, reduced by crouch and ADS.
  function spread(moveSpeed, crouched, aiming) {
    let value = state.def.baseSpread + state.def.moveSpread * Math.min(1, moveSpeed / 4.6);
    value += state.bloom * state.def.baseSpread * 4;
    if (crouched) value *= 0.65;
    if (aiming) value *= 0.45;
    return value;
  }

  function step(dt) {
    if (state.cooldown > 0) state.cooldown -= dt;
    if (state.reloadLeft > 0) {
      state.reloadLeft -= dt;
      if (state.reloadLeft <= 0) {
        const need = state.def.mag - state.mag;
        const taken = Math.min(need, state.reserve);
        state.mag += taken;
        state.reserve -= taken;
        state.reloadLeft = 0;
      }
    }
    state.bloom = Math.max(0, state.bloom - dt * 0.55);
  }

  function refill() {
    state.mag = state.def.mag;
    state.reserve = state.def.reserve;
    state.cooldown = 0;
    state.reloadLeft = 0;
    state.bloom = 0;
  }

  function swap(defId) {
    const next = WEAPONS[defId];
    state.def = next;
    state.mag = next.mag;
    state.reserve = next.reserve;
    state.cooldown = 0;
    state.reloadLeft = 0;
    state.bloom = 0;
  }

  return { state, ready, takeRound, reload, spread, step, refill, swap };
}
