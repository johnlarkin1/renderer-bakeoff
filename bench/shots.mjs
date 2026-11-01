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
    await page.goto(`http://localhost:4173/?r=${r}&icons=20000`);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `results/shot-${r}-fit.png` });
    for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -300), await page.waitForTimeout(50);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `results/shot-${r}-zoom.png` });
    await ctx.close();
  }
} finally { await browser.close(); server.kill(); }
