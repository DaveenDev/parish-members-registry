/**
 * The 3D scene behind Home's hero: a gold object inside the rays of Our Lady
 * of Guadalupe's mandorla (straight rays between wavy ones), with small stars
 * like the ones on her mantle and a little drifting light. The object is the
 * parish's choice (lib/heroSymbols.js): the crucifix (Christ on the cross, as
 * simple rounded shapes), a plain cross, the chalice, the monstrance, the
 * Sacred Heart, Our Lady (Queen of Heaven, crowned with twelve stars), the
 * Immaculate Heart, the dove of the Holy Spirit or the rosary.
 *
 * Loaded on its own (HeroGlory imports it once the page is idle), so three.js
 * is a separate download that never holds up the page.
 */
import {
  ACESFilmicToneMapping, AdditiveBlending, AmbientLight, BackSide, BoxGeometry, BufferAttribute, BufferGeometry,
  CanvasTexture, CapsuleGeometry, CatmullRomCurve3, ConeGeometry, CylinderGeometry, DirectionalLight, ExtrudeGeometry,
  FrontSide, Group, LatheGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry,
  PMREMGenerator, Points, PointsMaterial, Quaternion, Scene, Shape, SphereGeometry, SRGBColorSpace, TorusGeometry, TubeGeometry,
  Vector2, Vector3, WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const FOV = 35;
const CAMERA_Z = 10;
// How far out the longest rays reach, in scene units: place() sizes against this.
const OUTER = 2.75;

/** A small repeatable random, so the stars sit in the same places every visit. */
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Polygon points as a Shape. */
function shapeOf(points) {
  const shape = new Shape();
  points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  return shape;
}

/**
 * A burst of rays around the middle: straight rays between wavy, flame-like
 * ones. With no options it is the mandorla behind everything (an upright
 * oval, like Our Lady of Guadalupe's); the Monstrance and the Chalice's Host
 * use smaller ones of their own.
 */
function raysGeometry({ count = 44, inner = 1.28, straight = OUTER, wavy = 2.2, width = 0.05, sway = 0.065, depth = 0.05, oval = 0.84 } = {}) {
  const shapes = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const dir = [Math.cos(a), Math.sin(a)];
    const perp = [-dir[1], dir[0]];
    const at = (r, side) => [dir[0] * r + perp[0] * side, dir[1] * r + perp[1] * side];
    if (i % 2 === 0) {
      const half = inner * (Math.PI / count) * 0.62;
      shapes.push(shapeOf([at(inner, -half), at(straight, 0), at(inner, half)]));
    } else {
      const steps = 14;
      const left = [];
      const right = [];
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const r = inner + (wavy - inner) * t;
        const half = width * Math.pow(1 - t, 0.85) + 0.003;
        const off = sway * Math.sin(t * Math.PI * 3) * (1 - t * 0.35);
        left.push(at(r, off + half));
        right.push(at(r, off - half));
      }
      shapes.push(shapeOf([...left, ...right.reverse()]));
    }
  }
  const geometry = new ExtrudeGeometry(shapes, {
    depth, bevelEnabled: true, bevelThickness: depth * 0.3, bevelSize: depth * 0.2, bevelSegments: 1, curveSegments: 4,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.scale(oval, 1, 1);
  return geometry;
}

function crossGeometry() {
  const w = 0.125; // half the bar's width
  const shape = shapeOf([
    [-w, -1.0], [w, -1.0], [w, 0.28], [0.5, 0.28], [0.5, 0.28 + 2 * w], [w, 0.28 + 2 * w],
    [w, 0.85], [-w, 0.85], [-w, 0.28 + 2 * w], [-0.5, 0.28 + 2 * w], [-0.5, 0.28], [-w, 0.28],
  ]);
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.18, bevelEnabled: true, bevelThickness: 0.045, bevelSize: 0.035, bevelSegments: 3, curveSegments: 4,
  });
  geometry.center();
  return geometry;
}

function starGeometry() {
  const points = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 0.045 : 0.115;
    points.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const geometry = new ExtrudeGeometry(shapeOf(points), {
    depth: 0.025, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.008, bevelSegments: 1,
  });
  geometry.center();
  return geometry;
}

/** The INRI plate over Christ's head. */
function titulusTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e9cf86';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#6b4f17';
  ctx.font = 'bold 44px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('INRI', 128, 35);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * Christ on the cross, kept simple and abstract: rounded shapes for the
 * head (bowed toward His right shoulder, with a halo), the body, the arms
 * reaching to the ends of the crossbeam, the loincloth and the legs. In the
 * cross's own units (crossGeometry, centred): the crossbeam runs along
 * y ≈ 0.36–0.61 and the cross's front face is at z = 0.135.
 */
function corpus(body, plate, keep) {
  const group = new Group();
  const front = 0.135;
  const up = new Vector3(0, 1, 0);

  // A rounded limb from point a to point b.
  function limb(a, b, radius) {
    const from = new Vector3(...a);
    const to = new Vector3(...b);
    const dir = to.clone().sub(from);
    const length = dir.length();
    const mesh = new Mesh(keep(new CapsuleGeometry(radius, Math.max(0.001, length - radius * 2), 4, 10)), body);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(up, dir.normalize());
    group.add(mesh);
    return mesh;
  }

  // A smooth turned shape from a side profile of [radius, y] points,
  // flattened front to back so it lies against the cross.
  function turned(profile, depth, z) {
    const mesh = new Mesh(keep(new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), 24)), body);
    mesh.scale.set(1, 1, depth);
    mesh.position.z = z;
    group.add(mesh);
    return mesh;
  }

  // Arms, rising a little from the shoulders to the hands on the crossbeam.
  limb([-0.07, 0.375, front + 0.035], [-0.44, 0.49, front + 0.03], 0.027);
  limb([0.07, 0.375, front + 0.035], [0.44, 0.49, front + 0.03], 0.027);

  // The body, from the waist up to rounded shoulders.
  turned([
    [0, 0], [0.062, 0], [0.06, 0.06], [0.07, 0.16], [0.085, 0.28], [0.088, 0.33],
    [0.082, 0.37], [0.06, 0.395], [0.03, 0.405], [0, 0.408],
  ], 0.5, front + 0.04);

  // The neck and the head, bowed toward His right shoulder, with a halo.
  limb([0.005, 0.39, front + 0.045], [0.022, 0.45, front + 0.055], 0.028);
  const head = new Mesh(keep(new SphereGeometry(0.066, 18, 14)), body);
  head.position.set(0.035, 0.49, front + 0.06);
  head.scale.set(0.9, 1.05, 0.95);
  group.add(head);
  const halo = new Mesh(keep(new TorusGeometry(0.105, 0.011, 8, 40)), body);
  halo.position.set(0.032, 0.5, front + 0.012);
  group.add(halo);

  // The legs together in one piece, narrowing to the ankles.
  const legs = turned([
    [0, -0.71], [0.022, -0.7], [0.028, -0.64], [0.037, -0.52], [0.044, -0.42],
    [0.041, -0.35], [0.05, -0.24], [0.057, -0.13], [0.04, -0.1], [0, -0.095],
  ], 0.8, front + 0.04);
  legs.rotation.z = 0.025;
  // The feet, one over the other, nailed to the cross.
  limb([-0.012, -0.69, front + 0.045], [0.03, -0.75, front + 0.035], 0.02);

  // The loincloth, wider at the hem, over the hips.
  const cloth = new Mesh(keep(new CylinderGeometry(0.066, 0.098, 0.19, 18)), body);
  cloth.position.set(0, -0.055, front + 0.045);
  cloth.scale.set(1, 1, 0.6);
  cloth.rotation.z = -0.06;
  group.add(cloth);

  // The INRI plate above the head.
  const titulus = new Mesh(keep(new BoxGeometry(0.21, 0.07, 0.02)), [body, body, body, body, plate, body]);
  titulus.position.set(0, 0.73, front + 0.012);
  group.add(titulus);

  return group;
}

/** [radius, y] pairs as the profile of a LatheGeometry. */
function profile(points) {
  return points.map(([r, y]) => new Vector2(r, y));
}

/** A heart, point down, about 0.84 wide and 0.84 tall, centred, puffed out front and back. */
function heartGeometry() {
  const k = 0.42;
  const p = (x, y) => [x * k, y * k];
  const shape = new Shape();
  shape.moveTo(...p(0, -1.1));
  shape.bezierCurveTo(...p(-0.25, -0.75), ...p(-1, -0.35), ...p(-1, 0.25));
  shape.bezierCurveTo(...p(-1, 0.68), ...p(-0.75, 0.92), ...p(-0.48, 0.92));
  shape.bezierCurveTo(...p(-0.2, 0.92), ...p(-0.03, 0.72), ...p(0, 0.5));
  shape.bezierCurveTo(...p(0.03, 0.72), ...p(0.2, 0.92), ...p(0.48, 0.92));
  shape.bezierCurveTo(...p(0.75, 0.92), ...p(1, 0.68), ...p(1, 0.25));
  shape.bezierCurveTo(...p(1, -0.35), ...p(0.25, -0.75), ...p(0, -1.1));
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.05, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.09, bevelSegments: 8, curveSegments: 20,
  });
  geometry.center();
  return geometry;
}

/** One flame, `h` tall and about `w` wide, its foot at the origin. */
function flameGeometry(h, w) {
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(w, 0, w * 1.1, h * 0.45, w * 0.35, h * 0.72);
  shape.bezierCurveTo(w * 0.18, h * 0.84, w * 0.12, h * 0.92, 0, h);
  shape.bezierCurveTo(-w * 0.3, h * 0.8, -w * 0.95, h * 0.62, -w * 0.82, h * 0.34);
  shape.bezierCurveTo(-w * 0.74, h * 0.1, -w * 0.4, 0, 0, 0);
  return new ExtrudeGeometry(shape, {
    depth: 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 2, curveSegments: 10,
  });
}

/** Three flames rising from the top of a heart, `y` being where they start. */
function flames(material, keep, y) {
  const group = new Group();
  [[0, 0.42, 0.13, 0], [-0.13, 0.3, 0.1, 0.38], [0.13, 0.3, 0.1, -0.38]].forEach(([x, h, w, tilt]) => {
    const mesh = new Mesh(keep(flameGeometry(h, w)), material);
    mesh.position.set(x, y, -0.02);
    mesh.rotation.z = tilt;
    group.add(mesh);
  });
  return group;
}

/** A gold cross `size` times the main cross, centred on `y`. */
function smallCross(m, keep, size, y, z = 0) {
  const mesh = new Mesh(keep(crossGeometry()), m.gold);
  mesh.scale.setScalar(size);
  mesh.position.set(0, y, z);
  return mesh;
}

/** A round Host facing the front, with a cross pressed into it. */
function host(m, keep, radius) {
  const group = new Group();
  const disc = new Mesh(keep(new CylinderGeometry(radius, radius, 0.035, 48)), m.host);
  disc.rotation.x = Math.PI / 2;
  group.add(disc);
  const bar = keep(new BoxGeometry(1, 1, 1));
  const upright = new Mesh(bar, m.gold);
  upright.scale.set(radius * 0.16, radius * 1.15, 0.012);
  upright.position.set(0, radius * 0.05, 0.02);
  const beam = new Mesh(bar, m.gold);
  beam.scale.set(radius * 0.8, radius * 0.16, 0.012);
  beam.position.set(0, radius * 0.22, 0.02);
  group.add(upright, beam);
  return group;
}

// ---- the objects -------------------------------------------------------
// Each builds its object in the glory's units (the ring is 1.2 high, the
// cross about 2 tall), and says how it moves: `move(t)` gets the seconds.

function sway(group, amount = 0.55) {
  return (t) => { group.rotation.y = amount * Math.sin(t * 0.38); };
}

/** The crucifix: the gold cross with Christ on it, a shade paler so the figure reads against the wood. */
function buildCrucifix(m, keep) {
  const group = new Group();
  group.scale.setScalar(1.1);
  group.add(new Mesh(keep(crossGeometry()), m.gold));
  group.add(corpus(m.corpusGold, m.plate, keep));
  return { group, move: sway(group) };
}

/** A plain gold cross. */
function buildCross(m, keep) {
  const group = new Group();
  group.scale.setScalar(1.15);
  group.add(new Mesh(keep(crossGeometry()), m.gold));
  return { group, move: sway(group) };
}

/** The chalice, with the Host above it in its own small rays. */
function buildChalice(m, keep) {
  const group = new Group();
  group.position.y = -0.08;
  const cup = new Mesh(keep(new LatheGeometry(profile([
    [0, -1.0], [0.44, -1.0], [0.46, -0.975], [0.43, -0.94], [0.3, -0.87], [0.17, -0.78], [0.085, -0.66],
    [0.062, -0.5], [0.07, -0.43], [0.13, -0.39], [0.14, -0.35], [0.13, -0.31], [0.07, -0.27], [0.06, -0.2],
    [0.06, -0.1], [0.1, -0.05], [0.22, 0.01], [0.33, 0.11], [0.39, 0.24], [0.41, 0.36], [0.395, 0.37],
    [0.375, 0.27], [0.32, 0.15], [0.2, 0.07], [0, 0.05],
  ]), 56)), m.gold);
  group.add(cup);
  // A band of paler gold round the knop and under the cup.
  const knop = new Mesh(keep(new TorusGeometry(0.138, 0.018, 8, 40)), m.paleGold);
  knop.rotation.x = Math.PI / 2;
  knop.position.y = -0.35;
  group.add(knop);
  const lip = new Mesh(keep(new TorusGeometry(0.4, 0.014, 8, 56)), m.paleGold);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.36;
  group.add(lip);
  // The Host above the cup, in rays.
  const above = new Group();
  above.position.set(0, 0.72, 0.05);
  above.add(new Mesh(keep(raysGeometry({ count: 28, inner: 0.27, straight: 0.6, wavy: 0.5, width: 0.03, sway: 0.03, depth: 0.03, oval: 1 })), m.gold));
  above.add(host(m, keep, 0.24));
  group.add(above);
  return {
    group,
    move: (t) => {
      group.rotation.y = 0.4 * Math.sin(t * 0.38);
      above.rotation.y = -0.5 * group.rotation.y;
      above.position.y = 0.72 + 0.025 * Math.sin(t * 0.9);
    },
  };
}

/** The monstrance: the Host in a gold sunburst on a stand, a cross at the top. */
function buildMonstrance(m, keep) {
  const group = new Group();
  group.position.y = -0.06;
  group.scale.setScalar(0.95);
  const stand = new Mesh(keep(new LatheGeometry(profile([
    [0, -1.0], [0.42, -1.0], [0.435, -0.975], [0.39, -0.93], [0.24, -0.86], [0.11, -0.76], [0.065, -0.62],
    [0.06, -0.48], [0.12, -0.44], [0.13, -0.4], [0.12, -0.36], [0.06, -0.32], [0.055, -0.2], [0.1, -0.16],
    [0.1, -0.13], [0.05, -0.1], [0.045, -0.04], [0, -0.04],
  ]), 48)), m.gold);
  group.add(stand);
  const luna = new Group();
  luna.position.y = 0.26;
  luna.add(new Mesh(keep(raysGeometry({ count: 36, inner: 0.3, straight: 0.74, wavy: 0.6, width: 0.035, sway: 0.035, depth: 0.04, oval: 1 })), m.gold));
  const ring = new Mesh(keep(new TorusGeometry(0.255, 0.035, 12, 56)), m.paleGold);
  luna.add(ring);
  const outer = new Mesh(keep(new TorusGeometry(0.31, 0.014, 8, 56)), m.gold);
  luna.add(outer);
  luna.add(host(m, keep, 0.22));
  // Small gems round the ring.
  const gem = keep(new SphereGeometry(0.024, 10, 8));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const g = new Mesh(gem, m.red);
    g.position.set(Math.cos(a) * 0.31, Math.sin(a) * 0.31, 0.02);
    luna.add(g);
  }
  group.add(luna);
  group.add(smallCross(m, keep, 0.15, 1.15));
  return { group, move: sway(group, 0.45) };
}

/** The heart, red, centred on `y`. */
function heart(m, keep, y) {
  const group = new Group();
  group.position.y = y;
  group.add(new Mesh(keep(heartGeometry()), m.red));
  return group;
}

/** The Sacred Heart of Jesus: crowned with thorns, a cross in the flames above, the wound in its side. */
function buildSacredHeart(m, keep) {
  const group = new Group();
  group.scale.setScalar(1.18);
  const h = heart(m, keep, -0.12);
  group.add(h);
  // The wound, on His right (the heart's left as we look at it).
  const wound = new Mesh(keep(new CapsuleGeometry(0.018, 0.09, 4, 8)), m.darkRed);
  wound.position.set(-0.17, 0.0, 0.215);
  wound.rotation.z = -0.5;
  h.add(wound);
  // The crown of thorns round the middle, seen from a little above.
  const crown = new Group();
  // Its ring is the heart's width across and a little more than its depth
  // front to back, tipped toward us so the front of it shows.
  crown.position.set(0, -0.08, 0);
  crown.rotation.x = 0.32;
  const ring = keep(new TorusGeometry(1, 0.06, 8, 72));
  const thorn = keep(new ConeGeometry(0.018, 0.1, 5));
  const rand = seeded(77);
  [[0, 0], [0.04, 1.3]].forEach(([dy, turn]) => {
    const band = new Mesh(ring, m.thorn);
    band.rotation.x = Math.PI / 2;
    band.rotation.z = turn;
    band.position.y = dy;
    band.scale.set(0.56, 0.3, 0.4);
    crown.add(band);
  });
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2 + rand() * 0.1;
    const t = new Mesh(thorn, m.thorn);
    t.position.set(Math.cos(a) * 0.57, (rand() - 0.5) * 0.06, Math.sin(a) * 0.31);
    // Pointing out from the ring, every which way.
    t.rotation.set((rand() - 0.5) * 1.4, -a, -Math.PI / 2 + (rand() - 0.5) * 1.2);
    crown.add(t);
  }
  group.add(crown);
  group.add(flames(m.flame, keep, 0.21));
  group.add(smallCross(m, keep, 0.14, 0.76));
  return {
    group,
    move: (t) => {
      group.rotation.y = 0.35 * Math.sin(t * 0.38);
      h.scale.setScalar(1 + 0.018 * Math.max(0, Math.sin(t * 2.4)));
    },
  };
}

/** The Immaculate Heart of Mary: a wreath of roses, pierced by a sword, flames above. */
function buildImmaculateHeart(m, keep) {
  const group = new Group();
  group.scale.setScalar(1.12);
  const h = heart(m, keep, -0.12);
  group.add(h);
  // The sword, from the upper left through to the lower right.
  const sword = new Group();
  sword.position.set(-0.52, 0.44, 0.05);
  sword.rotation.z = -2.36;
  const blade = shapeOf([[-0.024, 0.08], [0.024, 0.08], [0.024, 1.2], [0, 1.32], [-0.024, 1.2]]);
  sword.add(new Mesh(keep(new ExtrudeGeometry(blade, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1 })), m.steel));
  const guard = new Mesh(keep(new BoxGeometry(0.22, 0.035, 0.045)), m.gold);
  guard.position.y = 0.07;
  sword.add(guard);
  const grip = new Mesh(keep(new CylinderGeometry(0.02, 0.022, 0.15, 10)), m.gold);
  grip.position.y = -0.02;
  sword.add(grip);
  const pommel = new Mesh(keep(new SphereGeometry(0.033, 12, 10)), m.gold);
  pommel.position.y = -0.115;
  sword.add(pommel);
  group.add(sword);
  // The wreath of roses round it, on a gold stem.
  const wreath = new Group();
  wreath.position.set(0, -0.12, 0.12);
  const rx = 0.64;
  const ry = 0.6;
  const stem = new Mesh(keep(new TorusGeometry(1, 0.012, 6, 80)), m.leaf);
  stem.scale.set(rx, ry, 1);
  wreath.add(stem);
  const petal = keep(new SphereGeometry(0.05, 12, 8));
  const bud = keep(new SphereGeometry(0.04, 12, 8));
  const leaf = keep(new SphereGeometry(0.042, 8, 6));
  for (let i = 0; i < 9; i++) {
    // Leave the top open for the flames.
    const a = Math.PI / 2 + 0.6 + (i / 8) * (Math.PI * 2 - 1.2);
    const rose = new Group();
    rose.position.set(Math.cos(a) * rx, Math.sin(a) * ry, 0.03);
    for (let k = 0; k < 5; k++) {
      const pa = (k / 5) * Math.PI * 2 + i;
      const p = new Mesh(petal, m.rose);
      p.position.set(Math.cos(pa) * 0.04, Math.sin(pa) * 0.04, 0);
      p.scale.set(1, 1, 0.55);
      rose.add(p);
    }
    const c = new Mesh(bud, m.roseDeep);
    c.position.z = 0.02;
    rose.add(c);
    // A leaf either side, along the stem.
    for (const side of [-1, 1]) {
      const l = new Mesh(leaf, m.leaf);
      l.position.set(-Math.sin(a) * 0.09 * side, Math.cos(a) * 0.09 * side, -0.02);
      l.scale.set(1.6, 0.6, 0.4);
      l.rotation.z = a + Math.PI / 2 + side * 0.35;
      rose.add(l);
    }
    wreath.add(rose);
  }
  group.add(wreath);
  group.add(flames(m.flame, keep, 0.21));
  return {
    group,
    move: (t) => {
      group.rotation.y = 0.35 * Math.sin(t * 0.38);
      h.scale.setScalar(1 + 0.018 * Math.max(0, Math.sin(t * 2.4)));
    },
  };
}

/** One wing of the dove, the right one, from the shoulder at the origin out and up. */
function wingGeometry(size = 1) {
  const tip = [0.98, 0.56];
  const root = [0.04, -0.14];
  const shape = new Shape();
  shape.moveTo(0, 0.06);
  shape.quadraticCurveTo(0.42, 0.46, tip[0], tip[1]);
  // The long feathers along the lower edge, from the tip back to the body.
  const feathers = 8;
  const dx = root[0] - tip[0];
  const dy = root[1] - tip[1];
  const len = Math.hypot(dx, dy);
  const out = [-dy / len, dx / len]; // away from the wing's top edge
  for (let i = 0; i < feathers; i++) {
    const t0 = i / feathers;
    const t1 = (i + 1) / feathers;
    const reach = 0.1 + 0.11 * Math.sin(Math.PI * (0.25 + 0.75 * t0)) * (1 - t0 * 0.4);
    const mid = (t0 + t1) / 2;
    const cx = tip[0] + dx * mid + out[0] * reach;
    const cy = tip[1] + dy * mid + out[1] * reach;
    shape.quadraticCurveTo(cx, cy, tip[0] + dx * t1, tip[1] + dy * t1);
  }
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.03, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2, curveSegments: 8,
  });
  geometry.scale(size, size, 1);
  return geometry;
}

/** The dove of the Holy Spirit, coming down with its wings spread. */
function buildDove(m, keep) {
  const group = new Group();
  group.position.y = 0.05;
  const body = new Mesh(keep(new SphereGeometry(0.2, 28, 20)), m.corpusGold);
  body.scale.set(0.85, 1.55, 0.85);
  body.position.set(0, -0.06, 0.06);
  group.add(body);
  const head = new Mesh(keep(new SphereGeometry(0.115, 22, 16)), m.corpusGold);
  head.position.set(0, 0.34, 0.12);
  group.add(head);
  const beak = new Mesh(keep(new ConeGeometry(0.026, 0.085, 10)), m.gold);
  beak.position.set(0, 0.3, 0.25);
  beak.rotation.x = Math.PI / 2 + 0.35;
  group.add(beak);
  // The tail, a fan of feathers below.
  const tailShape = new Shape();
  tailShape.moveTo(-0.06, -0.26);
  tailShape.lineTo(0.06, -0.26);
  tailShape.lineTo(0.2, -0.66);
  for (let i = 0; i < 5; i++) {
    const x0 = 0.2 - (i * 0.4) / 5;
    const x1 = 0.2 - ((i + 1) * 0.4) / 5;
    tailShape.quadraticCurveTo((x0 + x1) / 2, -0.76, x1, -0.66);
  }
  tailShape.closePath();
  const tail = new Mesh(keep(new ExtrudeGeometry(tailShape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 2 })), m.gold);
  tail.position.z = 0.0;
  group.add(tail);
  // The wings: long gold feathers, the shorter ones over them a paler gold.
  const long = keep(wingGeometry(1));
  const short = keep(wingGeometry(0.58));
  const wings = [-1, 1].map((side) => {
    const wing = new Group();
    wing.position.set(side * 0.09, 0.06, 0.02);
    wing.scale.x = side;
    wing.add(new Mesh(long, m.gold));
    const cover = new Mesh(short, m.paleGold);
    cover.position.set(0.02, 0.02, 0.035);
    wing.add(cover);
    group.add(wing);
    return wing;
  });
  return {
    group,
    move: (t) => {
      group.rotation.y = 0.35 * Math.sin(t * 0.38);
      group.position.y = 0.05 + 0.04 * Math.sin(t * 0.8);
      const beat = Math.sin(t * 1.5);
      wings.forEach((wing, i) => {
        const side = i ? 1 : -1;
        wing.rotation.z = side * 0.07 * beat;
        wing.rotation.y = side * (0.18 + 0.1 * beat);
      });
    },
  };
}

/** The rosary: five decades of wooden beads on a gold chain, the medal, and the crucifix below. */
function buildRosary(m, keep) {
  const group = new Group();
  group.position.y = 0.1;
  const cx = 0;
  const cy = 0.3;
  const rx = 0.6;
  const ry = 0.56;
  const at = (a) => new Vector3(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 0);
  // The chain round the loop.
  const loop = [];
  for (let i = 0; i < 72; i++) loop.push(at((i / 72) * Math.PI * 2));
  group.add(new Mesh(keep(new TubeGeometry(new CatmullRomCurve3(loop, true), 180, 0.006, 5, true)), m.gold));
  // The beads: from the medal at the bottom, ten small and one large, five times.
  const small = keep(new SphereGeometry(0.032, 14, 10));
  const large = keep(new SphereGeometry(0.047, 16, 12));
  const slots = 57; // 50 small, 4 large, and 3 taken by the medal
  let slot = 2;
  for (let decade = 0; decade < 5; decade++) {
    for (let b = 0; b < 10; b++) {
      const bead = new Mesh(small, m.wood);
      bead.position.copy(at(-Math.PI / 2 + (slot++ / slots) * Math.PI * 2));
      group.add(bead);
    }
    if (decade < 4) {
      const bead = new Mesh(large, m.gold);
      bead.position.copy(at(-Math.PI / 2 + (slot++ / slots) * Math.PI * 2));
      group.add(bead);
    }
  }
  // The medal where the loop meets the pendant.
  const bottom = cy - ry;
  const medal = new Group();
  medal.position.set(0, bottom, 0.01);
  const face = new Mesh(keep(new CylinderGeometry(0.07, 0.07, 0.022, 32)), m.paleGold);
  face.rotation.x = Math.PI / 2;
  medal.add(face);
  medal.add(new Mesh(keep(new TorusGeometry(0.07, 0.01, 8, 32)), m.gold));
  medal.scale.set(1, 1.25, 1);
  group.add(medal);
  // The pendant: a large bead, three small, a large, then the crucifix.
  const pendant = new Group();
  pendant.position.y = bottom - 0.08;
  const chain = new Mesh(keep(new CylinderGeometry(0.006, 0.006, 0.46, 5)), m.gold);
  chain.position.y = -0.23;
  pendant.add(chain);
  [[large, -0.06, m.gold], [small, -0.14, m.wood], [small, -0.205, m.wood], [small, -0.27, m.wood], [large, -0.36, m.gold]].forEach(([g, y, mat]) => {
    const bead = new Mesh(g, mat);
    bead.position.y = y;
    pendant.add(bead);
  });
  const crucifix = new Group();
  crucifix.scale.setScalar(0.23);
  crucifix.position.y = -0.63;
  crucifix.add(new Mesh(keep(crossGeometry()), m.gold));
  crucifix.add(corpus(m.corpusGold, m.plate, keep));
  pendant.add(crucifix);
  group.add(pendant);
  return {
    group,
    move: (t) => {
      group.rotation.y = 0.45 * Math.sin(t * 0.38);
      pendant.rotation.z = 0.06 * Math.sin(t * 0.9);
      pendant.rotation.x = 0.08 * Math.sin(t * 0.7 + 1);
    },
  };
}

/**
 * A cloth hanging round the figure and open at the front, like a mantle or a
 * veil. `rows` go from the bottom up as [radius, y, open], `open` being how
 * far round from the front (in radians) each side of the opening is; they are
 * smoothed into `steps` rings. `depth` flattens it front to back, `folds` and
 * `fold` ripple it into folds that deepen toward the bottom. Also returns
 * at(t, phi): a point on it and the way it faces, t from 0 (bottom) to 1 (top).
 */
function drape(rows, { depth = 1, folds = 0, fold = 0, steps = 40, segments = 48 } = {}) {
  const curve = new CatmullRomCurve3(rows.map(([r, y, open]) => new Vector3(r, y, open)));
  const rings = curve.getPoints(steps);
  const radiusAt = (ring, phi, t) => ring.x * (1 + fold * (1 - t) * Math.sin(phi * folds));
  const positions = [];
  const index = [];
  rings.forEach((ring, i) => {
    const t = i / steps;
    for (let j = 0; j <= segments; j++) {
      const phi = ring.z + ((Math.PI * 2 - ring.z * 2) * j) / segments;
      const r = radiusAt(ring, phi, t);
      positions.push(r * Math.sin(phi), ring.y, r * Math.cos(phi) * depth);
    }
  });
  const row = segments + 1;
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * row + j;
      index.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  function at(t, phi) {
    const ring = curve.getPoint(t);
    const r = radiusAt(ring, phi, t);
    return {
      position: new Vector3(r * Math.sin(phi), ring.y, r * Math.cos(phi) * depth),
      normal: new Vector3(Math.sin(phi), 0, Math.cos(phi) / depth).normalize(),
      open: ring.z,
    };
  }
  /** The two front edges, bottom to top, for a trim along them. */
  function edges(lift = 1.01) {
    return [1, -1].map((side) => rings.map((ring, i) => {
      const phi = side > 0 ? ring.z : Math.PI * 2 - ring.z;
      const r = radiusAt(ring, phi, i / steps) * lift;
      return new Vector3(r * Math.sin(phi), ring.y, r * Math.cos(phi) * depth);
    }));
  }
  return { geometry, at, edges };
}

/** A gold cord along `points`. */
function trim(m, keep, points, radius = 0.009) {
  return new Mesh(keep(new TubeGeometry(new CatmullRomCurve3(points), points.length * 2, radius, 5, false)), m.gold);
}

/** Two hands joined in prayer, fingertips up: a pointed shape, about 0.075 wide and 0.15 tall. */
function prayingHandsGeometry() {
  const shape = new Shape();
  shape.moveTo(-0.034, -0.07);
  shape.quadraticCurveTo(-0.042, 0.01, -0.02, 0.055);
  shape.quadraticCurveTo(-0.008, 0.078, 0, 0.082);
  shape.quadraticCurveTo(0.008, 0.078, 0.02, 0.055);
  shape.quadraticCurveTo(0.042, 0.01, 0.034, -0.07);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.03, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.01, bevelSegments: 3, curveSegments: 10,
  });
  geometry.translate(0, 0, -0.015);
  return geometry;
}

/** The crescent moon under her feet, horns up, `radius` across each way from the middle. */
function crescentGeometry(radius) {
  const points = [];
  const steps = 32;
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI + (i / steps) * Math.PI;
    points.push([Math.cos(a) * radius, Math.sin(a) * radius * 0.62]);
  }
  for (let i = steps - 1; i > 0; i--) {
    const a = Math.PI + (i / steps) * Math.PI;
    points.push([Math.cos(a) * radius * 0.97, Math.sin(a) * radius * 0.26]);
  }
  const geometry = new ExtrudeGeometry(shapeOf(points), {
    depth: 0.2, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.03, bevelSegments: 4, curveSegments: 4,
  });
  geometry.translate(0, 0, -0.1);
  return geometry;
}

/**
 * Our Lady, Queen of Heaven, for a parish of any of her titles (Guadalupe,
 * Mediatrix, the Immaculate Conception and others): Mary standing on the
 * moon, her head bowed a little to her right, hands joined in prayer, in a
 * rose gown and a blue-green mantle edged in gold and strewn with stars, a
 * small crown on her veil and twelve stars round her head (Revelation 12:1).
 * As simple rounded shapes, the face without features, like the crucifix.
 */
function buildOurLady(m, keep) {
  const group = new Group();
  group.scale.setScalar(1.18);
  group.position.y = 0.03;
  const figure = new Group();
  group.add(figure);
  const depth = 0.74;

  // The gown, from the hem up to the neck, falling in soft folds.
  const gownGeometry = keep(new LatheGeometry(profile([
    [0, -0.84], [0.29, -0.84], [0.305, -0.81], [0.285, -0.62], [0.25, -0.38], [0.215, -0.14], [0.185, 0.03],
    [0.18, 0.12], [0.195, 0.25], [0.205, 0.36], [0.19, 0.44], [0.13, 0.5], [0.06, 0.53], [0, 0.535],
  ]), 56));
  const pos = gownGeometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const lower = Math.max(0, Math.min(1, (0.1 - y) / 0.9));
    const k = 1 + 0.035 * lower * Math.sin(Math.atan2(x, z) * 11);
    pos.setXYZ(i, x * k, y, z * k);
  }
  gownGeometry.computeVertexNormals();
  const gown = new Mesh(gownGeometry, m.gown);
  gown.scale.z = depth;
  figure.add(gown);
  // A gold sash at the waist.
  const sash = new Mesh(keep(new TorusGeometry(0.184, 0.012, 8, 56)), m.gold);
  sash.rotation.x = Math.PI / 2;
  sash.scale.set(1, depth, 1);
  sash.position.y = 0.06;
  figure.add(sash);

  // The mantle, over the shoulders and down to the feet, open in front.
  const mantle = drape([
    [0.355, -0.8, 1.2], [0.315, -0.52, 1.08], [0.275, -0.22, 0.96], [0.245, 0.04, 0.86],
    [0.245, 0.24, 0.78], [0.24, 0.39, 0.66], [0.2, 0.47, 0.6], [0.12, 0.525, 0.58],
  ], { depth: depth + 0.04, folds: 9, fold: 0.05 });
  figure.add(new Mesh(keep(mantle.geometry), m.mantle));
  figure.add(new Mesh(mantle.geometry, m.lining));
  mantle.edges().forEach((edge) => figure.add(trim(m, keep, edge)));
  // Its hem, edged in gold too.
  const hem = [];
  for (let j = 0; j <= 40; j++) {
    const open = mantle.at(0, 0).open;
    hem.push(mantle.at(0, open + ((Math.PI * 2 - open * 2) * j) / 40).position.multiplyScalar(1.01));
  }
  figure.add(trim(m, keep, hem));
  // Gold stars on the mantle, on the sides that show.
  const star = keep(starGeometry());
  const front = new Vector3(0, 0, 1);
  const rand = seeded(1212);
  for (let i = 0; i < 26; i++) {
    const t = 0.06 + rand() * 0.82;
    const side = i % 2 ? 1 : -1;
    const { open } = mantle.at(t, 0);
    const phi = side > 0 ? open + 0.12 + rand() * 1.5 : Math.PI * 2 - open - 0.12 - rand() * 1.5;
    const { position, normal } = mantle.at(t, phi);
    const s = new Mesh(star, m.gold);
    s.position.copy(position).addScaledVector(normal, 0.008);
    s.quaternion.setFromUnitVectors(front, normal);
    s.rotateZ(rand() * Math.PI);
    s.scale.setScalar(0.28 + rand() * 0.08);
    figure.add(s);
  }

  // The arms in the gown's sleeves, the hands joined in prayer.
  const up = new Vector3(0, 1, 0);
  const sleeve = keep(new CapsuleGeometry(0.036, 0.13, 4, 10));
  for (const side of [-1, 1]) {
    const from = new Vector3(side * 0.165, 0.17, 0.05);
    const to = new Vector3(side * 0.035, 0.27, 0.165);
    const arm = new Mesh(sleeve, m.gown);
    arm.position.copy(from).add(to).multiplyScalar(0.5);
    arm.quaternion.setFromUnitVectors(up, to.clone().sub(from).normalize());
    figure.add(arm);
    const cuff = new Mesh(keep(new TorusGeometry(0.035, 0.008, 6, 20)), m.gold);
    cuff.position.copy(to);
    cuff.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), to.clone().sub(from).normalize());
    figure.add(cuff);
  }
  const hands = new Mesh(keep(prayingHandsGeometry()), m.skin);
  hands.position.set(0, 0.33, 0.19);
  hands.rotation.x = 0.28;
  figure.add(hands);

  // The head, bowed a little to her right (our left), in its veil.
  const head = new Group();
  head.position.set(0, 0.5, 0.02);
  head.rotation.set(0.12, 0, 0.13);
  figure.add(head);
  const neck = new Mesh(keep(new CylinderGeometry(0.04, 0.048, 0.1, 14)), m.skin);
  neck.position.y = 0.05;
  head.add(neck);
  const face = new Mesh(keep(new SphereGeometry(0.09, 24, 18)), m.skin);
  face.position.set(0, 0.165, 0.025);
  face.scale.set(0.86, 1.08, 0.92);
  head.add(face);
  const veil = drape([
    [0.21, -0.02, 0.62], [0.16, 0.06, 0.66], [0.128, 0.14, 0.74], [0.124, 0.2, 0.8],
    [0.108, 0.25, 0.86], [0.07, 0.29, 0.9], [0.012, 0.31, 0.9],
  ], { depth: 0.95, folds: 7, fold: 0.04, steps: 24, segments: 40 });
  head.add(new Mesh(keep(veil.geometry), m.mantle));
  head.add(new Mesh(veil.geometry, m.lining));
  head.add(trim(m, keep, [...veil.edges()[0], ...veil.edges()[1].reverse()], 0.008));

  // A small crown on the veil: a band, five points with pearls on them.
  const crown = new Group();
  crown.position.set(0, 0.29, -0.005);
  crown.rotation.x = -0.18;
  const band = new Mesh(keep(new CylinderGeometry(0.068, 0.06, 0.035, 32, 1, true)), m.gold);
  crown.add(band);
  const point = keep(new ConeGeometry(0.014, 0.05, 6));
  const pearl = keep(new SphereGeometry(0.009, 8, 6));
  for (let i = 0; i < 5; i++) {
    const a = ((i - 2) / 5) * Math.PI * 1.15;
    const p = new Mesh(point, m.gold);
    p.position.set(Math.sin(a) * 0.066, 0.04, Math.cos(a) * 0.066);
    crown.add(p);
    const b = new Mesh(pearl, m.pearl);
    b.position.set(Math.sin(a) * 0.066, 0.07, Math.cos(a) * 0.066);
    crown.add(b);
  }
  head.add(crown);

  // The crown of twelve stars, a ring floating over her head and slowly
  // turning, each star kept facing us.
  const circlet = new Group();
  circlet.position.set(0, 0.4, -0.01);
  circlet.rotation.x = 0.38;
  const spin = new Group();
  circlet.add(spin);
  const twelve = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const s = new Mesh(star, m.gold);
    s.position.set(Math.sin(a) * 0.22, 0, Math.cos(a) * 0.22);
    s.userData.phase = i * 0.9;
    spin.add(s);
    twelve.push(s);
  }
  head.add(circlet);
  const facing = new Quaternion();

  // The crescent moon under her feet.
  const moon = new Mesh(keep(crescentGeometry(0.46)), m.moon);
  moon.position.set(0, -0.6, 0.0);
  figure.add(moon);

  return {
    group,
    move: (t) => {
      group.rotation.y = 0.4 * Math.sin(t * 0.38);
      figure.position.y = 0.02 * Math.sin(t * 0.6);
      spin.rotation.y = t * 0.3;
      spin.getWorldQuaternion(facing).invert();
      for (const s of twelve) {
        s.quaternion.copy(facing);
        s.scale.setScalar(0.5 * (0.88 + 0.12 * Math.sin(t * 1.3 + s.userData.phase)));
      }
    },
  };
}

const BUILDERS = {
  crucifix: buildCrucifix,
  cross: buildCross,
  chalice: buildChalice,
  monstrance: buildMonstrance,
  'sacred-heart': buildSacredHeart,
  'our-lady': buildOurLady,
  'immaculate-heart': buildImmaculateHeart,
  dove: buildDove,
  rosary: buildRosary,
};

/** A soft round spot, for the glow behind the cross and the drifting light. */
function glowTexture(inner, outer) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * Starts the scene on `canvas`, with `symbol` (a lib/heroSymbols.js key) in
 * the middle. `place(canvasRect)` says where the glory goes,
 * in the canvas's own pixels: { x, y, radius }. `observe` lists elements whose
 * size changes should re-run place(). Calls onReady() after the first frame.
 * Returns a function that stops it and frees the GPU memory, or null when
 * WebGL isn't available.
 */
export function startGlory(canvas, { symbol = 'crucifix', place, observe = [], still = false, onReady }) {
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envMap = pmrem.fromScene(room, 0.04).texture;
  scene.environment = envMap;
  room.dispose?.();
  pmrem.dispose();

  scene.add(new AmbientLight(0xfff4e0, 0.35));
  const key = new DirectionalLight(0xffe6b0, 1.6);
  key.position.set(-3, 4, 6);
  scene.add(key);

  const camera = new PerspectiveCamera(FOV, 1, 0.1, 50);
  camera.position.set(0, 0, CAMERA_Z);

  const gold = new MeshStandardMaterial({ color: 0xd4a640, metalness: 0.92, roughness: 0.28, envMapIntensity: 1.15 });
  const paleGold = new MeshStandardMaterial({ color: 0xe2bd62, metalness: 0.75, roughness: 0.38 });
  const corpusGold = new MeshStandardMaterial({ color: 0xf3dfa6, metalness: 0.62, roughness: 0.34, envMapIntensity: 1.1 });
  const plateTexture = titulusTexture();
  const plateMaterial = new MeshStandardMaterial({ map: plateTexture, metalness: 0.3, roughness: 0.5 });
  // What the objects are made of besides gold.
  const m = {
    gold,
    paleGold,
    corpusGold,
    plate: plateMaterial,
    host: new MeshStandardMaterial({ color: 0xf8efd8, metalness: 0.05, roughness: 0.62 }),
    red: new MeshStandardMaterial({ color: 0xb0222c, metalness: 0.35, roughness: 0.3, envMapIntensity: 1.1 }),
    darkRed: new MeshStandardMaterial({ color: 0x5e0d14, metalness: 0.2, roughness: 0.5 }),
    thorn: new MeshStandardMaterial({ color: 0x5c4320, metalness: 0.45, roughness: 0.5 }),
    flame: new MeshStandardMaterial({ color: 0xf2a93b, emissive: 0xe2701c, emissiveIntensity: 0.45, metalness: 0.5, roughness: 0.35 }),
    steel: new MeshStandardMaterial({ color: 0xd9dde3, metalness: 1, roughness: 0.18, envMapIntensity: 1.3 }),
    rose: new MeshStandardMaterial({ color: 0xeab3bf, metalness: 0.05, roughness: 0.5 }),
    roseDeep: new MeshStandardMaterial({ color: 0xc9677d, metalness: 0.05, roughness: 0.5 }),
    leaf: new MeshStandardMaterial({ color: 0x5f8a3e, metalness: 0.2, roughness: 0.5 }),
    wood: new MeshStandardMaterial({ color: 0x6e3f1e, metalness: 0.15, roughness: 0.4, envMapIntensity: 1.1 }),
    // Our Lady: her mantle (its outside; the lining is gold), gown, skin, crown's pearls, the moon.
    mantle: new MeshStandardMaterial({ color: 0x24687a, metalness: 0.18, roughness: 0.5, envMapIntensity: 1.1, side: FrontSide }),
    lining: new MeshStandardMaterial({ color: 0xc99a3e, metalness: 0.7, roughness: 0.4, side: BackSide }),
    gown: new MeshStandardMaterial({ color: 0xe0a69c, metalness: 0.08, roughness: 0.52 }),
    skin: new MeshStandardMaterial({ color: 0xc89878, metalness: 0.05, roughness: 0.55 }),
    pearl: new MeshStandardMaterial({ color: 0xfaf4e6, metalness: 0.2, roughness: 0.25 }),
    moon: new MeshStandardMaterial({ color: 0xe6e2d6, metalness: 0.6, roughness: 0.3, envMapIntensity: 1.2 }),
  };
  const halo = glowTexture('rgba(255,238,196,0.95)', 'rgba(255,238,196,0)');
  const mote = glowTexture('rgba(255,226,150,1)', 'rgba(255,226,150,0)');
  const glowMaterial = new MeshBasicMaterial({ map: halo, transparent: true, depthWrite: false });
  const geometries = [];
  const keep = (g) => (geometries.push(g), g);

  // `root` is moved and scaled to sit where place() says; `glory` tilts inside it.
  const root = new Group();
  const glory = new Group();
  root.add(glory);
  scene.add(root);

  const glow = new Mesh(keep(new PlaneGeometry(3.6, 4.2)), glowMaterial);
  glow.position.z = -0.4;
  glory.add(glow);

  const rays = new Mesh(keep(raysGeometry()), paleGold);
  glory.add(rays);

  const ring = new Mesh(keep(new TorusGeometry(1.2, 0.028, 10, 120)), gold);
  ring.scale.set(0.84, 1, 1);
  glory.add(ring);

  // The parish's object (the crucifix unless it chose another), in front of
  // the rays. It moves by itself inside the glory's tilt.
  const piece = (BUILDERS[symbol] || BUILDERS.crucifix)(m, keep);
  const holder = new Group();
  holder.position.z = 0.25;
  holder.add(piece.group);
  glory.add(holder);

  // Stars around the rays, at different depths.
  const rand = seeded(1531);
  const starShape = keep(starGeometry());
  const stars = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + rand() * 0.3;
    const r = 2.0 + rand() * 1.0;
    const star = new Mesh(starShape, gold);
    star.position.set(Math.cos(a) * r * 0.95, Math.sin(a) * r, -0.6 + rand() * 1.4);
    const s = 0.7 + rand() * 0.8;
    star.scale.setScalar(s);
    star.userData = { base: star.position.clone(), scale: s, phase: rand() * Math.PI * 2, speed: 0.4 + rand() * 0.5 };
    glory.add(star);
    stars.push(star);
  }

  // Light drifting slowly upward through the glory.
  const moteCount = coarse ? 40 : 70;
  const motePositions = new Float32Array(moteCount * 3);
  const moteSpeeds = new Float32Array(moteCount);
  for (let i = 0; i < moteCount; i++) {
    motePositions[i * 3] = (rand() - 0.5) * 4.6;
    motePositions[i * 3 + 1] = (rand() - 0.5) * 6;
    motePositions[i * 3 + 2] = (rand() - 0.5) * 2;
    moteSpeeds[i] = 0.08 + rand() * 0.18;
  }
  const moteGeometry = keep(new BufferGeometry());
  moteGeometry.setAttribute('position', new BufferAttribute(motePositions, 3));
  const moteMaterial = new PointsMaterial({
    map: mote, size: 0.09, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0.85,
  });
  const motes = new Points(moteGeometry, moteMaterial);
  glory.add(motes);

  // Where the glory sits, from place(), in scene units.
  let placed = false;
  function layout() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    placed = true;
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    const spot = place(rect);
    const viewH = 2 * CAMERA_Z * Math.tan((FOV * Math.PI) / 360);
    const unitsPerPx = viewH / rect.height;
    root.position.set((spot.x - rect.width / 2) * unitsPerPx, -(spot.y - rect.height / 2) * unitsPerPx, 0);
    root.scale.setScalar((spot.radius * unitsPerPx) / OUTER);
    return true;
  }

  // The tilt follows the mouse a little on computers.
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  function onPointer(e) {
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
  }
  if (!coarse && !still) window.addEventListener('pointermove', onPointer, { passive: true });

  function pose(t, dt) {
    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 2.5);
    pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 2.5);
    glory.rotation.y = 0.22 * Math.sin(t * 0.23) + pointer.x * 0.22;
    glory.rotation.x = 0.1 * Math.sin(t * 0.17 + 1) + pointer.y * 0.14;
    piece.move(t);
    rays.scale.setScalar(1 + 0.018 * Math.sin(t * 0.7));
    glow.material.opacity = 0.8 + 0.2 * Math.sin(t * 0.7);
    for (const star of stars) {
      const { base, scale, phase, speed } = star.userData;
      star.position.y = base.y + 0.08 * Math.sin(t * speed + phase);
      star.rotation.y = t * speed * 0.8 + phase;
      star.scale.setScalar(scale * (0.85 + 0.15 * Math.sin(t * speed * 2.2 + phase)));
    }
    const pos = moteGeometry.attributes.position;
    for (let i = 0; i < moteCount; i++) {
      let y = pos.array[i * 3 + 1] + moteSpeeds[i] * dt;
      if (y > 3) y = -3;
      pos.array[i * 3 + 1] = y;
    }
    pos.needsUpdate = true;
  }

  let frame = 0;
  let visible = true;
  let last = 0;
  let clock = 0;
  let readySent = false;
  // Slow movement doesn't need 60 frames a second; phones get 30.
  const minGap = coarse ? 1000 / 30 : 1000 / 60 - 2;

  function draw() {
    renderer.render(scene, camera);
    if (!readySent) {
      readySent = true;
      onReady?.();
    }
  }

  function loop(now) {
    frame = requestAnimationFrame(loop);
    if (!visible || !placed) return;
    if (last && now - last < minGap) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    clock += dt;
    pose(clock, dt);
    draw();
  }

  function refresh() {
    if (!layout()) return;
    if (still) {
      pose(4, 0);
      draw();
    }
  }

  const resizer = new ResizeObserver(refresh);
  resizer.observe(canvas);
  observe.forEach((el) => el && resizer.observe(el));

  const watcher = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    last = 0;
  });
  if (!still) watcher.observe(canvas);

  // If the phone takes the GPU back, the glory just stops where it is.
  function onLost() {
    cancelAnimationFrame(frame);
  }
  canvas.addEventListener('webglcontextlost', onLost);

  // The resize observer's first call places it (and draws it, when still).
  if (!still) frame = requestAnimationFrame(loop);

  return function stop() {
    cancelAnimationFrame(frame);
    resizer.disconnect();
    watcher.disconnect();
    window.removeEventListener('pointermove', onPointer);
    canvas.removeEventListener('webglcontextlost', onLost);
    geometries.forEach((g) => g.dispose());
    [...new Set(Object.values(m)), glowMaterial, moteMaterial].forEach((material) => material.dispose());
    [halo, mote, plateTexture, envMap].forEach((t) => t.dispose());
    // No forceContextLoss(): React may start the scene again on this same
    // canvas (a remount), and a lost context can't be used again.
    renderer.dispose();
  };
}
