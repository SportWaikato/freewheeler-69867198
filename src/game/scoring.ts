// ─────────────────────────────────────────────────────────────────────────────
// Cycle Cup — placement scoring
//
// Placement points feed the EXISTING award_game_ride_points() trigger via
// game_rides.placement_points, so kart races land on the same student_points
// leaderboard as everything else. Distance / elevation / speed / power bonuses
// stay in the trigger — we only compute the placement component client-side.
//
// Formula:
//   multiplayer (racers ≥ 2): 20 + round(30 × (racers − pos) / (racers − 1))
//     → 4 bikes: 50 / 40 / 30 / 20   ·   3 bikes: 50 / 35 / 20   ·   2 bikes: 50 / 20
//     Winner always gets 50; every finisher gets at least 20 (kids on slower
//     legs still bank meaningful points — the rubber-band ethos).
//   solo: beat the track's par time → 15, otherwise 5 for finishing.
// Capped at 50 so a race never dwarfs the ride-quality bonuses (max ~35).
// ─────────────────────────────────────────────────────────────────────────────

export function placementPoints(position: number, totalRacers: number): number {
  if (totalRacers <= 1 || position < 1) return 0;
  const pos = Math.min(position, totalRacers);
  return 20 + Math.round((30 * (totalRacers - pos)) / (totalRacers - 1));
}

export function soloPoints(finishTimeSeconds: number, parTimeSeconds: number): number {
  return finishTimeSeconds <= parTimeSeconds ? 15 : 5;
}
