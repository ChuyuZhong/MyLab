import { useEffect, useRef, useState } from "react";
import {
  Plus,
  RefreshCw,
  Radio,
  BookOpen,
  Bookmark,
  CheckCheck,
  Languages,
  Sparkles,
  ArrowUpRight,
  Settings2,
  FilePlus2,
  Trash2,
  Search,
  Link2,
  Loader2,
} from "lucide-react";
import { useApp } from "./store";
import { fetchSource } from "./api";
import { dayKey, safeUrl } from "./core";
import { Modal, Field, Heading, Empty, ExternalLink, Notice } from "./ui";
import type { Article, Source } from "./types";
import { queueReading } from "./weekly";
import { applyFeedResult } from "./feed-sync";
export function SourceEditor({
  kind,
  initial,
  onClose,
}: {
  kind: "x" | "wechat";
  initial?: Source;
  onClose: () => void;
}) {
  const { setData, notify } = useApp();
  const [source, setSource] = useState<Source>(
    initial || {
      id: crypto.randomUUID(),
      kind,
      name: "",
      handle: "",
      url: "",
      feedUrl: "",
    },
  );
  return (
    <Modal title={initial ? "编辑订阅" : "添加订阅"} onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          let s = { ...source, name: source.name.trim() };
          if (kind === "x") {
            s.handle = source.handle
              .trim()
              .replace(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//, "")
              .replace(/^@/, "")
              .split(/[/?#]/)[0];
            if (!/^[A-Za-z0-9_]{1,15}$/.test(s.handle)) {
              notify("请输入有效的 X 用户名或个人主页链接");
              return;
            }
            s.url = `https://x.com/${s.handle}`;
            s.name = s.name || s.handle;
          }
          if (!s.name) {
            notify("请填写公众号名称");
            return;
          }
          if (s.feedUrl && !safeUrl(s.feedUrl)) {
            notify("订阅地址需要是 HTTPS 或本机地址");
            return;
          }
          setData((d) => ({
            ...d,
            sources: initial
              ? d.sources.map((x) => (x.id === s.id ? s : x))
              : [...d.sources, s],
          }));
          notify("订阅已保存");
          onClose();
        }}
      >
        <Field label={kind === "x" ? "显示名称" : "公众号名称"}>
          <input
            autoFocus
            value={source.name}
            maxLength={100}
            onChange={(e) => setSource((s) => ({ ...s, name: e.target.value }))}
            placeholder={kind === "x" ? "例如 Tibo" : "例如 遥感与深度学习"}
          />
        </Field>
        {kind === "x" ? (
          <Field label="X 用户名或主页链接">
            <input
              required
              value={source.handle}
              onChange={(e) =>
                setSource((s) => ({ ...s, handle: e.target.value }))
              }
              placeholder="@thsottiaux"
            />
          </Field>
        ) : (
          <Field label="公众号配套网站（可选）">
            <input
              value={source.url}
              onChange={(e) =>
                setSource((s) => ({ ...s, url: e.target.value }))
              }
              placeholder="https://…"
            />
          </Field>
        )}
        <Field
          label="RSS / Atom / JSON 订阅地址（可选）"
          hint={
            kind === "x"
              ? "留空则使用本机服务连接 X 官方 API，需要填写 X API Token。"
              : "RSDL 预设可直接更新；其他公众号需填写可用订阅地址，仅填名称不能自动获取新文章。留空可手动导入。"
          }
        >
          <input
            value={source.feedUrl}
            onChange={(e) =>
              setSource((s) => ({ ...s, feedUrl: e.target.value }))
            }
            placeholder="https://…/feed.xml"
          />
        </Field>
        <div className="modal-actions">
          {initial && (
            <button
              className="danger text-button"
              type="button"
              onClick={() => {
                setData((d) => ({
                  ...d,
                  sources: d.sources.filter((s) => s.id !== initial.id),
                }));
                notify("已取消订阅，已保存文章仍保留");
                onClose();
              }}
            >
              <Trash2 size={15} />
              取消订阅
            </button>
          )}
          <button className="secondary" type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary">保存订阅</button>
        </div>
      </form>
    </Modal>
  );
}
export function ArticleEditor({
  kind,
  onClose,
  initial,
}: {
  kind: "x" | "wechat";
  onClose: () => void;
  initial?: Article;
}) {
  const { data, setData, notify } = useApp();
  const [article, setArticle] = useState<Article>(
    initial || {
      id: crypto.randomUUID(),
      kind,
      sourceId: data.sources.find((s) => s.kind === kind)?.id || "",
      title: "",
      content: "",
      url: "",
      publishedAt: "",
      author: "",
      read: false,
      saved: false,
      contentScope: "link",
      provenance: "手动导入",
    },
  );
  return (
    <Modal title={initial ? "补充文章内容" : "导入内容"} onClose={onClose} wide>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (article.url && !safeUrl(article.url)) {
            notify("请填写 HTTPS 文章链接");
            return;
          }
          const a = {
            ...article,
            contentScope: article.content.trim()
              ? article.contentScope === "link"
                ? ("excerpt" as const)
                : article.contentScope
              : ("link" as const),
            author:
              article.author ||
              data.sources.find((s) => s.id === article.sourceId)?.name ||
              "手动导入",
            provenance: initial
              ? initial.provenance + " · 手动补充"
              : "手动导入",
          };
          setData((d) => ({
            ...d,
            articles: initial
              ? d.articles.map((x) => (x.id === a.id ? a : x))
              : [a, ...d.articles],
          }));
          notify("内容已保存");
          onClose();
        }}
      >
        <Field label="标题">
          <input
            required
            autoFocus
            maxLength={500}
            value={article.title}
            onChange={(e) =>
              setArticle((a) => ({ ...a, title: e.target.value }))
            }
          />
        </Field>
        <Field label="原文链接">
          <input
            value={article.url}
            onChange={(e) => setArticle((a) => ({ ...a, url: e.target.value }))}
            placeholder={
              kind === "x"
                ? "https://x.com/…/status/…"
                : "https://mp.weixin.qq.com/s/…"
            }
          />
        </Field>
        <div className="form-grid">
          <Field label="所属订阅">
            <select
              value={article.sourceId}
              onChange={(e) =>
                setArticle((a) => ({ ...a, sourceId: e.target.value }))
              }
            >
              <option value="">手动收藏</option>
              {data.sources
                .filter((s) => s.kind === kind)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="内容范围">
            <select
              value={article.contentScope}
              onChange={(e) =>
                setArticle((a) => ({
                  ...a,
                  contentScope: e.target.value as Article["contentScope"],
                }))
              }
            >
              <option value="link">仅链接</option>
              <option value="excerpt">摘要 / 节选</option>
              <option value="full">完整正文</option>
            </select>
          </Field>
        </div>
        <Field
          label="正文或节选"
          hint="粘贴正文后可交给助手翻译或总结。只有链接时，助手不会假装已读全文。"
        >
          <textarea
            rows={10}
            maxLength={100000}
            value={article.content}
            onChange={(e) =>
              setArticle((a) => ({ ...a, content: e.target.value }))
            }
          />
        </Field>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            取消
          </button>
          <button className="primary">保存内容</button>
        </div>
      </form>
    </Modal>
  );
}
const stamp = (a: Article) =>
  a.publishedAt
    ? new Date(a.publishedAt).toLocaleDateString("zh-CN")
    : a.indexedAt
      ? new Date(a.indexedAt).toLocaleDateString("zh-CN") + " 收录"
      : "原文日期未提供";
export function FeedsPage({ kind }: { kind: "x" | "wechat" }) {
  const {
    data,
    setData,
    secrets,
    notify,
    askAssistant,
    editTask,
    query,
    navigate,
  } = useApp();
  const [selected, setSelected] = useState("all");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [sourceEditor, setSourceEditor] = useState<Source | null | undefined>();
  const [articleEditor, setArticleEditor] = useState<
    Article | null | undefined
  >();
  const [reading, setReading] = useState<string>("");
  const [search, setSearch] = useState("");
  const refreshLock = useRef(false);
  const refreshController = useRef<AbortController | null>(null);
  const lastCheck = useRef(0);
  const [visibleCount, setVisibleCount] = useState(50);
  const sources = data.sources.filter((s) => s.kind === kind);
  const articles = data.articles
    .filter(
      (a) =>
        a.kind === kind &&
        (selected === "all" || a.sourceId === selected) &&
        (filter !== "unread" || !a.read) &&
        (filter !== "saved" || a.saved) &&
        `${a.title} ${a.content} ${a.author}`
          .toLowerCase()
          .includes((query || search).toLowerCase()),
    )
    .sort((a, b) =>
      (b.publishedAt || b.indexedAt || "").localeCompare(
        a.publishedAt || a.indexedAt || "",
      ),
    );
  const active = data.articles.find((a) => a.id === reading);
  const addToReport = (id: string) => {
    try {
      setData(queueReading(data, id));
      navigate("weekly");
      notify("已加入本周周报，可补充阅读笔记");
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const source = sources.find((s) => s.id === selected);
  async function refresh(quiet = false, all = false) {
    if (refreshLock.current) return;
    refreshLock.current = true;
    setBusy(true);
    const controller = new AbortController();
    refreshController.current = controller;
    lastCheck.current = Date.now();
    let success = 0;
    try {
      for (const s of !all && source ? [source] : sources) {
        if (controller.signal.aborted) return;
        try {
          const result = await fetchSource(
            s,
            data.settings,
            secrets,
            controller.signal,
          );
          if (controller.signal.aborted) return;
          success++;
          setData((d) => applyFeedResult(d, s.id, result));
        } catch (e) {
          if (controller.signal.aborted) return;
          const message = (e as Error).message;
          setData((d) => ({
            ...d,
            sources: d.sources.map((x) =>
              x.id === s.id ? { ...x, error: message } : x,
            ),
          }));
          if (!quiet) notify(`${s.name}：${message}`);
        }
      }
      if (success && !quiet)
        notify("检查完成；新增数量、实时连接或缓存状态见页面下方。");
    } finally {
      refreshLock.current = false;
      setBusy(false);
    }
  }
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    const minutes =
      kind === "wechat"
        ? data.settings.wechatRefresh
        : data.settings.autoRefresh;
    const initial = setTimeout(() => {
      if (kind === "wechat") void refreshRef.current(true, true);
    }, 0);
    const onVisible = () => {
      if (
        minutes &&
        document.visibilityState === "visible" &&
        Date.now() - lastCheck.current >= minutes * 60000
      )
        void refreshRef.current(true, true);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const id = setInterval(
      () => {
        if (minutes && document.visibilityState === "visible")
          void refreshRef.current(true, true);
      },
      (minutes || 60) * 60000,
    );
    return () => {
      clearTimeout(initial);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [data.settings.autoRefresh, data.settings.wechatRefresh, kind]);
  useEffect(() => () => refreshController.current?.abort(), []);
  useEffect(() => setVisibleCount(50), [selected, filter, search, query]);
  const update = (id: string, p: Partial<Article>) =>
    setData((d) => ({
      ...d,
      articles: d.articles.map((a) => (a.id === id ? { ...a, ...p } : a)),
    }));
  const open = (a: Article) => {
    setReading(a.id);
    update(a.id, { read: true });
  };
  const sourceErrors = (source ? [source] : sources).filter((s) => s.error);
  const last = (source ? [source] : sources)
    .map((s) => s.lastFetched)
    .filter(Boolean)
    .sort()
    .reverse()[0];
  return (
    <>
      <Heading
        eyebrow={
          kind === "x"
            ? "SIGNALS, WITHOUT THE NOISE"
            : "READ SLOWLY. THINK DEEPLY."
        }
        title={kind === "x" ? "值得关注的，新进展。" : "读一点，想远一点。"}
        description={
          kind === "x"
            ? "关注研究者与产品动态，把有价值的信息留下。"
            : "公众号文章、研究方法与灵感，放进你的阅读空间。"
        }
        action={
          <button className="primary" onClick={() => setSourceEditor(null)}>
            <Plus size={18} />
            添加订阅
          </button>
        }
      />
      <div className="feed-layout">
        <aside className="feed-sidebar">
          <div className="section-heading">
            <h3>我的订阅</h3>
            <span className="count-badge">{sources.length}</span>
          </div>
          <button
            className={"source-item " + (selected === "all" ? "selected" : "")}
            onClick={() => {
              setSelected("all");
              setReading("");
            }}
          >
            {kind === "x" ? <Radio size={17} /> : <BookOpen size={17} />}
            全部内容
            <span>
              {data.articles.filter((a) => a.kind === kind && !a.read).length}
            </span>
          </button>
          {sources.map((s) => (
            <div
              className={"source-row " + (selected === s.id ? "selected" : "")}
              key={s.id}
            >
              <button
                className="source-item"
                onClick={() => {
                  setSelected(s.id);
                  setReading("");
                }}
              >
                <span className={"source-avatar " + kind}>
                  {s.name.slice(0, 1)}
                </span>
                <span className="source-name">
                  {s.name}
                  <small>
                    {s.kind === "x"
                      ? "@" + s.handle
                      : s.id === "wechat-rsdl"
                        ? "RSDL 公开目录"
                        : "公众号订阅"}
                  </small>
                </span>
              </button>
              <button
                className="icon-button"
                aria-label={"编辑订阅 " + s.name}
                onClick={() => setSourceEditor(s)}
              >
                <Settings2 size={14} />
              </button>
            </div>
          ))}
          <button
            className="text-button add-source"
            onClick={() => setSourceEditor(null)}
          >
            <Plus size={15} />
            添加一个新来源
          </button>
          <div className="feed-sidebar-foot">
            <h4>让信息产生下一步。</h4>
            <p>
              收藏想重读的内容，
              <br />
              或把一个想法变成待办。
            </p>
            {last && (
              <small>
                上次检查
                <br />
                {new Date(last).toLocaleString("zh-CN")}
              </small>
            )}
          </div>
        </aside>
        <section className="feed-main">
          <div className="feed-toolbar">
            <div className="segmented">
              {[
                ["all", "全部"],
                ["unread", "未读"],
                ["saved", "已收藏"],
              ].map(([f, label]) => (
                <button
                  className={filter === f ? "selected" : ""}
                  key={f}
                  onClick={() => {
                    setFilter(f);
                    setReading("");
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="button-group">
              <button
                className="secondary compact"
                onClick={() => setArticleEditor(null)}
              >
                <FilePlus2 size={15} />
                导入
              </button>
              <button
                className="secondary compact"
                onClick={() => void refresh()}
                disabled={busy}
              >
                <RefreshCw size={15} className={busy ? "spin" : ""} />
                {busy ? "检查中" : "检查更新"}
              </button>
            </div>
          </div>
          <div className="feed-search">
            <Search size={16} />
            <input
              aria-label="搜索当前订阅内容"
              placeholder={
                kind === "x"
                  ? "搜索动态中的关键词…"
                  : "搜索文章、方法或研究方向…"
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span>
              {articles.length} {kind === "x" ? "条动态" : "篇内容"}
            </span>
          </div>
          {sourceErrors.map((s) => (
            <Notice key={s.id} tone="warning">
              <strong>{s.name}更新未完成</strong>
              <br />
              {s.error}
              <button
                className="text-button"
                onClick={() => navigate("settings")}
              >
                查看连接设置 <ArrowUpRight size={13} />
              </button>
            </Notice>
          ))}
          {kind === "x" && !secrets.xKey && (
            <Notice>
              预设内容为公开帖快照，不代表完整时间线。接入个人 X API Token 或
              RSS 后可获取近期动态。
              <ExternalLink url="https://x.com/thsottiaux">
                打开 Tibo 主页
              </ExternalLink>
            </Notice>
          )}
          {kind === "wechat" && (
            <>
              <div className="feed-auto-bar">
                <label>
                  自动检查{" "}
                  <select
                    aria-label="公众号自动检查间隔"
                    value={data.settings.wechatRefresh}
                    onChange={(e) =>
                      setData((d) => ({
                        ...d,
                        settings: {
                          ...d.settings,
                          wechatRefresh: Number(e.target.value),
                        },
                      }))
                    }
                  >
                    {[
                      [0, "仅进入页面 / 手动"],
                      [1, "每 1 分钟"],
                      [5, "每 5 分钟"],
                      [15, "每 15 分钟"],
                      [30, "每 30 分钟"],
                      [60, "每小时"],
                    ].map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <span>进入页面即检查，后台暂停，返回后补查。</span>
              </div>
              {(source ? [source] : sources).map(
                (s) =>
                  s.sync && (
                    <div
                      className={
                        "feed-sync-status " +
                        (s.sync.mode === "snapshot" ? "cached" : "")
                      }
                      key={s.id}
                      role="status"
                    >
                      <strong>
                        {s.name} ·{" "}
                        {s.sync.mode === "snapshot"
                          ? "部署缓存"
                          : s.sync.mode === "bridge"
                            ? "本机服务读取"
                            : "实时目录已连接"}
                      </strong>
                      <span>
                        本次新增 {s.sync.added || 0} 篇 · 检查于{" "}
                        {new Date(s.sync.checkedAt).toLocaleString("zh-CN")}
                      </span>
                      {s.sync.mode === "snapshot" && (
                        <span>
                          缓存采集时间：
                          {s.sync.dataAt
                            ? new Date(s.sync.dataAt).toLocaleString("zh-CN")
                            : "未知"}
                        </span>
                      )}
                      {s.sync.latestItemAt && (
                        <span>
                          目录最新收录：
                          {new Date(s.sync.latestItemAt).toLocaleString(
                            "zh-CN",
                          )}
                          {Date.now() - Date.parse(s.sync.latestItemAt) >
                          7 * 86400000
                            ? " · 上游目录近期未收录新内容，可能落后于微信端。"
                            : ""}
                        </span>
                      )}
                      {s.sync.warning && <p>{s.sync.warning}</p>}
                    </div>
                  ),
              )}
              <Notice>
                RSDL
                直接读取公开完整目录，包含期刊、会议、论文赏读等。目录收录时间不等于微信发布时间，更新取决于上游收录；正文需打开原文或手动补充。
                <ExternalLink url="https://rsdl.info/">
                  查看来源目录
                </ExternalLink>
              </Notice>
            </>
          )}
          {active && kind === "wechat" ? (
            <article className="reader-panel">
              <button className="text-button" onClick={() => setReading("")}>
                ← 返回文章列表
              </button>
              <div className="reader-meta">
                {active.author} · {stamp(active)}
              </div>
              <h2>{active.title}</h2>
              <div className="reader-actions">
                <ExternalLink url={active.url}>打开原文</ExternalLink>
                <button
                  className="text-button"
                  onClick={() => addToReport(active.id)}
                >
                  <FilePlus2 size={15} />
                  加入本周周报
                </button>
                <button
                  className="text-button"
                  onClick={() => setArticleEditor(active)}
                >
                  <PencilIcon />
                  补充正文
                </button>
                <button
                  className="text-button"
                  disabled={!active.content}
                  onClick={() =>
                    askAssistant(
                      "请总结这篇文章的关键观点、方法与局限。",
                      active,
                    )
                  }
                >
                  <Sparkles size={15} />
                  总结文章
                </button>
                <button
                  className="text-button"
                  onClick={() => update(active.id, { saved: !active.saved })}
                >
                  <Bookmark
                    size={15}
                    fill={active.saved ? "currentColor" : "none"}
                  />
                  {active.saved ? "已收藏" : "收藏"}
                </button>
              </div>
              <span className="content-scope">{scopeLabel(active)}</span>
              {active.content ? (
                <div className="article-content">{active.content}</div>
              ) : (
                <Empty icon={<Link2 size={24} />} heading="已收录原文链接">
                  目录未提供文章正文。
                  <br />
                  打开原文阅读，或补充内容后交给助手总结。
                </Empty>
              )}
              {active.summary && (
                <div className="ai-result">
                  <small>AI 摘要 · 请结合原文判断</small>
                  <div>{active.summary}</div>
                </div>
              )}
            </article>
          ) : (
            <div className={kind === "x" ? "tweet-list" : "article-list"}>
              {articles.slice(0, visibleCount).map((a, i) =>
                kind === "x" ? (
                  <article className="tweet-card" key={a.id}>
                    <div className="tweet-header">
                      <span className="source-avatar x">
                        {a.author.slice(0, 1) || "X"}
                      </span>
                      <div>
                        <strong>{a.author}</strong>
                        <small>{stamp(a)}</small>
                      </div>
                      <span className="tweet-logo">𝕏</span>
                    </div>
                    <p className="tweet-content">{a.content || a.title}</p>
                    {a.translation && (
                      <div className="translation-block">
                        <small>中文译文 · AI</small>
                        <p>{a.translation}</p>
                      </div>
                    )}
                    <span className="content-scope">
                      {scopeLabel(a)} · {a.provenance}
                    </span>
                    {a.provenanceUrl && (
                      <ExternalLink
                        url={a.provenanceUrl}
                        className="text-button"
                      >
                        查看索引来源
                      </ExternalLink>
                    )}
                    <div className="article-actions">
                      <button
                        className="text-button"
                        disabled={!a.content}
                        onClick={() => askAssistant("翻译成中文", a)}
                      >
                        <Languages size={15} />
                        {a.translation ? "重新翻译" : "翻译"}
                      </button>
                      <button
                        className="text-button"
                        onClick={() => update(a.id, { saved: !a.saved })}
                      >
                        <Bookmark
                          size={15}
                          fill={a.saved ? "currentColor" : "none"}
                        />
                        {a.saved ? "已收藏" : "收藏"}
                      </button>
                      <button
                        className="text-button"
                        onClick={() => {
                          editTask({
                            title: "跟进：" + a.title.slice(0, 100),
                            notes: a.url,
                            project: "论文阅读",
                            sourceUrl: a.url,
                          });
                        }}
                      >
                        <Plus size={15} />
                        转为待办
                      </button>
                      <button
                        className="text-button"
                        onClick={() => update(a.id, { read: !a.read })}
                      >
                        <CheckCheck size={15} />
                        {a.read ? "已读" : "标为已读"}
                      </button>
                      <ExternalLink url={a.url}>原帖</ExternalLink>
                    </div>
                  </article>
                ) : (
                  <article
                    className={"reading-card " + (a.read ? "is-read" : "")}
                    key={a.id}
                  >
                    <div className="reading-index">
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div className="reading-details">
                      <div className="reading-meta">
                        <span>{a.author}</span>
                        <span>{stamp(a)}</span>
                        {!a.read && <span className="unread-label">未读</span>}
                      </div>
                      <button className="article-title" onClick={() => open(a)}>
                        {a.title}
                      </button>
                      {a.content && <p>{a.content.slice(0, 120)}</p>}
                      <div className="article-actions">
                        <button className="text-button" onClick={() => open(a)}>
                          <BookOpen size={14} />
                          阅读
                        </button>
                        <button
                          className="text-button"
                          onClick={() => update(a.id, { saved: !a.saved })}
                        >
                          <Bookmark
                            size={14}
                            fill={a.saved ? "currentColor" : "none"}
                          />
                          {a.saved ? "已收藏" : "收藏"}
                        </button>
                        <button
                          className="text-button"
                          onClick={() =>
                            editTask({
                              title: "阅读：" + a.title,
                              notes: a.url,
                              project: "论文阅读",
                              sourceUrl: a.url,
                            })
                          }
                        >
                          <Plus size={14} />
                          转为待办
                        </button>
                        <ExternalLink url={a.url}>原文</ExternalLink>
                      </div>
                    </div>
                  </article>
                ),
              )}
              {articles.length > visibleCount && (
                <button
                  className="secondary"
                  onClick={() => setVisibleCount((n) => n + 50)}
                >
                  再显示 50 篇（已显示 {Math.min(visibleCount, articles.length)}{" "}
                  / {articles.length}）
                </button>
              )}
              {!articles.length && (
                <Empty
                  icon={
                    kind === "x" ? <Radio size={27} /> : <BookOpen size={27} />
                  }
                  heading="给灵感留一个位置。"
                  action={
                    <button
                      className="text-button"
                      onClick={() => setArticleEditor(null)}
                    >
                      导入第一条内容 <ArrowUpRight size={15} />
                    </button>
                  }
                >
                  添加订阅并连接数据源，或先导入一条链接。
                </Empty>
              )}
            </div>
          )}
        </section>
      </div>
      {sourceEditor !== undefined && (
        <SourceEditor
          kind={kind}
          initial={sourceEditor || undefined}
          onClose={() => setSourceEditor(undefined)}
        />
      )}{" "}
      {articleEditor !== undefined && (
        <ArticleEditor
          kind={kind}
          initial={articleEditor || undefined}
          onClose={() => setArticleEditor(undefined)}
        />
      )}
    </>
  );
}
function scopeLabel(a: Article) {
  return { full: "完整正文", excerpt: "节选内容", link: "仅原文链接" }[
    a.contentScope
  ];
}
function PencilIcon() {
  return <FilePlus2 size={15} />;
}
