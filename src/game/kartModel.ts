// ─────────────────────────────────────────────────────────────────────────────
// Cycle Cup — procedural kart + rider model
//
// Built from primitives so karts need no asset downloads and recolour freely.
// Returned group faces +Z. Wheels are exposed for spin animation, the root
// body group for lean/bounce.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

export interface KartModel {
  group: THREE.Group;
  body: THREE.Group;
  wheels: THREE.Mesh[];
  shieldMesh: THREE.Mesh;
  boostFlames: THREE.Mesh[];
  nametag: THREE.Sprite;
}

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
  sprite.position.set(0, 1.9, 0);
  return sprite;
}

export function buildKart(name: string, colorHex: number): KartModel {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const paint = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.35, metalness: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.8 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd8d8e0, roughness: 0.25, metalness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.7 });

  const addMesh = (
    parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material,
    x: number, y: number, z: number, rot?: [number, number, number],
  ) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  // Chassis tub — low and wide
  const tub = new THREE.BoxGeometry(1.15, 0.28, 1.9);
  addMesh(body, tub, paint, 0, 0.34, 0);
  // Nose cone
  addMesh(body, new THREE.CylinderGeometry(0.22, 0.5, 0.55, 4, 1), paint, 0, 0.36, 1.1, [Math.PI / 2, Math.PI / 4, 0]);
  // Side pods
  addMesh(body, new THREE.BoxGeometry(0.22, 0.22, 1.1), dark, 0.66, 0.3, -0.1);
  addMesh(body, new THREE.BoxGeometry(0.22, 0.22, 1.1), dark, -0.66, 0.3, -0.1);
  // Seat back
  addMesh(body, new THREE.BoxGeometry(0.62, 0.5, 0.14), paint, 0, 0.72, -0.72);
  // Rear spoiler
  addMesh(body, new THREE.BoxGeometry(1.05, 0.06, 0.3), paint, 0, 0.92, -0.95);
  addMesh(body, new THREE.BoxGeometry(0.06, 0.28, 0.06), chrome, 0.4, 0.76, -0.95);
  addMesh(body, new THREE.BoxGeometry(0.06, 0.28, 0.06), chrome, -0.4, 0.76, -0.95);
  // Steering column + wheel
  addMesh(body, new THREE.CylinderGeometry(0.03, 0.03, 0.42), chrome, 0, 0.62, 0.42, [0.9, 0, 0]);
  addMesh(body, new THREE.TorusGeometry(0.16, 0.035, 8, 20), dark, 0, 0.78, 0.32, [0.65, 0, 0]);

  // Rider — helmeted, leaning forward
  const rider = new THREE.Group();
  rider.position.set(0, 0.52, -0.28);
  body.add(rider);
  addMesh(rider, new THREE.CylinderGeometry(0.19, 0.24, 0.52, 10), paint, 0, 0.28, 0, [0.28, 0, 0]);       // torso
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0xf3f3f3, roughness: 0.2, metalness: 0.1 });
  addMesh(rider, new THREE.SphereGeometry(0.19, 16, 12), helmetMat, 0, 0.68, 0.06);                         // helmet
  addMesh(rider, new THREE.SphereGeometry(0.145, 12, 8), dark, 0, 0.66, 0.14);                              // visor
  addMesh(rider, new THREE.CylinderGeometry(0.05, 0.05, 0.42, 6), paint, 0.24, 0.36, 0.18, [1.1, 0, -0.25]); // arms
  addMesh(rider, new THREE.CylinderGeometry(0.05, 0.05, 0.42, 6), paint, -0.24, 0.36, 0.18, [1.1, 0, 0.25]);
  addMesh(rider, new THREE.SphereGeometry(0.055, 8, 6), skin, 0.15, 0.24, 0.42);                             // hands
  addMesh(rider, new THREE.SphereGeometry(0.055, 8, 6), skin, -0.15, 0.24, 0.42);

  // Wheels — chunky kart slicks
  const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.26, 18);
  const hubGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.27, 10);
  const wheels: THREE.Mesh[] = [];
  const wheelPos: Array<[number, number]> = [[0.62, 0.72], [-0.62, 0.72], [0.66, -0.68], [-0.66, -0.68]];
  for (const [x, z] of wheelPos) {
    const wheel = addMesh(group, wheelGeo, dark, x, 0.3, z, [0, 0, Math.PI / 2]);
    const hub = new THREE.Mesh(hubGeo, chrome);
    wheel.add(hub);
    wheels.push(wheel);
  }

  // Boost flames (hidden unless boosting)
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa722, transparent: true, opacity: 0.9 });
  const flameMat2 = new THREE.MeshBasicMaterial({ color: 0xfff06a, transparent: true, opacity: 0.95 });
  const boostFlames: THREE.Mesh[] = [];
  for (const [x, mat, len] of [[0.28, flameMat, 0.7], [-0.28, flameMat, 0.7], [0, flameMat2, 0.95]] as const) {
    const f = addMesh(group, new THREE.ConeGeometry(0.11, len, 8), mat, x, 0.36, -1.15, [Math.PI / 2, 0, 0]);
    f.visible = false;
    boostFlames.push(f);
  }

  // Shield bubble
  const shieldMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.45, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0x6ee7ff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
  );
  shieldMesh.position.y = 0.6;
  shieldMesh.visible = false;
  group.add(shieldMesh);

  const nametag = makeNametag(name, colorHex);
  group.add(nametag);

  return { group, body, wheels, shieldMesh, boostFlames, nametag };
}

/** Distinct kart paint colours per join order. */
export const KART_COLORS = [0xd7263d, 0x1b6ef3, 0x27ae60, 0xf2b705] as const;
