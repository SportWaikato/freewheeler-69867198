// ─────────────────────────────────────────────────────────────────────────────
// Cycle Cup — track mesh construction
//
// Turns a TrackDef + TrackCurve into real 3D geometry: asphalt ribbon that
// follows elevation, striped kerbs on both edges, low barrier walls, a shoulder
// apron, start/finish gantry, boost pads and item-box rows from the feature
// list. Everything is BufferGeometry built once at load — no per-frame cost.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import type { TrackDef, TrackFeature } from './types';
import { TrackCurve, mulberry32, hashString } from './math';

export interface BuiltFeatures {
  itemBoxes: Array<{ id: string; progress: number; lateral: number; mesh: THREE.Mesh; takenUntil: number }>;
  boostPads: Array<{ progress: number; lateral: number }>;
  obstacles: Array<{ progress: number; lateral: number }>;
}

interface RibbonOptions {
  innerLat: number;  // -1..1 (multiplied by half-width)
  outerLat: number;
  yOffset: number;
  color: number;
  roughness?: number;
  segments?: number;
  /** Alternate colour every `stripeEvery` segments (kerbs). */
  stripe?: { every: number; color: number };
}

/** Build a ribbon between two lateral fractions along the whole loop. */
function buildRibbon(curve: TrackCurve, opts: RibbonOptions): THREE.Mesh {
  const N = opts.segments ?? Math.max(256, Math.round(curve.lengthM / 3));
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const base = new THREE.Color(opts.color);
  const alt = new THREE.Color(opts.stripe?.color ?? opts.color);

  for (let i = 0; i <= N; i++) {
    const dist = (i / N) * curve.lengthM;
    const s = curve.sampleAt(dist);
    const inner = s.pos.clone().addScaledVector(s.normal, opts.innerLat * s.halfWidth);
    const outer = s.pos.clone().addScaledVector(s.normal, opts.outerLat * s.halfWidth);
    positions.push(inner.x, inner.y + opts.yOffset, inner.z, outer.x, outer.y + opts.yOffset, outer.z);
    const c = opts.stripe && Math.floor(i / opts.stripe.every) % 2 === 1 ? alt : base;
    colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    // Winding chosen so face normals point +Y (visible/lit from above)
    indices.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: opts.roughness ?? 0.95, metalness: 0 }),
  );
  mesh.receiveShadow = true;
  return mesh;
}

/** Low barrier wall as an extruded strip just outside a lateral fraction. */
function buildWall(curve: TrackCurve, side: 1 | -1, color: number): THREE.Mesh {
  const N = Math.max(200, Math.round(curve.lengthM / 4));
  const positions: number[] = [];
  const indices: number[] = [];
  const H = 0.6, LAT = 1.22;
  for (let i = 0; i <= N; i++) {
    const dist = (i / N) * curve.lengthM;
    const s = curve.sampleAt(dist);
    const p = s.pos.clone().addScaledVector(s.normal, side * LAT * s.halfWidth);
    positions.push(p.x, p.y, p.z, p.x, p.y + H, p.z);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    indices.push(a, c, b, b, c, d, a, b, c, b, d, c); // both faces
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.8, side: THREE.DoubleSide }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildStartGate(curve: TrackCurve, accentColor: number): THREE.Group {
  const g = new THREE.Group();
  const s = curve.sampleAt(0);
  const w = s.halfWidth * 2.6;
  const postGeo = new THREE.CylinderGeometry(0.18, 0.22, 5.2, 10);
  const postMat = new THREE.MeshStandardMaterial({ color: 0xe8e8ee, roughness: 0.4, metalness: 0.3 });
  for (const side of [-1, 1] as const) {
    const post = new THREE.Mesh(postGeo, postMat);
    const p = s.pos.clone().addScaledVector(s.normal, side * (w / 2));
    post.position.set(p.x, p.y + 2.6, p.z);
    post.castShadow = true;
    g.add(post);
  }
  // Banner
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 96;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#15130a';
  ctx.fillRect(0, 0, 512, 96);
  const accent = `#${accentColor.toString(16).padStart(6, '0')}`;
  ctx.fillStyle = accent;
  for (let i = 0; i < 16; i++) ctx.fillRect(i * 32, i % 2 === 0 ? 0 : 48, 32, 48);
  ctx.fillStyle = '#0d0c06';
  ctx.fillRect(64, 14, 384, 68);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 52px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CYCLE CUP', 256, 50);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  // One banner facing each direction so the text reads correctly on approach
  // (offset slightly along the tangent to avoid z-fighting back-to-back)
  for (const flip of [0, Math.PI]) {
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(w, 1.1),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide }),
    );
    const dir = flip === 0 ? 1 : -1;
    banner.position.set(s.pos.x, s.pos.y + 4.6, s.pos.z).addScaledVector(s.tangent, dir * 0.03);
    banner.rotation.y = Math.atan2(s.tangent.x, s.tangent.z) + flip;
    g.add(banner);
  }

  // Checkered start line on the road
  const lineCv = document.createElement('canvas');
  lineCv.width = 128; lineCv.height = 32;
  const lctx = lineCv.getContext('2d')!;
  for (let x = 0; x < 8; x++) for (let y = 0; y < 2; y++) {
    lctx.fillStyle = (x + y) % 2 === 0 ? '#ffffff' : '#111111';
    lctx.fillRect(x * 16, y * 16, 16, 16);
  }
  const lineTex = new THREE.CanvasTexture(lineCv);
  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(s.halfWidth * 2, 2.2),
    new THREE.MeshBasicMaterial({ map: lineTex, transparent: true }),
  );
  line.rotation.x = -Math.PI / 2;
  line.rotation.z = Math.atan2(s.normal.x, s.normal.z) + Math.PI / 2;
  line.position.set(s.pos.x, s.pos.y + 0.06, s.pos.z);
  g.add(line);
  return g;
}

function buildBoostPad(curve: TrackCurve, feature: TrackFeature): THREE.Mesh {
  const s = curve.sampleAt(feature.t * curve.lengthM);
  const lat = feature.lateral ?? 0;
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#0d2b12';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#8ffe4b';
  for (const dy of [4, 26, 48]) {
    ctx.beginPath();
    ctx.moveTo(8, dy + 14); ctx.lineTo(32, dy); ctx.lineTo(56, dy + 14);
    ctx.lineTo(56, dy + 22); ctx.lineTo(32, dy + 8); ctx.lineTo(8, dy + 22);
    ctx.closePath(); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const pad = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 4.2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.96 }),
  );
  const p = s.pos.clone().addScaledVector(s.normal, lat * s.halfWidth);
  pad.rotation.x = -Math.PI / 2;
  pad.rotation.z = Math.atan2(s.tangent.x, s.tangent.z) + Math.PI;
  pad.position.set(p.x, p.y + 0.05, p.z);
  return pad;
}

export interface BuiltTrack {
  group: THREE.Group;
  features: BuiltFeatures;
}

export function buildTrackMeshes(
  def: TrackDef,
  curve: TrackCurve,
  palette: { road: number; kerbA: number; kerbB: number; wall: number; shoulder: number; accent: number },
): BuiltTrack {
  const group = new THREE.Group();
  const rng = mulberry32(hashString(def.id));

  // Shoulder apron (slightly wider, under the road)
  group.add(buildRibbon(curve, { innerLat: -1.24, outerLat: 1.24, yOffset: -0.02, color: palette.shoulder, roughness: 1 }));
  // Asphalt
  group.add(buildRibbon(curve, { innerLat: -1, outerLat: 1, yOffset: 0.02, color: palette.road, roughness: 0.92 }));
  // Centre dashes
  group.add(buildRibbon(curve, {
    innerLat: -0.012, outerLat: 0.012, yOffset: 0.045, color: 0xe8e8e8,
    stripe: { every: 3, color: palette.road }, segments: 720,
  }));
  // Kerbs
  for (const side of [-1, 1] as const) {
    group.add(buildRibbon(curve, {
      innerLat: side === 1 ? 1 : -1.12,
      outerLat: side === 1 ? 1.12 : -1,
      yOffset: 0.035,
      color: palette.kerbA,
      stripe: { every: 4, color: palette.kerbB },
      segments: 640,
    }));
  }
  // Walls
  group.add(buildWall(curve, 1, palette.wall));
  group.add(buildWall(curve, -1, palette.wall));
  // Start gate
  group.add(buildStartGate(curve, palette.accent));

  // Features
  const features: BuiltFeatures = { itemBoxes: [], boostPads: [], obstacles: [] };
  const itemBoxGeo = new THREE.IcosahedronGeometry(0.42, 0);
  const itemBoxMat = new THREE.MeshStandardMaterial({
    color: 0x51c8ff, emissive: 0x1f5fb0, emissiveIntensity: 0.55,
    transparent: true, opacity: 0.85, roughness: 0.2, metalness: 0.4,
  });
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xff7222, roughness: 0.6 });
  const coneGeo = new THREE.ConeGeometry(0.35, 0.85, 10);

  for (const f of def.features) {
    const progress = f.t * curve.lengthM;
    if (f.type === 'boostPad') {
      group.add(buildBoostPad(curve, f));
      features.boostPads.push({ progress, lateral: f.lateral ?? 0 });
    } else if (f.type === 'itemBoxRow') {
      for (const lat of [-0.6, 0, 0.6]) {
        const mesh = new THREE.Mesh(itemBoxGeo, itemBoxMat.clone());
        const p = curve.worldPos(progress, lat, 0.85);
        mesh.position.copy(p);
        mesh.castShadow = true;
        group.add(mesh);
        features.itemBoxes.push({
          id: `${def.id}-box-${f.t.toFixed(3)}-${lat}`,
          progress, lateral: lat, mesh, takenUntil: 0,
        });
      }
    } else if (f.type === 'obstacle') {
      const lat = f.lateral ?? (rng() * 1.2 - 0.6);
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.copy(curve.worldPos(progress, lat, 0.42));
      cone.castShadow = true;
      group.add(cone);
      features.obstacles.push({ progress, lateral: lat });
    }
    // 'jump' features are handled purely by track elevation in the TrackDef;
    // reserved here so defs can tag them for the minimap.
  }

  return { group, features };
}
