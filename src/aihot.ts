export type AihotView = "selected" | "all" | "hot" | "daily";
export interface AihotQuery { view: AihotView; window: "24h" | "7d"; category: string; keyword: string; date: string }
export interface NewsItem {
  id: string; title: string; summary?: string | null; reason?: string | null;
  source: {name: string}; links: {aihot?: string | null; original?: string; story?: string};
  publishedAt?: string | null; discoveredAt?: string; latestAt?: string;
  rank?: number; sourceCount?: number; category?: string | null;
}
export interface AihotResponse {
  schemaVersion: number; items?: NewsItem[]; page?: {hasMore: boolean};
  report?: {date:string; generatedAt:string; links:{aihot:string}; lead:{title:string;leadParagraph:string}|null;
    sections:{label:string;items:NewsItem[]}[]; flashes:NewsItem[]};
}
export function aihotPath(q: AihotQuery) {
  if(q.view === "hot") return "/hot-topics";
  if(q.view === "daily") {
    if(q.date && (!/^\d{4}-\d{2}-\d{2}$/.test(q.date) || !Number.isFinite(Date.parse(q.date)))) throw Error("请选择有效的日报日期");
    return `/dailies/${q.date || "latest"}`;
  }
  const keyword = q.keyword.trim();
  if(keyword && (Array.from(keyword).length < 2 || Array.from(keyword).length > 200)) throw Error("关键词请输入 2—200 个字");
  const p = new URLSearchParams({mode:q.view,window:q.window,by:"published",limit:"20"});
  if(q.category) p.set("category",q.category);
  if(keyword) p.set("q",keyword);
  return "/items?" + p;
}
export function createAihotClient(fetcher: typeof fetch = fetch, now = Date.now) {
  const cache = new Map<string,{data:AihotResponse;etag:string;until:number;checkedAt:string}>();
  let retryAt = 0;
  return async (path:string, signal?:AbortSignal) => {
    const old = cache.get(path);
    if(now() < retryAt) throw Error(`上游暂时限流，请于 ${new Date(retryAt).toLocaleTimeString("zh-CN")} 后再试`);
    if(old && now() < old.until) return {...old, unchanged:true};
    const r = await fetcher("https://aihot.news/api/v1" + path, {
      credentials:"omit", headers:old?.etag ? {"If-None-Match":old.etag} : {},
      signal: signal ? AbortSignal.any([signal,AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
    });
    if(r.status === 429 || r.status === 503) {
      const raw = r.headers.get("Retry-After") || "60";
      retryAt = now() + Math.max(60000, /^\d+$/.test(raw) ? Number(raw)*1000 : Date.parse(raw)-now() || 60000);
      throw Error("AIHOT 暂时限流或维护，请稍后再试；已保留上次结果。");
    }
    const ttl = Math.max(path.startsWith("/items?") ? 60 : 300, Number(r.headers.get("Cache-Control")?.match(/s-maxage=(\d+)/)?.[1] || 0));
    if(r.status === 304 && old) {
      const entry = {...old,until:now()+ttl*1000,checkedAt:new Date(now()).toISOString()}; cache.set(path,entry);
      return {...entry,unchanged:true};
    }
    if(!r.ok) throw Error(r.status === 404 ? "该日期暂无日报，请选择其他日期或最新日报。" : `AIHOT 返回 HTTP ${r.status}，请稍后重试。`);
    const data = await r.json() as AihotResponse;
    if(data.schemaVersion !== 1 || (path.startsWith("/dailies/") ? !data.report || !Array.isArray(data.report.sections) || !Array.isArray(data.report.flashes) : !Array.isArray(data.items))) throw Error("AIHOT 数据格式已变化，请到原站查看。");
    const entry = {data,etag:r.headers.get("ETag") || "",until:now()+ttl*1000,checkedAt:new Date(now()).toISOString()};
    cache.set(path,entry); if(cache.size > 12) cache.delete(cache.keys().next().value!);
    return {...entry,unchanged:false};
  };
}
export const fetchAihot = createAihotClient();
