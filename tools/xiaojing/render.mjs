// Rebuilds 小鲸's art from the sources in tools/xiaojing (sheet.webp with the five drawn moods, plus
// the original pout and rage pictures):
//   npm run xiaojing:frames
// Uses headless Microsoft Edge (or MYLAB_BROWSER) for canvas work; replaces src/assets/xiaojing/*.webp
// and writes src/xiaojing-layout.json (where every layer sits and how the sprite sheets are cut).
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const types = { ".html": "text/html", ".js": "text/javascript", ".webp": "image/webp" };
const server = http.createServer((req, res) => {
  const file = resolve(root, "." + decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!file.startsWith(root + sep)) return res.writeHead(403).end();
  let body;
  try {
    body = readFileSync(file);
  } catch {
    return res.writeHead(404).end();
  }
  res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" }).end(body);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = process.env.MYLAB_BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const profile = mkdtempSync(join(tmpdir(), "xiaojing-rig-"));
const debugPort = 9300 + Math.floor(Math.random() * 400);
const proc = spawn(browser, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let page;
for (let i = 0; i < 60 && !page; i++) {
  try { page = (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find((t) => t.type === "page"); } catch {}
  if (!page) await sleep(250);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); pending.get(m.id)?.(m); pending.delete(m.id); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Page.navigate", { url: `${base}/tools/xiaojing/rig.html` });
await sleep(2500);
try {
  const r = await send("Runtime.evaluate", { expression: "window.build()", awaitPromise: true, returnByValue: true });
  const v = r.result?.result?.value;
  if (!v?.files) throw Error(JSON.stringify(r).slice(0, 800));
  const out = join(root, "src/assets/xiaojing");
  mkdirSync(out, { recursive: true });
  for (const old of readdirSync(out)) if (old.endsWith(".webp")) rmSync(join(out, old));
  for (const [name, url] of Object.entries(v.files)) {
    const bytes = Buffer.from(url.split(",")[1], "base64");
    writeFileSync(join(out, name), bytes);
    console.log(`${name.padEnd(34)} ${(bytes.length / 1024).toFixed(0).padStart(5)} KB`);
  }
  writeFileSync(join(root, "src/xiaojing-layout.json"), JSON.stringify(v.layout, null, 2) + String.fromCharCode(10));
  console.log("xiaojing-layout.json");
} finally {
  ws.close();
  proc.kill();
  server.close();
  setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} }, 1500);
}
