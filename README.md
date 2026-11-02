# renderer-bakeoff

Konva 9 vs Pixi v8 for a takeoff-style sheet viewer: a PDF tile pyramid with thousands of icons and duct runs on top. It answers one question for the next-gen web app RFC: does Pixi hold the pan/zoom frame budget on a p99 document where Konva does not?

All data is synthetic. No customer drawings belong in this repo.

## What is compared

Both variants draw the same scene from the same seed and use the same culling, so the renderer is the only difference.

| | Konva 9 | Pixi v8 (WebGL2) |
| --- | --- | --- |
| Sheet | `Konva.Image` per 512 px tile, one group per pyramid level | `Sprite` per tile, one container per level |
| Icons | `Konva.Image` cropped from one atlas | `Sprite` from one atlas texture (batched) |
| Ducts | `Konva.Line` per run | one `Graphics` per 256 pt bucket |
| Culling | 256 pt buckets, group hidden when off screen | same buckets, container hidden |
| Settings | `listening: false`, `perfectDrawEnabled: false` | `eventMode = "none"`, manual `app.render()` |

The scene is an ARCH D sheet (2592 × 1728 pt) with a drafting grid, 160 rooms and 4,000 text-like strokes rasterized at 0.5×, 1× and 2×. Icons cluster in rooms; ducts are orthogonal runs of 1 to 3 legs, one per four icons.

## Camera path

Each run renders 60 warm-up frames, then 600 measured frames:

1. `fit`: the whole sheet with a small jitter. Nothing is culled, so this is the worst case.
2. `zoom`: zoom from fit to 4× while drifting.
3. `pan3x`: pan across the sheet at 3×.

## Metrics

- **frame p50/p95/p99**: time between `requestAnimationFrame` callbacks. With vsync at 60 Hz, 16.7 ms means the budget was met.
- **% frames > 21 ms**: frames that missed vsync by more than 25%.
- **render CPU**: time inside the synchronous draw call (`stage.draw()` / `app.render()`). For Pixi this excludes GPU execution, which shows up in the frame interval instead.
- **build ms**: time to create the renderer and draw the first frame.

## Results (2026-11-01, Apple M5 Pro)

Frame p95 in ms over the whole camera path's worst segment (16.7 = 60 fps held). Medians of 3 runs; the full table is in [results/results.md](results/results.md).

| icons / ducts | Konva, CPU 1× | Pixi, CPU 1× | Konva, CPU 4× | Pixi, CPU 4× |
| --- | --- | --- | --- | --- |
| 5,000 / 1,250 | 16.8 | 16.8 | 83 | 16.8 |
| 20,000 / 5,000 | 83 | 16.8 | 400 | 16.8 |
| 50,000 / 12,500 | 217 | 16.8 | did not finish in 180 s | 16.8 (p99 33) |

- Pixi held 60 fps in every configuration. Its render CPU per frame stayed at 1–10 ms (p95 up to 26 ms at 50k with 4× throttling), so it has headroom for tools and hit testing.
- Konva only holds 60 fps at 5k icons on a fast CPU. At 20k it misses on the fast machine; with 4× throttling it drops to 2–4 fps. At 50k with 4× throttling it could not finish the 660-frame path.
- Konva's frame time is about twice its measured CPU time, so the Canvas 2D raster cost sits outside the draw call.
- Pixi builds the scene faster (134 ms vs 469 ms at 20k) and uses less heap (46 MB vs 83 MB at 20k).

### Without a GPU (`--software`)

SwiftShader WebGL for Pixi, CPU-raster Canvas 2D for Konva, as in a VDI session. Zoom segment, median of 3 runs ([results/software.md](results/software.md)).

| icons / ducts | Konva frame p50 / p95 | Pixi frame p50 / p95 |
| --- | --- | --- |
| 5,000 / 1,250 | 33 / 67 | 83 / 100 |
| 20,000 / 5,000 | 83 / 167 | 150 / 167 |
| 50,000 / 12,500 | 317 / 433 | 250 / 300 (one run did not finish in 180 s) |

Neither is usable without a GPU past 5k icons. Konva is about 2.5× faster at 5k; the two converge at 20k; Pixi is slightly ahead at 50k but less stable.

## Running

```bash
npm install
npm run dev                    # interactive: ?r=konva|pixi&icons=20000&frame=330
npm run bench                  # full matrix, writes results/results.md
node bench/run.mjs --icons 20000 --throttle 1 --reps 1   # quick run
node bench/shots.mjs           # parity screenshots in results/
```

The bench uses installed Chrome in new headless mode, which runs on the real GPU (it reports `ANGLE Metal Renderer` on Apple silicon, not SwiftShader). Viewport 1440 × 900 at DPR 2. `--throttle 4` applies CDP CPU throttling to approximate a slower laptop CPU; it does not slow the GPU.

## Caveats

- One machine so far (Apple M5 Pro). The RFC budget is set for a reference laptop with an integrated GPU, so the next step is a run on a typical estimator machine.
- Rendering only. Hit testing, selection and editing are not measured here; in the RFC they are renderer-independent.
- Tiles are pre-generated, so tile decode and upload during zoom are not measured.
- Every off-screen tile in the active level is still submitted (both variants), which slightly favors neither.
