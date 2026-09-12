import type { Article } from "./types.ts";

export const RSDL_API = "https://rsdl.info/api/links.php?action=list";
export const RSDL_FULL = "https://rsdl.info/submissions/links.json";
export function canonicalArticleUrl(value: string) {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password)
    throw Error("文章链接无效");
  if (u.hostname === "mp.weixin.qq.com") {
    for (const key of [...u.searchParams.keys()])
      if (!["__biz", "mid", "idx", "sn", "chksm"].includes(key))
        u.searchParams.delete(key);
    u.hash = "";
    u.searchParams.sort();
  }
  return u.href;
}
export function articleIdentity(
  a: Pick<Article, "id" | "kind" | "sourceId" | "url">,
) {
  try {
    const u = new URL(a.url);
    if (a.kind === "wechat" && u.hostname === "mp.weixin.qq.com") {
      const biz = u.searchParams.get("__biz"),
        mid = u.searchParams.get("mid");
      if (biz && mid)
        return `${a.sourceId}:wechat:${biz}:${mid}:${u.searchParams.get("idx") || "1"}`;
      return a.sourceId + ":" + canonicalArticleUrl(a.url);
    }
  } catch {}
  return a.sourceId + ":" + a.id;
}
export function parseRSDL(value: unknown) {
  const j = value as {
    items?: Record<string, unknown>[];
    updated_at?: unknown;
  };
  if (!j || !Array.isArray(j.items)) throw Error("RSDL 目录结构发生变化");
  const unique = new Map<string, Article>();
  for (const x of j.items) {
    if (
      !x ||
      typeof x.title !== "string" ||
      !x.title.trim() ||
      typeof x.url !== "string"
    )
      continue;
    try {
      const url = canonicalArticleUrl(x.url);
      let date = typeof x.added_at === "string" ? x.added_at.trim() : "";
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(date))
        date = date.replace(" ", "T") + "+08:00";
      const indexedAt =
        date && !isNaN(Date.parse(date))
          ? new Date(date).toISOString()
          : undefined;
      const groups: string[] = [];
      if (Array.isArray(x.journal) && x.journal.length) groups.push("期刊论文");
      if (Array.isArray(x.conf) && x.conf.length) groups.push("会议论文");
      const labels: Record<string, string> = {
        reading: "论文赏读",
        arxiv: "预印本",
        news: "资讯",
        practice: "技术实践",
        tools: "工具",
        books: "书籍",
        contest: "竞赛",
        jobs: "招生招聘",
        cfp: "征稿",
      };
      if (Array.isArray(x.misc))
        for (const key of x.misc)
          if (typeof key === "string" && labels[key]) groups.push(labels[key]);
      const a: Article = {
        id: "rsdl:" + url,
        sourceId: "wechat-rsdl",
        kind: "wechat",
        title: x.title.trim(),
        content: "",
        url,
        publishedAt: "",
        indexedAt,
        author: "遥感与深度学习",
        read: false,
        saved: false,
        contentScope: "link",
        provenance:
          "RSDL 公开目录" +
          (groups.length ? " · " + [...new Set(groups)].join(" / ") : ""),
      };
      const key = articleIdentity(a);
      if (
        !unique.has(key) ||
        (unique.get(key)!.indexedAt || "") < (indexedAt || "")
      )
        unique.set(key, a);
    } catch {}
  }
  if (j.items.length && !unique.size) throw Error("RSDL 未返回有效文章链接");
  const items = [...unique.values()].sort((a, b) =>
    (b.indexedAt || "").localeCompare(a.indexedAt || ""),
  );
  return {
    sourceId: "wechat-rsdl",
    fetchedAt: new Date().toISOString(),
    sourceUrl: RSDL_API,
    upstreamUpdatedAt: typeof j.updated_at === "string" ? j.updated_at : "",
    latestItemAt: items[0]?.indexedAt || "",
    items,
  };
}
