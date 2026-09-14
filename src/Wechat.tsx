import { useEffect, useRef, useState } from "react";
import { BookOpen, CheckCheck, Sparkles, FilePlus2 } from "lucide-react";
import { useApp } from "./store";
import { bridgeRequest } from "./api";
import { Heading, Notice, ExternalLink } from "./ui";
import { MarkdownView } from "./MarkdownView";
import { ArticleEditor } from "./Feeds";
import { queueReading } from "./weekly";
import type { Article } from "./types";

export function WechatPage() {
  const { data, setData, secrets, notify, askAssistant, navigate, query } = useApp();
  const [url, setUrl] = useState("");
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<Article | null | undefined>();
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const articles = data.articles.filter(a => a.kind === "wechat" && `${a.title} ${a.author}`.includes(query));
  const active = data.articles.find(a => a.id === selected);
  async function load() {
    if (request.current) return;
    try {
      const u = new URL(url.trim());
      if (u.protocol !== "https:" || u.hostname !== "mp.weixin.qq.com" || !/^\/s(?:\/|$)/.test(u.pathname)) throw Error("请输入微信文章链接 https://mp.weixin.qq.com/s/…");
      const existing = data.articles.find(a => a.kind === "wechat" && a.url === u.href);
      if (existing?.contentScope === "full") { setSelected(existing.id); return; }
      const controller = new AbortController(); request.current = controller;
      setBusy(true); setError("");
      const r = await bridgeRequest(data.settings, secrets, "/article", { url: u.href }, controller.signal);
      if (!r.content?.trim()) throw Error("没有取得正文，请在原文完成验证后手动补充。");
      const a: Article = { ...existing, id: existing?.id || crypto.randomUUID(), kind: "wechat", sourceId: "manual-wechat", title: r.title || "微信文章", author: r.author || "公众号", url: u.href, content: r.content, contentMarkdown: r.contentMarkdown, publishedAt: r.publishedAt || "", indexedAt: new Date().toISOString(), read: existing?.read || false, saved: existing?.saved || false, contentScope: "full", provenance: "文章链接 · 本机读取" };
      setData(d => ({ ...d, articles: [a, ...d.articles.filter(x => x.url !== a.url || x.kind !== "wechat")] }));
      setSelected(a.id);
    } catch (e) { if (!request.current?.signal.aborted) setError((e as Error).message); }
    finally { request.current = null; setBusy(false); }
  }
  return <>
    <Heading eyebrow="READ. THINK. KEEP." title="公众号导读" description="从一篇文章开始，把阅读变成自己的积累。" />
    <form className="guide-url surface" onSubmit={e => { e.preventDefault(); void load(); }}>
      <input aria-label="微信文章链接" placeholder="粘贴微信公众号文章链接 https://mp.weixin.qq.com/s/…" value={url} onChange={e => setUrl(e.target.value)} required />
      <button className="primary" disabled={busy}><BookOpen size={17}/>{busy ? "加载中…" : "加载文章"}</button>
      <button className="secondary" type="button" onClick={() => setEdit(null)}>粘贴正文</button>
    </form>
    {error && <Notice tone="warning">{error}<button className="text-button" onClick={() => navigate("settings")}>连接设置</button></Notice>}
    <div className="guide-layout">
      <aside className="surface guide-archive"><h3>阅读归档 · {articles.length}</h3>{!articles.length && <p className="muted">加载的文章保存在本机，可随时重读、备份。</p>}{articles.map(a => <button key={a.id} className={selected === a.id ? "selected" : ""} onClick={() => setSelected(a.id)}><small>{a.author} · {a.read ? "已读" : "待读"}</small><strong>{a.title}</strong></button>)}</aside>
      <section className="reader-panel">
        {!active ? <div className="small-empty">粘贴链接加载文章，或选择一篇已归档的内容。</div> : <>
          <div className="reader-meta">{active.author} · {active.publishedAt ? new Date(active.publishedAt).toLocaleString("zh-CN", { year:"numeric", month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit" }) : "发布时间未提供"}</div>
          <h2>{active.title}</h2>
          <div className="reader-actions">
            <ExternalLink url={active.url}>原文</ExternalLink>
            <button className="text-button" onClick={() => setData(d => ({...d,articles:d.articles.map(a => a.id === active.id ? {...a,read:!a.read} : a)}))}><CheckCheck size={16}/>{active.read ? "已读 · 已归档" : "标为已读"}</button>
            <button className="text-button" disabled={!active.content} onClick={() => askAssistant("请辅助阅读这篇文章，概括方法并回答我的问题。",active)}><Sparkles size={16}/>AI 辅助阅读</button>
            <button className="text-button" disabled={!active.content} onClick={() => {try {setData(queueReading(data,active.id));notify("已加入本周周报");navigate("weekly");}catch(e){notify((e as Error).message);}}}><FilePlus2 size={16}/>加入周报</button>
            <button className="text-button" onClick={() => setEdit(active)}>补充正文</button>
          </div>
          {active.contentMarkdown ? <MarkdownView text={active.contentMarkdown} images/> : <div className="article-content">{active.content || "尚无正文，请加载链接或粘贴正文。"}</div>}
          <small className="muted">图片由原站提供；视频、交互内容及受限图片请在原文查看。</small>
          {active.summary && <div className="ai-result"><MarkdownView text={active.summary}/></div>}
        </>}
      </section>
    </div>
    {edit !== undefined && <ArticleEditor kind="wechat" initial={edit || undefined} onClose={() => setEdit(undefined)}/>}
  </>;
}
