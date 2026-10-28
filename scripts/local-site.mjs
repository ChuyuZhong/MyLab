import { createReadStream } from "node:fs";
import { readdir, readFile, stat, writeFile, rename } from "node:fs/promises";
import { join, resolve, sep, extname } from "node:path";

// Serves the built site from the bridge's own origin and hands the page the newest
// settings file from the project folder, so a local start needs no manual pairing.
const root = resolve(import.meta.dirname, "..");
const site = resolve(root, process.env.MYLAB_SITE_DIR || "dist");
const configDir = resolve(root, process.env.MYLAB_CONFIG_DIR || ".");
const CONFIG_PATTERN = /^MyLab-settings-v\d+-[\w-]+\.json$/;
const BACKUP_PATTERN = /^MyLab-backup-[\w-]+\.json$/;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
};
const API = /^\/(health|gpu(\/.*)?|rsdl|feed|article|x|local\/.*)$/;
export const isApiPath = (path) => API.test(path);

export async function serveStatic(req, res, path) {
  let decoded;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const file = resolve(site, "." + (decoded.endsWith("/") ? decoded + "index.html" : decoded));
  if (file !== site && !file.startsWith(site + sep)) {
    res.writeHead(403).end();
    return;
  }
  let info;
  try {
    info = await stat(file);
    if (!info.isFile()) throw Error();
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  const immutable = decoded.startsWith("/assets/");
  res.writeHead(200, {
    "Content-Type": types[extname(file).toLowerCase()] || "application/octet-stream",
    "Content-Length": info.size,
    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  if (req.method === "HEAD") res.end();
  else createReadStream(file).pipe(res);
}

async function newest(pattern) {
  const names = (await readdir(configDir).catch(() => [])).filter((n) => pattern.test(n));
  const files = await Promise.all(
    names.map(async (name) => ({ name, mtime: (await stat(join(configDir, name))).mtimeMs })),
  );
  // Newest modification wins; the dated name breaks ties between copies made together.
  files.sort((a, b) => b.mtime - a.mtime || b.name.localeCompare(a.name));
  return files[0];
}

export async function latestConfig() {
  const file = await newest(CONFIG_PATTERN);
  if (!file) return null;
  const text = await readFile(join(configDir, file.name), "utf8");
  return { name: file.name, modifiedAt: new Date(file.mtime).toISOString(), text };
}

export async function latestBackup() {
  const file = await newest(BACKUP_PATTERN);
  if (!file) return null;
  if ((await stat(join(configDir, file.name))).size > 15_000_000) throw Error("备份文件超过 15 MB");
  return { name: file.name, text: await readFile(join(configDir, file.name), "utf8") };
}

export async function saveConfig(text) {
  if (typeof text !== "string" || text.length > 2_000_000) throw Error("配置内容无效或超过 2 MB");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw Error("配置内容不是有效 JSON");
  }
  if (parsed?.format !== "mylab-settings" || !Number.isInteger(parsed.schemaVersion))
    throw Error("只能保存 MyLab 配置文件");
  const now = new Date();
  const day = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((n) => String(n).padStart(2, "0"))
    .join("-");
  const name = `MyLab-settings-v${parsed.schemaVersion}-${day}.json`;
  const target = join(configDir, name);
  await writeFile(target + ".tmp", text, "utf8");
  await rename(target + ".tmp", target);
  return { name };
}

export async function siteBuilt() {
  try {
    return (await stat(join(site, "index.html"))).isFile();
  } catch {
    return false;
  }
}
