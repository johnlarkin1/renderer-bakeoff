import Konva from "konva";
import { ATLAS_CELL, Pyramid, pickLevel } from "./assets";
import { ICON_SIZE, Scene, View, visibleBuckets } from "./scene";
import type { Renderer } from "./renderer";

// Konva 9 with viewport culling: one Group per 256pt bucket, hidden when off screen.
// Nodes are non-listening with perfect-draw off, the usual Konva large-scene settings.
export async function createKonva(el: HTMLDivElement, scene: Scene, pyr: Pyramid, atlas: OffscreenCanvas): Promise<Renderer> {
  const w = el.clientWidth, h = el.clientHeight;
  const stage = new Konva.Stage({ container: el, width: w, height: h, listening: false });
  const tileLayer = new Konva.Layer({ listening: false });
  const markLayer = new Konva.Layer({ listening: false });
  stage.add(tileLayer, markLayer);

  const levelGroups = pyr.levels.map((tiles) => {
    const g = new Konva.Group({ visible: false });
    for (const t of tiles)
      g.add(new Konva.Image({
        image: t.bmp as unknown as CanvasImageSource, x: t.x, y: t.y,
        width: t.bmp.width / t.level, height: t.bmp.height / t.level,
        listening: false, perfectDrawEnabled: false,
      }));
    tileLayer.add(g);
    return g;
  });

  const atlasImg = atlas as unknown as CanvasImageSource;
  const half = ICON_SIZE / 2;
  const groups = scene.buckets.map((b) => {
    const g = new Konva.Group({ visible: false });
    for (const d of b.ducts)
      g.add(new Konva.Line({
        points: d.pts, stroke: "#" + d.color.toString(16).padStart(6, "0"), strokeWidth: d.width,
        lineCap: "butt", lineJoin: "miter", listening: false, perfectDrawEnabled: false, shadowForStrokeEnabled: false,
      }));
    for (const ic of b.icons)
      g.add(new Konva.Image({
        image: atlasImg, x: ic.x, y: ic.y, width: ICON_SIZE, height: ICON_SIZE, offsetX: half, offsetY: half,
        rotation: ic.rot, crop: { x: ic.kind * ATLAS_CELL, y: 0, width: ATLAS_CELL, height: ATLAS_CELL },
        listening: false, perfectDrawEnabled: false,
      }));
    markLayer.add(g);
    return g;
  });

  let level = -1;
  let visible = 0;
  return {
    name: "konva",
    setView(v: View) {
      stage.position({ x: v.x, y: v.y });
      stage.scale({ x: v.scale, y: v.scale });
      const lv = pickLevel(v.scale, window.devicePixelRatio);
      if (lv !== level) {
        if (level >= 0) levelGroups[level].visible(false);
        levelGroups[lv].visible(true);
        level = lv;
      }
      const vis = visibleBuckets(scene, v, w, h);
      visible = 0;
      vis.forEach((on, i) => {
        if (groups[i].visible() !== on) groups[i].visible(on);
        if (on) visible += scene.buckets[i].icons.length + scene.buckets[i].ducts.length;
      });
    },
    render() { stage.draw(); },
    visibleItems: () => visible,
    destroy() { stage.destroy(); },
  };
}
