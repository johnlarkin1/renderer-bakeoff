import { makeAtlas, makePyramid } from "./assets";
import { createKonva } from "./konvaRenderer";
import { createPixi } from "./pixiRenderer";
import type { Renderer } from "./renderer";
import { SHEET_H, SHEET_W, View, makeScene } from "./scene";

const q = new URLSearchParams(location.search);
const which = q.get("r") ?? "pixi";
const nIcons = Number(q.get("icons") ?? 20000);
const nDucts = Number(q.get("ducts") ?? Math.round(nIcons / 4));
const seed = Number(q.get("seed") ?? 1);
const auto = q.has("run");

const el = document.getElementById("stage") as HTMLDivElement;
const hud = document.getElementById("hud")!;

function glInfo(): string {
  const gl = document.createElement("canvas").getContext("webgl2");
  if (!gl) return "no webgl2";
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
}

function quantile(xs: number[], p: number) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

// Deterministic camera path: sheet fit with jitter, zoom in to 4x, then pan at 3x.
const SEGMENTS = [
  { name: "fit", frames: 200 },
  { name: "zoom", frames: 200 },
  { name: "pan3x", frames: 200 },
];

function viewAt(frame: number, w: number, h: number): View {
  const fit = Math.min(w / SHEET_W, h / SHEET_H) * 0.95;
  const center = (cx: number, cy: number, s: number): View => ({ x: w / 2 - cx * s, y: h / 2 - cy * s, scale: s });
  if (frame < 200) return center(SHEET_W / 2 + 60 * Math.sin(frame / 15), SHEET_H / 2 + 40 * Math.cos(frame / 15), fit);
  if (frame < 400) {
    const t = (frame - 200) / 199;
    const s = fit * Math.pow(4 / fit, t);
    return center(SHEET_W * (0.5 - 0.2 * t), SHEET_H * (0.5 - 0.2 * t), s);
  }
  const t = (frame - 400) / 199;
  return center(SHEET_W * (0.15 + 0.7 * t), SHEET_H * (0.35 + 0.3 * Math.sin(t * Math.PI)), 3);
}

async function main() {
  const t0 = performance.now();
  const scene = makeScene(nIcons, nDucts, seed);
  const [pyr, atlas] = [await makePyramid(seed), makeAtlas()];
  const t1 = performance.now();
  const r: Renderer = which === "konva" ? await createKonva(el, scene, pyr, atlas) : await createPixi(el, scene, pyr, atlas);
  const w = el.clientWidth, h = el.clientHeight;
  r.setView(viewAt(0, w, h));
  r.render();
  const t2 = performance.now();
  const base = { renderer: r.name, icons: nIcons, ducts: nDucts, dpr: devicePixelRatio, viewport: [w, h], gl: glInfo(),
    assetsMs: Math.round(t1 - t0), buildMs: Math.round(t2 - t1) };

  if (!auto) return interactive(r, w, h, base);

  const total = SEGMENTS.reduce((a, s) => a + s.frames, 0);
  const warmup = 60;
  const cpu: number[] = [], frame: number[] = [], items: number[] = [];
  let i = -warmup, last = 0;
  await new Promise<void>((done) => {
    const tick = (now: number) => {
      if (i >= 0 && last) frame.push(now - last);
      last = now;
      if (i >= total) return done();
      r.setView(viewAt(Math.max(0, i), w, h));
      const a = performance.now();
      r.render();
      if (i >= 0) { cpu.push(performance.now() - a); items.push(r.visibleItems()); }
      i++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  let off = 0;
  const segments: Record<string, unknown> = {};
  for (const s of SEGMENTS) {
    const c = cpu.slice(off, off + s.frames), f = frame.slice(off, off + s.frames);
    segments[s.name] = {
      cpuP50: +quantile(c, 0.5).toFixed(2), cpuP95: +quantile(c, 0.95).toFixed(2),
      frameP50: +quantile(f, 0.5).toFixed(2), frameP95: +quantile(f, 0.95).toFixed(2), frameP99: +quantile(f, 0.99).toFixed(2),
      over16: +(100 * f.filter((x) => x > 16.7 * 1.25).length / f.length).toFixed(1),
      visibleP50: quantile(items.slice(off, off + s.frames), 0.5),
    };
    off += s.frames;
  }
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  const result = { ...base, heapMB: mem ? Math.round(mem.usedJSHeapSize / 2 ** 20) : null, segments };
  hud.textContent = JSON.stringify(result, null, 1);
  (window as unknown as { __result: unknown }).__result = result;
}

function interactive(r: Renderer, w: number, h: number, base: object) {
  let v = viewAt(Number(q.get("frame") ?? 0), w, h);
  let drag: { x: number; y: number } | null = null;
  el.addEventListener("pointerdown", (e) => (drag = { x: e.clientX, y: e.clientY }));
  addEventListener("pointerup", () => (drag = null));
  addEventListener("pointermove", (e) => {
    if (!drag) return;
    v = { ...v, x: v.x + e.clientX - drag.x, y: v.y + e.clientY - drag.y };
    drag = { x: e.clientX, y: e.clientY };
  });
  el.addEventListener("wheel", (e) => {
    e.preventDefault();
    const k = Math.exp(-e.deltaY * 0.0015);
    v = { scale: v.scale * k, x: e.clientX - (e.clientX - v.x) * k, y: e.clientY - (e.clientY - v.y) * k };
  }, { passive: false });
  const times: number[] = [];
  let last = 0;
  const tick = (now: number) => {
    if (last) times.push(now - last);
    if (times.length > 60) times.shift();
    last = now;
    r.setView(v);
    r.render();
    const avg = times.reduce((a, b) => a + b, 0) / Math.max(1, times.length);
    hud.textContent = `${JSON.stringify(base)}\nfps ${(1000 / avg).toFixed(0)}  scale ${v.scale.toFixed(2)}  visible ${r.visibleItems()}`;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

main().catch((e) => {
  hud.textContent = String(e?.stack ?? e);
  (window as unknown as { __result: unknown }).__result = { error: String(e) };
});
