import type { TrackDef } from '@/game/types';

/**
 * VOLCANO RUSH — the climber.
 * Big ascent up the caldera rim, fast lava-field descent, narrow ridge section.
 * Hardest track at launch; rewards strong legs on the climb.
 */
export const volcanoRush: TrackDef = {
  id: 'volcano-rush',
  name: 'Volcano Rush',
  tagline: 'Climb the rim. Outrun the lava.',
  themeId: 'volcano',
  difficulty: 3,
  laps: 2,
  elevGainPerLapM: 58,
  parTimeSeconds: 360,
  halfWidth: 6,
  points: [
    { x: 0,    z: 0,   y: 0 },
    { x: 80,   z: 15,  y: 2 },
    { x: 140,  z: 55,  y: 9 },              // climb starts
    { x: 165,  z: 120, y: 18, width: 5 },   // steep switchback
    { x: 125,  z: 170, y: 26, width: 4.5 }, // narrow ridge
    { x: 55,   z: 195, y: 28 },             // summit
    { x: -20,  z: 200, y: 22 },             // descent begins
    { x: -85,  z: 170, y: 12 },
    { x: -120, z: 105, y: 4 },              // fast lava flats
    { x: -95,  z: 40,  y: 0, width: 7.5 },
    { x: -40,  z: 5,   y: 0 },
  ],
  features: [
    { type: 'itemBoxRow', t: 0.10 },
    { type: 'boostPad',   t: 0.18, lateral: 0 },     // run-up to the climb
    { type: 'itemBoxRow', t: 0.36 },                  // mid-climb resupply
    { type: 'obstacle',   t: 0.44, lateral: 0.4 },    // ridge rocks
    { type: 'obstacle',   t: 0.47, lateral: -0.45 },
    { type: 'jump',       t: 0.56 },                  // summit crest
    { type: 'boostPad',   t: 0.62, lateral: 0 },      // descent launch
    { type: 'boostPad',   t: 0.74, lateral: -0.3 },
    { type: 'itemBoxRow', t: 0.86 },
    { type: 'obstacle',   t: 0.93, lateral: 0 },
  ],
  scenery: [
    { kind: 'lavaRock',    offset: [4, 35],   count: 80 },
    { kind: 'volcanoCone', offset: [60, 160], count: 7 },
    { kind: 'emberVent',   offset: [3, 12],   count: 26 },
  ],
};
