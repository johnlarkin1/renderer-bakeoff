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
