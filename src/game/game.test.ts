import { describe, it, expect } from 'vitest';
import { TrackCurve, loopGap, mulberry32 } from './math';
import { placementPoints, soloPoints } from './scoring';
import { rollItem, stepCharge } from './items';
import { targetSpeed, stepLateral, PHYSICS } from './physics';
import { TRACKS, getTrack } from '@/data/tracks';
import { THEMES } from './themes';

describe('placementPoints', () => {
  it('awards 50/40/30/20 for a full 4-bike race', () => {
    expect(placementPoints(1, 4)).toBe(50);
    expect(placementPoints(2, 4)).toBe(40);
    expect(placementPoints(3, 4)).toBe(30);
    expect(placementPoints(4, 4)).toBe(20);
  });
  it('winner always gets 50, last always gets 20', () => {
    for (const n of [2, 3, 4]) {
      expect(placementPoints(1, n)).toBe(50);
      expect(placementPoints(n, n)).toBe(20);
    }
  });
  it('returns 0 for solo (placement handled by soloPoints)', () => {
    expect(placementPoints(1, 1)).toBe(0);
  });
  it('never exceeds the 50-point cap', () => {
    for (let n = 2; n <= 4; n++) {
      for (let p = 1; p <= n; p++) {
        expect(placementPoints(p, n)).toBeLessThanOrEqual(50);
        expect(placementPoints(p, n)).toBeGreaterThanOrEqual(20);
      }
    }
  });
});

describe('soloPoints', () => {
  it('rewards beating par', () => {
    expect(soloPoints(290, 300)).toBe(15);
    expect(soloPoints(301, 300)).toBe(5);
  });
});

describe('rollItem', () => {
  it('returns a valid item for every position and rand value', () => {
    const rng = mulberry32(42);
    for (let pos = 1; pos <= 4; pos++) {
      for (let i = 0; i < 200; i++) {
        expect(['turbo', 'shield', 'slick', 'zap']).toContain(rollItem(pos, 4, rng()));
      }
    }
  });
  it('rubber-bands: last place draws more turbos than the leader', () => {
    const rng = mulberry32(7);
    let leaderTurbos = 0, lastTurbos = 0;
    for (let i = 0; i < 800; i++) {
      if (rollItem(1, 4, rng()) === 'turbo') leaderTurbos++;
      if (rollItem(4, 4, rng()) === 'turbo') lastTurbos++;
    }
    expect(lastTurbos).toBeGreaterThan(leaderTurbos);
  });
  it('never gives zap to the leader-biased extreme less often than tail', () => {
    const rng = mulberry32(11);
    let leaderZaps = 0, lastZaps = 0;
    for (let i = 0; i < 800; i++) {
      if (rollItem(1, 4, rng()) === 'zap') leaderZaps++;
      if (rollItem(4, 4, rng()) === 'zap') lastZaps++;
    }
    expect(lastZaps).toBeGreaterThan(leaderZaps);
  });
});

describe('stepCharge', () => {
  it('fills over ~8s of high cadence and fires', () => {
    let charge = 0;
    let fired = false;
    for (let t = 0; t < 9 && !fired; t += 0.1) {
      const r = stepCharge(charge, 100, 150, 140, 0.1);
      charge = r.charge;
      fired = r.fired;
    }
    expect(fired).toBe(true);
  });
  it('drains when soft-pedalling', () => {
    const r = stepCharge(0.5, 70, 100, 140, 1);
    expect(r.charge).toBeLessThan(0.5);
    expect(r.fired).toBe(false);
  });
});

describe('physics', () => {
  const noMods = { boosting: false, drafting: false, slowed: false, offTrack: false, gradient: 0 };
  it('more power = more speed', () => {
    expect(targetSpeed(200, noMods)).toBeGreaterThan(targetSpeed(100, noMods));
  });
  it('caps at max speed', () => {
    expect(targetSpeed(2000, { ...noMods, boosting: true })).toBeLessThanOrEqual(
      (PHYSICS.maxSpeedKmh * PHYSICS.boostFactor) / 3.6 + 0.001,
    );
  });
  it('climbing is slower, descending faster', () => {
    expect(targetSpeed(150, { ...noMods, gradient: 0.06 })).toBeLessThan(targetSpeed(150, noMods));
    expect(targetSpeed(150, { ...noMods, gradient: -0.06 })).toBeGreaterThan(targetSpeed(150, noMods));
  });
  it('steering clamps at the walls and reports the hit', () => {
    const r = stepLateral(0.99, 1, 10, 0.5);
    expect(r.lateral).toBe(1);
    expect(r.hitWall).toBe(true);
  });
});

describe('track registry', () => {
  it('every track has a registered theme, unique id and valid features', () => {
    const ids = new Set<string>();
    for (const t of TRACKS) {
      expect(ids.has(t.id)).toBe(false);
      ids.add(t.id);
      expect(THEMES[t.themeId]).toBeDefined();
      expect(t.points.length).toBeGreaterThanOrEqual(6);
      expect(t.laps).toBeGreaterThanOrEqual(1);
      for (const f of t.features) {
        expect(f.t).toBeGreaterThanOrEqual(0);
        expect(f.t).toBeLessThan(1);
      }
      for (const band of t.scenery) {
        expect(THEMES[t.themeId].builders[band.kind],
          `theme ${t.themeId} missing scenery builder '${band.kind}' used by ${t.id}`).toBeDefined();
      }
    }
    expect(getTrack('meadow-grand-prix')).toBeDefined();
    expect(getTrack('nope')).toBeUndefined();
  });

  it('every track closes into a loop with sane arc-length parametrisation', () => {
    for (const t of TRACKS) {
      const curve = new TrackCurve(t);
      expect(curve.lengthM).toBeGreaterThan(300);
      // Walking the LUT: distance→u→sample round-trips monotonically
      const a = curve.sampleAt(0).pos;
      const b = curve.sampleAt(curve.lengthM).pos; // wraps to start
      expect(a.distanceTo(b)).toBeLessThan(1);
      // Moving 100 m along the loop actually moves ~100 m of arc
      let travelled = 0;
      let prev = curve.sampleAt(0).pos;
      for (let d = 5; d <= 100; d += 5) {
        const p = curve.sampleAt(d).pos;
        travelled += p.distanceTo(prev);
        prev = p;
      }
      expect(travelled).toBeGreaterThan(85);
      expect(travelled).toBeLessThan(115);
    }
  });
});

describe('loopGap', () => {
  it('handles wrap-around', () => {
    expect(loopGap(990, 10, 1000)).toBe(20);   // b just ahead across the line
    expect(loopGap(10, 990, 1000)).toBe(-20);  // b just behind across the line
    expect(loopGap(100, 150, 1000)).toBe(50);
  });
});
