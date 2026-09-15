import type {AppData, Article} from "./types.ts";
export function cleanLegacyWechat(data:AppData):AppData {
  const referenced=new Set(data.reports.flatMap(r=>r.articleIds));
  return {...data,articles:data.articles.filter(a=>!(a.kind==="wechat" && (a.sourceId==="wechat-rsdl" || a.id.startsWith("rsdl:")) && !a.content && !a.contentMarkdown && !a.read && !a.saved && !a.summary && !a.translation && !referenced.has(a.id) && !a.provenance.includes("手动")))};
}
export function archiveGroups(articles:Article[], mode:"imported"|"read") {
  const field=mode==="read" ? "readAt" : "importedAt";
  const valid=(a:Article)=> typeof a[field]==="string" && Number.isFinite(Date.parse(a[field]!)) ? a[field]! : "";
  const sorted=articles.filter(a=>a.kind==="wechat" && (mode!=="read" || a.read)).sort((a,b)=>(Date.parse(valid(b))||0)-(Date.parse(valid(a))||0));
  const groups=new Map<string,Article[]>();
  for(const a of sorted){const value=valid(a),d=value?new Date(value):null;const key=d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`:"时间未记录";groups.set(key,[...(groups.get(key)||[]),a]);}
  return [...groups.entries()];
}
