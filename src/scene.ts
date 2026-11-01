// Synthetic takeoff sheet. Page units are PDF points (36" x 24" ARCH D sheet).
export const SHEET_W = 2592;
export const SHEET_H = 1728;
export const BUCKET = 256;
export const ICON_KINDS = 8;
export const ICON_SIZE = 14;

export interface Icon { x: number; y: number; kind: number; rot: number }
export interface Duct { pts: number[]; width: number; color: number }
export interface Bucket { icons: Icon[]; ducts: Duct[] }

export interface Scene {
  icons: Icon[];
  ducts: Duct[];
  cols: number;
  rows: number;
  buckets: Bucket[];
}

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DUCT_COLORS = [0x1f77b4, 0xd62728, 0x2ca02c, 0x9467bd];

// Icons cluster around rooms, like diffusers in a ceiling grid; ducts are orthogonal runs.
export function makeScene(nIcons: number, nDucts: number, seed = 1): Scene {
  const r = rng(seed);
  const rooms = Array.from({ length: 120 }, () => {
    const w = 80 + r() * 260, h = 80 + r() * 200;
    return { x: r() * (SHEET_W - w), y: r() * (SHEET_H - h), w, h };
  });

  const icons: Icon[] = [];
  for (let i = 0; i < nIcons; i++) {
    const room = rooms[Math.floor(r() * rooms.length)];
    icons.push({
      x: room.x + r() * room.w,
      y: room.y + r() * room.h,
      kind: Math.floor(r() * ICON_KINDS),
      rot: Math.floor(r() * 4) * 90,
    });
  }

  const ducts: Duct[] = [];
  for (let i = 0; i < nDucts; i++) {
    let x = r() * SHEET_W, y = r() * SHEET_H;
    const pts = [x, y];
    const legs = 1 + Math.floor(r() * 3);
    for (let k = 0; k < legs; k++) {
      const len = 20 + r() * 120;
      if (k % 2 === 0) x = clamp(x + (r() < 0.5 ? -len : len), 0, SHEET_W);
      else y = clamp(y + (r() < 0.5 ? -len : len), 0, SHEET_H);
      pts.push(x, y);
    }
    ducts.push({ pts, width: 1 + r() * 5, color: DUCT_COLORS[i % DUCT_COLORS.length] });
  }

  const cols = Math.ceil(SHEET_W / BUCKET), rows = Math.ceil(SHEET_H / BUCKET);
  const buckets: Bucket[] = Array.from({ length: cols * rows }, () => ({ icons: [], ducts: [] }));
  const idx = (x: number, y: number) =>
    Math.min(rows - 1, Math.floor(y / BUCKET)) * cols + Math.min(cols - 1, Math.floor(x / BUCKET));
  for (const ic of icons) buckets[idx(ic.x, ic.y)].icons.push(ic);
  for (const d of ducts) buckets[idx(d.pts[0], d.pts[1])].ducts.push(d);
  return { icons, ducts, cols, rows, buckets };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export interface View { x: number; y: number; scale: number } // screen = page * scale + (x, y)

// Buckets whose page rect intersects the viewport (padded so ducts starting in a bucket but crossing its edge still draw).
export function visibleBuckets(s: Scene, v: View, w: number, h: number): boolean[] {
  const pad = 400;
  const x0 = (-v.x) / v.scale - pad, y0 = (-v.y) / v.scale - pad;
  const x1 = (w - v.x) / v.scale + pad, y1 = (h - v.y) / v.scale + pad;
  const out = new Array<boolean>(s.cols * s.rows);
  for (let r = 0; r < s.rows; r++)
    for (let c = 0; c < s.cols; c++) {
      const bx = c * BUCKET, by = r * BUCKET;
      out[r * s.cols + c] = bx < x1 && bx + BUCKET > x0 && by < y1 && by + BUCKET > y0;
    }
  return out;
}
