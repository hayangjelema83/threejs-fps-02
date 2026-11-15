# Kestrel Yard — a three.js tactical FPS

A round-based tactical first-person shooter in the Counter-Strike style, built
for the make.fun `threejs-fps-02` bounty. Original map, art, sounds and names —
nothing copied from any commercial game.

## The game

**Kestrel Yard** is a dusk-desert compound with three lanes: mid (a choke, a
steel silo and a cross-connector), west to Site A (an amber warehouse) and east
to Site B (a teal solar yard). Vanguard attacks, Jackals defend. First to 5
rounds wins the match (max 9 rounds).

- **Rounds & objective** — 100-second rounds, won by eliminating the other
  team, detonating the spike, or running the clock out as defenders. Hold `E`
  inside a site for 4 s to plant the spike (40 s fuse); Jackal bots push the
  site to defuse (5 s channel). If the carrier dies, a living teammate bot
  picks the spike up and pushes a site.
- **Economy** — $800 to start; $300 a kill, $300 a plant, $3,250 a round win,
  $1,900 a round loss plus $500 per consecutive loss (capped at $3,400). The
  buy menu (`B`, open during the 12 s freeze) sells 5 weapons, Kevlar, frag
  and smoke grenades.
- **Gunplay** — hitscan against head / torso / legs (head pays most), recoil
  and bloom that punish firing on the move, spread that shrinks when crouched
  or aiming down sights (RMB), acceleration-based movement with crouch, jump
  and AABB collision, so stopping to aim pays.
- **Bots** — 4 Vanguard teammates and 5 Jackal enemies navigate a waypoint
  graph (BFS routes), hold positions, react to visible enemies with a reaction
  time and an aim error that shrinks while they stand still, fire in bursts,
  investigate nearby gunfire, and plant / defuse the spike.
- **Presentation** — HUD (health, armour, ammo, credits, round timer, round
  score, alive pips, killfeed, hitmarker, damage flash, live minimap with
  sound-revealed enemies), synthesized WebAudio gunfire / beeps / stingers
  (no audio files), tracers, impact dust, explosions and smoke that blocks
  line of sight.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (click the game to capture the pointer) |
| Click / RMB | Fire / aim down sights |
| R | Reload |
| E (hold) | Plant the spike inside a site |
| Q / G | Throw frag / smoke grenade |
| B | Buy menu (freeze phase) |
| Ctrl / C | Crouch |
| Space | Jump |
| M | Mute |

## Run it

```sh
node serve.ts          # serves game/ on http://localhost:8080
```

Open http://localhost:8080 in desktop Chrome. Everything is static files
under `game/`; the game makes no network request. three.js 0.187.0 is vendored
under `game/vendor/three/` and mapped by the import map in `game/index.html`.

## Screenshots

Deterministic frames for capture (the game sets `window.__shotReady` once the
frame is painted twice and frozen):

```sh
http://localhost:8080/?shot=start&seed=1   # menu over the yard
http://localhost:8080/?shot=play&seed=1    # mid-round, rifle on a Jackal
http://localhost:8080/?shot=end&seed=1     # round won, buy menu open
```

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/`
to the output directory and writes `dossier.json` with the kit's vendored
`vendor/makefun-threejs.ts`.

## Layout

```
main.ts            entrypoint: copies game/ + screenshots/, writes dossier.json
serve.ts           static dev server for game/
game/
  index.html       import map + HUD DOM + CSS
  vendor/three/    three.js 0.187.0, byte for byte from the kit
  src/
    main.js        boot, fixed 60 Hz loop, player shooting, viewmodel, shots
    game.js        match state machine: rounds, economy, spike, buy, wins
    bots.js        bot AI: routes, holds, engages, plants, defuses
    combat.js      hitscan, tracers, dust, frag / smoke grenades
    world.js       map meshes, colliders, line of sight
    mapdata.js     Kestrel Yard: boxes, sites, spawns, waypoint graph
    player.js      movement physics (accel, crouch, jump, collision)
    weapons.js     weapon catalogue + fire / reload / spread model
    input.js       keyboard, mouse look, pointer lock
    audio.js       synthesized WebAudio SFX
    hud.js         DOM HUD, buy menu, minimap, killfeed, banners
    palette.js     the one dusk-desert palette
    rng.js         deterministic RNG + helpers
screenshots/      3 real renders of the game's own code
```

## License

MIT — see `LICENSE`.
