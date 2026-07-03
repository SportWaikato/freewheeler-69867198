// ─────────────────────────────────────────────────────────────────────────────
// Freewheeler Bike League — item system
//
// Mario Kart-style pickups with a physical-effort twist:
//  · turbo  — +35 % speed for 3 s
//  · shield — blocks the next slick/zap against you
//  · slick  — drops an oil patch behind you; riders who hit it slow hard for 2 s
//  · zap    — slows the kart directly ahead of you for 2.5 s
//
// Rubber-banding: the roll is weighted by race position. Leaders mostly draw
// slicks (defensive), tail-enders mostly draw turbos and zaps (catch-up).
//
// Sprint Charge (separate from item boxes): sustained high cadence or a power
// spike fills a meter; a full meter auto-fires a mini-turbo. Real legs = boost.
// ─────────────────────────────────────────────────────────────────────────────
import type { ItemType } from './types';

export const ITEM_INFO: Record<ItemType, { label: string; emoji: string; desc: string }> = {
  turbo:  { label: 'Turbo',  emoji: '🚀', desc: '+35% speed for 3s' },
  shield: { label: 'Shield', emoji: '🛡️', desc: 'Blocks the next hit' },
  slick:  { label: 'Slick',  emoji: '🛢️', desc: 'Drops an oil patch behind you' },
  zap:    { label: 'Zap',    emoji: '⚡', desc: 'Slows the kart ahead' },
};

export const ITEM_DURATIONS = {
  turboSeconds: 3,
  miniTurboSeconds: 2,
  slickSlowSeconds: 2,
  zapSlowSeconds: 2.5,
  itemBoxRespawnSeconds: 3,
} as const;

export const SPRINT_CHARGE = {
  /** Cadence at/above this counts as a sprint effort. */
  cadenceRpm: 95,
  /** Or instantaneous power at/above this multiple of the rider's rolling average. */
  powerSpikeFactor: 1.3,
  /** Seconds of sprint effort to fill the meter from empty. */
  fillSeconds: 8,
  /** Meter drain per second when not sprinting. */
  drainPerSecond: 0.04,
} as const;

/**
 * Weighted item roll by race position (1 = leader).
 * rand ∈ [0,1) — injected so multiplayer clients / tests can be deterministic.
 */
export function rollItem(position: number, totalKarts: number, rand: number): ItemType {
  const last = Math.max(totalKarts, 1);
  const back = last <= 1 ? 0 : (Math.min(position, last) - 1) / (last - 1); // 0 leader → 1 last
  // Weights morph from leader-set to tail-set.
  const w: Array<[ItemType, number]> = [
    ['turbo',  0.25 + 0.45 * back],
    ['zap',    0.05 + 0.25 * back],
    ['shield', 0.25],
    ['slick',  0.45 - 0.40 * back],
  ];
  const total = w.reduce((s, [, v]) => s + v, 0);
  let r = rand * total;
  for (const [item, v] of w) {
    r -= v;
    if (r <= 0) return item;
  }
  return 'turbo';
}

/** Advance the sprint-charge meter. Returns { charge, fired }. */
export function stepCharge(
  charge: number,
  cadenceRpm: number,
  powerW: number,
  rollingAvgPowerW: number,
  dt: number,
): { charge: number; fired: boolean } {
  const sprinting =
    cadenceRpm >= SPRINT_CHARGE.cadenceRpm ||
    (rollingAvgPowerW > 30 && powerW >= rollingAvgPowerW * SPRINT_CHARGE.powerSpikeFactor);
  let next = sprinting
    ? charge + dt / SPRINT_CHARGE.fillSeconds
    : charge - dt * SPRINT_CHARGE.drainPerSecond;
  next = Math.min(Math.max(next, 0), 1);
  if (next >= 1) return { charge: 0, fired: true };
  return { charge: next, fired: false };
}
