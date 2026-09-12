import { load } from "cheerio";
export function wechatArticleUrl(value) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.hostname !== "mp.weixin.qq.com" ||
    u.port ||
    u.username ||
    u.password ||
    !/^\/s(?:\/|$)/.test(u.pathname)
  )
    throw Error("正文获取仅支持微信公开文章 https://mp.weixin.qq.com/s 链接");
  return u.href;
}
export function extractWechatArticle(html) {
  const $ = load(html),
    root = $("#js_content").first();
  if (!root.length)
    throw Error(
      "微信未提供正文，可能需要在微信中验证、登录，或文章已失效。请打开原文后粘贴正文，或接入全文 RSS。",
    );
  root.find("script,style,iframe,object,svg,form").remove();
  root.find("br").replaceWith("\n");
  root.find("p,section,div,li,h1,h2,h3,h4,blockquote,tr").append("\n");
  const content = root
    .text()
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .trim();
  if (content.length < 40)
    throw Error("没有取得足够的正文文字，请打开原文核对并粘贴正文。");
  if (content.length > 100000)
    throw Error("正文超过 100,000 字符，请手动选择需要阅读的部分。");
  return {
    title:
      $("#activity-name").text().trim() ||
      $('meta[property="og:title"]').attr("content") ||
      "",
    author: $("#js_name").text().trim(),
    content,
    contentScope: "full",
    fetchedAt: new Date().toISOString(),
    note: "提取文字正文，不包含图片、视频或评论。",
  };
}
