import { Application, Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import { ATLAS_CELL, Pyramid, pickLevel } from "./assets";
import { ICON_KINDS, ICON_SIZE, Scene, View, visibleBuckets } from "./scene";
import type { Renderer } from "./renderer";

// Pixi v8 on WebGL2: tiles as sprites, icons as sprites from one atlas texture (batched),
// ducts as one Graphics per 256pt bucket. Same bucket culling as the Konva variant.
export async function createPixi(el: HTMLDivElement, scene: Scene, pyr: Pyramid, atlas: OffscreenCanvas): Promise<Renderer> {
  const w = el.clientWidth, h = el.clientHeight;
  const app = new Application();
  await app.init({
    width: w, height: h, antialias: true, background: "#ffffff",
    resolution: window.devicePixelRatio, autoDensity: true, autoStart: false, preference: "webgl",
  });
  el.appendChild(app.canvas);
  app.stage.eventMode = "none";

  const world = new Container();
  app.stage.addChild(world);

  const levelGroups = pyr.levels.map((tiles) => {
    const c = new Container({ visible: false });
    for (const t of tiles) {
      const s = new Sprite(Texture.from(t.bmp));
      s.position.set(t.x, t.y);
      s.scale.set(1 / t.level);
      c.addChild(s);
    }
    world.addChild(c);
    return c;
  });

  const atlasTex = Texture.from(await createImageBitmap(atlas));
  const iconTex = Array.from({ length: ICON_KINDS }, (_, k) =>
    new Texture({ source: atlasTex.source, frame: new Rectangle(k * ATLAS_CELL, 0, ATLAS_CELL, ATLAS_CELL) }));

  const groups = scene.buckets.map((b) => {
    const c = new Container({ visible: false });
    const g = new Graphics();
    for (const d of b.ducts) {
      g.moveTo(d.pts[0], d.pts[1]);
      for (let i = 2; i < d.pts.length; i += 2) g.lineTo(d.pts[i], d.pts[i + 1]);
      g.stroke({ width: d.width, color: d.color, cap: "butt", join: "miter" });
    }
    c.addChild(g);
    for (const ic of b.icons) {
      const s = new Sprite(iconTex[ic.kind]);
      s.anchor.set(0.5);
      s.position.set(ic.x, ic.y);
      s.width = ICON_SIZE;
      s.height = ICON_SIZE;
      s.angle = ic.rot;
      c.addChild(s);
    }
    world.addChild(c);
    return c;
  });

  let level = -1;
  let visible = 0;
  return {
    name: "pixi",
    setView(v: View) {
      world.position.set(v.x, v.y);
      world.scale.set(v.scale);
      const lv = pickLevel(v.scale, window.devicePixelRatio);
      if (lv !== level) {
        if (level >= 0) levelGroups[level].visible = false;
        levelGroups[lv].visible = true;
        level = lv;
      }
      const vis = visibleBuckets(scene, v, w, h);
      visible = 0;
      vis.forEach((on, i) => {
        groups[i].visible = on;
        if (on) visible += scene.buckets[i].icons.length + scene.buckets[i].ducts.length;
      });
    },
    render() { app.render(); },
    visibleItems: () => visible,
    destroy() { app.destroy(true); },
  };
}
