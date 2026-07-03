// ─────────────────────────────────────────────────────────────────────────────
// Cycle Cup — kart physics
//
// Forward speed comes from real pedalling power (Wattbike FTMS). Steering is
// touch-button lateral movement. The model is arcade-tuned: power sets a target
// speed, the kart eases toward it, and modifiers (boost, draft, slick, grass,
// gradient) multiply the target. Tablet-friendly: no per-wheel simulation.
// ─────────────────────────────────────────────────────────────────────────────
import { MathUtils } from 'three';

export interface PhysicsModifiers {
  boosting: boolean;   // turbo item / boost pad / sprint charge
  drafting: boolean;
  slowed: boolean;     // slick or zap hit
  offTrack: boolean;   // ran wide onto grass/shoulder
  gradient: number;    // rise/run at current position
}

export const PHYSICS = {
  /** Power (W) → base speed (km/h). Tuned so ~120 W teen effort ≈ 30 km/h in game. */
  powerToKmh: (watts: number) => 9 + 5.4 * Math.cbrt(Math.max(watts, 0)),
  maxSpeedKmh: 75,
  accel: 6.5,          // m/s² toward target when below
  brake: 10,           // m/s² toward target when above
  steerRate: 1.35,     // lateral units (-1..1) per second at full deflection
  steerSpeedFloor: 2,  // m/s — below this, steering authority fades out
  boostFactor: 1.35,
  draftFactor: 1.12,
  slickFactor: 0.55,
  offTrackFactor: 0.62,
  gradientPenalty: 5.5,  // climbing slowdown strength
  gradientBoost: 3.0,    // descending speed-up strength
  maxDownhillFactor: 1.25,
} as const;

/** Target speed in m/s given rider power and active modifiers. */
export function targetSpeed(watts: number, mods: PhysicsModifiers): number {
  let kmh = Math.min(PHYSICS.powerToKmh(watts), PHYSICS.maxSpeedKmh);
  const up = Math.max(0, mods.gradient);
  const down = Math.max(0, -mods.gradient);
  kmh *= 1 / (1 + up * PHYSICS.gradientPenalty);
  kmh *= Math.min(1 + down * PHYSICS.gradientBoost, PHYSICS.maxDownhillFactor);
  if (mods.boosting) kmh *= PHYSICS.boostFactor;
  if (mods.drafting && !mods.boosting) kmh *= PHYSICS.draftFactor;
  if (mods.slowed) kmh *= PHYSICS.slickFactor;
  if (mods.offTrack) kmh *= PHYSICS.offTrackFactor;
  return kmh / 3.6;
}

/** Ease current speed toward target, rate-limited by accel/brake. Returns new speed (m/s). */
export function stepSpeed(current: number, target: number, dt: number): number {
  const rate = target >= current ? PHYSICS.accel : PHYSICS.brake;
  const delta = target - current;
  return current + Math.sign(delta) * Math.min(Math.abs(delta), rate * dt);
}

/**
 * Step lateral position from steering input ∈ [-1, 1] (negative = left).
 * Steering authority scales with speed so a stationary kart doesn't slide.
 * Returns { lateral, hitWall }.
 */
export function stepLateral(
  lateral: number,
  steerInput: number,
  speed: number,
  dt: number,
): { lateral: number; hitWall: boolean } {
  const authority = MathUtils.clamp(speed / PHYSICS.steerSpeedFloor, 0, 1);
  let next = lateral + steerInput * PHYSICS.steerRate * authority * dt;
  let hitWall = false;
  if (next > 1) { next = 1; hitWall = true; }
  if (next < -1) { next = -1; hitWall = true; }
  return { lateral: next, hitWall };
}
