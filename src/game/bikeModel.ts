// ─────────────────────────────────────────────────────────────────────────────
// Cycle Cup — procedural road bike + rider model
//
// Replaces the earlier kart model: this is a cycling app, so the thing on
// track is a push bike with a rider in a racing crouch. Built from primitives
// (no asset downloads), recolours per player, and matches the game's stylised
// low-poly register.
//
// Animation is driven by update(dt, speedMps, cadenceRpm):
//   · wheels roll at true ground speed
//   · cranks turn at cadence; pedals stay level
//   · legs follow the pedals via 2-bone IK (hip → knee → pedal)
// The `body` group is the roll/pitch pivot — the engine leans the whole
// bike+rider into corners and pitches it with the road gradient.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

export interface BikeModel {
  group: THREE.Group;
  /** Roll/pitch pivot: contains the entire bike + rider (wheels included). */
  body: THREE.Group;
  shieldMesh: THREE.Mesh;
  boostFlames: THREE.Mesh[];
  nametag: THREE.Sprite;
  /** Advance wheel roll, crank rotation and leg IK. */
  update: (dt: number, speedMps: number, cadenceRpm: number) => void;
}

// ── Geometry constants (metres, bike faces +Z) ───────────────────────────────
const WHEEL_R = 0.34;
const REAR_AXLE = new THREE.Vector3(0, WHEEL_R, -0.52);
const FRONT_AXLE = new THREE.Vector3(0, WHEEL_R, 0.55);
const BB = new THREE.Vector3(0, 0.30, 0.03);        // bottom bracket
const CRANK_LEN = 0.17;
const PEDAL_X = 0.14;
const SADDLE = new THREE.Vector3(0, 0.96, -0.22);
const HEAD_TOP = new THREE.Vector3(0, 0.95, 0.42);  // head tube top
const HIP_Y = 1.0, HIP_Z = -0.2, HIP_X = 0.09;
const THIGH_LEN = 0.46, SHIN_LEN = 0.46;

function makeNametag(text: string, colorHex: number): THREE.Sprite {
  const W = 256, H = 64;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const col = `#${colorHex.toString(16).padStart(6, '0')}`;
  ctx.fillStyle = 'rgba(15,18,10,0.82)';
  ctx.beginPath();
  ctx.roundRect(4, 8, W - 8, H - 16, 14);
  ctx.fill();
  ctx.strokeStyle = col;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(4, 8, W - 8, H - 16, 14);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 30px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.slice(0, 12).toUpperCase(), W / 2, H / 2 + 1);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(2.2, 0.55, 1);
  sprite.position.set(0, 1.95, 0);
  return sprite;
}

/** Cylinder "tube" between two points; call setTube again to re-orient (legs). */
const UNIT_Y = new THREE.Vector3(0, 1, 0);
function setTube(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length() || 0.001;
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(UNIT_Y, dir.normalize());
  mesh.scale.set(1, len, 1);
}
function tube(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material): THREE.Mesh {
  // Unit-height cylinder so setTube can scale length without touching radius
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 8), mat);
  m.castShadow = true;
  setTube(m, a, b);
  return m;
}

function buildWheel(dark: THREE.Material, chrome: THREE.Material): THREE.Group {
  const wheel = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R, 0.042, 10, 24), dark);
  tire.rotation.y = Math.PI / 2; // wheel plane = YZ, rolls around local X
  tire.castShadow = true;
  wheel.add(tire);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.09, 8), chrome);
  hub.rotation.z = Math.PI / 2;
  wheel.add(hub);
  const spokeGeo = new THREE.CylinderGeometry(0.007, 0.007, WHEEL_R * 2 - 0.06, 4);
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Mesh(spokeGeo, chrome);
    spoke.rotation.x = (i / 4) * Math.PI;
    wheel.add(spoke);
  }
  return wheel;
}

export function buildBike(name: string, colorHex: number): BikeModel {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const paint = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.35, metalness: 0.3 });
  const jersey = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.65 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.85 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xcfcfd8, roughness: 0.3, metalness: 0.65 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.7 });
  const shorts = new THREE.MeshStandardMaterial({ color: 0x23232c, roughness: 0.75 });

  // ── Wheels ──
  const rearWheel = buildWheel(dark, chrome);
  rearWheel.position.copy(REAR_AXLE);
  const frontWheel = buildWheel(dark, chrome);
  frontWheel.position.copy(FRONT_AXLE);
  body.add(rearWheel, frontWheel);

  // ── Frame ──
  const seatCluster = new THREE.Vector3(0, 0.90, -0.16);
  const headBottom = new THREE.Vector3(0, 0.62, 0.48);
  body.add(
    tube(BB, seatCluster, 0.028, paint),                                   // seat tube
    tube(seatCluster, SADDLE, 0.02, chrome),                               // seat post
    tube(BB, headBottom, 0.03, paint),                                     // down tube
    tube(seatCluster, HEAD_TOP, 0.026, paint),                             // top tube
    tube(headBottom, HEAD_TOP, 0.028, paint),                              // head tube
    tube(new THREE.Vector3(0.05, BB.y, BB.z), REAR_AXLE, 0.016, paint),    // chainstays
    tube(new THREE.Vector3(-0.05, BB.y, BB.z), REAR_AXLE, 0.016, paint),
    tube(seatCluster, REAR_AXLE, 0.014, paint),                            // seat stays
    tube(HEAD_TOP, new THREE.Vector3(0.045, FRONT_AXLE.y, FRONT_AXLE.z), 0.016, paint), // fork
    tube(HEAD_TOP, new THREE.Vector3(-0.045, FRONT_AXLE.y, FRONT_AXLE.z), 0.016, paint),
  );

  // Saddle
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.045, 0.26), dark);
  saddle.position.copy(SADDLE).add(new THREE.Vector3(0, 0.03, 0));
  saddle.castShadow = true;
  body.add(saddle);

  // Handlebars — stem + flat top bar + forward drops
  const barCentre = new THREE.Vector3(0, 1.0, 0.46);
  body.add(tube(HEAD_TOP, barCentre, 0.02, chrome)); // stem
  body.add(tube(new THREE.Vector3(-0.17, 1.0, 0.46), new THREE.Vector3(0.17, 1.0, 0.46), 0.018, dark));
  for (const sx of [-0.17, 0.17]) {
    body.add(tube(new THREE.Vector3(sx, 1.0, 0.46), new THREE.Vector3(sx, 0.93, 0.56), 0.018, dark)); // hoods/drops
  }

  // Chainring
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.014, 6, 18), chrome);
  ring.rotation.y = Math.PI / 2;
  ring.position.copy(BB).add(new THREE.Vector3(0.055, 0, 0));
  body.add(ring);

  // ── Cranks + pedals (animated) ──
  const crankGroup = new THREE.Group();
  crankGroup.position.copy(BB);
  body.add(crankGroup);
  const pedals: THREE.Mesh[] = [];
  for (const side of [1, -1] as const) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, CRANK_LEN, 0.035), chrome);
    arm.position.set(side * (PEDAL_X - 0.02), (side === 1 ? 1 : -1) * (CRANK_LEN / 2), 0);
    crankGroup.add(arm);
    const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.13), dark);
    pedal.position.set(side * PEDAL_X, (side === 1 ? 1 : -1) * CRANK_LEN, 0);
    crankGroup.add(pedal);
    pedals.push(pedal);
  }

  // ── Rider ──
  const shoulders = new THREE.Vector3(0, 1.2, 0.14);
  const hipCentre = new THREE.Vector3(0, HIP_Y, HIP_Z);
  const torso = tube(hipCentre, shoulders, 0.115, jersey);
  body.add(torso);
  // Hips block
  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8), shorts);
  hips.position.copy(hipCentre);
  hips.castShadow = true;
  body.add(hips);
  // Head + helmet + visor
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.125, 14, 10), new THREE.MeshStandardMaterial({ color: 0xf3f3f3, roughness: 0.25 }));
  helmet.position.set(0, 1.33, 0.24);
  helmet.scale.set(1, 0.92, 1.15);
  helmet.castShadow = true;
  body.add(helmet);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), skin);
  face.position.set(0, 1.28, 0.31);
  body.add(face);
  // Arms: shoulders → hoods
  for (const sx of [-1, 1]) {
    body.add(tube(
      new THREE.Vector3(sx * 0.13, 1.17, 0.14),
      new THREE.Vector3(sx * 0.16, 1.0, 0.44),
      0.04, jersey,
    ));
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), skin);
    hand.position.set(sx * 0.16, 1.0, 0.46);
    body.add(hand);
  }

  // Legs (re-oriented every frame by IK)
  const legParts: Array<{ thigh: THREE.Mesh; shin: THREE.Mesh; foot: THREE.Mesh; sideX: number; phase: number }> = [];
  for (const [sideX, phase] of [[HIP_X, 0], [-HIP_X, Math.PI]] as const) {
    const thigh = tube(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0.055, shorts);
    const shin = tube(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0.04, skin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.045, 0.16), dark);
    foot.castShadow = true;
    body.add(thigh, shin, foot);
    legParts.push({ thigh, shin, foot, sideX, phase });
  }

  // ── Boost flames (rear, behind the back wheel) ──
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa722, transparent: true, opacity: 0.9 });
  const flameMat2 = new THREE.MeshBasicMaterial({ color: 0xfff06a, transparent: true, opacity: 0.95 });
  const boostFlames: THREE.Mesh[] = [];
  for (const [x, y, mat, len] of [[0.12, 0.32, flameMat, 0.55], [-0.12, 0.32, flameMat, 0.55], [0, 0.5, flameMat2, 0.75]] as const) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.09, len, 8), mat);
    f.position.set(x, y, -0.95);
    f.rotation.x = Math.PI / 2;
    f.visible = false;
    body.add(f);
    boostFlames.push(f);
  }

  // ── Shield bubble ──
  const shieldMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.3, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0x6ee7ff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
  );
  shieldMesh.position.y = 0.75;
  shieldMesh.visible = false;
  group.add(shieldMesh);

  const nametag = makeNametag(name, colorHex);
  group.add(nametag);

  // ── Animation ──
  let crankAngle = 0;
  const hipL = new THREE.Vector3(HIP_X, HIP_Y, HIP_Z);
  const hipR = new THREE.Vector3(-HIP_X, HIP_Y, HIP_Z);
  const foot = new THREE.Vector3();
  const knee = new THREE.Vector3();

  const solveLeg = (part: (typeof legParts)[number], hip: THREE.Vector3) => {
    const theta = crankAngle + part.phase;
    // Pedal position from crank rotation around X (spindle top ~ ankle height)
    foot.set(
      part.sideX > 0 ? PEDAL_X : -PEDAL_X,
      BB.y + CRANK_LEN * Math.cos(theta) + 0.04,
      BB.z + CRANK_LEN * Math.sin(theta),
    );
    // 2-bone IK in the YZ plane (legs pedal in a vertical plane)
    let dy = foot.y - hip.y, dz = foot.z - hip.z;
    let d = Math.hypot(dy, dz);
    const maxD = (THIGH_LEN + SHIN_LEN) * 0.995;
    if (d > maxD) { dy *= maxD / d; dz *= maxD / d; d = maxD; }
    const a = THIGH_LEN, b = SHIN_LEN;
    const cosA = Math.min(Math.max((a * a + d * d - b * b) / (2 * a * d), -1), 1);
    const alpha = Math.acos(cosA);
    const dirY = dy / d, dirZ = dz / d;
    // Perpendicular chosen so the knee bends forward (+Z)
    let perpY = -dirZ, perpZ = dirY;
    if (perpZ < 0) { perpY = -perpY; perpZ = -perpZ; }
    knee.set(
      hip.x + (foot.x - hip.x) * 0.5,
      hip.y + dirY * a * Math.cos(alpha) + perpY * a * Math.sin(alpha),
      hip.z + dirZ * a * Math.cos(alpha) + perpZ * a * Math.sin(alpha),
    );
    setTube(part.thigh, hip, knee);
    setTube(part.shin, knee, foot);
    part.foot.position.set(foot.x, foot.y, foot.z + 0.02);
  };

  const update = (dt: number, speedMps: number, cadenceRpm: number) => {
    const roll = (speedMps / WHEEL_R) * dt;
    rearWheel.rotation.x += roll;
    frontWheel.rotation.x += roll;
    crankAngle += (cadenceRpm / 60) * Math.PI * 2 * dt;
    crankGroup.rotation.x = crankAngle;
    // Keep pedal platforms level
    for (const pedal of pedals) pedal.rotation.x = -crankAngle;
    solveLeg(legParts[0], hipL);
    solveLeg(legParts[1], hipR);
    // Flame flicker while boosting
    if (boostFlames[0].visible) {
      for (const f of boostFlames) f.scale.y = 0.8 + Math.random() * 0.5;
    }
  };
  update(0.016, 0, 0); // pose the legs before first frame

  return { group, body, shieldMesh, boostFlames, nametag, update };
}

/** Distinct jersey/frame colours per join order. */
export const RIDER_COLORS = [0xd7263d, 0x1b6ef3, 0x27ae60, 0xf2b705] as const;
