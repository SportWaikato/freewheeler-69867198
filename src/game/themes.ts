// ─────────────────────────────────────────────────────────────────────────────
// Freewheeler Bike League — theme registry
//
// A theme owns the look of a track: sky gradient, fog, lighting tint, ground,
// track palette, and a set of named scenery builders that TrackDef scenery
// bands reference by `kind`. New themes are added here without engine changes;
// a new track can also reuse an existing theme with different geometry.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mulberry32 } from './math';

export interface ThemePalette {
  road: number; kerbA: number; kerbB: number; wall: number; shoulder: number; accent: number;
}

export interface ThemeDef {
  id: string;
  name: string;
  skyTop: number;
  skyBottom: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  sunColor: number;
  sunIntensity: number;
  ambientColor: number;
  ambientIntensity: number;
  groundColor: number;
  palette: ThemePalette;
  /** kind → builder returning one scenery object (positioned at origin). */
  builders: Record<string, (rng: () => number) => THREE.Object3D>;
}

// ── Shared primitive helpers ─────────────────────────────────────────────────

function std(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts });
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, y = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.y = y;
  m.castShadow = true;
  return m;
}

function pineTree(rng: () => number): THREE.Object3D {
  const g = new THREE.Group();
  const h = 3.5 + rng() * 3.5;
  g.add(mesh(new THREE.CylinderGeometry(0.14, 0.22, h * 0.35), std(0x5a3d24), h * 0.17));
  const green = 0x1d6b35 + Math.floor(rng() * 3) * 0x000a04;
  for (let i = 0; i < 3; i++) {
    const r = (1.5 - i * 0.4) * (0.8 + rng() * 0.3);
    g.add(mesh(new THREE.ConeGeometry(r, h * 0.36, 8), std(green), h * (0.4 + i * 0.24)));
  }
  return g;
}

function palmTree(rng: () => number): THREE.Object3D {
  const g = new THREE.Group();
  const h = 3 + rng() * 2.5;
  const trunk = mesh(new THREE.CylinderGeometry(0.12, 0.2, h, 8), std(0x9a7448), h / 2);
  trunk.rotation.z = (rng() - 0.5) * 0.25;
  g.add(trunk);
  for (let i = 0; i < 6; i++) {
    const frond = mesh(new THREE.ConeGeometry(0.16, 2.4, 4), std(0x2e9e4f), 0);
    frond.position.set(0, h - 0.1, 0);
    frond.rotation.z = Math.PI / 2.4;
    frond.rotation.y = (i / 6) * Math.PI * 2 + rng() * 0.4;
    frond.rotateOnAxis(new THREE.Vector3(1, 0, 0), -0.5);
    g.add(frond);
  }
  return g;
}

function crystal(rng: () => number): THREE.Object3D {
  const g = new THREE.Group();
  const colors = [0x8f5fff, 0x5fd0ff, 0xff5fd6];
  const n = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const h = 1.2 + rng() * 3.4;
    const c = mesh(
      new THREE.ConeGeometry(0.35 + rng() * 0.4, h, 5),
      new THREE.MeshStandardMaterial({
        color: colors[Math.floor(rng() * colors.length)],
        emissive: colors[Math.floor(rng() * colors.length)],
        emissiveIntensity: 0.35, roughness: 0.15, metalness: 0.2,
        transparent: true, opacity: 0.92,
      }),
      h / 2,
    );
    c.position.x = (rng() - 0.5) * 1.6;
    c.position.z = (rng() - 0.5) * 1.6;
    c.rotation.z = (rng() - 0.5) * 0.5;
    g.add(c);
  }
  return g;
}

function lavaRock(rng: () => number): THREE.Object3D {
  const g = new THREE.Group();
  const r = 0.8 + rng() * 2.2;
  const rock = mesh(new THREE.DodecahedronGeometry(r, 0), std(0x2b2126, { roughness: 1 }), r * 0.6);
  rock.rotation.set(rng() * Math.PI, rng() * Math.PI, 0);
  g.add(rock);
  if (rng() > 0.55) {
    g.add(mesh(
      new THREE.DodecahedronGeometry(r * 0.35, 0),
      new THREE.MeshBasicMaterial({ color: 0xff5a1f }),
      r * 1.1,
    ));
  }
  return g;
}

function volcanoCone(rng: () => number): THREE.Object3D {
  const g = new THREE.Group();
  const h = 22 + rng() * 30;
  const r = 14 + rng() * 16;
  g.add(mesh(new THREE.ConeGeometry(r, h, 9), std(0x3a2c2c, { roughness: 1 }), h / 2));
  const glow = mesh(new THREE.CylinderGeometry(r * 0.16, r * 0.2, 1.2, 9),
    new THREE.MeshBasicMaterial({ color: 0xff4d00 }), h + 0.4);
  g.add(glow);
  return g;
}

function skyscraper(rng: () => number): THREE.Object3D {
  const g = new THREE.Group();
  const h = 10 + rng() * 26;
  const w = 3.5 + rng() * 4;
  const bodyCol = [0x1b2340, 0x232c52, 0x16203a][Math.floor(rng() * 3)];
  const body = mesh(new THREE.BoxGeometry(w, h, w), std(bodyCol, { roughness: 0.5, metalness: 0.4 }), h / 2);
  g.add(body);
  // Emissive window strips
  const winMat = new THREE.MeshBasicMaterial({ color: rng() > 0.5 ? 0x7ee6ff : 0xffd66e });
  const rows = Math.floor(h / 2.4);
  for (let i = 0; i < rows; i++) {
    if (rng() > 0.45) continue;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.32, w * 1.01), winMat);
    strip.position.y = 1.6 + i * 2.4;
    g.add(strip);
  }
  return g;
}

function neonSign(rng: () => number): THREE.Object3D {
  const g = new THREE.Group();
  const colors = [0xff2fa0, 0x2fffe0, 0xb92fff, 0xffe32f];
  const c = colors[Math.floor(rng() * colors.length)];
  const h = 4 + rng() * 4;
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, h, 6), std(0x30303a), h / 2));
  const ring = mesh(
    new THREE.TorusGeometry(0.9 + rng() * 0.7, 0.09, 8, 24),
    new THREE.MeshBasicMaterial({ color: c }),
    h + 0.8,
  );
  ring.rotation.y = rng() * Math.PI;
  g.add(ring);
  return g;
}

function sandDune(rng: () => number): THREE.Object3D {
  const r = 4 + rng() * 9;
  const dune = mesh(new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0xe6cf9a, { roughness: 1 }), 0);
  dune.scale.y = 0.28 + rng() * 0.2;
  dune.receiveShadow = true;
  return dune;
}

function beachUmbrella(rng: () => number): THREE.Object3D {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), std(0xe8e8e8), 1.2));
  const canopy = mesh(
    new THREE.ConeGeometry(1.3, 0.6, 10),
    std(rng() > 0.5 ? 0xff4d5e : 0x2fa8ff, { roughness: 0.6 }),
    2.5,
  );
  g.add(canopy);
  return g;
}

function rockArch(rng: () => number): THREE.Object3D {
  const g = new THREE.Group();
  const mat = std(0xc79d70, { roughness: 1 });
  const h = 5 + rng() * 4;
  g.add(mesh(new THREE.CylinderGeometry(1.1, 1.6, h, 7), mat, h / 2));
  const top = mesh(new THREE.SphereGeometry(1.6, 7, 5), mat, h + 0.6);
  top.scale.y = 0.6;
  g.add(top);
  return g;
}

function snowPine(rng: () => number): THREE.Object3D {
  const g = pineTree(rng) as THREE.Group;
  // Dust the cones with a white cap
  g.children.forEach((c, i) => {
    if (i >= 1 && c instanceof THREE.Mesh) {
      const cap = new THREE.Mesh((c.geometry as THREE.ConeGeometry).clone(), std(0xf4f8ff, { roughness: 0.9 }));
      cap.scale.setScalar(0.72);
      cap.position.y = c.position.y + 0.5;
      g.add(cap);
    }
  });
  return g;
}

function iceSpire(rng: () => number): THREE.Object3D {
  const h = 3 + rng() * 8;
  const spire = mesh(
    new THREE.ConeGeometry(0.7 + rng() * 0.8, h, 6),
    new THREE.MeshStandardMaterial({
      color: 0xbfe8ff, roughness: 0.1, metalness: 0.1,
      transparent: true, opacity: 0.88, emissive: 0x3a7ca8, emissiveIntensity: 0.12,
    }),
    h / 2,
  );
  spire.rotation.z = (rng() - 0.5) * 0.3;
  return spire;
}

function hotAirBalloon(rng: () => number): THREE.Object3D {
  const g = new THREE.Group();
  const colors = [0xd7263d, 0xf2b705, 0x1b6ef3, 0x27ae60];
  const c = colors[Math.floor(rng() * colors.length)];
  const y = 18 + rng() * 22;
  const envelope = mesh(new THREE.SphereGeometry(2.4, 12, 10), std(c, { roughness: 0.55 }), y);
  envelope.scale.y = 1.25;
  g.add(envelope);
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), std(0x7a5230), y - 3.6));
  return g;
}

// ── Themes ───────────────────────────────────────────────────────────────────

export const THEMES: Record<string, ThemeDef> = {
  meadow: {
    id: 'meadow',
    name: 'Sunny Meadows',
    skyTop: 0x3f9bf0, skyBottom: 0xcdeaff,
    fogColor: 0xbcdcf5, fogNear: 90, fogFar: 420,
    sunColor: 0xfff2d8, sunIntensity: 2.6,
    ambientColor: 0xbcd8ff, ambientIntensity: 0.85,
    groundColor: 0x63b34d,
    palette: { road: 0x3d3d46, kerbA: 0xd7263d, kerbB: 0xf2f2f2, wall: 0xe9e4d8, shoulder: 0x4f9440, accent: 0xc4f53c },
    builders: { pineTree, hotAirBalloon,
      flowerPatch: (rng) => {
        const g = new THREE.Group();
        const colors = [0xff5f8f, 0xffd23c, 0xffffff, 0xa16bff];
        for (let i = 0; i < 7; i++) {
          const f = mesh(new THREE.SphereGeometry(0.14, 6, 5), std(colors[Math.floor(rng() * colors.length)], { roughness: 0.6 }), 0.35);
          f.position.x = (rng() - 0.5) * 2.4;
          f.position.z = (rng() - 0.5) * 2.4;
          g.add(f);
          g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 4), std(0x3f8f3a), 0.17).translateX(f.position.x).translateZ(f.position.z));
        }
        return g;
      },
      barn: (rng) => {
        const g = new THREE.Group();
        g.add(mesh(new THREE.BoxGeometry(5, 3.2, 6.5), std(0xb8402f, { roughness: 0.8 }), 1.6));
        const roof = mesh(new THREE.CylinderGeometry(2.9, 2.9, 6.5, 3, 1), std(0x7a2c20), 3.6);
        roof.rotation.set(0, 0, 0); roof.rotation.x = Math.PI / 2; roof.rotation.y = Math.PI / 6;
        g.add(roof);
        g.add(mesh(new THREE.BoxGeometry(1.4, 1.8, 0.1), std(0x5a3d24), 0.9).translateZ(3.28));
        void rng;
        return g;
      },
    },
  },

  neonCity: {
    id: 'neonCity',
    name: 'Neon City Nights',
    skyTop: 0x141b4d, skyBottom: 0x5a2b8a,
    fogColor: 0x3a2662, fogNear: 80, fogFar: 400,
    sunColor: 0xb8c4ff, sunIntensity: 1.9,
    ambientColor: 0x8a78c8, ambientIntensity: 1.9,
    groundColor: 0x232a4a,
    palette: { road: 0x3c3c52, kerbA: 0xff2fa0, kerbB: 0x2fffe0, wall: 0x4a5280, shoulder: 0x2c3252, accent: 0xff2fa0 },
    builders: { skyscraper, neonSign,
      searchlight: (rng) => {
        const g = new THREE.Group();
        const beam = new THREE.Mesh(
          new THREE.ConeGeometry(2.2, 30, 8, 1, true),
          new THREE.MeshBasicMaterial({ color: 0x8fb8ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
        );
        beam.position.y = 15;
        beam.rotation.z = (rng() - 0.5) * 0.9;
        g.add(beam);
        return g;
      },
    },
  },

  volcano: {
    id: 'volcano',
    name: 'Volcano Rush',
    skyTop: 0x2a1015, skyBottom: 0x8a3a1d,
    fogColor: 0x54281c, fogNear: 60, fogFar: 340,
    sunColor: 0xffb98a, sunIntensity: 1.7,
    ambientColor: 0xff8a5a, ambientIntensity: 0.8,
    groundColor: 0x3a2a28,
    palette: { road: 0x33272a, kerbA: 0xff7222, kerbB: 0x1c1418, wall: 0x4a3134, shoulder: 0x2c1f20, accent: 0xff7222 },
    builders: { lavaRock, volcanoCone,
      emberVent: (rng) => {
        const g = new THREE.Group();
        g.add(mesh(new THREE.CylinderGeometry(0.7, 1.1, 0.8, 8), std(0x241b1e, { roughness: 1 }), 0.4));
        g.add(mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.2, 8), new THREE.MeshBasicMaterial({ color: 0xff5a1f }), 0.85));
        void rng;
        return g;
      },
    },
  },

  crystalPeaks: {
    id: 'crystalPeaks',
    name: 'Crystal Peaks',
    skyTop: 0x1d2f66, skyBottom: 0x9fd4ef,
    fogColor: 0xa8cfe8, fogNear: 80, fogFar: 400,
    sunColor: 0xeaf4ff, sunIntensity: 2.2,
    ambientColor: 0xb8d4ff, ambientIntensity: 1.0,
    groundColor: 0xdfeaf5,
    palette: { road: 0x3b4152, kerbA: 0x5fd0ff, kerbB: 0xffffff, wall: 0xcfe2f0, shoulder: 0xc4d6e6, accent: 0x8f5fff },
    builders: { crystal, snowPine, iceSpire },
  },

  canyon: {
    id: 'canyon',
    name: 'Big Sky Canyon',
    skyTop: 0x2e7ad1, skyBottom: 0xffd9a0,
    fogColor: 0xf0cf9e, fogNear: 90, fogFar: 430,
    sunColor: 0xffe8c0, sunIntensity: 2.5,
    ambientColor: 0xffd8b0, ambientIntensity: 0.8,
    groundColor: 0xd9a765,
    palette: { road: 0x4a3f38, kerbA: 0xf2b705, kerbB: 0x8a4a2a, wall: 0xc79d70, shoulder: 0xba8a55, accent: 0xf2b705 },
    builders: { rockArch, sandDune, beachUmbrella,
      cactus: (rng) => {
        const g = new THREE.Group();
        const h = 1.6 + rng() * 1.8;
        const mat = std(0x3f8f4a, { roughness: 0.7 });
        g.add(mesh(new THREE.CapsuleGeometry(0.28, h, 4, 8), mat, h / 2 + 0.28));
        if (rng() > 0.4) {
          const arm = mesh(new THREE.CapsuleGeometry(0.16, 0.7, 4, 8), mat, h * 0.6);
          arm.position.x = 0.45; arm.rotation.z = -0.5;
          g.add(arm);
        }
        return g;
      },
    },
  },

  palmBay: {
    id: 'palmBay',
    name: 'Palm Bay',
    skyTop: 0x2493df, skyBottom: 0xbfeef7,
    fogColor: 0xc6ecf4, fogNear: 90, fogFar: 420,
    sunColor: 0xfff4da, sunIntensity: 2.7,
    ambientColor: 0xcae8ff, ambientIntensity: 0.9,
    groundColor: 0xefdfae,
    palette: { road: 0x8a8f98, kerbA: 0x2fa8ff, kerbB: 0xffffff, wall: 0xf4ead2, shoulder: 0xe6cf9a, accent: 0x2fa8ff },
    builders: { palmTree, beachUmbrella, sandDune },
  },
};

/** Vertical-gradient sky dome. */
export function buildSky(theme: ThemeDef): THREE.Mesh {
  const geo = new THREE.SphereGeometry(900, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(theme.skyTop) },
      bottom: { value: new THREE.Color(theme.skyBottom) },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 bottom; varying vec3 vPos;
      void main() {
        float h = clamp(normalize(vPos).y * 1.6 + 0.35, 0.0, 1.0);
        gl_FragColor = vec4(mix(bottom, top, h), 1.0);
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

/** Scatter one theme's scenery bands around the track. */
export function buildScenery(
  theme: ThemeDef,
  bands: Array<{ kind: string; offset: [number, number]; count: number; range?: [number, number]; scale?: [number, number] }>,
  curve: import('./math').TrackCurve,
  seed: number,
): THREE.Group {
  const g = new THREE.Group();
  const rng = mulberry32(seed);
  for (const band of bands) {
    const builder = theme.builders[band.kind];
    if (!builder) continue;
    const [t0, t1] = band.range ?? [0, 1];
    for (let i = 0; i < band.count; i++) {
      const t = t0 + rng() * (t1 - t0);
      const dist = t * curve.lengthM;
      const s = curve.sampleAt(dist);
      const side = rng() > 0.5 ? 1 : -1;
      const off = band.offset[0] + rng() * (band.offset[1] - band.offset[0]);
      const obj = builder(rng);
      const pos = s.pos.clone().addScaledVector(s.normal, side * (s.halfWidth + off));
      obj.position.set(pos.x, Math.min(pos.y, s.pos.y), pos.z);
      obj.rotation.y = rng() * Math.PI * 2;
      const [s0, s1] = band.scale ?? [0.85, 1.25];
      obj.scale.setScalar(s0 + rng() * (s1 - s0));
      g.add(obj);
    }
  }
  return g;
}
