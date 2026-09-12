export function canonicalArticleUrl(value) {
  const u = new URL(value);
  if (u.hostname === "mp.weixin.qq.com") {
    for (const key of [...u.searchParams.keys()])
      if (!["__biz", "mid", "idx", "sn", "chksm"].includes(key))
        u.searchParams.delete(key);
    u.hash = "";
  }
  return u.href;
}
export const RSDL_URL = "https://rsdl.info/submissions/lists/misc-news.json";
export async function collectRSDL() {
  const response = await fetch(RSDL_URL, {
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw Error(`RSDL 目录返回 HTTP ${response.status}`);
  const j = await response.json();
  if (!Array.isArray(j.items)) throw Error("RSDL 目录结构发生变化");
  const items = j.items
    .filter((x) => x.title && x.url && /^https:\/\//.test(x.url))
    .sort((a, b) =>
      String(b.added_at || "").localeCompare(String(a.added_at || "")),
    )
    .slice(0, 16)
    .map((x) => ({
      id: "rsdl:" + canonicalArticleUrl(x.url),
      sourceId: "wechat-rsdl",
      kind: "wechat",
      title: x.title,
      content: "",
      url: canonicalArticleUrl(x.url),
      publishedAt: "",
      indexedAt: x.added_at
        ? new Date(
            x.added_at.includes("T")
              ? x.added_at
              : x.added_at.replace(" ", "T") + "+08:00",
          ).toISOString()
        : undefined,
      author: "遥感与深度学习",
      read: false,
      saved: false,
      contentScope: "link",
      provenance: "RSDL 公开文章目录",
    }));
  return {
    sourceId: "wechat-rsdl",
    fetchedAt: new Date().toISOString(),
    sourceUrl: RSDL_URL,
    items,
  };
}
export const X_POSTS = [
  "2098612714704891959",
  "2098569976143806918",
  "2098569538510180712",
];
const decode = (s) =>
  s
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
export async function collectX() {
  const results = await Promise.allSettled(
    X_POSTS.map(async (id) => {
      const url = `https://x.com/thsottiaux/status/${id}`;
      const response = await fetch(
        "https://publish.twitter.com/oembed?omit_script=true&dnt=true&url=" +
          encodeURIComponent(url),
        { signal: AbortSignal.timeout(16000) },
      );
      if (!response.ok)
        throw Error(`X 公开嵌入接口返回 HTTP ${response.status}`);
      const j = await response.json();
      const paragraph =
        j.html.match(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/i)?.[1] || "";
      const words = decode(paragraph).split(/\s+/);
      const excerpt =
        words.slice(0, 24).join(" ") + (words.length > 24 ? " …" : "");
      if (!excerpt) throw Error("没有取得公开帖文字");
      return {
        id: "x:" + id,
        sourceId: "x-tibo",
        kind: "x",
        title: excerpt.slice(0, 85),
        content: excerpt,
        url,
        publishedAt: new Date(
          Number((BigInt(id) >> 22n) + 1288834974657n),
        ).toISOString(),
        author: j.author_name || "Tibo",
        read: false,
        saved: false,
        contentScope: "excerpt",
        provenance: "X 官方公开嵌入 · 选定帖快照",
      };
    }),
  );
  const items = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);
  if (!items.length) throw Error("X 公开嵌入内容暂时不可访问");
  return {
    sourceId: "x-tibo",
    fetchedAt: new Date().toISOString(),
    items,
    note: "仅选定公开帖的短节选；完整时间线需个人 X API 或 RSS。",
  };
}
