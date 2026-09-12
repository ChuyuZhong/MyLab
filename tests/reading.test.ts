import test from "node:test";
import assert from "node:assert/strict";
import {
  extractWechatArticle,
  wechatArticleUrl,
} from "../scripts/article-reader.mjs";
import { allowedLocalFeed } from "../scripts/local-feed.mjs";
import { readingMessages, completeReading } from "../src/reading.ts";
import { defaultData } from "../src/core.ts";
import { emptyReport, reportInputs, localSections } from "../src/weekly.ts";
import { mergeFeedArticles } from "../src/feed-sync.ts";
import type { Article } from "../src/types.ts";
const a: Article = {
  id: "reading-test",
  sourceId: "wechat-rsdl",
  kind: "wechat",
  title: "测试论文",
  url: "https://mp.weixin.qq.com/s/fixture",
  author: "测试来源",
  content: "测试正文。".repeat(15),
  contentScope: "full",
  provenance: "本机获取文字正文",
  publishedAt: "",
  read: false,
  saved: true,
};
test("WeChat reader extracts text paragraphs, excludes executable markup and rejects verification pages", () => {
  const result = extractWechatArticle(
    `<h1 id="activity-name">测试论文</h1><div id="js_content"><p>${a.content}</p><p>第二段</p><script>HIDDEN_SCRIPT</script><iframe>HIDDEN_FRAME</iframe></div>`,
  );
  assert.equal(result.title, "测试论文");
  assert.match(result.content, /\n第二段/);
  assert.doesNotMatch(result.content, /HIDDEN/);
  assert.throws(
    () => extractWechatArticle("<html>环境异常，需要验证</html>"),
    /验证/,
  );
  assert.throws(
    () => extractWechatArticle('<div id="js_content">缺失</div>'),
    /足够/,
  );
  for (const url of [
    "http://mp.weixin.qq.com/s/a",
    "https://mp.weixin.qq.com.evil.test/s/a",
    "https://127.0.0.1/s/a",
    "https://mp.weixin.qq.com/admin",
    "https://user@mp.weixin.qq.com/s/a",
  ])
    assert.throws(() => wechatArticleUrl(url));
  assert.equal(wechatArticleUrl(a.url), a.url);
  assert.ok(wechatArticleUrl("https://mp.weixin.qq.com/s?__biz=example&mid=1"));
});
test("local RSS permits only explicitly configured loopback feed paths, never arbitrary local services", () => {
  const origins = new Set(["http://127.0.0.1:8001"]);
  assert.ok(allowedLocalFeed("http://127.0.0.1:8001/feed/abc.xml", origins));
  for (const u of [
    "http://127.0.0.1:8001/admin",
    "http://127.0.0.1:8001/feed/../admin",
    "http://127.0.0.1:4318/feed/abc",
    "http://192.168.1.1:8001/feed/a",
    "http://user:pass@127.0.0.1:8001/feed/a",
  ])
    assert.equal(allowedLocalFeed(u, origins), false);
});
test("AI reading refuses link-only and overlong inputs; completed notes enter weekly materials without replacing personal drafts", () => {
  assert.throws(() => readingMessages({ ...a, content: "" }), /正文/);
  assert.throws(
    () => readingMessages({ ...a, content: "a".repeat(60001) }),
    /60,000/,
  );
  assert.equal(JSON.parse(readingMessages(a)[1].content).content, a.content);
  const d = defaultData();
  d.articles = [a];
  d.reports = [
    {
      ...emptyReport("2026-09-07"),
      markdown: "手动修改的原稿",
      readingNotes: {
        [a.id]: { notes: "个人判断", paperTitle: "", publication: "" },
      },
    },
  ];
  const result = completeReading(d, a.id, "AI 笔记", "2026-09-07");
  assert.ok(result.queued);
  assert.ok(result.data.articles[0].read);
  assert.ok(result.data.articles[0].saved);
  assert.equal(result.data.reports[0].markdown, "手动修改的原稿");
  assert.equal(result.data.reports[0].readingNotes[a.id].notes, "个人判断");
  const input = reportInputs(result.data.reports[0], result.data.articles, []);
  assert.equal(input.readings[0].summary, "AI 笔记");
  assert.equal(localSections(input).papers[0], "个人判断");
  const again = completeReading(result.data, a.id, "新笔记", "2026-09-07");
  assert.equal(again.data.reports[0].articleIds.length, 1);
  const noNotes = {
    ...input,
    readings: input.readings.map((r) => ({ ...r, notes: "" })),
  };
  assert.match(localSections(noNotes).papers[0], /AI 阅读笔记（待核对）/);
});
test("a full weekly selection still preserves completed AI notes; directory refresh retains fetched bodies", () => {
  const d = defaultData();
  d.articles = [a];
  d.reports = [
    {
      ...emptyReport("2026-09-07"),
      articleIds: Array.from({ length: 12 }, (_, i) => "other-" + i),
    },
  ];
  const r = completeReading(d, a.id, "保留笔记", "2026-09-07");
  assert.equal(r.queued, false);
  assert.equal(r.data.articles[0].summary, "保留笔记");
  assert.equal(r.data.reports[0].articleIds.length, 12);
  const merged = mergeFeedArticles(
    [r.data.articles[0]],
    [{ ...a, content: "", contentScope: "link", provenance: "目录" }],
  );
  assert.equal(merged.articles[0].content, a.content);
  assert.equal(merged.articles[0].summary, "保留笔记");
});
