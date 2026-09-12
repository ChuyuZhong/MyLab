import type { AppData, Task, Repeat } from "./types.ts";
export const DAY = 86_400_000;
export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const parseDay = (s: string) => new Date(`${s}T12:00:00`);
export const addDays = (s: string, n: number) => {
  const d = parseDay(s);
  d.setDate(d.getDate() + n);
  return dayKey(d);
};
export const dateLabel = (s: string) =>
  s
    ? parseDay(s.slice(0, 10)).toLocaleDateString("zh-CN", {
        month: "short",
        day: "numeric",
      })
    : "未安排";
export const repeatLabel = (r: Repeat) =>
  ({
    none: "单次",
    daily: "每天",
    weekdays: "工作日",
    weekly: "每周",
    monthly: "每月",
  })[r];
export function defaultData(): AppData {
  return {
    version: 1,
    tasks: [],
    events: [],
    articles: [],
    requests: [],
    notified: [],
    reports: [],
    sources: [
      {
        id: "x-tibo",
        kind: "x",
        name: "Tibo",
        handle: "thsottiaux",
        url: "https://x.com/thsottiaux",
        feedUrl: "",
      },
      {
        id: "wechat-rsdl",
        kind: "wechat",
        name: "遥感与深度学习",
        handle: "",
        url: "",
        feedUrl: "",
      },
    ],
    settings: {
      name: "我的实验室",
      theme: "light",
      aiBase: "https://api.deepseek.com",
      aiModel: "deepseek-flash",
      translationPrompt:
        "将以下内容翻译为简体中文，保留原意、段落、链接、代码及必要的专业术语，不补充原文没有的信息。仅返回译文。",
      bridgeUrl: "http://127.0.0.1:4318",
      gpuUrl: "",
      feedMode: "bridge",
      autoRefresh: 0,
      wechatRefresh: 5,
      assistantHints: true,
    },
  };
}
export function newTask(
  input: Partial<Task> & { title: string },
  now = new Date(),
): Task {
  return {
    id: crypto.randomUUID(),
    notes: "",
    project: "个人",
    priority: 2,
    date: dayKey(now),
    time: "",
    deadline: "",
    reminder: "",
    repeat: "none",
    repeatDays: [],
    repeatUntil: "",
    createdAt: now.toISOString(),
    ...input,
    title: input.title.trim(),
  };
}
export function parseQuickTask(
  text: string,
  now = new Date(),
): Partial<Task> & { title: string } {
  let title = text.trim(),
    date = dayKey(now),
    time = "",
    repeat: Repeat = "none",
    repeatDays: number[] = [];
  const weekdays: Record<string, number> = {
    日: 0,
    天: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
  };
  const weekly = title.match(/每周([一二三四五六日天])/);
  if (weekly) {
    repeat = "weekly";
    repeatDays = [weekdays[weekly[1]]];
    let delta = (repeatDays[0] - now.getDay() + 7) % 7;
    date = addDays(date, delta);
    title = title.replace(weekly[0], "");
  } else if (title.includes("每天")) {
    repeat = "daily";
    title = title.replace("每天", "");
  } else if (title.includes("工作日")) {
    repeat = "weekdays";
    title = title.replace(/每个工作日|每工作日|工作日/, "");
    while ([0, 6].includes(parseDay(date).getDay())) date = addDays(date, 1);
  } else {
    const week = title.match(/(下周|周)([一二三四五六日天])/);
    if (week) {
      const wd = weekdays[week[2]];
      const monday = addDays(dayKey(now), -((now.getDay() + 6) % 7));
      date = addDays(monday, ((wd + 6) % 7) + (week[1] === "下周" ? 7 : 0));
      if (week[1] === "周" && date < dayKey(now)) date = addDays(date, 7);
      title = title.replace(week[0], "");
    }
  }
  for (const [word, days] of [
    ["后天", 2],
    ["明天", 1],
    ["今天", 0],
  ] as const) {
    if (title.includes(word)) {
      date = addDays(dayKey(now), days);
      title = title.replace(word, "");
      break;
    }
  }
  const exact = title.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (exact && validDay(exact[1])) {
    date = exact[1];
    title = title.replace(exact[0], "");
  }
  const clock = title.match(
    /(上午|下午|晚上|早上|中午)?\s*(\d{1,2})[:：](\d{2})/,
  );
  const cnClock = title.match(
    /(上午|下午|晚上|早上|中午)?([一二三四五六七八九十两\d]{1,3})点(半|\d{1,2}分?)?/,
  );
  if (clock) {
    let h = Number(clock[2]);
    if (["下午", "晚上"].includes(clock[1]) && h < 12) h += 12;
    const m = Number(clock[3]);
    if (h < 24 && m < 60) {
      time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      title = title.replace(clock[0], "");
    }
  } else if (cnClock) {
    const nums: Record<string, number> = {
      一: 1,
      二: 2,
      两: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
      十: 10,
      十一: 11,
      十二: 12,
    };
    let h = nums[cnClock[2]] ?? Number(cnClock[2]);
    if (["下午", "晚上"].includes(cnClock[1]) && h < 12) h += 12;
    if (cnClock[1] === "中午" && h < 11) h += 12;
    const m = cnClock[3] === "半" ? 30 : parseInt(cnClock[3] || "0");
    if (h < 24 && m < 60) {
      time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      title = title.replace(cnClock[0], "");
    }
  }
  return { title: title.trim() || text.trim(), date, time, repeat, repeatDays };
}
export function nextTaskDate(task: Task, now = new Date()): string | undefined {
  if (task.repeat === "none" || !task.date) return;
  const after = task.date > dayKey(now) ? task.date : dayKey(now);
  if (task.repeat === "monthly") {
    const anchor = task.anchorDay || Number(task.date.slice(8));
    let d = parseDay(task.date);
    for (let i = 0; i < 2400; i++) {
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1, 12);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const key = dayKey(
        new Date(d.getFullYear(), d.getMonth(), Math.min(anchor, end), 12),
      );
      if (key > after)
        return task.repeatUntil && key > task.repeatUntil ? undefined : key;
    }
    return;
  }
  for (let i = 1; i <= 8; i++) {
    const next = addDays(after, i),
      wd = parseDay(next).getDay();
    const matches =
      task.repeat === "daily" ||
      (task.repeat === "weekdays" && wd !== 0 && wd !== 6) ||
      (task.repeat === "weekly" &&
        (task.repeatDays.length
          ? task.repeatDays
          : [parseDay(task.date).getDay()]
        ).includes(wd));
    if (matches)
      return task.repeatUntil && next > task.repeatUntil ? undefined : next;
  }
}
export function toggleTask(
  tasks: Task[],
  id: string,
  now = new Date(),
): Task[] {
  const task = tasks.find((t) => t.id === id);
  if (!task) return tasks;
  if (task.completedAt)
    return tasks
      .filter((t) => !(t.generatedFrom === id && !t.completedAt))
      .map((t) => (t.id === id ? { ...t, completedAt: undefined } : t));
  const next = nextTaskDate(task, now);
  const result = tasks.map((t) =>
    t.id === id ? { ...t, completedAt: now.toISOString() } : t,
  );
  if (next && !tasks.some((t) => t.generatedFrom === id)) {
    let reminder = "";
    if (task.reminder && task.date) {
      const offset =
        new Date(task.reminder).getTime() -
        new Date(`${task.date}T${task.time || "09:00"}`).getTime();
      const d = new Date(
        new Date(`${next}T${task.time || "09:00"}`).getTime() + offset,
      );
      reminder = `${dayKey(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    result.push({
      ...task,
      id: crypto.randomUUID(),
      date: next,
      reminder,
      completedAt: undefined,
      generatedFrom: id,
      seriesId: task.seriesId || task.id,
      anchorDay: task.anchorDay || Number(task.date.slice(8)),
      createdAt: now.toISOString(),
    });
  }
  return result;
}
export function validDay(s: unknown): s is string {
  return (
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !isNaN(parseDay(s).getTime()) &&
    dayKey(parseDay(s)) === s
  );
}
export function safeUrl(value: string, allowLocal = false): string {
  try {
    const u = new URL(value);
    if (u.username || u.password) return "";
    return u.protocol === "https:" ||
      (u.protocol === "http:" &&
        (allowLocal ||
          ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)))
      ? u.href
      : "";
  } catch {
    return "";
  }
}
export function validateBackup(value: unknown): AppData {
  const d = value as AppData;
  if (
    !d ||
    d.version !== 1 ||
    !["tasks", "events", "sources", "articles", "requests", "notified"].every(
      (k) => Array.isArray((d as unknown as Record<string, unknown>)[k]),
    ) ||
    !d.settings
  )
    throw Error("这不是 MyLab v1 备份文件");
  if (d.tasks.length > 20000 || d.articles.length > 20000)
    throw Error("备份数据过大");
  const strings = (obj: object, keys: string[]) =>
    keys.every((k) => typeof (obj as Record<string, unknown>)[k] === "string");
  if (
    d.tasks.some(
      (t) =>
        !strings(t, [
          "id",
          "title",
          "notes",
          "project",
          "date",
          "time",
          "deadline",
          "reminder",
          "repeatUntil",
          "createdAt",
        ]) ||
        !["none", "daily", "weekdays", "weekly", "monthly"].includes(
          t.repeat,
        ) ||
        ![1, 2, 3].includes(t.priority) ||
        !Array.isArray(t.repeatDays) ||
        t.repeatDays.some((n) => !Number.isInteger(n) || n < 0 || n > 6) ||
        (t.date !== "" && !validDay(t.date)) ||
        t.title.length > 500,
    )
  )
    throw Error("备份中的待办格式不正确");
  if (
    d.events.some(
      (e) =>
        !strings(e, ["id", "title", "start", "end", "source", "description"]) ||
        isNaN(Date.parse(e.start)) ||
        isNaN(Date.parse(e.end)),
    )
  )
    throw Error("日历格式不正确");
  if (
    d.sources.some(
      (s) =>
        !strings(s, ["id", "kind", "name", "handle", "url", "feedUrl"]) ||
        !["x", "wechat"].includes(s.kind) ||
        (s.sync !== undefined &&
          (!s.sync ||
            !strings(s.sync, ["mode", "checkedAt", "dataAt", "latestItemAt"]) ||
            !["live", "bridge", "snapshot"].includes(s.sync.mode) ||
            (s.sync.warning !== undefined &&
              typeof s.sync.warning !== "string") ||
            (s.sync.added !== undefined && typeof s.sync.added !== "number"))),
    )
  )
    throw Error("订阅格式不正确");
  if (
    d.articles.some(
      (a) =>
        !strings(a, [
          "id",
          "sourceId",
          "kind",
          "title",
          "content",
          "url",
          "publishedAt",
          "author",
          "provenance",
        ]) ||
        !["x", "wechat"].includes(a.kind) ||
        !["full", "excerpt", "link"].includes(a.contentScope),
    )
  )
    throw Error("文章格式不正确");
  if (
    d.requests.some(
      (r) =>
        !strings(r, ["id", "title", "start", "notes", "createdAt"]) ||
        !["draft", "recorded", "finished"].includes(r.status) ||
        !Number.isFinite(r.count) ||
        !Number.isFinite(r.hours) ||
        !Number.isFinite(r.memory),
    )
  )
    throw Error("申请记录格式不正确");
  const settings = defaultData().settings;
  const reports = d.reports ?? [];
  if (
    !Array.isArray(reports) ||
    reports.length > 520 ||
    reports.some(
      (r) =>
        !r ||
        !strings(r, [
          "id",
          "weekStart",
          "author",
          "work",
          "ideas",
          "nextWeek",
          "other",
          "markdown",
          "updatedAt",
          "generatedBasis",
          "generationMode",
        ]) ||
        !validDay(r.weekStart) ||
        parseDay(r.weekStart).getDay() !== 1 ||
        r.id !== r.weekStart ||
        !["", "local", "ai"].includes(r.generationMode) ||
        typeof r.includeNonDDL !== "boolean" ||
        !Array.isArray(r.articleIds) ||
        r.articleIds.length > 12 ||
        r.articleIds.some((s) => typeof s !== "string") ||
        !Array.isArray(r.taskIds) ||
        r.taskIds.length > 20000 ||
        r.taskIds.some((s) => typeof s !== "string") ||
        !r.readingNotes ||
        typeof r.readingNotes !== "object" ||
        Array.isArray(r.readingNotes) ||
        Object.values(r.readingNotes).some(
          (n) => !n || !strings(n, ["paperTitle", "publication", "notes"]),
        ) ||
        r.markdown.length > 200000 ||
        r.author.length > 80,
    )
  )
    throw Error("备份中的周报格式不正确");
  for (const key of Object.keys(settings) as (keyof typeof settings)[]) {
    if (typeof d.settings[key] === typeof settings[key])
      (settings as unknown as Record<string, unknown>)[key] = d.settings[key];
  }
  if (!["light", "dark"].includes(settings.theme)) settings.theme = "light";
  settings.autoRefresh = [0, 15, 30, 60].includes(settings.autoRefresh)
    ? settings.autoRefresh
    : 0;
  settings.wechatRefresh = [0, 1, 5, 15, 30, 60].includes(
    settings.wechatRefresh,
  )
    ? settings.wechatRefresh
    : 5;
  return {
    version: 1,
    tasks: d.tasks,
    events: d.events,
    sources: d.sources,
    articles: d.articles,
    requests: d.requests,
    notified: d.notified.filter((n) => typeof n === "string"),
    settings,
    reports,
  };
}
export function makeBackup(data: AppData) {
  return {
    ...data,
    settings: {
      ...data.settings,
      bridgeUrl: "http://127.0.0.1:4318",
      gpuUrl: "",
    },
    sources: data.sources.map((s) => ({ ...s, feedUrl: "", error: undefined })),
    notified: [],
  };
}
export function downloadText(
  name: string,
  text: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
