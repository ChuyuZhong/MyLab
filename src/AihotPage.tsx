import { useEffect, useRef, useState } from "react";
import { RefreshCw, Sparkles, Plus, Newspaper } from "lucide-react";
import { Heading, Notice, ExternalLink, Field } from "./ui";
import { useApp } from "./store";
import { aihotPath, fetchAihot, type AihotQuery, type AihotResponse, type NewsItem } from "./aihot";
import type { Article } from "./types";
const views = [{id:"selected",name:"精选资讯"},{id:"all",name:"全部动态"},{id:"hot",name:"热点榜"},{id:"daily",name:"AI 日报"}] as const;
const categories = [["","全部分类"],["ai-models","模型"],["ai-products","产品"],["industry","行业"],["paper","论文"],["tip","技巧"]];
const stamp = (s?:string|null) => s && Number.isFinite(Date.parse(s)) ? new Date(s).toLocaleString("zh-CN",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}) : "未提供";
export default function AihotPage() {
  const {askAssistant,editTask} = useApp();
  const [query,setQuery] = useState<AihotQuery>({view:"selected",window:"24h",category:"",keyword:"",date:""});
  const [keyword,setKeyword] = useState("");
  const [result,setResult] = useState<{path:string;data:AihotResponse;checkedAt:string;unchanged:boolean}|null>(null);
  const [busy,setBusy] = useState(false), [error,setError] = useState(""), [auto,setAuto] = useState(true);
  const controller = useRef<AbortController|null>(null);
  const requestId = useRef(0), lastCheck=useRef(0);
  const path = aihotPath(query);
  const refresh = async () => {
    controller.current?.abort(); const c=new AbortController();controller.current=c;
    const id=++requestId.current; setBusy(true);setError("");
    try {const r=await fetchAihot(path,c.signal);if(id===requestId.current){setResult({...r,path});lastCheck.current=Date.now();}}
    catch(e) {if(!c.signal.aborted && id===requestId.current)setError((e as Error).message === "Failed to fetch" ? "无法连接 AIHOT，请检查网络；也可以打开原站。" : (e as Error).message);}
    finally {if(id===requestId.current)setBusy(false);}
  };
  const refreshRef=useRef(refresh);refreshRef.current=refresh;
  useEffect(()=>{void refreshRef.current();return()=>controller.current?.abort();},[path]);
  useEffect(()=>{
    if(!auto)return;
    const check=()=>{if(document.visibilityState==="visible" && Date.now()-lastCheck.current>=30*60000)void refreshRef.current();};
    const timer=setInterval(check,30*60000);document.addEventListener("visibilitychange",check);
    return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",check);};
  },[auto]);
  const shown=result?.path===path ? result : null;
  const article=(item:NewsItem):Article=>({id:"aihot:"+item.id,kind:"x",sourceId:"aihot",title:item.title,author:item.source?.name || "AIHOT",url:item.links.aihot || item.links.original || "https://aihot.news",content:[item.summary,item.reason && "推荐理由："+item.reason].filter(Boolean).join("\n\n"),publishedAt:item.publishedAt || item.latestAt || "",read:false,saved:false,contentScope:"excerpt",provenance:"AIHOT 公开摘要"});
  const card=(item:NewsItem,index:number)=><article className="aihot-card surface" key={item.id || index}>
    <div className="aihot-meta"><span className="aihot-icon">{item.rank ? String(item.rank).padStart(2,"0") : <Newspaper size={19}/>}</span><span>{item.source?.name || "AIHOT"}<small>{item.latestAt ? "最近进展" : "发布时间"} · {stamp(item.publishedAt || item.latestAt)}</small></span>{item.category && <span className="status-tag">{categories.find(c=>c[0]===item.category)?.[1] || item.category}</span>}</div>
    <h2>{item.title}</h2>{item.summary && <p>{item.summary}</p>}{item.reason && <p className="aihot-reason">推荐理由 · {item.reason}</p>}
    {item.sourceCount !== undefined && <p className="muted">{item.sourceCount} 个信息来源 · 排名来自 AIHOT</p>}
    <div className="button-group wrap"><ExternalLink url={item.links.aihot || ""}>AIHOT 阅读</ExternalLink>{item.links.original && <ExternalLink url={item.links.original}>原文</ExternalLink>}{item.links.story && <ExternalLink url={item.links.story}>事件时间线</ExternalLink>}
    <button className="text-button" disabled={!item.summary} onClick={()=>askAssistant("请根据这条 AIHOT 摘要解释其意义与需要核实的内容，不要假装已读原文。",article(item))}><Sparkles size={15}/>AI 解读摘要</button>
    <button className="text-button" onClick={()=>editTask({title:item.title,notes:[item.summary,item.links.aihot].filter(Boolean).join("\n"),sourceUrl:item.links.aihot || item.links.original,project:"AI 情报"})}><Plus size={15}/>转为待办</button></div>
  </article>;
  const daily=shown?.data.report;
  return <>
    <Heading eyebrow="AI SIGNALS · POWERED BY AIHOT" title="AI 情报" description="从每日动态里，找到值得关注的变化。" action={<ExternalLink url="https://aihot.news/agent" className="secondary">AIHOT 接入说明</ExternalLink>}/>
    <div className="aihot-tabs" role="group" aria-label="情报类型">{views.map(v=><button key={v.id} className={query.view===v.id ? "primary" : "secondary"} aria-pressed={query.view===v.id} onClick={()=>setQuery(q=>({...q,view:v.id}))}>{v.name}</button>)}</div>
    <form className="aihot-controls surface" onSubmit={e=>{e.preventDefault();try{const q={...query,keyword};aihotPath(q);setQuery(q);}catch(e){setError((e as Error).message);}}}>
      {(query.view==="selected" || query.view==="all") && <><Field label="时间范围"><select value={query.window} onChange={e=>setQuery(q=>({...q,window:e.target.value as "24h"|"7d"}))}><option value="24h">过去 24 小时</option><option value="7d">最近 7 天</option></select></Field><Field label="分类"><select value={query.category} onChange={e=>setQuery(q=>({...q,category:e.target.value}))}>{categories.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field><Field label="关键词"><input value={keyword} onChange={e=>setKeyword(e.target.value)} maxLength={200} placeholder="例如 DeepSeek、遥感"/></Field><button className="secondary" type="submit">搜索</button></>}
      {query.view==="daily" && <><Field label="日报日期（留空查看最新）"><input type="date" value={query.date} onChange={e=>setQuery(q=>({...q,date:e.target.value}))}/></Field><button type="button" className="secondary" onClick={()=>setQuery(q=>({...q,date:""}))}>最新日报</button></>}
      <button type="button" className="secondary" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={16} className={busy?"spin":""}/>{busy?"获取中…":"检查更新"}</button>
      <label className="aihot-auto"><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/>每 30 分钟检查</label>
    </form>
    <div className="aihot-status" role="status">{shown ? `检查于 ${stamp(shown.checkedAt)}${shown.unchanged?" · 内容未变化 / 缓存仍有效":" · 已获取最新接口结果"}` : busy ? "正在连接 AIHOT…" : "尚未取得本次查询结果"}<ExternalLink url="https://aihot.news">数据来源：AIHOT</ExternalLink></div>
    {error && <Notice tone="warning">{error}{shown && " 当前显示上次成功结果。"}</Notice>}
    <details className="aihot-help surface"><summary>功能指引 · 如何使用 AI 情报</summary><p>无需 API Key 或本机服务。点击上方按钮获取精选、全部动态、热点榜或日报；资讯支持过去 24 小时 / 最近 7 天、分类与 2—200 字关键词。默认最多 20 条，热点最多 10 条。按发布时间筛选，数量不足时如实显示。</p><p>选择“论文”查阅研究进展；“AI 解读摘要”调用设置中的共享模型接口，“转为待办”打开任务编辑器。日报支持选择日期，留空获取最新一期。摘要不等于论文或文章全文，完整内容请点击原文。</p><p>自动检查仅在此页面可见时运行，返回页面会检查是否需要更新。接口有缓存和限流，因此不保证即时推送；短时间重复点击不会绕过缓存。页面只保存少量会话内查询结果，不批量下载或公开镜像新闻。</p></details>
    {daily && <section className="aihot-daily surface"><span className="status-tag">{daily.date} · AI 日报</span><h2>{daily.lead?.title || "今日 AI 日报"}</h2><p>{daily.lead?.leadParagraph}</p><small>生成于 {stamp(daily.generatedAt)}</small><ExternalLink url={daily.links.aihot}>阅读日报原页</ExternalLink></section>}
    {daily ? <>{daily.sections.map((s,i)=><section key={i}><h2 className="aihot-section">{s.label}</h2><div className="aihot-grid">{s.items.map(card)}</div></section>)}{daily.flashes.length>0 && <section><h2 className="aihot-section">快讯</h2><div className="aihot-grid">{daily.flashes.map(card)}</div></section>}</> : <div className="aihot-grid">{shown?.data.items?.map(card)}</div>}
    {shown?.data.items?.length===0 && <div className="small-empty">当前条件暂无内容，可扩大到最近 7 天或清空关键词。</div>}
    {shown?.data.page?.hasMore && <p className="muted">当前显示最新 20 条，请缩小筛选条件或前往 AIHOT 查看更多。</p>}
  </>;
}
