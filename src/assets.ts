import { ICON_KINDS, SHEET_H, SHEET_W, rng } from "./scene";

export const TILE = 512;
export const LEVELS = [0.5, 1, 2]; // tile pyramid scales (device px per page pt)

export interface Tile { level: number; x: number; y: number; bmp: ImageBitmap } // x, y in page pts
export interface Pyramid { levels: Tile[][] }

// Stands in for a rasterized PDF sheet: drafting grid, room outlines, text-like strokes.
function drawSheet(ctx: OffscreenCanvasRenderingContext2D, s: number, seed: number) {
  const r = rng(seed + 7);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, SHEET_W * s, SHEET_H * s);
  ctx.scale(s, s);
  ctx.strokeStyle = "#e6e6e6";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let x = 0; x <= SHEET_W; x += 36) { ctx.moveTo(x, 0); ctx.lineTo(x, SHEET_H); }
  for (let y = 0; y <= SHEET_H; y += 36) { ctx.moveTo(0, y); ctx.lineTo(SHEET_W, y); }
  ctx.stroke();
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 160; i++) ctx.strokeRect(r() * SHEET_W, r() * SHEET_H, 60 + r() * 300, 60 + r() * 220);
  ctx.strokeStyle = "#888";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let i = 0; i < 4000; i++) {
    const x = r() * SHEET_W, y = r() * SHEET_H;
    ctx.moveTo(x, y);
    ctx.lineTo(x + 4 + r() * 30, y);
  }
  ctx.stroke();
}

export async function makePyramid(seed = 1): Promise<Pyramid> {
  const levels: Tile[][] = [];
  for (const s of LEVELS) {
    const w = Math.ceil(SHEET_W * s), h = Math.ceil(SHEET_H * s);
    const cv = new OffscreenCanvas(w, h);
    drawSheet(cv.getContext("2d")!, s, seed);
    const tiles: Tile[] = [];
    for (let ty = 0; ty < h; ty += TILE)
      for (let tx = 0; tx < w; tx += TILE) {
        const bmp = await createImageBitmap(cv, tx, ty, Math.min(TILE, w - tx), Math.min(TILE, h - ty));
        tiles.push({ level: s, x: tx / s, y: ty / s, bmp });
      }
    levels.push(tiles);
  }
  return { levels };
}

// Smallest level that covers the current device-pixel density, capped at the top level.
export function pickLevel(scale: number, dpr: number): number {
  const need = scale * dpr;
  const i = LEVELS.findIndex((l) => l >= need);
  return i === -1 ? LEVELS.length - 1 : i;
}

export const ATLAS_CELL = 64;

// One row of icon symbols; renderers draw them at ICON_SIZE page pts.
export function makeAtlas(): OffscreenCanvas {
  const cv = new OffscreenCanvas(ATLAS_CELL * ICON_KINDS, ATLAS_CELL);
  const ctx = cv.getContext("2d")!;
  const colors = ["#e45756", "#4c78a8", "#54a24b", "#f58518", "#b279a2", "#72b7b2", "#9d755d", "#000"];
  for (let k = 0; k < ICON_KINDS; k++) {
    const cx = k * ATLAS_CELL + 32, cy = 32;
    ctx.strokeStyle = colors[k];
    ctx.fillStyle = colors[k] + "55";
    ctx.lineWidth = 5;
    ctx.beginPath();
    if (k % 4 === 0) ctx.arc(cx, cy, 24, 0, Math.PI * 2);
    else if (k % 4 === 1) ctx.rect(cx - 24, cy - 24, 48, 48);
    else if (k % 4 === 2) { ctx.moveTo(cx, cy - 26); ctx.lineTo(cx + 26, cy + 22); ctx.lineTo(cx - 26, cy + 22); ctx.closePath(); }
    else { ctx.moveTo(cx, cy - 26); ctx.lineTo(cx + 26, cy); ctx.lineTo(cx, cy + 26); ctx.lineTo(cx - 26, cy); ctx.closePath(); }
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy); ctx.lineTo(cx + 12, cy);
    if (k >= 4) { ctx.moveTo(cx, cy - 12); ctx.lineTo(cx, cy + 12); }
    ctx.stroke();
  }
  return cv;
}
