import test from "node:test";
import assert from "node:assert/strict";
import { extractWechatArticle, wechatArticleUrl } from "../scripts/article-reader.mjs";

test("WeChat reader retains article text, safe images and publication time", () => {
  const r = extractWechatArticle(`<script>var ct="1789369200";</script><h1 id="activity-name">论文</h1><span id="js_name">公众号</span><div id="js_content"><p>${"完整正文内容。".repeat(10)}</p><img data-src="https://mmbiz.qpic.cn/test.png"><img src="https://evil.example/a"><script>unsafe script</script></div>`);
  assert.equal(r.title, "论文");
  assert.equal(r.author, "公众号");
  assert.ok(r.contentMarkdown.includes("https://mmbiz.qpic.cn/test.png"));
  assert.ok(!r.contentMarkdown.includes("evil.example"));
  assert.ok(!r.content.includes("unsafe script"));
  assert.equal(r.publishedAt, new Date(1789369200000).toISOString());
  assert.throws(() => extractWechatArticle("环境异常"));
  assert.throws(() => wechatArticleUrl("https://mp.weixin.qq.com.evil.example/s/x"));
});
