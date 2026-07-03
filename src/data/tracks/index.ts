// ─────────────────────────────────────────────────────────────────────────────
// Cycle Cup — track registry
//
// SHIPPING A NEW TRACK (the quarterly release path):
//   1. Copy an existing track file, change the id/name/points/features/scenery.
//   2. Pick a theme from src/game/themes.ts (or add a new ThemeDef there).
//   3. Import + append it to TRACKS below. Done — course select, racing,
//      multiplayer and scoring all read from this list.
// Track ids are persisted in game_rides.route_id / game_race_results, so never
// reuse or rename an id once it has shipped.
// ─────────────────────────────────────────────────────────────────────────────
import type { TrackDef } from '@/game/types';
import { meadowGrandPrix } from './meadowGrandPrix';
import { neonCircuit } from './neonCircuit';
import { crystalPeaksCircuit } from './crystalPeaks';
import { volcanoRush } from './volcanoRush';

export const TRACKS: TrackDef[] = [
  meadowGrandPrix,
  neonCircuit,
  crystalPeaksCircuit,
  volcanoRush,
];

export function getTrack(id: string): TrackDef | undefined {
  return TRACKS.find(t => t.id === id);
}
