import {templates,poolAvailability,submit,readJob,killTask,assertOwner,safeTask,taskMonitor} from './gpu-control.mjs';
import http from "node:http";
import https from "node:https";
import dns from "node:dns/promises";
import { isIP } from "node:net";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { collectRSDL } from "./public-data.mjs";
import { wechatArticleUrl, extractWechatArticle } from "./article-reader.mjs";
import { createXNetwork } from "./x-network.mjs";
import { allowedLocalFeed } from "./local-feed.mjs";
const xNetwork = createXNetwork(process.env.MYLAB_PROXY_URL || "");
const localFeedOrigins = new Set(
  (process.env.MYLAB_LOCAL_FEED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
// The bridge is deliberately loopback-only. No passwords or API tokens are written to disk.
const port = Number(process.env.MYLAB_BRIDGE_PORT || 4318);
const pairing = randomBytes(24).toString("base64url");
const origins = new Set([
  "https://chuyuzhong.github.io",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  ...(process.env.MYLAB_ALLOWED_ORIGINS || "").split(",").filter(Boolean),
]);
let gpuUsername = "";
let gpuBase = "",
  gpuToken = "";
const timeout = () => AbortSignal.timeout(20000);
function json(res, status, obj) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(obj));
}
async function body(req) {
  let data = "";
  for await (const part of req) {
    data += part;
    if (data.length > 1_000_000) throw Error("请求内容过大");
  }
  try {
    return JSON.parse(data || "{}");
  } catch {
    throw Error("请求不是有效 JSON");
  }
}
function validBase(s) {
  const u = new URL(s);
  if (
    !["https:", "http:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    u.pathname !== "/" ||
    u.search ||
    u.hash
  )
    throw Error("请填写系统根地址，不包含 /det 路径");
  return u.origin;
}
async function login(base, username, password) {
  const target = validBase(base);
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    !username ||
    !password
  )
    throw Error("请填写用户名与密码");
  const r = await fetch(target + "/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password: createHash("sha512")
        .update("GubPEmmotfiK9TMD6Zdw" + password)
        .digest("hex"),
      isHashed: true,
    }),
    signal: timeout(),
    redirect: "error",
  });
  if (!r.ok) throw Error(`实验室登录返回 HTTP ${r.status}，请检查账号或网络`);
  const a = await r.json();
  if (typeof a.token !== "string" || !a.token)
    throw Error("实验室未返回有效会话");
  gpuBase = target;
  gpuToken = a.token;
  gpuUsername = username;
  return { connected: true };
}
async function gpuGet(path) {
  if (!gpuToken) throw Error("尚未登录实验室，请点击“连接 / 登录”");
  const r = await fetch(gpuBase + path, {
    headers: { Authorization: "Bearer " + gpuToken },
    signal: timeout(),
    redirect: "error",
  });
  if (r.status === 401) {
    gpuToken = "";
    throw Error("实验室会话已过期，请重新登录");
  }
  if (!r.ok) throw Error(`资源接口返回 HTTP ${r.status}`);
  return r.json();
}
function privateIP(ip) {
  if (ip.includes(":"))
    return /^(::|fc|fd|fe8|fe9|fea|feb)/i.test(ip) || ip.includes("::ffff:");
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}
// Resolve and pin a public address, including on redirects, so an RSS URL cannot query the lab or local services.
async function publicText(value, depth = 0, articleOnly = false) {
  if (depth > 3) throw Error("订阅重定向过多");
  const u = new URL(value);
  if (articleOnly) {
    try {
      wechatArticleUrl(value);
    } catch (e) {
      if (depth)
        throw Error(
          "微信将请求转到了验证页或非正文页面。请打开原文完成阅读后粘贴正文，或使用全文 RSS。",
        );
      throw e;
    }
  }
  if (!articleOnly && allowedLocalFeed(value, localFeedOrigins)) {
    const r = await fetch(u, { signal: timeout(), redirect: "error" });
    if (!r.ok) throw Error(`本机 RSS 返回 HTTP ${r.status}`);
    let text = "",
      bytes = 0;
    const decoder = new TextDecoder();
    for await (const part of r.body) {
      bytes += part.byteLength;
      if (bytes > 3_000_000) throw Error("订阅内容超过 3 MB");
      text += decoder.decode(part, { stream: true });
    }
    return text + decoder.decode();
  }
  if (u.protocol !== "https:" || u.username || u.password)
    throw Error("代理订阅仅接受不含凭据的 HTTPS 地址");
  const addresses = await dns.lookup(u.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => privateIP(a.address)))
    throw Error("订阅代理不能访问私有网络地址");
  const chosen = addresses[0];
  return new Promise((resolve, reject) => {
    const r = https.get(
      u,
      {
        headers: {
          "User-Agent": articleOnly ? "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.34(0x16082222) NetType/WIFI Language/zh_CN" : "MyLab-Personal-Reader/0.1",
          Accept:
            articleOnly ? "text/html" : "application/rss+xml, application/atom+xml, application/json, text/xml",
        },
        lookup: (_h, opts, cb) =>
          opts.all
            ? cb(null, [chosen])
            : cb(null, chosen.address, chosen.family),
      },
      async (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          try {
            resolve(
              await publicText(
                new URL(res.headers.location, u).href,
                depth + 1,
                articleOnly,
              ),
            );
          } catch (e) {
            reject(e);
          }
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(Error(`订阅源返回 HTTP ${res.statusCode}`));
          return;
        }
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (s) => {
          data += s;
          if (data.length > (articleOnly ? 8_000_000 : 3_000_000)) {
            r.destroy();
            reject(Error("返回内容超过读取大小限制"));
          }
        });
        res.on("end", () => resolve(data));
        res.on("error", reject);
      },
    );
    r.setTimeout(20000, () => r.destroy(Error("订阅请求超时")));
    r.on("error", reject);
  });
}
async function xPosts(handle, key) {
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle || "")) throw Error("X 用户名无效");
  if (!key)
    throw Error(
      "完整 X 时间线需要个人 X API Bearer Token，或为此订阅设置 RSS 地址",
    );
  const get = async (path) => {
    const r = await xNetwork.fetch("https://api.x.com/2/" + path, {
      headers: { Authorization: "Bearer " + key },
      signal: timeout(),
      redirect: "error",
    });
    if (!r.ok)
      throw Error(`X API 返回 HTTP ${r.status}，请检查 Token、额度与权限`);
    return r.json();
  };
  const u = await get("users/by/username/" + handle);
  if (!u.data?.id) throw Error("未找到此 X 账号");
  const j = await get(
    `users/${u.data.id}/tweets?max_results=10&tweet.fields=created_at,note_tweet&exclude=retweets`,
  );
  if (j.errors?.length && !j.data) throw Error("X API 没有返回可用内容");
  return {
    items: (j.data || []).map((t) => ({
      id: "x:" + t.id,
      sourceId: "",
      kind: "x",
      title: t.text.slice(0, 85),
      content: t.note_tweet?.text || t.text,
      url: `https://x.com/${handle}/status/${t.id}`,
      publishedAt: t.created_at || "",
      author: u.data.name || handle,
      read: false,
      saved: false,
      contentScope: "full",
      provenance: "X 官方 API",
    })),
  };
}
const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (!["127.0.0.1:" + port, "localhost:" + port].includes(req.headers.host)) {
    json(res, 403, { error: "Host not allowed" });
    return;
  }
  if (origin && !origins.has(origin)) {
    json(res, 403, { error: "Origin not allowed" });
    return;
  }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const supplied = Buffer.from(
    (req.headers.authorization || "").replace(/^Bearer /, ""),
  );
  const expected = Buffer.from(pairing);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    json(res, 401, { error: "配对码不正确或服务已重启，请在设置中重新填写" });
    return;
  }
  try {
    const path = new URL(req.url, "http://127.0.0.1").pathname;
    if (path === "/health" && req.method === "GET") {
      json(res, 200, {
        ok: true,
        gpuConnected: Boolean(gpuToken),
        version: "0.1.0",
        xProxy: xNetwork.proxy || "直连",
        articleReader: true,
      });
      return;
    }
    if (path === "/gpu/login" && req.method === "POST") {
      const q = await body(req);
      json(res, 200, await login(q.base, q.username, q.password));
      return;
    }
    if(path==="/gpu/options" && req.method==="GET"){
      const a=await gpuGet('/api/v1/agents');json(res,200,{pools:Object.entries(templates).map(([pool,file])=>({pool,file,available:poolAvailability(a.agents||[],pool)}))});return;
    }
    if(path==="/gpu/submit" && req.method==="POST"){const q=await body(req);json(res,200,await submit(q,{base:gpuBase,token:gpuToken,username:gpuUsername},async()=>(await gpuGet('/api/v1/agents')).agents||[]));return;}
    if(path==="/gpu/job" && req.method==="POST"){const q=await body(req);json(res,200,await readJob(q.key,gpuUsername));return;}
    if(path==="/gpu/tasks" && req.method==="GET"){
      const r=await gpuGet('/api/v1/shells?users='+encodeURIComponent(gpuUsername));json(res,200,{tasks:(r.shells||[]).filter(s=>s.username===gpuUsername).map(safeTask)});return;
    }
    if(path==="/gpu/kill" && req.method==="POST"){
      const q=await body(req);json(res,200,await killTask(q.taskId,{base:gpuBase,token:gpuToken,username:gpuUsername},async id=>(await gpuGet('/api/v1/shells/'+encodeURIComponent(id))).shell));return;
    }
    if(path==="/gpu/task-monitor" && req.method==="POST"){
      const q=await body(req);if(typeof q.taskId!=='string')throw Error('任务 ID 无效');
      const r=await gpuGet('/api/v1/shells/'+encodeURIComponent(q.taskId));assertOwner(r.shell,gpuUsername);json(res,200,await taskMonitor(q.taskId));return;
    }
    if (path === "/gpu" && req.method === "GET") {
      const [a, p, m] = await Promise.all([
        gpuGet("/api/v1/agents"),
        gpuGet("/api/v1/resource-pools"),
        gpuGet("/api/v1/master"),
      ]);
      json(res, 200, {
        fetchedAt: new Date().toISOString(),
        version: m.version,
        agents: (a.agents || []).map((a) => ({
          id: a.id,
          name: a.id,
          resourcePool: (a.resourcePools || []).join(", "),
          enabled: a.enabled && !a.draining,
          slots: Object.values(a.slots || {})
            .filter((s) => s.device?.type !== "TYPE_CPU")
            .map((s) => ({
              id: s.id,
              uuid: s.device?.uuid,
              device: s.device?.brand || "未知 GPU",
              memory: null,
              enabled: s.enabled && !s.draining,
              state: s.container?.state || "UNALLOCATED",
              allocated: Boolean(s.container),
            })),
        })),
        pools: (p.resourcePools || []).map((p) => ({
          name: p.name,
          total: p.slotsAvailable,
          used: p.slotsUsed,
        })),
      });
      return;
    }
    if (path === "/rsdl" && req.method === "GET") {
      json(res, 200, await collectRSDL());
      return;
    }
    if (path === "/feed" && req.method === "POST") {
      const q = await body(req);
      json(res, 200, { text: await publicText(q.url) });
      return;
    }
    if (path === "/article" && req.method === "POST") {
      const q = await body(req);
      const url = wechatArticleUrl(q.url);
      json(res, 200, {
        ...extractWechatArticle(await publicText(url, 0, true)),
        url,
      });
      return;
    }
    if (path === "/x" && req.method === "POST") {
      const q = await body(req);
      json(res, 200, await xPosts(q.handle, q.key));
      return;
    }
    json(res, 404, { error: "此接口未提供。" });
  } catch (e) {
    json(res, 400, { error: e.message || "连接请求失败" });
  }
});
if (
  process.env.GPU_BASE_URL &&
  process.env.GPU_USER &&
  process.env.GPU_PASSWORD
) {
  try {
    await login(
      process.env.GPU_BASE_URL,
      process.env.GPU_USER,
      process.env.GPU_PASSWORD,
    );
    console.log("GPU session connected in memory.");
  } catch (e) {
    console.log("GPU login failed: " + e.message);
  }
  delete process.env.GPU_PASSWORD;
  delete process.env.GPU_USER;
}
server.listen(port, "127.0.0.1", () => {
  console.log(`MyLab local bridge: http://127.0.0.1:${port}`);
  console.log(`Pairing code (memory only): ${pairing}`);
  console.log(
    "Paste this pairing code into Settings. Closing this process discards all sessions.",
  );
});
server.on("error", (e) => {
  console.error("Bridge failed: " + e.message);
  process.exitCode = 1;
});
