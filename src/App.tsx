import { WechatPage } from "./Wechat";
import { Suspense, useEffect, useRef, useState, type CSSProperties } from "react";
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
  Sparkles,
  X,
  CheckCircle,
  FilePenLine,
} from "lucide-react";
import { AppProvider, usePersistedData } from "./store";
import { dayKey, mergeBackup, newTask, toggleTask, validateBackup, validDay } from "./core";
import { applyConfig, parseConfig, type ImportedConfig } from "./config-transfer";
import { configIsNew, fetchLocalBoot, markConfigApplied, storageWasEmpty } from "./local-boot";
import { WhaleMark } from "./Mascot";
import { MascotPet } from "./MascotPet";
import { emitMascot, markActive } from "./mascot-mood";
import { lazyPage } from "./lazy-page";
import { TodayPage, CalendarPage, TaskEditor } from "./Tasks";
import { FeedsPage } from "./Feeds";
import { GpuPage } from "./Gpu";
import { SettingsPage } from "./Settings";
import { Assistant } from "./Assistant";
import { Notice } from "./ui";
import type { Page, Secrets, Task, Article } from "./types";
const AihotPage = lazyPage(() => import("./AihotPage"));
const WeeklyPage = lazyPage(() => import("./WeeklyPage"));
const navItems = [
  { id: "today", icon: LayoutDashboard, label: "今天" },
  { id: "calendar", icon: CalendarDays, label: "日历与计划" },
  { id: "x", icon: Radio, label: "X 动态" },
  { id: "aihot", icon: Sparkles, label: "AI 情报" },
  { id: "wechat", icon: BookOpen, label: "公众号导读" },
  { id: "gpu", icon: Cpu, label: "GPU 资源" },
  { id: "weekly", icon: FilePenLine, label: "写周报" },
] as const;
// [left %, size px, duration s, delay s] for the bubbles rising through the sidebar.
const BUBBLES = [
  [12, 7, 15, 0],
  [34, 4, 11, 3],
  [58, 9, 18, 6],
  [76, 5, 13, 1.5],
  [88, 6, 16, 9],
  [24, 5, 14, 11],
];
const TIDE_NOTES = [
  "慢慢游，也能抵达深处。",
  "像鲸鱼一样，一次只深潜一件事。",
  "累了就浮上来换口气。",
  "先完成，再完美。",
  "今天也要按时吃饭哦（白米饭）。",
  "灵感会像气泡一样冒出来，记下来就好。",
  "论文读不动的时候，先读摘要。",
];
const EMPTY_SECRETS: Secrets = { aiKey: "", bridgeKey: "", xKey: "" };
const pageFromHash = (): Page => {
  const p = location.hash.replace(/^#\/?/, "").split("?")[0];
  return [
    "today",
    "calendar",
    "x",
    "aihot",
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
  const [now, setNow] = useState(new Date());
  const [localMode, setLocalMode] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const booted = useRef(false);
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
  };
  useEffect(() => {
    emitMascot("greet");
    let last = 0;
    const active = () => {
      const now = Date.now();
      if (now - last < 1500) return;
      last = now;
      markActive();
    };
    const events = ["pointermove", "pointerdown", "keydown", "wheel", "focus"] as const;
    events.forEach((e) => window.addEventListener(e, active, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, active));
  }, []);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void (async () => {
      const boot = await fetchLocalBoot();
      if (!boot) return;
      setLocalMode(true);
      const messages: string[] = [];
      let config: ImportedConfig | null = null;
      if (boot.config) {
        try {
          config = parseConfig(boot.config.text);
        } catch (e) {
          messages.push(`配置 ${boot.config.name} 无法读取：${(e as Error).message}`);
        }
      }
      let fresh = Boolean(config) && configIsNew(boot);
      if (config && fresh) {
        try {
          applyConfig(dataRef.current, EMPTY_SECRETS, config);
        } catch (e) {
          fresh = false;
          messages.push((e as Error).message);
        }
      }
      setData((d) => {
        let next = d;
        if (config && fresh) {
          try {
            next = applyConfig(d, EMPTY_SECRETS, config).data;
          } catch {}
        }
        return { ...next, settings: { ...next.settings, bridgeUrl: location.origin } };
      });
      setSecrets((s) => ({ ...s, ...(config?.secrets || {}), bridgeKey: boot.pairing }));
      if (config && fresh) markConfigApplied(boot);
      if (boot.config && config)
        messages.unshift(
          fresh
            ? `已载入最新配置 ${boot.config.name}，并自动连接本机服务`
            : `已自动连接本机服务，密钥来自 ${boot.config.name}`,
        );
      else if (!boot.config) messages.unshift("已自动连接本机服务；文件夹中还没有 MyLab-settings 配置");
      if (storageWasEmpty) {
        try {
          const r = await fetch("./local/backup", {
            headers: { Authorization: `Bearer ${boot.pairing}` },
            cache: "no-store",
          });
          const j = await r.json();
          if (!r.ok) throw Error(j.error || `HTTP ${r.status}`);
          if (j.backup) {
            const incoming = validateBackup(JSON.parse(j.backup.text));
            setData((d) => mergeBackup(d, incoming));
            messages.push(`已从 ${j.backup.name} 导入 ${incoming.tasks.length} 项待办`);
          }
        } catch (e) {
          messages.push("自动导入备份失败：" + (e as Error).message);
        }
      }
      if (boot.warning) messages.push(boot.warning);
      setToast(messages.join("；"));
    })();
  }, [setData]);
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
    const id = setTimeout(() => emitMascot("hint"), 45000);
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
        localMode,
      }}
    >
      <div className="app-shell">
        <aside className="sidebar">
          <div className="sea-bubbles" aria-hidden="true">
            {BUBBLES.map(([left, size, duration, delay], i) => (
              <i
                key={i}
                style={
                  {
                    left: `${left}%`,
                    "--s": `${size}px`,
                    "--d": `${duration}s`,
                    "--delay": `${delay}s`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
          <a className="brand" href="#/today">
            <span className="brand-mark">
              <WhaleMark size={28} />
            </span>
            <span>
              <strong>MyLab</strong>
              <small>DEEP SEA LAB</small>
            </span>
          </a>
          <div className="workspace-label">工作空间</div>
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
            <strong>小鲸的潮汐便签</strong>
            <p>
              {
                TIDE_NOTES[
                  Math.floor(
                    (now.getTime() - now.getTimezoneOffset() * 60000) /
                      86400000,
                  ) % TIDE_NOTES.length
                ]
              }
            </p>
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
            <span className="crumbs">
              工作台 <span className="crumb-sep">/</span>
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
                className="theme-toggle"
                aria-label="切换深浅色"
                title={data.settings.theme === "light" ? "潜入深海（深色）" : "浮上海面（浅色）"}
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
                  <Moon size={18} />
                ) : (
                  <Sun size={18} />
                )}
              </button>
              <span
                className={"local-badge " + (localMode ? "live" : "")}
                title={localMode ? "页面由本机服务提供，已自动配对" : "数据保存在此浏览器"}
              >
                {localMode ? <span className="dot" /> : <HardDrive size={13} />}
                {localMode ? "本机运行 · 已配对" : "本机保存"}
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
            ) : page === "aihot" ? (
              <Suspense fallback={<Notice>正在打开 AI 情报…</Notice>}><AihotPage /></Suspense>
            ) : page === "wechat" ? (
              <WechatPage />
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
            <span>MyLab · 深海研究所，让研究有条不紊</span>
            <span>{localMode ? "本机运行 · 数据保存在此浏览器" : "数据保存在此浏览器"}</span>
          </footer>
        </div>
        <MascotPet open={assistantOpen} onOpen={() => askAssistant()} />
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
