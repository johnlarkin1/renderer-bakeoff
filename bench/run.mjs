// Runs each renderer x scene size x CPU throttle in a fresh Chrome page and writes results/.
// Usage: node bench/run.mjs [--headed] [--icons 5000,20000,50000] [--throttle 1,4] [--reps 3]
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i === -1 ? d : process.argv[i + 1];
};
const headed = process.argv.includes("--headed");
const iconSets = arg("icons", "5000,20000,50000").split(",").map(Number);
const throttles = arg("throttle", "1,4").split(",").map(Number);
const reps = Number(arg("reps", "3"));
const renderers = arg("renderers", "konva,pixi").split(",");
const PORT = 4173;

const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));

const browser = await chromium.launch({
  channel: "chrome",
  headless: !headed,
  args: ["--enable-gpu", "--ignore-gpu-blocklist"],
});

const runs = [];
try {
  for (const icons of iconSets)
    for (const throttle of throttles)
      for (const r of renderers)
        for (let rep = 0; rep < reps; rep++) {
          const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
          const page = await ctx.newPage();
          const cdp = await ctx.newCDPSession(page);
          await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
          await page.goto(`http://localhost:${PORT}/?r=${r}&icons=${icons}&run=1`);
          const res = await page.waitForFunction(() => window.__result, null, { timeout: 300_000 }).then((h) => h.jsonValue());
          await ctx.close();
          runs.push({ ...res, throttle, rep });
          const z = res.segments?.zoom ?? {};
          console.log(`${r.padEnd(5)} icons=${icons} cpu×${throttle} rep${rep}  zoom frameP95=${z.frameP95} cpuP95=${z.cpuP95}  gl=${res.gl}`);
        }
} finally {
  await browser.close();
  server.kill();
}

mkdirSync("results", { recursive: true });
writeFileSync("results/results.raw.json", JSON.stringify(runs, null, 1));

// Median across reps of each metric, per renderer x icons x throttle x segment.
const med = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const rows = [];
for (const icons of iconSets)
  for (const throttle of throttles)
    for (const r of renderers) {
      const rs = runs.filter((x) => x.renderer === r && x.icons === icons && x.throttle === throttle && x.segments);
      if (!rs.length) continue;
      for (const seg of Object.keys(rs[0].segments)) {
        const m = (k) => med(rs.map((x) => x.segments[seg][k]));
        rows.push({ renderer: r, icons, ducts: rs[0].ducts, throttle, segment: seg,
          frameP50: m("frameP50"), frameP95: m("frameP95"), frameP99: m("frameP99"), over16: m("over16"),
          cpuP50: m("cpuP50"), cpuP95: m("cpuP95"), visible: m("visibleP50"),
          buildMs: med(rs.map((x) => x.buildMs)), heapMB: med(rs.map((x) => x.heapMB)) });
      }
    }
writeFileSync("results/results.json", JSON.stringify({ gl: runs[0]?.gl, headed, reps, rows }, null, 1));

const md = ["| renderer | icons / ducts | CPU throttle | segment | frame p50 | frame p95 | frame p99 | % frames > 21 ms | render CPU p50 | render CPU p95 | visible items | build ms | heap MB |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map((x) => `| ${x.renderer} | ${x.icons} / ${x.ducts} | ${x.throttle}× | ${x.segment} | ${x.frameP50} | ${x.frameP95} | ${x.frameP99} | ${x.over16} | ${x.cpuP50} | ${x.cpuP95} | ${x.visible} | ${x.buildMs} | ${x.heapMB} |`)];
writeFileSync("results/results.md", `GPU: ${runs[0]?.gl}\n\n${md.join("\n")}\n`);
console.log(`\nwrote results/results.md (${rows.length} rows)`);
