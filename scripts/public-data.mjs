import { parseRSDL, RSDL_API, RSDL_FULL } from "../src/rsdl.ts";
export { canonicalArticleUrl } from "../src/rsdl.ts";
export const RSDL_URL = RSDL_API;
export async function collectRSDL() {
  for (const url of [RSDL_API, RSDL_FULL]) {
    try {
      const response = await fetch(
        url + (url.includes("?") ? "&" : "?") + "_=" + Date.now(),
        { cache: "no-store", signal: AbortSignal.timeout(20000) },
      );
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const result = parseRSDL(await response.json());
      return {
        ...result,
        sourceUrl: url,
        ...(url === RSDL_FULL
          ? { warning: "上游动态接口未连接，读取上游完整目录文件。" }
          : {}),
      };
    } catch (error) {
      if (url === RSDL_FULL)
        throw Error("RSDL 完整目录读取失败：" + error.message);
    }
  }
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
