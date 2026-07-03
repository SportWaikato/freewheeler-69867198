// ─────────────────────────────────────────────────────────────────────────────
// Freewheeler Bike League — shared game types
//
// A track is pure data (TrackDef). Adding a new track = one new file in
// src/data/tracks/ that exports a TrackDef, registered in src/data/tracks/index.ts.
// No engine changes required.
// ─────────────────────────────────────────────────────────────────────────────

/** One control point of the track centreline. The loop is closed automatically. */
export interface TrackControlPoint {
  x: number;      // metres, world X
  z: number;      // metres, world Z
  y?: number;     // metres, elevation (default 0)
  width?: number; // half-width override in metres (default theme/track width)
}

/** Things placed on the track surface, positioned by loop progress t ∈ [0,1). */
export type TrackFeatureType = 'boostPad' | 'itemBoxRow' | 'obstacle' | 'jump';

export interface TrackFeature {
  type: TrackFeatureType;
  t: number;        // progress along the loop 0–1
  lateral?: number; // -1..1 across track width (0 = centre). itemBoxRow ignores this.
}

/** Scenery placement hint — themes interpret these. */
export interface SceneryBand {
  /** Which procedural scenery builder to use (must exist in the theme). */
  kind: string;
  /** Distance from track edge in metres (min..max). */
  offset: [number, number];
  /** Approximate count around the whole loop. */
  count: number;
  /** Optional t-range restriction. */
  range?: [number, number];
  scale?: [number, number];
}

export interface TrackDef {
  id: string;
  name: string;
  tagline: string;
  themeId: string;
  difficulty: 1 | 2 | 3;      // 1 = easy
  laps: number;
  /** Nominal stats used for scoring + course select display. */
  elevGainPerLapM: number;    // derived-ish; stated for scoring clarity
  parTimeSeconds: number;     // "beat par" solo target
  points: TrackControlPoint[];
  halfWidth: number;          // default half-width (m)
  features: TrackFeature[];
  scenery: SceneryBand[];
}

// ── Live race state ──────────────────────────────────────────────────────────

export type ItemType = 'turbo' | 'shield' | 'slick' | 'zap';

export interface KartState {
  id: string;              // player id
  name: string;
  color: number;           // kart body colour
  /** Total loop progress in metres since the start line (monotonic across laps). */
  progress: number;
  lateral: number;         // -1..1 across the track half-width
  speed: number;           // m/s
  lap: number;             // 1-based current lap
  finished: boolean;
  finishTime?: number;     // seconds since race start
  item: ItemType | null;
  boostTimer: number;      // seconds of active boost remaining
  slowTimer: number;       // seconds of slick/zap slow remaining
  shielded: boolean;
  charge: number;          // 0..1 sprint-charge meter
}

export interface DroppedHazard {
  id: string;
  ownerId: string;
  progress: number; // metres along loop
  lateral: number;
}

export interface RaceHudData {
  speedKmh: number;
  powerW: number;
  cadenceRpm: number;
  heartRate: number;
  distanceKm: number;
  lap: number;
  totalLaps: number;
  position: number;
  totalKarts: number;
  item: ItemType | null;
  charge: number;       // 0..1
  boosting: boolean;
  drafting: boolean;
  slowed: boolean;
  shielded: boolean;
  offTrack: boolean;
  elapsed: number;      // s
  lastLapTime: number | null;
  bestLapTime: number | null;
  progressPct: number;  // 0..100 across whole race
}

export interface RaceFinishData {
  finishPosition: number;
  totalRacers: number;
  finishTimeSeconds: number;
  bestLapSeconds: number | null;
  distanceKm: number;
  avgSpeedKmh: number;
  avgPowerWatts: number;
  avgCadenceRpm: number;
  elevationGainM: number;
  placementPoints: number;
  beatPar: boolean;
}

/** 10 Hz multiplayer state packet (kept tiny — broadcast payload). */
export interface NetKartState {
  id: string;
  n: string;   // name
  c: number;   // color
  p: number;   // progress (m)
  l: number;   // lateral -1..1
  s: number;   // speed m/s
  lp: number;  // lap
  f: 0 | 1;    // finished
  ft?: number; // finish time s
}
