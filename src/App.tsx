import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  Radio,
  BookOpen,
  Cpu,
  Settings,
  Search,
  HardDrive,
  Sun,
  Moon,
  PanelLeftClose,
  Sparkles,
  X,
  CheckCircle,
  FilePenLine,
} from "lucide-react";
import { AppProvider, usePersistedData } from "./store";
import { dayKey, newTask, toggleTask, validDay } from "./core";
import { TodayPage, CalendarPage, TaskEditor } from "./Tasks";
import { FeedsPage } from "./Feeds";
import { GpuPage } from "./Gpu";
import { SettingsPage } from "./Settings";
import { Assistant } from "./Assistant";
import { Notice } from "./ui";
import type { Page, Secrets, Task, Article } from "./types";
const WeeklyPage = lazy(() => import("./WeeklyPage"));
const navItems = [
  { id: "today", icon: LayoutDashboard, label: "今天" },
  { id: "calendar", icon: CalendarDays, label: "日历与计划" },
  { id: "x", icon: Radio, label: "X 动态" },
  { id: "wechat", icon: BookOpen, label: "公众号阅读" },
  { id: "gpu", icon: Cpu, label: "GPU 资源" },
  { id: "weekly", icon: FilePenLine, label: "写周报" },
] as const;
const pageFromHash = (): Page => {
  const p = location.hash.replace(/^#\/?/, "").split("?")[0];
  return [
    "today",
    "calendar",
    "x",
    "wechat",
    "gpu",
    "weekly",
    "settings",
  ].includes(p)
    ? (p as Page)
    : "today";
};
export default function App() {
  const { data, setData, storageError, recoverStorage } = usePersistedData();
  const [secrets, setSecrets] = useState<Secrets>({
    aiKey: "",
    bridgeKey: "",
    xKey: "",
  });
  const [page, setPage] = useState<Page>(pageFromHash);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [editing, setEditing] = useState<Partial<Task> | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [assistantArticle, setAssistantArticle] = useState<Article>();
  const [trigger, setTrigger] = useState(0);
  const [hint, setHint] = useState(false);
  const [now, setNow] = useState(new Date());
  const searchRef = useRef<HTMLInputElement>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const navigate = (p: Page) => {
    location.hash = "/" + p;
    setPage(p);
    setQuery("");
  };
  const notify = (s: string) => setToast(s);
  const askAssistant = (prompt = "", article?: Article) => {
    setAssistantPrompt(prompt);
    setAssistantArticle(article);
    setTrigger((n) => n + 1);
    setAssistantOpen(true);
    setHint(false);
  };
  useEffect(() => {
    const change = () => {
      setPage(pageFromHash());
      setQuery("");
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = data.settings.theme;
    document.title = `${navItems.find((n) => n.id === page)?.label || "设置与数据"} · MyLab`;
  }, [data.settings.theme, page]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        setAssistantOpen((v) => !v);
      }
      if (e.key === "Escape") setAssistantOpen(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!data.settings.assistantHints) return;
    const id = setTimeout(() => setHint(true), 45000);
    return () => clearTimeout(id);
  }, [data.settings.assistantHints]);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const due = dataRef.current.tasks.filter(
      (t) =>
        !t.completedAt &&
        t.reminder &&
        new Date(t.reminder) <= now &&
        !dataRef.current.notified.includes(t.id + ":" + t.reminder),
    );
    if (!due.length) return;
    setData((d) => ({
      ...d,
      notified: [
        ...d.notified,
        ...due.map((t) => t.id + ":" + t.reminder),
      ].slice(-5000),
    }));
    setToast(`待办提醒：${due.map((t) => t.title).join("、")}`);
    if ("Notification" in window && Notification.permission === "granted") {
      due.forEach((t) => {
        try {
          new Notification("MyLab 待办提醒", {
            body: t.title,
            tag: t.id,
            icon: "./favicon.svg",
          });
        } catch {}
      });
    }
  }, [now, setData]);
  useEffect(() => {
    let alive = true;
    async function load() {
      for (const name of ["rsdl", "x"]) {
        try {
          const r = await fetch(`./data/${name}.json`, { cache: "no-cache" });
          if (!r.ok) continue;
          const j = await r.json();
          if (!alive || !Array.isArray(j.items)) continue;
          const valid = j.items.filter(
            (a: Article) =>
              a &&
              typeof a.id === "string" &&
              typeof a.title === "string" &&
              typeof a.content === "string" &&
              typeof a.url === "string" &&
              ["x", "wechat"].includes(a.kind),
          );
          setData((d) => {
            const ids = new Set(d.articles.map((a) => a.id));
            const fresh = valid.filter((a: Article) => !ids.has(a.id));
            return {
              ...d,
              articles: [...d.articles, ...fresh],
              sources: d.sources.map((s) =>
                s.id === j.sourceId && !s.lastFetched
                  ? { ...s, lastFetched: j.fetchedAt }
                  : s,
              ),
            };
          });
        } catch {}
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [setData]);
  useEffect(() => {
    type Context = { registerTool: (tool: unknown, options: unknown) => void };
    const context = (document as unknown as { modelContext?: Context })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const nextFrame = () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const tools = [
      {
        name: "list_tasks",
        title: "读取待办",
        description: "读取本机任务，不包含接口或密钥。",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: () => ({
          tasks: dataRef.current.tasks.map(
            ({ id, title, date, time, deadline, repeat, completedAt }) => ({
              id,
              title,
              date,
              time,
              deadline,
              repeat,
              completedAt,
            }),
          ),
        }),
      },
      {
        name: "add_tasks",
        title: "创建待办",
        description: "创建一条或多条本机待办，立即显示在工作台。",
        inputSchema: {
          type: "object",
          properties: {
            tasks: {
              type: "array",
              minItems: 1,
              maxItems: 20,
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  date: { type: "string" },
                },
                required: ["title"],
                additionalProperties: false,
              },
            },
          },
          required: ["tasks"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute: async (input: unknown) => {
          const q = input as { tasks: Partial<Task>[] };
          if (
            !q ||
            !Array.isArray(q.tasks) ||
            q.tasks.length < 1 ||
            q.tasks.length > 20 ||
            q.tasks.some(
              (t) =>
                !t ||
                typeof t.title !== "string" ||
                !t.title.trim() ||
                t.title.length > 500 ||
                (t.date !== undefined && !validDay(t.date)),
            )
          )
            throw Error("需要 1–20 条有效待办，日期格式为 YYYY-MM-DD");
          const tasks = q.tasks.map((t) =>
            newTask({ title: t.title!, ...(t.date ? { date: t.date } : {}) }),
          );
          setData((d) => ({ ...d, tasks: [...d.tasks, ...tasks] }));
          navigate("today");
          await nextFrame();
          return { created: tasks.map((t) => ({ id: t.id, title: t.title })) };
        },
      },
      {
        name: "complete_tasks",
        title: "完成待办",
        description: "将指定未完成任务标记为完成，重复任务自动生成下一次。",
        inputSchema: {
          type: "object",
          properties: {
            ids: {
              type: "array",
              items: { type: "string" },
              minItems: 1,
              maxItems: 20,
            },
          },
          required: ["ids"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute: async (input: unknown) => {
          const q = input as { ids: string[] };
          if (
            !q ||
            !Array.isArray(q.ids) ||
            q.ids.length < 1 ||
            q.ids.length > 20 ||
            q.ids.some(
              (id) =>
                typeof id !== "string" ||
                !dataRef.current.tasks.some((t) => t.id === id),
            )
          )
            throw Error("任务 ID 无效");
          setData((d) => ({
            ...d,
            tasks: [...new Set(q.ids)].reduce(
              (list, id) =>
                list.find((t) => t.id === id)?.completedAt
                  ? list
                  : toggleTask(list, id),
              d.tasks,
            ),
          }));
          await nextFrame();
          return { completed: q.ids };
        },
      },
    ];
    for (const tool of tools) {
      try {
        Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    }
    return () => lifecycle.abort();
  }, [setData]);
  const pageLabel = navItems.find((n) => n.id === page)?.label || "设置与数据";
  const activeCount = data.tasks.filter(
    (t) => !t.completedAt && (!t.date || t.date <= dayKey()),
  ).length;
  return (
    <AppProvider
      value={{
        data,
        setData,
        secrets,
        setSecrets,
        page,
        navigate,
        notify,
        editTask: setEditing,
        askAssistant,
        query,
        setQuery,
      }}
    >
      <div className="app-shell">
        <aside className="sidebar">
          <a className="brand" href="#/today">
            <span className="brand-mark">M</span>
            <span>
              MyLab<small>PERSONAL WORKSPACE</small>
            </span>
          </a>
          <div className="workspace-label">
            我的工作空间 <PanelLeftClose size={15} />
          </div>
          <nav>
            {navItems.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                title={label}
                aria-label={label}
                aria-current={page === id ? "page" : undefined}
                className={"nav-item " + (page === id ? "active" : "")}
                onClick={() => navigate(id)}
              >
                <Icon size={19} />
                <span>{label}</span>
                {id === "today" && (
                  <span className="nav-count">{activeCount}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="sidebar-note">
            <span className="tiny-label">留一点空间，专注重要的事。</span>
            <p>计划 · 阅读 · 实验</p>
          </div>
          <div className="sidebar-bottom">
            <button
              title="设置与数据"
              className={"nav-item " + (page === "settings" ? "active" : "")}
              onClick={() => navigate("settings")}
            >
              <Settings size={18} />
              <span>设置与数据</span>
            </button>
            <div className="profile">
              <span className="avatar">CZ</span>
              <div>
                <strong>{data.settings.name}</strong>
                <small>个人工作台</small>
              </div>
              <HardDrive size={16} />
            </div>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <span>
              工作台 <span className="muted">/</span>
              <strong>{pageLabel}</strong>
            </span>
            <div className="topbar-right">
              <label className="search-shell">
                <Search size={16} />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => {
                    if (!["today", "x", "wechat"].includes(page))
                      navigate("today");
                    setQuery(e.target.value);
                  }}
                  placeholder="搜索当前任务或文章"
                  aria-label="搜索任务或文章"
                />
                <kbd>Ctrl K</kbd>
              </label>
              <button
                className="icon-button"
                aria-label="切换深浅色"
                onClick={() =>
                  setData((d) => ({
                    ...d,
                    settings: {
                      ...d.settings,
                      theme: d.settings.theme === "light" ? "dark" : "light",
                    },
                  }))
                }
              >
                {data.settings.theme === "light" ? (
                  <Sun size={19} />
                ) : (
                  <Moon size={19} />
                )}
              </button>
              <span className="local-badge">
                <HardDrive size={13} />
                本机保存
              </span>
            </div>
          </header>
          <main>
            {storageError && <Notice tone="warning">{storageError}</Notice>}
            {page === "today" ? (
              <TodayPage />
            ) : page === "calendar" ? (
              <CalendarPage />
            ) : page === "x" ? (
              <FeedsPage key="x" kind="x" />
            ) : page === "wechat" ? (
              <FeedsPage key="wechat" kind="wechat" />
            ) : page === "gpu" ? (
              <GpuPage />
            ) : page === "weekly" ? (
              <Suspense fallback={<Notice>正在打开周报工作台…</Notice>}>
                <WeeklyPage />
              </Suspense>
            ) : (
              <SettingsPage recoverStorage={recoverStorage} />
            )}
          </main>
          <footer className="page-footer">
            <span>MyLab · 让研究有条不紊</span>
            <span>数据保存在此浏览器</span>
          </footer>
        </div>
        {!assistantOpen && (
          <>
            {hint && data.settings.assistantHints && (
              <div className="assistant-hint">
                <button onClick={() => askAssistant()}>
                  需要一起理清思路吗？
                </button>
                <button
                  aria-label="关闭助手提示"
                  onClick={() => setHint(false)}
                >
                  <X size={14} />
                </button>
              </div>
            )}
            <button
              className="assistant-fab"
              aria-label="呼出助手"
              title="助手 · Ctrl /"
              onClick={() => askAssistant()}
            >
              <Sparkles size={22} />
            </button>
          </>
        )}
        <Assistant
          open={assistantOpen}
          onClose={() => setAssistantOpen(false)}
          prompt={assistantPrompt}
          article={assistantArticle}
          trigger={trigger}
        />
        {editing && (
          <TaskEditor initial={editing} onClose={() => setEditing(null)} />
        )}{" "}
        {toast && (
          <div className="toast" role="status">
            <CheckCircle size={18} />
            <span>{toast}</span>
            <button
              className="icon-button"
              aria-label="关闭提示"
              onClick={() => setToast("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </AppProvider>
  );
}
