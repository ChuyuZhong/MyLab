import test from "node:test";
import assert from "node:assert/strict";
import { parseRSDL, articleIdentity, RSDL_API } from "../src/rsdl.ts";
import { fetchRSDL } from "../src/rsdl-client.ts";
import { mergeFeedArticles, applyFeedResult } from "../src/feed-sync.ts";
import { defaultData, validateBackup } from "../src/core.ts";
import { emptyReport } from "../src/weekly.ts";
const url =
  "https://mp.weixin.qq.com/s?__biz=ABC==&mid=123&idx=1&sn=token&scene=126";
const raw = {
  updated_at: "2026-09-12T10:00:00Z",
  items: Array.from({ length: 80 }, (_, i) => ({
    title: "论文 " + i,
    url: url.replace("mid=123", "mid=" + i),
    added_at: "2026-09-12T00:00:00Z",
    journal: ["TGRS"],
  })),
};
test("complete directory includes journal and conference items beyond the previous 16-item news limit", () => {
  const result = parseRSDL(raw);
  assert.equal(result.items.length, 80);
  assert.ok(result.items.every((a) => a.provenance.includes("期刊论文")));
  assert.equal(result.latestItemAt, "2026-09-12T00:00:00.000Z");
  assert.equal(
    parseRSDL({ items: [{ title: "会议", url, conf: [{ name: "CVPR" }] }] })
      .items[0].provenance,
    "RSDL 公开目录 · 会议论文",
  );
  assert.throws(() => parseRSDL({ data: [] }));
});
test("live API bypasses cache, does not require bridge credentials and retains upstream freshness", async () => {
  const calls: string[] = [];
  const result = await fetchRSDL({
    fetcher: (async (u, options) => {
      calls.push(String(u));
      assert.equal(options?.cache, "no-store");
      assert.equal(options?.credentials, "omit");
      return Response.json(raw);
    }) as typeof fetch,
    bridge: async () => {
      throw Error("Should not call bridge");
    },
  });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].startsWith(RSDL_API + "&_="));
  assert.equal(result.sync.mode, "live");
  assert.equal(result.items.length, 80);
  assert.equal(result.sync.upstreamUpdatedAt, raw.updated_at);
});
test("offline fallback exposes the original snapshot time, never labels cache as live", async () => {
  const snapshot = { ...parseRSDL(raw), fetchedAt: "2026-08-17T00:00:00Z" };
  const result = await fetchRSDL({
    fetcher: (async (u) => {
      if (String(u).startsWith(RSDL_API)) throw Error("CORS/network");
      return Response.json(snapshot);
    }) as typeof fetch,
  });
  assert.equal(result.sync.mode, "snapshot");
  assert.equal(result.sync.dataAt, snapshot.fetchedAt);
  assert.match(result.sync.warning!, /部署缓存/);
  await assert.rejects(
    fetchRSDL({
      fetcher: (async () => {
        throw Error("offline");
      }) as typeof fetch,
    }),
    /保留本机文章/,
  );
});
test("aborting live refresh does not start bridge or cache requests", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    fetchRSDL({
      signal: controller.signal,
      fetcher: (async () => {
        calls++;
        controller.abort();
        throw Error("aborted");
      }) as typeof fetch,
      bridge: async () => {
        calls++;
        throw Error("not expected");
      },
    }),
    /取消/,
  );
  assert.equal(calls, 1);
});
test("a paired bridge can recover a failed direct request before consulting the deployed cache", async () => {
  let reads = 0;
  const result = await fetchRSDL({
    fetcher: (async () => {
      reads++;
      throw Error("network");
    }) as typeof fetch,
    bridge: async () => parseRSDL(raw),
  });
  assert.equal(reads, 1);
  assert.equal(result.sync.mode, "bridge");
  assert.equal(result.items.length, 80);
});
test("refresh preserves legacy article IDs, user content and weekly notes while counting only new articles", () => {
  const fresh = parseRSDL({
    items: [{ title: "最新标题", url, added_at: "2026-09-12T00:00:00Z" }],
  }).items[0];
  const old = {
    ...fresh,
    id: "legacy-id",
    url: url + "&sessionid=old",
    title: "旧标题",
    content: "用户补充的全文",
    contentScope: "full" as const,
    provenance: "RSDL · 手动补充",
    read: true,
    saved: true,
    summary: "我的摘要",
  };
  assert.equal(articleIdentity(old), articleIdentity(fresh));
  const data = defaultData();
  data.sources.push({id:"wechat-rsdl",kind:"wechat",name:"遥感与深度学习",handle:"",url:"",feedUrl:""});
  data.articles = [old];
  data.reports = [
    {
      ...emptyReport("2026-09-07"),
      articleIds: [old.id],
      readingNotes: {
        [old.id]: { paperTitle: "原题", publication: "", notes: "个人思考" },
      },
    },
  ];
  const updated = applyFeedResult(data, "wechat-rsdl", {
    items: [fresh],
    sync: {
      mode: "live",
      checkedAt: "2026-09-12T10:00:00Z",
      dataAt: "2026-09-12T10:00:00Z",
      latestItemAt: "2026-09-12T00:00:00Z",
    },
  });
  assert.equal(updated.articles.length, 1);
  assert.equal(updated.articles[0].title, "最新标题");
  assert.equal(updated.articles[0].id, old.id);
  assert.equal(updated.articles[0].content, old.content);
  assert.ok(updated.articles[0].read && updated.articles[0].saved);
  assert.equal(
    updated.sources.find((s) => s.id === "wechat-rsdl")?.sync?.added,
    0,
  );
  assert.deepEqual(updated.reports, data.reports);
  assert.equal(mergeFeedArticles([old], parseRSDL(raw).items).added, 80);
  assert.equal(
    mergeFeedArticles([{ ...old, provenance: "手动导入" }], [fresh]).articles[0]
      .content,
    old.content,
  );
  assert.equal(
    mergeFeedArticles([old], [fresh], false).articles[0].title,
    old.title,
  );
});
test("older settings gain a WeChat refresh interval and sync metadata survives backup validation", () => {
  const data = defaultData();
  const { wechatRefresh, ...settings } = data.settings;
  assert.equal(validateBackup({ ...data, settings }).settings.wechatRefresh, 0);
  data.settings.wechatRefresh = 1;
  assert.equal(validateBackup(data).settings.wechatRefresh, 1);
  data.sources[0].sync = {
    mode: "snapshot",
    checkedAt: "2026-09-12T10:00:00Z",
    dataAt: "2026-08-17T00:00:00Z",
    latestItemAt: "2026-08-12T00:00:00Z",
    warning: "缓存",
  };
  assert.equal(validateBackup(data).sources[0].sync?.mode, "snapshot");
});

test("X refresh bounds history to twenty while retaining bookmarks and report references", () => {
  const data = defaultData(), sourceId = data.sources[0].id;
  const items = Array.from({length:25}, (_,i) => ({id:`post-${i}`,sourceId,kind:"x" as const,author:"Tibo",title:"",content:"Full post",url:`https://x.com/thsottiaux/status/${i}`,publishedAt:new Date(1700000000000+i*60000).toISOString(),read:false,saved:i===0,contentScope:"full" as const,provenance:"订阅源"}));
  const report = emptyReport("2026-09-14"); report.articleIds=["post-1"]; data.reports=[report];
  const next=applyFeedResult(data,sourceId,{items,sync:{mode:"live",checkedAt:new Date().toISOString(),dataAt:new Date().toISOString(),latestItemAt:items[24].publishedAt}});
  assert.equal(next.articles.length,22);
  assert.ok(next.articles.some(a=>a.id==="post-0"));
  assert.ok(next.articles.some(a=>a.id==="post-1"));
  assert.ok(!next.articles.some(a=>a.id==="post-2"));
});
