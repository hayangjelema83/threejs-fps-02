// Kestrel Yard: an original three-lane map. South is the Vanguard spawn, north the
// Jackal spawn. Site A (west, amber warehouse) and Site B (east, teal solar yard) sit
// north; mid runs between two concrete fins with a steel silo in the middle.
// Boxes are {x, z, w, d, h, c}: centre, footprint, height, palette key. All solid.
export const MAP = {
  bounds: { minX: -28, maxX: 28, minZ: -22, maxZ: 22 },
  boxes: [
    // Perimeter (h 4).
    { x: 0, z: -22.5, w: 58, d: 1, h: 4, c: 'concreteDark' },
    { x: 0, z: 22.5, w: 58, d: 1, h: 4, c: 'concreteDark' },
    { x: -28.5, z: 0, w: 1, d: 46, h: 4, c: 'concreteDark' },
    { x: 28.5, z: 0, w: 1, d: 46, h: 4, c: 'concreteDark' },
    // Mid fins (leave a gap at z -8..-2 for the cross-connector).
    { x: -6, z: 3, w: 1, d: 10, h: 3, c: 'concrete' },
    { x: -6, z: -11, w: 1, d: 6, h: 3, c: 'concrete' },
    { x: 6, z: 3, w: 1, d: 10, h: 3, c: 'concrete' },
    { x: 6, z: -11, w: 1, d: 6, h: 3, c: 'concrete' },
    // Mid south choke (gap x -2.5..2.5) and mid north choke (same gap).
    { x: -4.5, z: 8, w: 4, d: 1, h: 3, c: 'concreteDark' },
    { x: 4.5, z: 8, w: 4, d: 1, h: 3, c: 'concreteDark' },
    { x: -4.5, z: -14, w: 4, d: 1, h: 3, c: 'concreteDark' },
    { x: 4.5, z: -14, w: 4, d: 1, h: 3, c: 'concreteDark' },
    // Central silo splits mid.
    { x: 0, z: -2, w: 5, d: 5, h: 3.5, c: 'steel' },
    // Site A warehouse shell.
    { x: -19, z: -18, w: 12, d: 1, h: 3.5, c: 'concrete' },
    { x: -25, z: -12, w: 1, d: 10, h: 3.5, c: 'concrete' },
    // Site A crates (kept clear of the aSite waypoint at (-19, -13)).
    { x: -21, z: -15.5, w: 2.4, d: 2.4, h: 1.2, c: 'crate' },
    { x: -16, z: -16, w: 2, d: 2, h: 1.2, c: 'crateDark' },
    { x: -23, z: -10, w: 2, d: 2, h: 1.1, c: 'crate' },
    { x: -14, z: -10, w: 2.4, d: 1.6, h: 1.3, c: 'crateDark' },
    // Site B solar panels and crates.
    { x: 18, z: -16, w: 6, d: 0.4, h: 2.2, c: 'panel' },
    { x: 23, z: -12, w: 0.4, d: 6, h: 2.2, c: 'panel' },
    { x: 16, z: -11, w: 2, d: 2, h: 1.2, c: 'crate' },
    { x: 22, z: -16, w: 2.4, d: 2.4, h: 1.2, c: 'crateDark' },
    { x: 14, z: -18, w: 2, d: 2, h: 1.1, c: 'crate' },
    // Lane cover.
    { x: -22, z: 4, w: 2, d: 2, h: 1.2, c: 'crate' },
    { x: -20, z: -2, w: 2, d: 3, h: 1.3, c: 'crateDark' },
    { x: -24, z: 8, w: 3, d: 1.6, h: 1.1, c: 'crate' },
    { x: 22, z: 4, w: 2, d: 2, h: 1.2, c: 'crate' },
    { x: 20, z: -2, w: 2, d: 3, h: 1.3, c: 'crateDark' },
    { x: 24, z: 8, w: 3, d: 1.6, h: 1.1, c: 'crate' },
    { x: -3, z: 14, w: 2, d: 2, h: 1.2, c: 'crate' },
    { x: 3, z: 14, w: 2, d: 2, h: 1.2, c: 'crate' },
    { x: -3, z: -6, w: 2, d: 2, h: 1.1, c: 'crateDark' },
    { x: 3, z: -6, w: 2, d: 2, h: 1.1, c: 'crateDark' },
    { x: -10, z: -16, w: 2, d: 2, h: 1.2, c: 'crate' },
    { x: 10, z: -16, w: 2, d: 2, h: 1.2, c: 'crate' },
    // Spawn cover (kept clear of the corner spawn waypoints at (±8, ±18)).
    { x: -12, z: 18, w: 3, d: 1.5, h: 1.2, c: 'crate' },
    { x: 12, z: 18, w: 3, d: 1.5, h: 1.2, c: 'crate' },
    { x: -12, z: -18, w: 3, d: 1.5, h: 1.2, c: 'crate' },
    { x: 12, z: -18, w: 3, d: 1.5, h: 1.2, c: 'crate' },
  ],
  // Plant zones (rects on the ground).
  sites: {
    A: { x0: -24, x1: -14, z0: -17, z1: -10, label: 'A', color: 'amber' },
    B: { x0: 14, x1: 24, z0: -18, z1: -10, label: 'B', color: 'teal' },
  },
  spawns: {
    vanguard: [[-6, 18], [-3, 19], [0, 18], [3, 19], [6, 18]],
    jackal: [[-6, -18], [-3, -19], [0, -18], [3, -19], [6, -18]],
  },
  // Waypoint graph: nodes by name, edges by name. Bots BFS over this.
  waypoints: {
    vSpawn: [0, 18], vSpawnL: [-8, 18], vSpawnR: [8, 18],
    midS: [0, 11], midGap: [0, 6], midW: [-4, -2], midE: [4, -2], midN: [0, -10],
    westS: [-22, 12], westM: [-22, 2], westN: [-22, -6],
    eastS: [22, 12], eastM: [22, 2], eastN: [22, -6],
    conW: [-10, -5], conE: [10, -5],
    aEntry: [-19, -7], aSite: [-19, -13], aSiteW: [-24, -13], aSiteE: [-15, -13],
    bEntry: [19, -7], bSite: [19, -13], bSiteW: [15, -13], bSiteE: [23, -8.5],
    jSpawn: [0, -18], jSpawnL: [-8, -18], jSpawnR: [8, -18],
    jMid: [-4, -16], jMidR: [4, -16],
  },
  edges: {
    vSpawn: ['vSpawnL', 'vSpawnR', 'midS'],
    vSpawnL: ['vSpawn', 'westS'],
    vSpawnR: ['vSpawn', 'eastS'],
    midS: ['vSpawn', 'midGap'],
    midGap: ['midS', 'midW', 'midE'],
    midW: ['midGap', 'midN', 'conW'],
    midE: ['midGap', 'midN', 'conE'],
    midN: ['midW', 'midE', 'jSpawn', 'jMid', 'jMidR'],
    westS: ['vSpawnL', 'westM'],
    westM: ['westS', 'westN', 'conW'],
    westN: ['westM', 'aEntry'],
    eastS: ['vSpawnR', 'eastM'],
    eastM: ['eastS', 'eastN', 'conE'],
    eastN: ['eastM', 'bEntry'],
    conW: ['midW', 'westM', 'aEntry'],
    conE: ['midE', 'eastM', 'bEntry'],
    aEntry: ['westN', 'conW', 'aSite'],
    aSite: ['aEntry', 'aSiteW', 'aSiteE'],
    aSiteW: ['aSite'], aSiteE: ['aSite'],
    bEntry: ['eastN', 'conE', 'bSite'],
    bSite: ['bEntry', 'bSiteW', 'bSiteE'],
    bSiteW: ['bSite'], bSiteE: ['bSite'],
    jSpawn: ['midN', 'jSpawnL', 'jSpawnR'],
    jSpawnL: ['jSpawn', 'jMid'],
    jSpawnR: ['jSpawn', 'jMidR'],
    jMid: ['jSpawnL', 'midN', 'aEntry'],
    jMidR: ['jSpawnR', 'midN', 'bEntry'],
  },
  // Where defenders hold when the round starts.
  defenderHolds: ['aSite', 'bSite', 'midN', 'conW', 'conE'],
};
