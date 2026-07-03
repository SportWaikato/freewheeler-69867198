import type { TrackDef } from '@/game/types';

/**
 * CRYSTAL PEAKS — alpine glitter run.
 * Rolling snowfield with two crest "jumps" and long draft-friendly straights.
 */
export const crystalPeaksCircuit: TrackDef = {
  id: 'crystal-peaks',
  name: 'Crystal Peaks',
  tagline: 'Ice-cold straights, glittering climbs.',
  themeId: 'crystalPeaks',
  difficulty: 2,
  laps: 3,
  elevGainPerLapM: 34,
  parTimeSeconds: 340,
  halfWidth: 6.5,
  points: [
    { x: 0,    z: 0,   y: 0 },
    { x: 95,   z: -5,  y: 0, width: 7.5 },  // long start straight (draft zone)
    { x: 170,  z: 25,  y: 4 },
    { x: 200,  z: 90,  y: 12 },             // first crest
    { x: 170,  z: 150, y: 8 },
    { x: 105,  z: 185, y: 10, width: 5.5 },
    { x: 30,   z: 210, y: 16 },             // second crest
    { x: -45,  z: 195, y: 10 },
    { x: -110, z: 150, y: 4 },
    { x: -130, z: 80,  y: 0, width: 7.5 },  // back straight
    { x: -80,  z: 20,  y: 0 },
  ],
  features: [
    { type: 'itemBoxRow', t: 0.08 },
    { type: 'boostPad',   t: 0.15, lateral: 0 },
    { type: 'jump',       t: 0.30 },
    { type: 'itemBoxRow', t: 0.40 },
    { type: 'obstacle',   t: 0.48, lateral: -0.35 },
    { type: 'jump',       t: 0.57 },
    { type: 'boostPad',   t: 0.66, lateral: 0.3 },
    { type: 'itemBoxRow', t: 0.80 },
    { type: 'boostPad',   t: 0.90, lateral: -0.3 },
    { type: 'obstacle',   t: 0.96, lateral: 0.4 },
  ],
  scenery: [
    { kind: 'snowPine', offset: [5, 40],  count: 80 },
    { kind: 'crystal',  offset: [4, 25],  count: 46 },
    { kind: 'iceSpire', offset: [10, 60], count: 30 },
  ],
};
