// Screenshots both renderers at three camera positions for a visual parity check.
import { spawn } from "node:child_process";
import { chromium } from "playwright";
const server = spawn("npx", ["vite", "preview", "--port", "4173", "--strictPort"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ channel: "chrome", args: ["--enable-gpu", "--ignore-gpu-blocklist"] });
try {
  for (const r of ["konva", "pixi"]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    for (const [name, frame] of [["fit", 0], ["zoom", 330], ["pan3x", 500]]) {
      await page.goto(`http://localhost:4173/?r=${r}&icons=20000&frame=${frame}`);
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `results/shot-${r}-${name}.png` });
    }
    await ctx.close();
  }
} finally { await browser.close(); server.kill(); }
