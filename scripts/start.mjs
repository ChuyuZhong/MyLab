import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

// One-command local start: rebuild when sources changed, then serve site + bridge on one origin.
const root = resolve(import.meta.dirname, "..");
process.chdir(root);
try {
  process.loadEnvFile(join(root, ".env.local"));
} catch {}
const args = new Set(process.argv.slice(2));
const port = Number(process.env.MYLAB_BRIDGE_PORT || 4318);
const url = `http://127.0.0.1:${port}/`;

async function newestSource(path) {
  let info;
  try {
    info = await stat(path);
  } catch {
    return 0;
  }
  if (!info.isDirectory()) return info.mtimeMs;
  const entries = await readdir(path);
  return Math.max(info.mtimeMs, ...(await Promise.all(entries.map((e) => newestSource(join(path, e))))));
}

async function needsBuild() {
  if (args.has("--build")) return true;
  const built = join(root, "dist", "index.html");
  if (!existsSync(built)) return true;
  const sources = ["src", "public", "index.html", "vite.config.ts", "package.json"];
  const newest = Math.max(...(await Promise.all(sources.map((s) => newestSource(join(root, s))))));
  return newest > (await stat(built)).mtimeMs;
}

async function probe() {
  try {
    const r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(1500) });
    return r.ok ? "mylab" : "other";
  } catch {
    return "free";
  }
}

function openBrowser() {
  if (args.has("--no-open")) return;
  const command =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  spawn(command[0], command[1], { detached: true, stdio: "ignore" }).unref();
}

const state = await probe();
if (state === "mylab") {
  console.log(`MyLab 已在运行：${url}`);
  openBrowser();
  process.exit(0);
}
if (state === "other") {
  console.error(
    `端口 ${port} 已被其他程序占用（可能是旧的 npm run bridge）。请关闭它，或在 .env.local 设置 MYLAB_BRIDGE_PORT。`,
  );
  process.exit(1);
}
if (await needsBuild()) {
  console.log("检测到界面有更新，正在构建…");
  const vite = join(root, "node_modules", "vite", "bin", "vite.js");
  const result = spawnSync(process.execPath, [vite, "build", "--logLevel", "error"], { stdio: "inherit" });
  if (result.status !== 0) {
    console.error("构建失败，请查看上方错误信息。");
    process.exit(1);
  }
}
process.env.MYLAB_SERVE_SITE = "1";
await import("./bridge.mjs");
for (let i = 0; i < 40; i++) {
  if ((await probe()) === "mylab") {
    openBrowser();
    break;
  }
  await new Promise((r) => setTimeout(r, 250));
}
