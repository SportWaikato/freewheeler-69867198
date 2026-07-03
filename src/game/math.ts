// ─────────────────────────────────────────────────────────────────────────────
// Freewheeler Bike League — track curve sampling
//
// A TrackDef's control points become a closed Catmull-Rom loop. Everything in
// the game addresses positions as (progress metres, lateral -1..1); this module
// converts those to world space and provides arc-length parametrisation so
// speed in m/s moves karts a true number of metres regardless of point spacing.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import type { TrackControlPoint, TrackDef } from './types';

export interface TrackSample {
  pos: THREE.Vector3;
  tangent: THREE.Vector3; // normalised, horizontal-ish
  normal: THREE.Vector3;  // normalised left-pointing horizontal normal
  halfWidth: number;
}

export class TrackCurve {
  readonly curve: THREE.CatmullRomCurve3;
  readonly lengthM: number;
  private readonly lut: number[];      // arc length at each of N uniform u samples
  private readonly widths: number[];   // half-width at each control point
  private readonly def: TrackDef;
  private static readonly LUT_N = 1024;

  constructor(def: TrackDef) {
    this.def = def;
    const pts = def.points.map(
      (p: TrackControlPoint) => new THREE.Vector3(p.x, p.y ?? 0, p.z),
    );
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    this.widths = def.points.map(p => p.width ?? def.halfWidth);

    // Arc-length lookup table
    this.lut = [0];
    let acc = 0;
    let prev = this.curve.getPoint(0);
    for (let i = 1; i <= TrackCurve.LUT_N; i++) {
      const pt = this.curve.getPoint(i / TrackCurve.LUT_N);
      acc += pt.distanceTo(prev);
      this.lut.push(acc);
      prev = pt;
    }
    this.lengthM = acc;
  }

  /** Map distance (m, any real number — wraps around the loop) to curve u ∈ [0,1). */
  distToU(dist: number): number {
    const d = ((dist % this.lengthM) + this.lengthM) % this.lengthM;
    // Binary search the LUT
    let lo = 0, hi = TrackCurve.LUT_N;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (this.lut[mid] <= d) lo = mid; else hi = mid;
    }
    const span = this.lut[hi] - this.lut[lo] || 1;
    return (lo + (d - this.lut[lo]) / span) / TrackCurve.LUT_N;
  }

  private halfWidthAtU(u: number): number {
    const n = this.widths.length;
    const raw = u * n;
    const i = Math.floor(raw) % n;
    const j = (i + 1) % n;
    return this.widths[i] + (this.widths[j] - this.widths[i]) * (raw - Math.floor(raw));
  }

  /** Full frame at a loop distance in metres. */
  sampleAt(dist: number): TrackSample {
    const u = this.distToU(dist);
    const pos = this.curve.getPoint(u);
    const tangent = this.curve.getTangent(u).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    return { pos, tangent, normal, halfWidth: this.halfWidthAtU(u) };
  }

  /** World position for (loop metres, lateral -1..1, height above road). */
  worldPos(dist: number, lateral: number, y = 0): THREE.Vector3 {
    const s = this.sampleAt(dist);
    return s.pos.clone()
      .addScaledVector(s.normal, lateral * s.halfWidth)
      .add(new THREE.Vector3(0, y, 0));
  }

  /** Road gradient (rise/run) looking `lookM` metres ahead. */
  gradientAt(dist: number, lookM = 12): number {
    const a = this.sampleAt(dist).pos.y;
    const b = this.sampleAt(dist + lookM).pos.y;
    return (b - a) / lookM;
  }

  /** Signed curvature estimate (rad/m); positive = turning left. */
  curvatureAt(dist: number, lookM = 6): number {
    const t0 = this.sampleAt(dist).tangent;
    const t1 = this.sampleAt(dist + lookM).tangent;
    const cross = t0.x * t1.z - t0.z * t1.x;
    const dot = THREE.MathUtils.clamp(t0.dot(t1), -1, 1);
    return (Math.sign(-cross) * Math.acos(dot)) / lookM;
  }

  /** Total metres of climbing in one lap (for scoring). */
  climbPerLap(samples = 512): number {
    let climb = 0;
    let prevY = this.sampleAt(0).pos.y;
    for (let i = 1; i <= samples; i++) {
      const y = this.sampleAt((i / samples) * this.lengthM).pos.y;
      if (y > prevY) climb += y - prevY;
      prevY = y;
    }
    return climb;
  }
}

/** Deterministic per-track RNG so scenery layout is stable frame-to-frame and across clients. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Shortest signed gap (m) from kart a to kart b around a loop of length L. */
export function loopGap(aProgress: number, bProgress: number, loopLength: number): number {
  const diff = (bProgress - aProgress) % loopLength;
  const half = loopLength / 2;
  if (diff > half) return diff - loopLength;
  if (diff < -half) return diff + loopLength;
  return diff;
}
