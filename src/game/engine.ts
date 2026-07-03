// ─────────────────────────────────────────────────────────────────────────────
// Freewheeler Bike League — game engine
//
// Owns the Three.js scene and the whole race simulation for the LOCAL player,
// plus lightweight interpolated proxies for remote karts. React never touches
// the scene: the RaceScreen feeds inputs in (rider watts/cadence, steer value,
// item button) and receives HUD snapshots + events out via callbacks.
//
// Multiplayer stays thin: the engine emits NetKartState packets and consumes
// them for remote karts; item/hazard/zap effects arrive as explicit calls.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import type {
  DroppedHazard, ItemType, KartState, NetKartState, RaceFinishData, RaceHudData, TrackDef,
} from './types';
import { TrackCurve, hashString, loopGap, mulberry32 } from './math';
import { buildTrackMeshes, type BuiltTrack } from './trackGeometry';
import { THEMES, buildScenery, buildSky, type ThemeDef } from './themes';
import { buildBike, RIDER_COLORS, type BikeModel } from './bikeModel';
import { targetSpeed, stepSpeed, stepLateral, PHYSICS } from './physics';
import { ITEM_DURATIONS, rollItem, stepCharge } from './items';
import { placementPoints, soloPoints } from './scoring';

export interface EngineEvents {
  onHud: (hud: RaceHudData) => void;
  onCountdownDone?: () => void;
  onLap?: (lap: number, lapTime: number) => void;
  onItemPickup?: (item: ItemType) => void;
  onFinish?: (data: RaceFinishData) => void;
  /** Local kart state to broadcast (called ~10 Hz while racing). */
  onNetState?: (state: NetKartState) => void;
  /** Local player dropped a slick — broadcast it. */
  onDropHazard?: (hazard: DroppedHazard) => void;
  /** Local player zapped `targetId` — broadcast it. */
  onZap?: (targetId: string) => void;
  /** Local player crossed the finish line — broadcast it. */
  onFinishLine?: (finishTime: number) => void;
}

export interface EngineOptions {
  playerId: string;
  playerName: string;
  colorIndex: number;
  events: EngineEvents;
  /** Known finish order (player ids) maintained by the race coordinator. */
  getFinishOrder: () => string[];
}

interface RemoteKart {
  state: KartState;
  model: BikeModel;
  targetProgress: number;
  targetLateral: number;
  netSpeed: number;
}

// Tuned for the bike silhouette (narrower/taller than a kart): slightly closer
// and lower so the rider reads larger without hiding the road ahead.
const CAM = { back: 5.4, up: 2.6, lookAhead: 9, fov: 68, boostFov: 80 } as const;

export class GameEngine {
  readonly track: TrackDef;
  readonly curve: TrackCurve;
  readonly theme: ThemeDef;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private container: HTMLElement;
  private built: BuiltTrack;
  private clock = new THREE.Clock();
  private rafId = 0;
  private disposed = false;

  // Local player
  private me: KartState;
  private meModel: BikeModel;
  private steerInput = 0;              // -1..1
  private riderWatts = 0;
  private riderCadence = 0;
  private riderHeartRate = 0;
  private rollingPowerAvg = 0;
  private lean = 0;

  // Remote karts
  private remotes = new Map<string, RemoteKart>();

  // Hazards on track (slicks) — id → mesh
  private hazards = new Map<string, { hazard: DroppedHazard; mesh: THREE.Mesh }>();
  private hazardGroup = new THREE.Group();
  private itemRng: () => number;

  // Race state
  private running = false;
  private raceStartAt = 0;             // clock elapsed time when GO
  private elapsed = 0;
  private lapStartElapsed = 0;
  private lastLapTime: number | null = null;
  private bestLapTime: number | null = null;
  private prevY: number | null = null;
  private climbM = 0;
  private distanceM = 0;
  private powerSum = 0;
  private cadenceSum = 0;
  private sampleCount = 0;
  private hudAccum = 0;
  private netAccum = 0;
  private drafting = false;
  private offTrack = false;
  private finishedEmitted = false;

  constructor(container: HTMLElement, track: TrackDef, opts: EngineOptions) {
    this.container = container;
    this.track = track;
    this.opts = opts;
    this.curve = new TrackCurve(track);
    this.theme = THEMES[track.themeId] ?? THEMES.meadow;
    this.itemRng = mulberry32(hashString(opts.playerId + track.id));

    // Renderer
    const W = container.clientWidth, H = container.clientHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(W, H);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(CAM.fov, W / H, 0.3, 1200);

    // World
    const theme = this.theme;
    this.scene.fog = new THREE.Fog(theme.fogColor, theme.fogNear, theme.fogFar);
    this.scene.add(buildSky(theme));
    this.scene.add(new THREE.AmbientLight(theme.ambientColor, theme.ambientIntensity));
    const hemi = new THREE.HemisphereLight(theme.skyBottom, theme.groundColor, 0.5);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(theme.sunColor, theme.sunIntensity);
    sun.position.set(120, 180, 80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = 140;
    sun.shadow.camera.left = -sc; sun.shadow.camera.right = sc;
    sun.shadow.camera.top = sc; sun.shadow.camera.bottom = -sc;
    sun.shadow.camera.far = 600;
    this.scene.add(sun);
    this.sun = sun;

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(850, 48),
      new THREE.MeshStandardMaterial({ color: theme.groundColor, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.35;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.built = buildTrackMeshes(track, this.curve, theme.palette);
    this.scene.add(this.built.group);
    this.scene.add(buildScenery(theme, track.scenery, this.curve, hashString(track.id)));
    this.scene.add(this.hazardGroup);

    // Local rider
    this.me = this.makeKartState(opts.playerId, opts.playerName, RIDER_COLORS[opts.colorIndex % RIDER_COLORS.length]);
    this.meModel = buildBike(opts.playerName, this.me.color);
    this.meModel.nametag.visible = false; // you don't need your own tag
    this.scene.add(this.meModel.group);

    this.placeKart(this.meModel, this.me, 0);
    this.updateCamera(1);

    window.addEventListener('resize', this.onResize);
    this.loop();
  }

  private opts: EngineOptions;
  private sun: THREE.DirectionalLight;

  private makeKartState(id: string, name: string, color: number): KartState {
    return {
      id, name, color,
      progress: 0, lateral: 0, speed: 0, lap: 1,
      finished: false, item: null,
      boostTimer: 0, slowTimer: 0, shielded: false, charge: 0,
    };
  }

  // ── Public API (called by RaceScreen / multiplayer layer) ──────────────────

  /** Grid slot before the start (0-based). */
  setGridSlot(slot: number) {
    this.me.progress = -6 - slot * 3.5;
    this.me.lateral = slot % 2 === 0 ? -0.45 : 0.45;
    this.placeKart(this.meModel, this.me, 0);
  }

  startRace() {
    this.running = true;
    this.raceStartAt = this.clock.elapsedTime;
    this.lapStartElapsed = 0;
    this.elapsed = 0;
  }

  setSteer(v: number) { this.steerInput = THREE.MathUtils.clamp(v, -1, 1); }

  setRiderInput(watts: number, cadence: number, heartRate = 0) {
    this.riderWatts = Math.max(0, watts);
    this.riderCadence = Math.max(0, cadence);
    this.riderHeartRate = heartRate;
  }

  /** Fire the held item. Returns the item used (or null). */
  useItem(): ItemType | null {
    const item = this.me.item;
    if (!item || !this.running || this.me.finished) return null;
    this.me.item = null;
    switch (item) {
      case 'turbo':
        this.me.boostTimer = Math.max(this.me.boostTimer, ITEM_DURATIONS.turboSeconds);
        break;
      case 'shield':
        this.me.shielded = true;
        break;
      case 'slick': {
        const hazard: DroppedHazard = {
          id: `${this.opts.playerId}-${Date.now()}`,
          ownerId: this.opts.playerId,
          progress: ((this.me.progress - 3) % this.curve.lengthM + this.curve.lengthM) % this.curve.lengthM,
          lateral: this.me.lateral,
        };
        this.addHazard(hazard);
        this.opts.events.onDropHazard?.(hazard);
        break;
      }
      case 'zap': {
        const target = this.kartAhead();
        if (target) this.opts.events.onZap?.(target);
        break;
      }
    }
    return item;
  }

  /** Remote kart lifecycle. */
  applyNetState(s: NetKartState) {
    if (s.id === this.opts.playerId) return;
    let r = this.remotes.get(s.id);
    if (!r) {
      const model = buildBike(s.n, s.c);
      this.scene.add(model.group);
      r = {
        state: this.makeKartState(s.id, s.n, s.c),
        model,
        targetProgress: s.p,
        targetLateral: s.l,
        netSpeed: s.s,
      };
      r.state.progress = s.p;
      this.remotes.set(s.id, r);
    }
    r.targetProgress = s.p;
    r.targetLateral = s.l;
    r.netSpeed = s.s;
    r.state.lap = s.lp;
    r.state.name = s.n;
    r.state.finished = s.f === 1;
    r.state.finishTime = s.ft;
  }

  removeRemote(id: string) {
    const r = this.remotes.get(id);
    if (r) {
      this.scene.remove(r.model.group);
      this.remotes.delete(id);
    }
  }

  /** A remote player dropped a slick. */
  addHazard(hazard: DroppedHazard) {
    if (this.hazards.has(hazard.id)) return;
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 14),
      new THREE.MeshStandardMaterial({ color: 0x14121a, roughness: 0.25, metalness: 0.55, transparent: true, opacity: 0.92 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    const p = this.curve.worldPos(hazard.progress, hazard.lateral, 0.06);
    mesh.position.copy(p);
    this.hazardGroup.add(mesh);
    this.hazards.set(hazard.id, { hazard, mesh });
  }

  /** This local player got zapped by someone behind. */
  applyZapToMe() {
    if (this.me.shielded) { this.me.shielded = false; return; }
    this.me.slowTimer = Math.max(this.me.slowTimer, ITEM_DURATIONS.zapSlowSeconds);
    this.me.boostTimer = 0;
  }

  /** Race positions (1-based) for every kart id, live or finished. */
  positions(): Array<{ id: string; name: string; color: number; position: number; finished: boolean }> {
    const finishOrder = this.opts.getFinishOrder();
    const all = [this.me, ...[...this.remotes.values()].map(r => r.state)];
    const done = all.filter(k => finishOrder.includes(k.id))
      .sort((a, b) => finishOrder.indexOf(a.id) - finishOrder.indexOf(b.id));
    const live = all.filter(k => !finishOrder.includes(k.id))
      .sort((a, b) => b.progress - a.progress);
    return [...done, ...live].map((k, i) => ({
      id: k.id, name: k.name, color: k.color, position: i + 1, finished: finishOrder.includes(k.id),
    }));
  }

  myPosition(): number {
    return this.positions().find(p => p.id === this.opts.playerId)?.position ?? 1;
  }

  /** Normalised (0..1) minimap geometry + live kart dots. */
  minimap(): { outline: Array<[number, number]>; karts: Array<{ x: number; y: number; color: number; me: boolean }> } {
    if (!this.minimapOutline) {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i <= 96; i++) {
        const p = this.curve.sampleAt((i / 96) * this.curve.lengthM).pos;
        pts.push([p.x, p.z]);
      }
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const span = Math.max(maxX - minX, maxY - minY) || 1;
      this.minimapNorm = { minX, minY, span };
      this.minimapOutline = pts.map(([x, y]) => [(x - minX) / span, (y - minY) / span]);
    }
    const norm = this.minimapNorm!;
    const dot = (k: KartState, me: boolean) => {
      const p = this.curve.worldPos(Math.max(k.progress, 0), k.lateral);
      return { x: (p.x - norm.minX) / norm.span, y: (p.z - norm.minY) / norm.span, color: k.color, me };
    };
    return {
      outline: this.minimapOutline,
      karts: [dot(this.me, true), ...[...this.remotes.values()].map(r => dot(r.state, false))],
    };
  }
  private minimapOutline: Array<[number, number]> | null = null;
  private minimapNorm: { minX: number; minY: number; span: number } | null = null;

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private onResize = () => {
    const W = this.container.clientWidth, H = this.container.clientHeight;
    if (!W || !H) return;
    this.renderer.setSize(W, H);
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
  };

  private kartAhead(): string | null {
    let best: { id: string; gap: number } | null = null;
    for (const r of this.remotes.values()) {
      if (r.state.finished) continue;
      const gap = r.state.progress - this.me.progress;
      if (gap > 0 && (!best || gap < best.gap)) best = { id: r.state.id, gap };
    }
    return best && best.gap < 220 ? best.id : null;
  }

  private placeKart(model: BikeModel, k: KartState, dt: number, steerLean = 0, cadenceRpm?: number) {
    const dist = ((k.progress % this.curve.lengthM) + this.curve.lengthM) % this.curve.lengthM;
    const s = this.curve.sampleAt(dist);
    const pos = s.pos.clone().addScaledVector(s.normal, k.lateral * s.halfWidth);
    model.group.position.set(pos.x, pos.y, pos.z);
    model.group.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);
    // Pitch with the road
    const grad = this.curve.gradientAt(dist, 6);
    model.body.rotation.x = THREE.MathUtils.lerp(model.body.rotation.x, -Math.atan(grad) * 0.7, dt * 6 || 1);
    // Lean INTO corners like a real rider: physical lean angle atan(v²·κ/g)
    // (κ > 0 = left turn = negative roll), plus the local steer-input lean.
    const kappa = this.curve.curvatureAt(dist);
    const targetRoll = THREE.MathUtils.clamp(
      -Math.atan((k.speed * k.speed * kappa) / 9.81) + steerLean,
      -0.42, 0.42,
    );
    model.body.rotation.z = THREE.MathUtils.lerp(model.body.rotation.z, targetRoll, 1 - Math.exp(-(dt || 0.016) * 5));
    // Wheel roll + pedalling (cadence estimated from speed for remote riders)
    const cadence = cadenceRpm ?? Math.min(100, k.speed * 9);
    model.update(dt, k.speed, cadence);
    model.shieldMesh.visible = k.shielded;
    model.boostFlames.forEach(f => { f.visible = k.boostTimer > 0; });
  }

  private updateCamera(dt: number) {
    const k = this.me;
    const dist = ((k.progress % this.curve.lengthM) + this.curve.lengthM) % this.curve.lengthM;
    const s = this.curve.sampleAt(dist);
    const kartPos = s.pos.clone().addScaledVector(s.normal, k.lateral * s.halfWidth);
    const behind = this.curve.sampleAt(dist - CAM.back);
    const camTarget = behind.pos.clone()
      .addScaledVector(behind.normal, k.lateral * behind.halfWidth * 0.55)
      .add(new THREE.Vector3(0, CAM.up, 0));
    const alpha = 1 - Math.exp(-dt * 5.5);
    this.camera.position.lerp(camTarget, Math.min(alpha, 1));
    const look = this.curve.sampleAt(dist + CAM.lookAhead).pos.clone().add(new THREE.Vector3(0, 1.2, 0));
    this.camera.lookAt(look.x, (look.y + kartPos.y + 1.2) / 2, look.z);
    // FOV kick when boosting / fast
    const wantFov = k.boostTimer > 0 ? CAM.boostFov : CAM.fov + Math.min(k.speed, 20) * 0.35;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, wantFov, 1 - Math.exp(-dt * 4));
    this.camera.updateProjectionMatrix();
    // Keep the sun's shadow box roughly centred on the player
    this.sun.position.set(kartPos.x + 120, 180, kartPos.z + 80);
    this.sun.target.position.copy(kartPos);
    this.sun.target.updateMatrixWorld();
  }

  private stepLocal(dt: number) {
    const k = this.me;
    if (k.finished) {
      // Coast after the flag
      k.speed = Math.max(k.speed - 3 * dt, 0);
      k.progress += k.speed * dt;
      return;
    }

    // Timers
    k.boostTimer = Math.max(0, k.boostTimer - dt);
    k.slowTimer = Math.max(0, k.slowTimer - dt);

    // Rolling power average (for sprint-spike detection), ~20 s horizon
    this.rollingPowerAvg += (this.riderWatts - this.rollingPowerAvg) * Math.min(dt / 20, 1);

    // Sprint charge
    const { charge, fired } = stepCharge(k.charge, this.riderCadence, this.riderWatts, this.rollingPowerAvg, dt);
    k.charge = charge;
    if (fired) k.boostTimer = Math.max(k.boostTimer, ITEM_DURATIONS.miniTurboSeconds);

    // Drafting: within 7 m behind any kart, roughly same line
    this.drafting = false;
    for (const r of this.remotes.values()) {
      const gap = loopGap(k.progress, r.state.progress, this.curve.lengthM);
      if (gap > 1 && gap < 7 && Math.abs(r.state.lateral - k.lateral) < 0.45) { this.drafting = true; break; }
    }

    // Off-track: hugging the wall at speed scrubs speed (walls sit at |lat| = 1)
    this.offTrack = Math.abs(k.lateral) > 0.93;

    const grad = this.curve.gradientAt(Math.max(k.progress, 0));
    const target = targetSpeed(this.riderWatts, {
      boosting: k.boostTimer > 0,
      drafting: this.drafting,
      slowed: k.slowTimer > 0,
      offTrack: this.offTrack,
      gradient: grad,
    });
    k.speed = stepSpeed(k.speed, target, dt);
    k.progress += k.speed * dt;
    this.distanceM += k.speed * dt;

    // Steering — lean is applied in placeKart (into the turn, like a real rider)
    const st = stepLateral(k.lateral, this.steerInput, k.speed, dt);
    k.lateral = st.lateral;
    this.lean = THREE.MathUtils.lerp(this.lean, this.steerInput * 0.14, 1 - Math.exp(-dt * 8));

    // Climb accumulation
    const y = this.curve.sampleAt(Math.max(k.progress, 0)).pos.y;
    if (this.prevY !== null && y > this.prevY) this.climbM += y - this.prevY;
    this.prevY = y;

    // Averages
    this.powerSum += this.riderWatts * dt;
    this.cadenceSum += this.riderCadence * dt;
    this.sampleCount += dt;

    // ── Feature collisions (progress-space, cheap) ──
    const wrapped = ((k.progress % this.curve.lengthM) + this.curve.lengthM) % this.curve.lengthM;

    for (const pad of this.built.features.boostPads) {
      if (Math.abs(loopGap(wrapped, pad.progress, this.curve.lengthM)) < 2.2 &&
          Math.abs(k.lateral - pad.lateral) < 0.5) {
        k.boostTimer = Math.max(k.boostTimer, 1.5);
      }
    }

    const now = this.clock.elapsedTime;
    for (const box of this.built.features.itemBoxes) {
      box.mesh.rotation.y += dt * 1.6;
      box.mesh.rotation.x += dt * 0.9;
      box.mesh.visible = now >= box.takenUntil;
      if (!box.mesh.visible) continue;
      if (k.item === null &&
          Math.abs(loopGap(wrapped, box.progress, this.curve.lengthM)) < 1.6 &&
          Math.abs(k.lateral - box.lateral) < 0.34) {
        box.takenUntil = now + ITEM_DURATIONS.itemBoxRespawnSeconds;
        const item = rollItem(this.myPosition(), this.remotes.size + 1, this.itemRng());
        k.item = item;
        this.opts.events.onItemPickup?.(item);
      }
    }

    for (const ob of this.built.features.obstacles) {
      if (Math.abs(loopGap(wrapped, ob.progress, this.curve.lengthM)) < 1.4 &&
          Math.abs(k.lateral - ob.lateral) < 0.22) {
        if (k.shielded) { k.shielded = false; }
        else if (k.slowTimer <= 0) { k.slowTimer = 1.2; k.boostTimer = 0; }
      }
    }

    for (const [id, h] of this.hazards) {
      if (Math.abs(loopGap(wrapped, h.hazard.progress, this.curve.lengthM)) < 1.4 &&
          Math.abs(k.lateral - h.hazard.lateral) < 0.3) {
        this.hazardGroup.remove(h.mesh);
        this.hazards.delete(id);
        if (k.shielded) { k.shielded = false; }
        else { k.slowTimer = Math.max(k.slowTimer, ITEM_DURATIONS.slickSlowSeconds); k.boostTimer = 0; }
      }
    }

    // ── Lap / finish ──
    const lapNow = Math.floor(Math.max(k.progress, 0) / this.curve.lengthM) + 1;
    if (lapNow > k.lap && k.progress > 0) {
      const lapTime = this.elapsed - this.lapStartElapsed;
      this.lapStartElapsed = this.elapsed;
      this.lastLapTime = lapTime;
      if (this.bestLapTime === null || lapTime < this.bestLapTime) this.bestLapTime = lapTime;
      k.lap = lapNow;
      if (lapNow > this.track.laps) {
        k.finished = true;
        k.finishTime = this.elapsed;
        this.opts.events.onFinishLine?.(this.elapsed);
        this.opts.events.onLap?.(this.track.laps, lapTime);
      } else {
        this.opts.events.onLap?.(lapNow, lapTime);
      }
    }
  }

  /** Called by the coordinator once the final finish order (incl. me) is known. */
  emitFinish(finishOrder: string[]) {
    if (this.finishedEmitted) return;
    this.finishedEmitted = true;
    const totalRacers = this.remotes.size + 1;
    const myPos = Math.max(finishOrder.indexOf(this.opts.playerId) + 1, 1);
    const secs = Math.round(this.me.finishTime ?? this.elapsed);
    const avgPower = this.sampleCount > 0 ? this.powerSum / this.sampleCount : 0;
    const avgCadence = this.sampleCount > 0 ? this.cadenceSum / this.sampleCount : 0;
    const distanceKm = this.distanceM / 1000;
    const beatPar = secs <= this.track.parTimeSeconds;
    const placement = totalRacers > 1
      ? placementPoints(myPos, totalRacers)
      : soloPoints(secs, this.track.parTimeSeconds);
    this.opts.events.onFinish?.({
      finishPosition: myPos,
      totalRacers,
      finishTimeSeconds: secs,
      bestLapSeconds: this.bestLapTime ? Math.round(this.bestLapTime) : null,
      distanceKm,
      avgSpeedKmh: secs > 0 ? (distanceKm / secs) * 3600 : 0,
      avgPowerWatts: Math.round(avgPower),
      avgCadenceRpm: Math.round(avgCadence),
      elevationGainM: Math.round(this.climbM),
      placementPoints: placement,
      beatPar,
    });
  }

  private stepRemotes(dt: number) {
    for (const r of this.remotes.values()) {
      // Dead-reckon: advance at last known speed, spring toward reported progress
      r.state.progress += r.netSpeed * dt;
      const err = r.targetProgress + r.netSpeed * 0.05 - r.state.progress;
      r.state.progress += err * Math.min(dt * 4, 1);
      r.state.lateral += (r.targetLateral - r.state.lateral) * Math.min(dt * 6, 1);
      r.state.speed = r.netSpeed;
      this.placeKart(r.model, r.state, dt);
    }
  }

  private emitHud() {
    const k = this.me;
    const total = this.track.laps * this.curve.lengthM;
    this.opts.events.onHud({
      speedKmh: k.speed * 3.6,
      powerW: this.riderWatts,
      cadenceRpm: this.riderCadence,
      heartRate: this.riderHeartRate,
      distanceKm: this.distanceM / 1000,
      lap: Math.min(k.lap, this.track.laps),
      totalLaps: this.track.laps,
      position: this.myPosition(),
      totalKarts: this.remotes.size + 1,
      item: k.item,
      charge: k.charge,
      boosting: k.boostTimer > 0,
      drafting: this.drafting,
      slowed: k.slowTimer > 0,
      shielded: k.shielded,
      offTrack: this.offTrack,
      elapsed: this.elapsed,
      lastLapTime: this.lastLapTime,
      bestLapTime: this.bestLapTime,
      progressPct: Math.min(Math.max(k.progress, 0) / total, 1) * 100,
    });
  }

  private loop = () => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.running) {
      this.elapsed = this.clock.elapsedTime - this.raceStartAt;
      this.stepLocal(dt);
    } else {
      // Idle spin of item boxes on the grid
      for (const box of this.built.features.itemBoxes) box.mesh.rotation.y += dt * 1.6;
    }
    this.stepRemotes(dt);
    this.placeKart(this.meModel, this.me, dt, this.lean, this.riderCadence);
    this.updateCamera(dt);

    this.hudAccum += dt;
    if (this.hudAccum >= 0.1) { this.hudAccum = 0; this.emitHud(); }

    if (this.running && !this.me.finished) {
      this.netAccum += dt;
      if (this.netAccum >= 0.1) {
        this.netAccum = 0;
        this.opts.events.onNetState?.({
          id: this.opts.playerId,
          n: this.opts.playerName,
          c: this.me.color,
          p: Math.round(this.me.progress * 10) / 10,
          l: Math.round(this.me.lateral * 100) / 100,
          s: Math.round(this.me.speed * 100) / 100,
          lp: this.me.lap,
          f: 0,
        });
      }
    }

    this.renderer.render(this.scene, this.camera);
  };
}
