import type { Article, Settings, Secrets, Source } from "./types";
import { safeUrl } from "./core";
export async function bridgeRequest(
  settings: Settings,
  secrets: Secrets,
  path: string,
  body?: object,
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
      signal: AbortSignal.timeout(30000),
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
      contentScope: full ? "full" : "excerpt",
    };
  });
}
export async function fetchSource(
  source: Source,
  settings: Settings,
  secrets: Secrets,
): Promise<Article[]> {
  if (source.feedUrl) {
    let text: string;
    if (settings.feedMode === "bridge") {
      text = (
        await bridgeRequest(settings, secrets, "/feed", { url: source.feedUrl })
      ).text;
    } else {
      try {
        const r = await fetch(safeUrl(source.feedUrl), {
          signal: AbortSignal.timeout(20000),
          credentials: "omit",
        });
        if (!r.ok) throw Error(String(r.status));
        text = await r.text();
      } catch {
        throw Error("订阅地址无法直接读取。可在设置中切换为通过本机服务读取。");
      }
    }
    return parseFeed(text, source);
  }
  if (source.kind === "x") {
    const result = await bridgeRequest(settings, secrets, "/x", {
      handle: source.handle,
      key: secrets.xKey,
    });
    return result.items.map((a: Article) => ({ ...a, sourceId: source.id }));
  }
  if (source.id === "wechat-rsdl") {
    if (secrets.bridgeKey) {
      const r = await bridgeRequest(settings, secrets, "/rsdl");
      return r.items.map((a: Article) => ({ ...a, sourceId: source.id }));
    }
    const response = await fetch("./data/rsdl.json", {
      cache: "no-cache",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw Error("网站目录快照暂不可用，请连接本机服务后重试");
    const result = await response.json();
    if (!result.items?.length)
      throw Error("尚未取得目录快照，请连接本机服务读取");
    return result.items.map((a: Article) => ({
      ...a,
      sourceId: source.id,
      provenance: `RSDL 目录快照 · ${new Date(result.fetchedAt).toLocaleDateString("zh-CN")}`,
    }));
  }
  throw Error("请编辑此订阅，填写 RSS / JSON 地址；也可以手动导入文章链接。");
}
