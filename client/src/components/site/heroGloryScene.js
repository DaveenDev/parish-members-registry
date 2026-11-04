/**
 * The 3D scene behind Home's hero: a gold crucifix (Christ on the cross, as
 * simple rounded shapes) inside the rays of Our Lady of Guadalupe's mandorla
 * (straight rays between wavy ones), with small stars like the ones on her
 * mantle and a little drifting light.
 *
 * Loaded on its own (HeroGlory imports it once the page is idle), so three.js
 * is a separate download that never holds up the page.
 */
import {
  ACESFilmicToneMapping, AdditiveBlending, AmbientLight, BoxGeometry, BufferAttribute, BufferGeometry,
  CanvasTexture, CapsuleGeometry, CylinderGeometry, DirectionalLight, ExtrudeGeometry, Group, LatheGeometry,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, PMREMGenerator, Points,
  PointsMaterial, Scene, Shape, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector2, Vector3, WebGLRenderer,
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

/** The mandorla: straight rays between wavy, flame-like ones. */
function raysGeometry() {
  const count = 44;
  const inner = 1.28;
  const shapes = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const dir = [Math.cos(a), Math.sin(a)];
    const perp = [-dir[1], dir[0]];
    const at = (r, side) => [dir[0] * r + perp[0] * side, dir[1] * r + perp[1] * side];
    if (i % 2 === 0) {
      const half = inner * (Math.PI / count) * 0.62;
      shapes.push(shapeOf([at(inner, -half), at(OUTER, 0), at(inner, half)]));
    } else {
      const outer = 2.2;
      const steps = 14;
      const left = [];
      const right = [];
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const r = inner + (outer - inner) * t;
        const half = 0.05 * Math.pow(1 - t, 0.85) + 0.003;
        const sway = 0.065 * Math.sin(t * Math.PI * 3) * (1 - t * 0.35);
        left.push(at(r, sway + half));
        right.push(at(r, sway - half));
      }
      shapes.push(shapeOf([...left, ...right.reverse()]));
    }
  }
  const geometry = new ExtrudeGeometry(shapes, {
    depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.01, bevelSegments: 1, curveSegments: 4,
  });
  geometry.translate(0, 0, -0.025);
  // Her mandorla is an upright oval, not a circle.
  geometry.scale(0.84, 1, 1);
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
 * Starts the scene on `canvas`. `place(canvasRect)` says where the glory goes,
 * in the canvas's own pixels: { x, y, radius }. `observe` lists elements whose
 * size changes should re-run place(). Calls onReady() after the first frame.
 * Returns a function that stops it and frees the GPU memory, or null when
 * WebGL isn't available.
 */
export function startGlory(canvas, { place, observe = [], still = false, onReady }) {
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

  // The crucifix: the gold cross with Christ on it, a shade paler so the
  // figure reads against the wood. `cross` sways as one piece.
  const cross = new Group();
  cross.position.z = 0.25;
  cross.scale.setScalar(1.1);
  cross.add(new Mesh(keep(crossGeometry()), gold));
  cross.add(corpus(corpusGold, plateMaterial, keep));
  glory.add(cross);

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
    cross.rotation.y = 0.55 * Math.sin(t * 0.38);
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
    [gold, paleGold, corpusGold, plateMaterial, glowMaterial, moteMaterial].forEach((m) => m.dispose());
    [halo, mote, plateTexture, envMap].forEach((t) => t.dispose());
    // No forceContextLoss(): React may start the scene again on this same
    // canvas (a remount), and a lost context can't be used again.
    renderer.dispose();
  };
}
