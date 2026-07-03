import type { TrackDef } from '@/game/types';

/**
 * MEADOW GRAND PRIX — the starter track.
 * Wide, flowing, gentle elevation. Teaches steering, item boxes and boost pads.
 */
export const meadowGrandPrix: TrackDef = {
  id: 'meadow-grand-prix',
  name: 'Meadow Grand Prix',
  tagline: 'Wide open. Full send.',
  themeId: 'meadow',
  difficulty: 1,
  laps: 3,
  elevGainPerLapM: 14,
  parTimeSeconds: 300,
  halfWidth: 7,
  points: [
    { x: 0,    z: 0,    y: 0 },
    { x: 90,   z: 10,   y: 1 },
    { x: 160,  z: 45,   y: 3 },
    { x: 190,  z: 110,  y: 6, width: 8 },
    { x: 160,  z: 170,  y: 8 },
    { x: 90,   z: 195,  y: 5 },
    { x: 10,   z: 185,  y: 2 },
    { x: -60,  z: 150,  y: 0 },
    { x: -95,  z: 90,   y: 2, width: 6 },
    { x: -70,  z: 35,   y: 1 },
  ],
  features: [
    { type: 'itemBoxRow', t: 0.16 },
    { type: 'boostPad',   t: 0.30, lateral: 0 },
    { type: 'itemBoxRow', t: 0.48 },
    { type: 'obstacle',   t: 0.58, lateral: -0.4 },
    { type: 'boostPad',   t: 0.70, lateral: 0.35 },
    { type: 'itemBoxRow', t: 0.82 },
    { type: 'obstacle',   t: 0.90, lateral: 0.45 },
  ],
  scenery: [
    { kind: 'pineTree',     offset: [6, 40],  count: 90 },
    { kind: 'flowerPatch',  offset: [3, 14],  count: 40 },
    { kind: 'barn',         offset: [22, 45], count: 4 },
    { kind: 'hotAirBalloon',offset: [30, 90], count: 6 },
  ],
};
