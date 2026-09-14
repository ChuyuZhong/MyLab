import type { Article, Settings, Secrets, Source, FeedResult } from "./types";
import { safeUrl } from "./core";
import { fetchRSDL } from "./rsdl-client";
const fullPostCache = new Map<string, string>();
async function completeXPosts(items: Article[], signal?: AbortSignal) {
  for (const a of items) {
    if (!/(?:…|\.\.\.)\s*$/.test(a.content)) continue;
    a.contentScope = "excerpt";
    const id = a.url.match(/\/status\/(\d+)/)?.[1];
    if (!id) continue;
    try {
      let text = fullPostCache.get(id);
      if (!text) {
        const response = await fetch(`https://api.fxtwitter.com/status/${id}`, {signal: signal ? AbortSignal.any([signal,AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000)});
        if (!response.ok) throw Error("全文接口暂不可用");
        const json = await response.json();
        if (json.code !== 200 || typeof json.tweet?.text !== "string") throw Error("全文缺失");
        text = json.tweet.text;
        if (json.tweet.quote?.text) text += `\n\n引用 @${json.tweet.quote.author?.screen_name || ""}：\n${json.tweet.quote.text}`;
        fullPostCache.set(id,text!);
        if (fullPostCache.size > 100) fullPostCache.delete(fullPostCache.keys().next().value!);
      }
      a.content = text!; a.contentScope = "full";
    } catch { if (signal?.aborted) throw Error("已取消"); a.provenance += " · 全文补充失败，请查看原帖"; }
  }
  return items;
}
export async function bridgeRequest(
  settings: Settings,
  secrets: Secrets,
  path: string,
  body?: object,
  signal?: AbortSignal,
) {
  const base = safeUrl(settings.bridgeUrl);
  if (!base) throw Error("请在设置中填写有效的本机连接服务地址");
  if (!secrets.bridgeKey) throw Error("请先在设置中填写连接服务显示的配对码");
  let res: Response;
  try {
    res = await fetch(base.replace(/\/$/, "") + path, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secrets.bridgeKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
        : AbortSignal.timeout(30000),
      redirect: "error",
    });
  } catch {
    throw Error(
      "无法连接本机服务。请启动 npm run bridge，并确认浏览器允许访问本地网络。",
    );
  }
  const json = await res.json();
  if (!res.ok) throw Error(json.error || `连接服务返回 ${res.status}`);
  return json;
}
export async function callAI(
  settings: Settings,
  key: string,
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
  options?: { maxTokens?: number },
) {
  if (!key)
    throw Error("请先在设置中填写个人模型 API Key。密钥仅在本次打开期间使用。");
  const base = safeUrl(settings.aiBase);
  if (!base) throw Error("模型接口必须使用 HTTPS，或本机地址");
  const url = base.replace(/\/$/, "");
  let r: Response;
  try {
    r = await fetch(
      url.endsWith("/chat/completions") ? url : url + "/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: settings.aiModel,
          messages,
          stream: false,
          max_tokens: options?.maxTokens ?? 4096,
        }),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(90000)])
          : AbortSignal.timeout(90000),
        redirect: "error",
      },
    );
  } catch (e) {
    if (signal?.aborted) throw Error("已停止生成");
    throw Error("模型请求未完成，请检查接口地址、网络或跨域设置。");
  }
  if (!r.ok)
    throw Error(
      `模型服务返回 HTTP ${r.status}。${r.status === 401 ? "请检查 API Key。" : r.status === 429 ? "请求频率或额度受限，请稍后重试。" : "请检查模型名称及服务状态。"}`,
    );
  const j = await r.json();
  const content = j.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim())
    throw Error("模型没有返回文本内容");
  return content;
}
export function plainHtml(s: string) {
  const d = new DOMParser().parseFromString(s, "text/html");
  d.querySelectorAll("script,style,iframe,object,svg").forEach((n) =>
    n.remove(),
  );
  d.querySelectorAll("p,div,br,li,h1,h2,h3").forEach((n) => n.append("\n"));
  return (d.body.textContent || "").trim();
}
export function parseFeed(text: string, source: Source): Article[] {
  const common = {
    sourceId: source.id,
    kind: source.kind,
    author: source.name,
    read: false,
    saved: false,
    provenance: "订阅源",
    contentScope: "excerpt" as const,
  };
  if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
    const data = JSON.parse(text);
    const items = Array.isArray(data) ? data : data.items;
    if (!Array.isArray(items)) throw Error("JSON 订阅源需要 items 数组");
    return items.slice(0, 100).map((a) => {
      const url = safeUrl(String(a.url || a.link || ""));
      const content = String(a.content_text || a.content || a.summary || "");
      return {
        ...common,
        id: source.id + ":" + String(a.id || url || a.title),
        title: String(a.title || "未命名内容"),
        content: plainHtml(content),
        url,
        publishedAt: String(a.date_published || a.publishedAt || ""),
        contentScope: a.contentScope === "full" ? "full" : "excerpt",
      };
    });
  }
  const doc = new DOMParser().parseFromString(text, "text/xml");
  if (doc.querySelector("parsererror"))
    throw Error("订阅源不是有效的 RSS / Atom / JSON");
  const items = Array.from(doc.querySelectorAll("item,entry"));
  if (!items.length && !doc.querySelector("rss,feed"))
    throw Error("该地址没有提供可解析的文章订阅");
  return items.slice(0, 100).map((el) => {
    const get = (tag: string) =>
      el.getElementsByTagName(tag)[0]?.textContent || "";
    const link =
      el.querySelector('link[rel="alternate"]') || el.querySelector("link");
    const url = safeUrl(link?.getAttribute("href") || link?.textContent || "");
    const full = get("content:encoded") || get("content");
    const content = full || get("description") || get("summary");
    const rawDate = get("pubDate") || get("published") || get("updated");
    return {
      ...common,
      id: source.id + ":" + (get("guid") || get("id") || url || get("title")),
      title: get("title") || "未命名内容",
      content: plainHtml(content),
      url,
      publishedAt:
        rawDate && !isNaN(Date.parse(rawDate))
          ? new Date(rawDate).toISOString()
          : "",
      contentScope: full || source.kind === "x" ? "full" : "excerpt",
    };
  });
}
export async function fetchSource(
  source: Source,
  settings: Settings,
  secrets: Secrets,
  signal?: AbortSignal,
): Promise<FeedResult> {
  const result = (items: Article[], mode: "live" | "bridge"): FeedResult => ({
    items,
    sync: {
      mode,
      checkedAt: new Date().toISOString(),
      dataAt: new Date().toISOString(),
      latestItemAt:
        items
          .map((a) => a.publishedAt || a.indexedAt || "")
          .sort()
          .at(-1) || "",
    },
  });
  if (source.feedUrl || source.kind === "x") {
    const feedUrl = source.kind === "x" ? `https://fxtwitter.com/${source.handle}/feed.xml` : source.feedUrl;
    const throughBridge = source.kind !== "x" && settings.feedMode === "bridge";
    let text: string;
    if (throughBridge) {
      text = (
        await bridgeRequest(
          settings,
          secrets,
          "/feed",
          { url: feedUrl },
          signal,
        )
      ).text;
    } else {
      try {
        const r = await fetch(safeUrl(feedUrl), {
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
            : AbortSignal.timeout(20000),
          credentials: "omit",
          cache: "no-store",
        });
        if (!r.ok) throw Error(String(r.status));
        text = await r.text();
      } catch {
        throw Error("FxTwitter 暂时无法读取，请检查网络后重试。");
      }
    }
    const parsed = parseFeed(text, source).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
    return result(
      source.kind === "x" ? await completeXPosts(parsed.slice(0,20),signal) : parsed,
      throughBridge ? "bridge" : "live",
    );
  }
  if (source.id === "wechat-rsdl") {
    return fetchRSDL({
      signal,
      bridge: secrets.bridgeKey
        ? () => bridgeRequest(settings, secrets, "/rsdl", undefined, signal)
        : undefined,
    });
  }
  throw Error("请编辑此订阅，填写 RSS / JSON 地址；也可以手动导入文章链接。");
}
