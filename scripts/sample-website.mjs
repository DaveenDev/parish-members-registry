// Sample website content for the DEMO site, so the public pages look like a
// parish's: Blog Articles with their main photos, Pahibalo (announcements),
// events, made-up History chapters, and photos for three GKKs. Everything is
// invented for the demo, and the pictures are drawn here (sunset churches, a
// fiesta, chapels, candles), so there's nothing to download and no one's
// photos are used.
//
// `npm run db:seed-website` draws the pictures and writes their SQL to
// supabase/seed/website-sample/ (gitignored), uploads the pictures to the
// demo project's public "downloads" bucket under demo-website/, and inserts
// the rows; running it again replaces them. `npm run db:clean-website` takes
// them all out again (supabase/seed/website-sample-clean.sql), and leaves
// everything else, such as the load test's "[Test]" posts, alone. Both name
// the demo project, never live, and need the Supabase CLI signed in.
//
//   node scripts/sample-website.mjs          only draw the pictures and write the SQL
//   node scripts/sample-website.mjs seed     draw, upload and insert (demo)
//   node scripts/sample-website.mjs clean    take them out of the demo site again
import fs from 'node:fs';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

// The demo project, always named: the CLI may be linked to live.
const DEMO = 'qyoyuukpdjrwfhovtrwd';
const MODE = process.argv[2] || 'write';
const OUT = 'supabase/seed/website-sample';
const PICS = `${OUT}/pictures`;
const CLEAN_SQL = 'supabase/seed/website-sample-clean.sql';
const FOLDER = 'demo-website';
const PUBLIC = `https://${DEMO}.supabase.co/storage/v1/object/public/downloads/${FOLDER}`;

/** `npx supabase <args>` against the demo project. */
function supabase(args, { quiet = false } = {}) {
  execFileSync('npx', ['supabase', ...args, '--project-ref', DEMO, '--linked'], { stdio: quiet ? 'pipe' : 'inherit', shell: true });
}

if (MODE === 'clean') {
  supabase(['db', 'query', '-f', CLEAN_SQL]);
  supabase(['storage', 'rm', '-r', `ss:///downloads/${FOLDER}`, '--experimental', '--yes']);
  console.log('Sample website content taken out of the demo site.');
  process.exit(0);
}

// ---- drawing ------------------------------------------------------------------

const W = 960;
const H = 540;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** A small picture to draw on: filled shapes with soft edges, gradients and glows, saved as a PNG. */
class Picture {
  constructor() { this.px = new Float32Array(W * H * 3); }

  put(x, y, c, a) {
    if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
    const i = (y * W + x) * 3;
    const k = Math.min(1, a);
    this.px[i] += (c[0] - this.px[i]) * k;
    this.px[i + 1] += (c[1] - this.px[i + 1]) * k;
    this.px[i + 2] += (c[2] - this.px[i + 2]) * k;
  }

  /** Top-to-bottom gradient through `stops` ([[0, '#hex'], …, [1, '#hex']]) between y0 and y1. */
  sky(stops, y0 = 0, y1 = H) {
    const s = stops.map(([t, c]) => [t, hex(c)]);
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, y1); y++) {
      const t = (y - y0) / (y1 - y0);
      let j = 0;
      while (j < s.length - 2 && t > s[j + 1][0]) j++;
      const [t0, c0] = s[j];
      const [t1, c1] = s[j + 1];
      const c = mix(c0, c1, Math.min(1, Math.max(0, (t - t0) / (t1 - t0 || 1))));
      for (let x = 0; x < W; x++) this.put(x, y, c, 1);
    }
  }

  /** A filled polygon, four samples a pixel for soft edges. */
  poly(pts, color, alpha = 1) {
    const c = hex(color);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const inside = (x, y) => {
      let on = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) on = !on;
      }
      return on;
    };
    for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(H - 1, Math.ceil(Math.max(...ys))); y++) {
      for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(W - 1, Math.ceil(Math.max(...xs))); x++) {
        const n = inside(x + 0.25, y + 0.25) + inside(x + 0.75, y + 0.25) + inside(x + 0.25, y + 0.75) + inside(x + 0.75, y + 0.75);
        if (n) this.put(x, y, c, (alpha * n) / 4);
      }
    }
  }

  rect(x, y, w, h, color, alpha = 1) { this.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], color, alpha); }

  /** A filled ellipse (a circle when ry is left out). */
  oval(cx, cy, rx, color, alpha = 1, ry = rx) {
    const c = hex(color);
    for (let y = Math.max(0, Math.floor(cy - ry - 1)); y <= Math.min(H - 1, cy + ry + 1); y++) {
      for (let x = Math.max(0, Math.floor(cx - rx - 1)); x <= Math.min(W - 1, cx + rx + 1); x++) {
        const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
        const edge = (1 - d) * Math.min(rx, ry) + 0.5;
        if (edge > 0) this.put(x, y, c, alpha * Math.min(1, edge));
      }
    }
  }

  /** A soft light: strongest in the middle, gone at radius r. */
  glow(cx, cy, r, color, alpha = 0.6) {
    const c = hex(color);
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(H - 1, cy + r); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W - 1, cx + r); x++) {
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d < 1) this.put(x, y, c, alpha * (1 - d) ** 2);
      }
    }
  }

  png() {
    const raw = Buffer.alloc((W * 3 + 1) * H);
    for (let y = 0; y < H; y++) {
      const row = y * (W * 3 + 1);
      raw[row] = 2; // "Up" filter: smooth skies compress well
      for (let x = 0; x < W * 3; x++) {
        const v = Math.round(Math.max(0, Math.min(255, this.px[y * W * 3 + x])));
        const above = y ? Math.round(Math.max(0, Math.min(255, this.px[(y - 1) * W * 3 + x]))) : 0;
        raw[row + 1 + x] = (v - above) & 255;
      }
    }
    const chunk = (type, data) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
      const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
      const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body));
      return Buffer.concat([len, body, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
  }
}

// ---- scene pieces ---------------------------------------------------------------

/** Rolling hills along `base`, `bumps` across, in one colour. */
function hills(p, base, height, bumps, color, phase = 0) {
  const pts = [[0, H]];
  for (let x = 0; x <= W; x += 12) pts.push([x, base - height * (0.5 + 0.5 * Math.sin((x / W) * Math.PI * bumps + phase))]);
  pts.push([W, H]);
  p.poly(pts, color);
}

/** A coconut tree whose top is at (x, top), leaning by `lean`. */
function palm(p, x, ground, top, color, lean = 0.12) {
  const hgt = ground - top;
  const tip = [x + hgt * lean, top];
  p.poly([[x - 7, ground], [x + 7, ground], [tip[0] + 3, top], [tip[0] - 3, top]], color);
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI + (i / 6) * Math.PI + (i % 2 ? 0.15 : -0.1);
    const len = 70 + (i % 3) * 14;
    const end = [tip[0] + Math.cos(a) * len, top + Math.sin(a) * len * 0.45 + len * 0.35];
    const mid = [tip[0] + Math.cos(a) * len * 0.5, top + Math.sin(a) * len * 0.5 - 8];
    p.poly([tip, [mid[0], mid[1] - 7], end, [mid[0], mid[1] + 7]], color);
  }
}

/** A colonial-style church front, centred at cx, standing on `ground`. */
function church(p, cx, ground, scale, wall, trim, door, cross = trim) {
  const s = scale;
  const w = 220 * s;
  const h = 150 * s;
  const left = cx - w / 2;
  p.rect(left, ground - h, w, h, wall);
  p.poly([[left - 12 * s, ground - h], [cx, ground - h - 70 * s], [left + w + 12 * s, ground - h]], trim);
  p.poly([[left + 6 * s, ground - h], [cx, ground - h - 58 * s], [left + w - 6 * s, ground - h]], wall);
  // Bell tower on the left, with its little dome and cross.
  const tw = 62 * s;
  const tx = left - tw + 8 * s;
  p.rect(tx, ground - h - 90 * s, tw, h + 90 * s, wall);
  p.rect(tx - 4 * s, ground - h - 96 * s, tw + 8 * s, 10 * s, trim);
  p.oval(tx + tw / 2, ground - h - 96 * s, tw / 2.4, wall, 1, 30 * s);
  p.rect(tx + tw / 2 - 2 * s, ground - h - 150 * s, 4 * s, 30 * s, cross);
  p.rect(tx + tw / 2 - 11 * s, ground - h - 140 * s, 22 * s, 4 * s, cross);
  p.oval(tx + tw / 2, ground - h - 50 * s, 10 * s, door, 1, 16 * s);
  // Arched door and two windows.
  p.rect(cx - 26 * s, ground - 70 * s, 52 * s, 70 * s, door);
  p.oval(cx, ground - 70 * s, 26 * s, door, 1, 24 * s);
  for (const wx of [left + 40 * s, left + w - 40 * s]) {
    p.rect(wx - 12 * s, ground - 110 * s, 24 * s, 34 * s, door);
    p.oval(wx, ground - 110 * s, 12 * s, door, 1, 12 * s);
  }
  p.oval(cx, ground - h - 26 * s, 13 * s, door);
  // Cross on the gable.
  p.rect(cx - 2.5 * s, ground - h - 104 * s, 5 * s, 36 * s, cross);
  p.rect(cx - 13 * s, ground - h - 94 * s, 26 * s, 5 * s, cross);
}

/** A small GKK chapel: white walls, a pitched roof, a cross. */
function chapel(p, cx, ground, s, wall, roof, door) {
  const w = 170 * s;
  const h = 90 * s;
  p.rect(cx - w / 2, ground - h, w, h, wall);
  p.poly([[cx - w / 2 - 18 * s, ground - h + 4 * s], [cx, ground - h - 70 * s], [cx + w / 2 + 18 * s, ground - h + 4 * s]], roof);
  p.rect(cx - 20 * s, ground - 56 * s, 40 * s, 56 * s, door);
  p.oval(cx, ground - 56 * s, 20 * s, door, 1, 16 * s);
  for (const wx of [cx - w / 2 + 34 * s, cx + w / 2 - 34 * s]) p.rect(wx - 11 * s, ground - 68 * s, 22 * s, 26 * s, door);
  p.rect(cx - 2.5 * s, ground - h - 112 * s, 5 * s, 46 * s, roof);
  p.rect(cx - 14 * s, ground - h - 100 * s, 28 * s, 5 * s, roof);
}

/** A row of people seen from behind, standing on `ground`. */
function crowd(p, ground, color, count, seed, size = 1) {
  for (let i = 0; i < count; i++) {
    const x = ((i + 0.5) / count) * W + Math.sin(i * 12.9 + seed) * 18;
    const s = size * (0.85 + 0.3 * Math.abs(Math.sin(i * 3.1 + seed)));
    p.poly([[x - 26 * s, ground + 4], [x - 20 * s, ground - 52 * s], [x, ground - 62 * s], [x + 20 * s, ground - 52 * s], [x + 26 * s, ground + 4]], color);
    p.oval(x, ground - 76 * s, 15 * s, color);
  }
}

/** A lit candle standing on `base`. */
function candle(p, x, base, h, wax, flame) {
  p.glow(x, base - h - 14, 120, flame, 0.35);
  p.rect(x - 9, base - h, 18, h, wax);
  p.oval(x, base - h - 12, 6, flame, 1, 13);
  p.oval(x, base - h - 9, 3, '#fff8e0', 1, 6);
}

// ---- the scenes -------------------------------------------------------------------

const SCENES = {
  /** The parish church at sunset, with coconut trees. */
  church(v) {
    const p = new Picture();
    p.sky(v.sky);
    p.glow(v.sunX, 300, 260, v.sun, 0.55);
    p.oval(v.sunX, 300, 46, v.sun);
    hills(p, 420, 60, 2.2, v.far, v.phase);
    church(p, v.cx, 470, v.scale, v.wall, v.trim, v.door);
    hills(p, 500, 30, 3, v.near, v.phase + 1);
    p.rect(0, 495, W, H - 495, v.near);
    for (const [x, t] of v.palms) palm(p, x, 500, t, v.near, x > W / 2 ? 0.1 : -0.1);
    return p;
  },
  /** Fiesta night: bunting, lanterns and the crowd. */
  fiesta(v) {
    const p = new Picture();
    p.sky(v.sky);
    church(p, v.cx, 430, 1.1, v.wall, v.trim, v.door);
    for (let line = 0; line < 3; line++) {
      const y0 = 70 + line * 55;
      const colors = v.flags;
      for (let i = 0; i < 24; i++) {
        const x = i * 42;
        const sag = (t) => y0 + Math.sin(t * Math.PI) * 30;
        const ya = sag(x / W);
        const yb = sag((x + 30) / W);
        p.poly([[x, ya], [x + 30, yb], [x + 15, (ya + yb) / 2 + 30]], colors[(i + line) % colors.length], 0.95);
      }
    }
    for (const [x, y] of v.lanterns) { p.glow(x, y, 90, '#ffd27a', 0.5); p.oval(x, y, 14, '#ffcf66'); }
    crowd(p, H + 10, v.crowd, 16, v.seed, 1.2);
    crowd(p, H + 40, v.crowd2, 11, v.seed + 3, 1.6);
    return p;
  },
  /** A GKK chapel among coconut trees on a bright day. */
  chapel(v) {
    const p = new Picture();
    p.sky(v.sky);
    for (const [x, y, r] of v.clouds) { p.oval(x, y, r * 1.6, '#ffffff', 0.85, r); p.oval(x + r, y + 8, r * 1.2, '#ffffff', 0.85, r * 0.8); p.oval(x - r, y + 10, r, '#ffffff', 0.8, r * 0.7); }
    hills(p, 360, 70, 1.6, v.far, v.phase);
    hills(p, 420, 40, 2.6, v.mid, v.phase + 2);
    p.rect(0, 440, W, H - 440, v.ground);
    p.poly([[v.cx - 40, 470], [v.cx + 40, 470], [v.cx + 160, H], [v.cx - 160, H]], v.path);
    chapel(p, v.cx, 470, v.scale, '#fbf6ea', v.roof, '#6b4a2f');
    for (const [x, t] of v.palms) palm(p, x, 480 + (x % 30), t, v.trees, x > v.cx ? 0.08 : -0.08);
    return p;
  },
  /** Candles and an open Bible: prayer, Bible month, All Souls. */
  candles(v) {
    const p = new Picture();
    p.sky(v.sky);
    p.rect(0, 400, W, H - 400, v.table);
    p.poly([[310, 420], [470, 400], [480, 470], [300, 495]], '#f3ead3');
    p.poly([[650, 420], [490, 400], [480, 470], [660, 495]], '#efe3c6');
    for (let i = 0; i < 7; i++) { p.rect(330, 428 + i * 8, 120, 2, '#c9bb98'); p.rect(510, 428 + i * 8, 120, 2, '#c9bb98'); }
    p.rect(470, 390, 20, 110, v.ribbon);
    for (const [x, h] of v.candles) candle(p, x, 410, h, v.wax, v.flame);
    return p;
  },
  /** People gathered under a big tree: GKK meetings, youth, formation. */
  gathering(v) {
    const p = new Picture();
    p.sky(v.sky);
    p.glow(v.sunX, 330, 300, v.sun, 0.5);
    hills(p, 390, 50, 2, v.far, v.phase);
    p.rect(0, 430, W, H - 430, v.ground);
    p.rect(v.treeX - 16, 230, 32, 210, v.trunk);
    for (const [dx, dy, r] of [[0, 0, 120], [-110, 30, 90], [110, 30, 95], [-60, -50, 90], [70, -55, 85], [0, -90, 80]]) p.oval(v.treeX + dx, 210 + dy, r, v.leaves, 1, r * 0.75);
    crowd(p, 470, v.people, 9, v.seed, 0.9);
    crowd(p, 520, v.people2, 7, v.seed + 2, 1.15);
    return p;
  },
};

// Sepia for the old days in the History chapters.
const OLD = { sky: [[0, '#d9c49a'], [1, '#f1e4c4']], far: '#b39a6c', near: '#5e4a31', wall: '#efe2c3', trim: '#8a714c', door: '#5a4630', sun: '#fff1cc' };

const PICTURES = {
  // Blog Articles
  'article-fiesta.png': ['fiesta', { sky: [[0, '#14193a'], [0.6, '#3b2a5c'], [1, '#7a3b52']], cx: 480, wall: '#f4ead2', trim: '#c9a34a', door: '#3b2e22', flags: ['#e6394a', '#f2c230', '#2f7de1', '#ffffff', '#3cb371'], lanterns: [[120, 250], [840, 240], [300, 300], [660, 300]], crowd: '#1b1424', crowd2: '#0d0a12', seed: 1 }],
  'article-chapel.png': ['chapel', { sky: [[0, '#5fa8e8'], [1, '#cfe8fb']], clouds: [[180, 90, 34], [620, 70, 28], [820, 130, 24]], far: '#6aa36f', mid: '#4f8d55', ground: '#7fb46a', path: '#d8c49a', cx: 470, scale: 1.3, roof: '#b9443a', trees: '#2f5d33', phase: 0.4, palms: [[120, 250], [230, 300], [760, 260], [860, 220]] }],
  'article-youth.png': ['gathering', { sky: [[0, '#f6b56b'], [0.55, '#f7d9a0'], [1, '#fbe9c5']], sunX: 760, sun: '#fff1c2', far: '#c9925a', ground: '#8a6a3c', treeX: 300, trunk: '#4a3420', leaves: '#3f6b35', people: '#3a2a1c', people2: '#24190f', seed: 4, phase: 1 }],
  'article-bible.png': ['candles', { sky: [[0, '#1d140c'], [1, '#3a2716']], table: '#5a3a22', ribbon: '#b02e2e', wax: '#f5ecd6', flame: '#ffb84d', candles: [[180, 120], [250, 80], [720, 100], [790, 140]] }],
  'article-history.png': ['church', { ...OLD, cx: 520, scale: 1.25, sunX: 220, phase: 0.6, palms: [[110, 250], [860, 230]] }],
  'article-lectors.png': ['church', { sky: [[0, '#2a3a78'], [0.5, '#c8608a'], [1, '#f6b26b']], sun: '#ffe2a8', far: '#4b3a5e', near: '#1c1a2b', wall: '#f3e7cf', trim: '#d1a64c', door: '#3a2c22', cx: 470, scale: 1.2, sunX: 770, phase: 2, palms: [[90, 260], [190, 310], [850, 250]] }],
  // Events
  'event-fiesta.png': ['fiesta', { sky: [[0, '#0f1630'], [0.7, '#2f3b6e'], [1, '#6a4a7a']], cx: 520, wall: '#f6edd8', trim: '#e0b84f', door: '#2f261c', flags: ['#2f7de1', '#ffffff', '#f2c230', '#e6394a'], lanterns: [[160, 280], [800, 270], [420, 320]], crowd: '#171223', crowd2: '#0b0910', seed: 7 }],
  'event-allsouls.png': ['candles', { sky: [[0, '#0d0b14'], [1, '#2a2033']], table: '#2e2430', ribbon: '#6b4ea0', wax: '#f2eee6', flame: '#ffc35c', candles: [[120, 90], [200, 140], [270, 70], [700, 120], [770, 80], [850, 150]] }],
  'event-recollection.png': ['gathering', { sky: [[0, '#8ec5ea'], [1, '#e6f3fb']], sunX: 180, sun: '#ffffff', far: '#7fae8a', ground: '#9cc27a', treeX: 640, trunk: '#5a4029', leaves: '#2f6a3a', people: '#3d4a5c', people2: '#25303e', seed: 9, phase: 0.3 }],
  'event-novena.png': ['church', { sky: [[0, '#101a3a'], [0.6, '#283c78'], [1, '#5a5aa0']], sun: '#fff7d6', far: '#22284a', near: '#0d1022', wall: '#ece4d2', trim: '#c9a34a', door: '#f5c26b', cx: 500, scale: 1.3, sunX: 820, phase: 1.4, palms: [[110, 270], [850, 250]] }],
  // History chapters
  'history-1958.png': ['chapel', { sky: [[0, '#d8c49b'], [1, '#efe2c2']], clouds: [[220, 80, 30], [700, 100, 26]], far: '#b89f72', mid: '#9c845c', ground: '#a78e63', path: '#d7c6a0', cx: 480, scale: 1.1, roof: '#6e5a3c', trees: '#5a4831', phase: 1.2, palms: [[150, 270], [320, 300], [700, 280], [820, 240]] }],
  'history-1974.png': ['gathering', { sky: [[0, '#d6c094'], [1, '#efe0bd']], sunX: 700, sun: '#fff3d0', far: '#b49a6c', ground: '#9b8158', treeX: 360, trunk: '#5a4630', leaves: '#7a6a45', people: '#4d3d2a', people2: '#3a2d1e', seed: 2, phase: 0.8 }],
  'history-1996.png': ['church', { ...OLD, cx: 470, scale: 1.35, sunX: 760, phase: 1.8, palms: [[100, 250], [210, 300], [840, 240]] }],
  'history-2011.png': ['fiesta', { sky: [[0, '#1a2448'], [0.7, '#3e3c78'], [1, '#8a5a7a']], cx: 480, wall: '#f4ead2', trim: '#c9a34a', door: '#3b2e22', flags: ['#f2c230', '#ffffff', '#3cb371', '#e6394a', '#2f7de1'], lanterns: [[200, 270], [760, 260]], crowd: '#1d1626', crowd2: '#0e0b14', seed: 5 }],
  // GKK main photos
  'gkk-1.png': ['chapel', { sky: [[0, '#4f9be0'], [1, '#d5ecfc']], clouds: [[160, 100, 30], [560, 70, 34]], far: '#5c9a63', mid: '#47864f', ground: '#79ad62', path: '#dccaa0', cx: 520, scale: 1.25, roof: '#2f6db5', trees: '#2b5a30', phase: 2.1, palms: [[110, 240], [250, 290], [800, 250]] }],
  'gkk-2.png': ['chapel', { sky: [[0, '#f0a35e'], [0.6, '#f7cf8f'], [1, '#fbe6bf']], clouds: [[300, 90, 26], [760, 120, 30]], far: '#a8805a', mid: '#7c6a3e', ground: '#8aa45a', path: '#e2cfa3', cx: 440, scale: 1.2, roof: '#a8352e', trees: '#33452a', phase: 0.9, palms: [[140, 260], [700, 240], [840, 290]] }],
  'gkk-3.png': ['chapel', { sky: [[0, '#6fb7e9'], [1, '#e4f4fd']], clouds: [[420, 80, 36], [840, 90, 24]], far: '#6ba778', mid: '#4f9461', ground: '#88bb6d', path: '#d6c39b', cx: 500, scale: 1.35, roof: '#3e8a4f', trees: '#2a5a34', phase: 3.2, palms: [[90, 250], [200, 300], [790, 230], [880, 280]] }],
};

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(PICS, { recursive: true });
for (const [name, [scene, v]] of Object.entries(PICTURES)) fs.writeFileSync(`${PICS}/${name}`, SCENES[scene](v).png());
const pic = (name) => `${PUBLIC}/${name}`;

// ---- the content ----------------------------------------------------------------------

const q = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const day = (n) => `current_date ${n < 0 ? '-' : '+'} ${Math.abs(n)}`;

const ARTICLES = [
  {
    title: 'Malipayong Pagsaulog sa Fiesta ni Birhen sa Guadalupe', tag: 'Parish', heldOn: day(-24), place: 'Simbahan sa Parokya, Mua-an', author: 'Parish Media Ministry', photo: 'article-fiesta.png',
    gallery: [['event-fiesta.png', 'Ang prosesyon human sa Misa'], ['history-2011.png', 'Ang mga banderitas sa plasa']],
    summary: 'Libolibo ka mga parokyano ang mitambong sa Misa, prosesyon ug sayaw sa pasidungog sa atong patrona.',
    body: 'Sayo pa sa kabuntagon napuno na ang simbahan sa mga pamilya gikan sa tanang GKK. Ang Misa Concelebrada gipangulohan sa atong Obispo uban sa mga pari sa bikaryato.\n\nHuman sa Misa, ang imahen sa Birhen sa Guadalupe gisubay sa prosesyon libot sa plasa, inubanan sa mga banda ug sa mga mananayaw gikan sa matag GKK.\n\nDaghang salamat sa tanang boluntaryo, sa mga ministry sa liturhiya ug musika, ug sa mga pamilya nga naghatag og pagkaon alang sa tanan. Hangtod sa sunod tuig!',
  },
  {
    title: 'GKK Birhen sa Fatima: Gibendisyonan ang Bag-ong Kapilya', tag: 'GKK', heldOn: day(-40), place: 'GKK Birhen sa Fatima, Mua-an', author: 'GKK Birhen sa Fatima', photo: 'article-chapel.png',
    summary: 'Human sa duha ka tuig nga pagpanginabuhi ug bayanihan, nahuman na ang bag-ong kapilya sa GKK Birhen sa Fatima.',
    body: 'Ang bag-ong kapilya gitukod pinaagi sa mga hinabang sa mga miyembro sa GKK, sa mga anak nga anaa sa layong dapit, ug sa mga higala sa parokya. Ang mga lalaki sa GKK mihatag sa ilang kusog matag Sabado sulod sa duha ka tuig.\n\nSa bendisyon, gipasalamatan sa among kura paroko ang tanang mitabang ug giawhag ang GKK nga himoon ang kapilya nga balay sa pag-ampo ug panag-ambitay sa Pulong sa Dios.\n\nAng Bible Sharing sa GKK mapadayon na sa kapilya matag Huwebes sa alas 7 sa gabii.',
  },
  {
    title: 'Youth Ministry: Usa ka Adlaw sa Pag-alagad sa Komunidad', tag: 'Ministry', heldOn: day(-12), place: 'Purok 3, Mua-an', author: 'Parish Youth Ministry', photo: 'article-youth.png',
    summary: 'Kapin 60 ka batan-on ang mitabang sa paglimpyo, pagtanom og kahoy ug pagbisita sa mga tigulang.',
    body: 'Gisugdan ang adlaw sa usa ka mubo nga pag-ampo ug pagbasa sa Ebanghelyo. Gibahin dayon ang mga batan-on sa tulo ka grupo: ang usa nanglimpyo sa dalan ug kanal, ang usa nagtanom og 150 ka semilya sa kahoy, ug ang usa mibisita sa mga tigulang ug masakiton sa purok.\n\n"Dinhi namo nakita nga ang pagtuo dili lang sa simbahan kondili sa among mga kamot," matod sa usa ka batan-on.\n\nAng sunod nga outreach sa Youth Ministry himoon sa Disyembre, alang sa mga bata sa GKK.',
  },
  {
    title: 'Bible Month: Ang Pulong sa Dios sa Matag Panimalay', tag: 'Parish', heldOn: day(-35), place: 'Tanang GKK', author: 'Biblical Apostolate', photo: 'article-bible.png',
    summary: 'Sulod sa usa ka bulan, ang matag GKK nagbasa sa tibuok Ebanghelyo ni San Marcos.',
    body: 'Ang Biblical Apostolate naghatag og giya sa pagbasa alang sa matag adlaw. Ang mga pamilya nagtigom matag gabii aron mobasa, mamalandong ug mag-ampo sa usag usa.\n\nSa katapusan sa bulan, ang tanang GKK nagtigom sa simbahan alang sa Bible Enthronement ug usa ka mubo nga quiz bee sa mga bata.\n\nPadayon kitang mobasa sa Pulong sa Dios sa atong mga panimalay, dili lang sa Bible Month.',
  },
  {
    title: 'Ang Unang Kapilya sa Mua-an: Mga Handumanan sa mga Tigulang', tag: 'History', heldOn: day(-60), place: 'Mua-an', author: 'Parish Archives', photo: 'article-history.png',
    summary: 'Gisaysay sa mga tigulang sa parokya kung giunsa pagsugod ang komunidad sa usa ka gamay nga kapilya nga kawayan.',
    body: 'Sa wala pa ang simbahan nga atong makita karon, ang mga Katoliko sa Mua-an nagtigom sa usa ka gamay nga kapilya nga kawayan ug nipa. Usa ka pari ang moabot kausa sa usa ka bulan gikan sa lungsod, nagsakay og kabayo.\n\n"Gabii pa kami molakaw aron makaabot sa Misa sa buntag," handum ni Lola Ising, 84 anyos.\n\nKini nga mga istorya among gitigom alang sa History sa parokya. Kung aduna kay mga litrato o istorya, palihug duol sa opisina.',
  },
  {
    title: 'Formation Seminar alang sa mga Lector ug Commentator', tag: 'Ministry', heldOn: day(-5), place: 'Parish Hall', author: 'Ministry of Lectors and Commentators', photo: 'article-lectors.png',
    summary: '35 ka lector ug commentator gikan sa 12 ka GKK ang mitambong sa usa ka adlaw nga formation.',
    body: 'Gitudlo sa seminar ang kahulogan sa Liturhiya sa Pulong, ang husto nga pagbasa ug paglitok, ug ang pagpangandam sa matag Domingo.\n\nAng mga partisipante nagpraktis sa pagbasa atubangan sa grupo ug nakadawat og tambag gikan sa ilang mga kauban.\n\nAng mga bag-ong lector magsugod na sa ilang pag-alagad sa unang Domingo sa Adbiyento.',
  },
];

const ANNOUNCEMENTS = [
  { title: 'Iskedyul sa mga Misa sa Adlaw sa mga Santos ug Kalag-kalag', category: 'Schedule change', pinned: true, urgent: false, publishOn: day(-2), expiresOn: "date '2026-11-03'", body: 'Nobyembre 1 (Adlaw sa mga Santos): Misa sa 6:00 ug 8:00 sa buntag sa simbahan.\nNobyembre 2 (Kalag-kalag): Misa sa 6:00 sa buntag sa simbahan, ug sa 4:00 sa hapon sa sementeryo publiko.\n\nAng mga pangalan sa atong mga minahal nga namatay mahimong ihatag sa opisina hangtod Oktubre 31.' },
  { title: 'Rosaryo sa Oktubre sa Matag GKK', category: 'Parish', pinned: false, urgent: false, publishOn: day(-10), expiresOn: "date '2026-10-31'", body: 'Matag gabii sa Oktubre, alas 7, ang imahen sa Birhen moduaw sa usa ka panimalay sa matag GKK alang sa Santo Rosaryo. Pangutan-a ang inyong GKK coordinator sa iskedyul.' },
  { title: 'Pagpalista sa Bunyag alang sa Disyembre', category: 'Parish', pinned: false, urgent: false, publishOn: day(-4), expiresOn: day(30), body: 'Ang Bunyag sa Disyembre himoon sa Disyembre 5 ug 19. Ipalista ang bata sa opisina dili mosobra sa Nobyembre 28. Dad-a ang birth certificate sa bata ug ang kopya sa kasal sa ginikanan (kung naa). Ang mga ninong ug ninang kinahanglan motambong sa pre-baptismal seminar.' },
  { title: 'Panawagan: Mga Boluntaryo alang sa Simbang Gabi', category: 'Ministry', pinned: false, urgent: false, publishOn: day(-1), expiresOn: day(45), body: 'Nanginahanglan kami og mga usher, choir member ug mga motabang sa pagpangandam sa simbahan alang sa Simbang Gabi (Disyembre 16 hangtod 24). Ipalista ang inyong ngalan sa Parish Pastoral Council o sa opisina.' },
  { title: 'GKK Assembly sa Ikaduhang Domingo sa Nobyembre', category: 'GKK', pinned: false, urgent: false, publishOn: day(-3), expiresOn: day(35), body: 'Tanang GKK coordinator ug mga opisyal gidapit sa GKK Assembly human sa Misa sa alas 8. Hisgutan ang plano alang sa Adbiyento, ang census sa sunod tuig ug ang Fiesta ni Birhen sa Guadalupe.' },
  { title: 'Walay Misa sa Kapilya sa Lumot karong Sabado', category: 'Schedule change', pinned: false, urgent: true, publishOn: day(0), expiresOn: day(5), body: 'Tungod sa pag-ayo sa atop sa kapilya, walay Misa sa GKK Lumot karong Sabado. Ang mga parokyano gidapit sa Misa sa simbahan sa alas 5 sa hapon.' },
];

const EVENTS = [
  { title: 'Pastoral Council Meeting', type: 'Meeting', start: day(6), end: null, startTime: '14:00', endTime: '16:00', location: 'Parish Hall', gkk: null, organizer: 'Parish Pastoral Council', description: 'Buwanang miting sa PPC: report sa matag ministry ug plano alang sa Adbiyento.', photo: null },
  { title: 'Seminar sa Pagpangandam sa Kasal', type: 'Seminar', start: day(11), end: null, startTime: '08:00', endTime: '12:00', location: 'Parish Hall', gkk: null, organizer: 'Family and Life Ministry', description: 'Alang sa mga magtiayon nga magpakasal sa simbahan sa sunod tulo ka bulan. Ipalista sa opisina.', photo: null },
  { title: 'Kalag-kalag: Misa sa Sementeryo', type: 'Other', start: "date '2026-11-02'", end: null, startTime: '16:00', endTime: '17:30', location: 'Sementeryo Publiko, Mua-an', gkk: null, organizer: 'Parokya', description: 'Misa alang sa tanang kalag sa atong mga minahal nga namatay, inubanan sa bendisyon sa mga lubnganan.', photo: 'event-allsouls.png' },
  { title: 'Advent Recollection alang sa mga Ministry', type: 'Recollection / Retreat', start: "date '2026-11-28'", end: null, startTime: '08:00', endTime: '15:00', location: 'Parish Hall', gkk: null, organizer: 'Parish Pastoral Council', description: 'Usa ka adlaw sa pag-ampo ug pamalandong alang sa tanang miyembro sa mga ministry ug organisasyon, sa dili pa ang Adbiyento.', photo: 'event-recollection.png' },
  { title: 'Nobena alang sa Birhen sa Guadalupe', type: 'Novena', start: "date '2026-12-03'", end: "date '2026-12-11'", startTime: '17:30', endTime: '18:30', location: 'Simbahan sa Parokya', gkk: null, organizer: 'Parokya', description: 'Siyam ka gabii sa nobena ug Misa, ang matag gabii gipangulohan sa usa ka GKK.', photo: 'event-novena.png' },
  { title: 'Fiesta ni Birhen sa Guadalupe', type: 'Fiesta', start: "date '2026-12-12'", end: null, startTime: '08:00', endTime: '12:00', location: 'Simbahan sa Parokya ug Plasa', gkk: null, organizer: 'Parokya', description: 'Misa Concelebrada, prosesyon libot sa plasa ug salo-salo sa tanang GKK.', photo: 'event-fiesta.png' },
  { title: 'Simbang Gabi', type: 'Other', start: "date '2026-12-16'", end: "date '2026-12-24'", startTime: '04:00', endTime: '05:00', location: 'Simbahan sa Parokya', gkk: null, organizer: 'Parokya', description: 'Siyam ka kaadlawon nga Misa sa pagpangandam sa Pasko.', photo: null },
];

const HISTORY = [
  { year: 1958, dateLabel: null, title: 'Ang Unang Kapilya nga Kawayan', author: 'Parish Archives', photo: 'history-1958.png', body: 'Ang mga unang Katoliko nga nanimuyo sa Mua-an nagtukod og usa ka gamay nga kapilya nga kawayan ug nipa duol sa suba. Usa ka pari gikan sa lungsod ang moabot kausa sa usa ka bulan aron magmisa ug magbunyag.\n\nAng kapilya nahimong tigumanan sa komunidad: dinhi gihimo ang mga nobena, ang katesismo sa mga bata ug ang mga tigum sa barangay.' },
  { year: 1974, dateLabel: '1974–1980', title: 'Ang Pagsugod sa mga GKK', author: 'Parish Archives', photo: 'history-1974.png', body: 'Uban sa pagdasig sa Diyosesis, ang mga purok giorganisa ngadto sa mga Gagmayng Kristohanong Katilingban (GKK). Ang matag GKK adunay kaugalingong coordinator ug Bible Sharing matag semana.\n\nSa 1980, napulo na ka GKK ang aktibo, ug ang matag usa nagsugod sa pagtukod sa kaugalingong kapilya.' },
  { year: 1996, dateLabel: null, title: 'Ang Bag-ong Simbahan nga Konkreto', author: 'Parish Archives', photo: 'history-1996.png', body: 'Human sa lima ka tuig nga pagpanginabuhi, gibendisyonan ang bag-ong simbahan nga konkreto nga adunay kampanaryo. Ang kampana gihatag sa usa ka pamilya isip pasalamat sa ilang anak nga naayo sa sakit.\n\nAng karaang kapilya nga kawayan gihimong kapilya sa GKK nga duol sa suba.' },
  { year: 2011, dateLabel: null, title: 'Nahimong Quasi-Parish', author: 'Parish Archives', photo: 'history-2011.png', body: 'Gideklarar sa Obispo ang Our Lady of Guadalupe isip quasi-parish, nga adunay kaugalingong kura paroko ug parish office. Ang unang Fiesta isip quasi-parish gisaulog uban sa tanang GKK sa Disyembre 12.\n\nKaron, ang parokya adunay kapin 16 ka GKK ug daghang ministry ug organisasyon.' },
];

// The History page's opening text, put in only while the main article still
// holds placeholder Lorem ipsum (never over real writing; clean leaves it).
const HISTORY_INTRO = 'Ang Our Lady of Guadalupe Quasi-Parish sa Mua-an nagsugod isip usa ka gamay nga komunidad sa mga mag-uuma nga nagtigom aron mag-ampo sa usa ka kapilya nga kawayan. Sulod sa kapin unom ka dekada, mitubo kini ngadto sa usa ka parokya nga adunay kapin 16 ka Gagmayng Kristohanong Katilingban (GKK), daghang ministry ug organisasyon, ug usa ka simbahan nga gitukod sa hinabang sa tanan.\n\nAng among kasaysayan mao ang kasaysayan sa mga pamilya: ang mga apohan nga naglakaw sa kagabhion aron makaabot sa Misa, ang mga GKK nga nagtukod sa ilang kapilya pinaagi sa bayanihan, ug ang mga batan-on nga karon nagpadayon sa pag-alagad.\n\nBasaha ang mga kapitulo sa among panaw, gikan sa unang kapilya hangtod karon.';

// The first three GKKs (by id) get a main photo.
const GKK_PHOTOS = ['gkk-1.png', 'gkk-2.png', 'gkk-3.png'];

// Each sample row by its title and its own text together, so a real post that
// happens to share a title (a "Pastoral Council Meeting") is never taken out.
const pairs = (rows, text) => rows.map((r) => `(${q(r.title)}, ${q(r[text])})`).join(', ');
const clean = `-- Takes the sample website content (scripts/sample-website.mjs) out of the
-- DEMO site again. Generated; run with: npm run db:clean-website
delete from articles where (title, summary) in (${pairs(ARTICLES, 'summary')});
delete from announcements where (title, body) in (${pairs(ANNOUNCEMENTS, 'body')});
delete from events where (title, description) in (${pairs(EVENTS, 'description')});
delete from history_articles where not is_main and (title, body) in (${pairs(HISTORY, 'body')});
update gkks set photo_url = null where photo_url like '%/${FOLDER}/%';
`;

const seed = `-- Sample website content for the DEMO site (scripts/sample-website.mjs).
-- Generated; run with: npm run db:seed-website
begin;
${clean.split('\n').filter((l) => !l.startsWith('--')).join('\n')}
insert into articles (title, tag, held_on, place, summary, body, photo_url, photos, author, published) values
${ARTICLES.map((a) => `  (${q(a.title)}, ${q(a.tag)}, ${a.heldOn}, ${q(a.place)}, ${q(a.summary)}, ${q(a.body)}, ${q(pic(a.photo))}, ${q(JSON.stringify((a.gallery || []).map(([f, caption]) => ({ url: pic(f), caption }))))}::jsonb, ${q(a.author)}, true)`).join(',\n')};

insert into announcements (title, body, category, urgent, pinned, publish_on, expires_on, published) values
${ANNOUNCEMENTS.map((a) => `  (${q(a.title)}, ${q(a.body)}, ${q(a.category)}, ${a.urgent}, ${a.pinned}, ${a.publishOn}, ${a.expiresOn}, true)`).join(',\n')};

insert into events (title, type, start_date, end_date, start_time, end_time, location, gkk, organizer, description, photo_url, published) values
${EVENTS.map((e) => `  (${q(e.title)}, ${q(e.type)}, ${e.start}, ${e.end || 'null'}, ${q(e.startTime)}, ${q(e.endTime)}, ${q(e.location)}, ${q(e.gkk)}, ${q(e.organizer)}, ${q(e.description)}, ${e.photo ? q(pic(e.photo)) : 'null'}, true)`).join(',\n')};

insert into history_articles (is_main, title, year, date_label, author, body, photo_url, published) values
${HISTORY.map((h) => `  (false, ${q(h.title)}, ${h.year}, ${q(h.dateLabel)}, ${q(h.author)}, ${q(h.body)}, ${q(pic(h.photo))}, true)`).join(',\n')};

update history_articles set body = ${q(HISTORY_INTRO)}, updated_at = now() where is_main and body like 'Lorem ipsum%';

${GKK_PHOTOS.map((f, i) => `update gkks set photo_url = ${q(pic(f))} where id = (select id from gkks order by id offset ${i} limit 1);`).join('\n')}
commit;
`;

fs.writeFileSync(CLEAN_SQL, clean);
fs.writeFileSync(`${OUT}/seed.sql`, seed);
console.log(`Drew ${Object.keys(PICTURES).length} pictures in ${PICS} and wrote ${OUT}/seed.sql.`);

if (MODE === 'seed') {
  try { supabase(['storage', 'rm', '-r', `ss:///downloads/${FOLDER}`, '--experimental', '--yes'], { quiet: true }); } catch { /* none yet */ }
  for (const name of Object.keys(PICTURES)) {
    supabase(['storage', 'cp', `${PICS}/${name}`, `ss:///downloads/${FOLDER}/${name}`, '--content-type', 'image/png', '--experimental'], { quiet: true });
  }
  console.log(`Uploaded the pictures to the demo project's downloads bucket (${FOLDER}/).`);
  supabase(['db', 'query', '-f', `${OUT}/seed.sql`]);
  console.log('Sample website content is on the demo site.');
}
