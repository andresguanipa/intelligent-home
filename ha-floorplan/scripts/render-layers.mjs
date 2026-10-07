#!/usr/bin/env node
// =============================================================================
//  render-layers.mjs · genera los PNG del dashboard desde el modelo three.js
//  Uso:  node scripts/render-layers.mjs            (requiere: npm i -g playwright)
//  Salida: config/www/floorplan/casa_base.png + <habitación>_on.png  (1920×1200)
//  Variables: CHROMIUM_PATH=/ruta/a/chromium  (si Playwright no lo encuentra)
// =============================================================================
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WWW = join(ROOT, "config/www");
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright"))); }

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png" };
const server = createServer(async (req, res) => {
  try {
    const p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
    const body = await readFile(join(WWW, p.replace(/^\/local\//, "/")));
    res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream" }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1200 } });
page.on("pageerror", (e) => console.error("página:", e.message));
await page.goto(`http://localhost:${port}/casa3d/index.html?render=1`);
await page.waitForFunction(() => window.casa3d?.ready, null, { timeout: 30000 });

const save = (name, dataUrl) =>
  writeFile(join(WWW, "floorplan", name), Buffer.from(dataUrl.split(",")[1], "base64"));

await save("casa_base.png", await page.evaluate(() => window.casa3d.renderBase()));
console.log("✔ casa_base.png");
for (const id of await page.evaluate(() => window.casa3d.rooms)) {
  await save(`${id}_on.png`, await page.evaluate((r) => window.casa3d.renderLayer(r), id));
  const { top, left } = await page.evaluate((r) => window.casa3d.project(r), id);
  console.log(`✔ ${id}_on.png   → icono: top: ${top}%  left: ${left}%`);
}
await browser.close();
server.close();
