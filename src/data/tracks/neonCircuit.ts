import type { TrackDef } from '@/game/types';

/**
 * NEON CIRCUIT — night city street race.
 * Tighter corners, a chicane, more obstacles. Medium difficulty.
 */
export const neonCircuit: TrackDef = {
  id: 'neon-circuit',
  name: 'Neon Circuit',
  tagline: 'Street race under the city lights.',
  themeId: 'neonCity',
  difficulty: 2,
  laps: 3,
  elevGainPerLapM: 22,
  parTimeSeconds: 330,
  halfWidth: 6,
  points: [
    { x: 0,    z: 0,   y: 0 },
    { x: 70,   z: -8,  y: 0 },
    { x: 130,  z: 15,  y: 2 },
    { x: 150,  z: 70,  y: 5, width: 5 },   // overpass climb
    { x: 120,  z: 120, y: 8 },
    { x: 130,  z: 175, y: 4 },
    { x: 80,   z: 205, y: 1 },
    { x: 20,   z: 185, y: 0, width: 5 },   // chicane in
    { x: -15,  z: 205, y: 0, width: 5 },   // chicane out
    { x: -75,  z: 185, y: 1 },
    { x: -105, z: 120, y: 3 },
    { x: -90,  z: 55,  y: 1 },
    { x: -45,  z: 15,  y: 0 },
  ],
  features: [
    { type: 'itemBoxRow', t: 0.12 },
    { type: 'boostPad',   t: 0.24, lateral: -0.3 },
    { type: 'obstacle',   t: 0.33, lateral: 0.5 },
    { type: 'itemBoxRow', t: 0.44 },
    { type: 'obstacle',   t: 0.52, lateral: -0.5 },
    { type: 'obstacle',   t: 0.55, lateral: 0.35 },
    { type: 'boostPad',   t: 0.63, lateral: 0 },
    { type: 'itemBoxRow', t: 0.78 },
    { type: 'boostPad',   t: 0.92, lateral: 0.3 },
  ],
  scenery: [
    { kind: 'skyscraper',  offset: [10, 60], count: 70 },
    { kind: 'neonSign',    offset: [3, 10],  count: 34 },
    { kind: 'searchlight', offset: [15, 50], count: 8 },
  ],
};
