import { useState } from "react";
import {
  Plus,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Clock,
  Flag,
  Repeat2,
  Pencil,
  Trash2,
  Download,
  Upload,
  Sparkles,
  Bell,
  ChevronDown,
} from "lucide-react";
import { useApp } from "./store";
import {
  dayKey,
  addDays,
  parseDay,
  dateLabel,
  newTask,
  parseQuickTask,
  repeatLabel,
  toggleTask,
  downloadText,
} from "./core";
import { importCalendar, exportCalendar } from "./calendar";
import { Modal, Field, Empty, Heading, Notice } from "./ui";
import type { Task, Repeat } from "./types";

export function TaskEditor({
  initial,
  onClose,
}: {
  initial: Partial<Task>;
  onClose: () => void;
}) {
  const { setData, notify } = useApp();
  const [task, setTask] = useState(() => newTask({ title: "", ...initial }));
  const [scope, setScope] = useState("one");
  const patch = (p: Partial<Task>) => setTask((t) => ({ ...t, ...p }));
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!task.title.trim()) return;
    if (task.repeat !== "none" && !task.date) {
      notify("重复待办需要设置计划日期");
      return;
    }
    if (task.repeatUntil && task.date && task.repeatUntil < task.date) {
      notify("重复结束日期不能早于计划日期");
      return;
    }
    const cleaned = {
      ...task,
      title: task.title.trim(),
      anchorDay: task.date
        ? task.date === initial.date && initial.anchorDay
          ? initial.anchorDay
          : Number(task.date.slice(8))
        : undefined,
    };
    setData((d) => {
      let list = d.tasks.some((t) => t.id === task.id)
        ? d.tasks.map((t) => (t.id === task.id ? cleaned : t))
        : [...d.tasks, cleaned];
      if (scope === "series" && task.seriesId)
        list = list.map((t) =>
          t.id !== task.id && t.seriesId === task.seriesId && !t.completedAt
            ? {
                ...t,
                title: cleaned.title,
                notes: cleaned.notes,
                project: cleaned.project,
                priority: cleaned.priority,
                repeat: cleaned.repeat,
                repeatDays: cleaned.repeatDays,
                repeatUntil: cleaned.repeatUntil,
              }
            : t,
        );
      return { ...d, tasks: list };
    });
    notify(initial.id ? "待办已更新" : "待办已添加");
    onClose();
  }
  return (
    <Modal title={initial.id ? "编辑待办" : "新建待办"} onClose={onClose}>
      <form onSubmit={submit} className="form-stack">
        <Field label="任务名称">
          <input
            autoFocus
            required
            maxLength={500}
            value={task.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="你想完成什么？"
          />
        </Field>
        <div className="form-grid">
          <Field label="计划日期">
            <input
              type="date"
              value={task.date}
              onInput={(e) => patch({ date: e.currentTarget.value })}
              onChange={(e) => patch({ date: e.target.value })}
            />
          </Field>
          <Field label="计划时间">
            <input
              type="time"
              value={task.time}
              onInput={(e) => patch({ time: e.currentTarget.value })}
              onChange={(e) => patch({ time: e.target.value })}
            />
          </Field>
          <Field
            label="截止时间（DDL）"
            hint="独立于计划时间，调整计划不会改变截止时间。"
          >
            <input
              type="datetime-local"
              value={task.deadline}
              onInput={(e) => patch({ deadline: e.currentTarget.value })}
              onChange={(e) => patch({ deadline: e.target.value })}
            />
          </Field>
          <Field label="单次提醒时间">
            <input
              type="datetime-local"
              value={task.reminder}
              onInput={(e) => patch({ reminder: e.currentTarget.value })}
              onChange={(e) => patch({ reminder: e.target.value })}
            />
          </Field>
          <Field label="重复规则">
            <select
              value={task.repeat}
              onChange={(e) => patch({ repeat: e.target.value as Repeat })}
            >
              {(
                ["none", "daily", "weekdays", "weekly", "monthly"] as Repeat[]
              ).map((r) => (
                <option key={r} value={r}>
                  {repeatLabel(r)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="重复结束日期（可选）">
            <input
              type="date"
              value={task.repeatUntil}
              onInput={(e) => patch({ repeatUntil: e.currentTarget.value })}
              onChange={(e) => patch({ repeatUntil: e.target.value })}
            />
          </Field>
        </div>
        {task.repeat === "weekly" && (
          <div className="field">
            <span>每周几重复</span>
            <div className="weekday-picks">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={task.repeatDays.includes(d) ? "selected" : ""}
                  aria-pressed={task.repeatDays.includes(d)}
                  onClick={() =>
                    patch({
                      repeatDays: task.repeatDays.includes(d)
                        ? task.repeatDays.filter((x) => x !== d)
                        : [...task.repeatDays, d],
                    })
                  }
                >
                  {"日一二三四五六"[d]}
                </button>
              ))}
            </div>
            <small>不选择时，按计划日期对应的星期重复。</small>
          </div>
        )}
        {task.repeat !== "none" && (
          <Notice>
            完成后生成下一次待办，保留完成记录。提醒按相对间隔顺延，DDL
            保持不变。
          </Notice>
        )}
        <div className="form-grid">
          <Field label="项目">
            <input
              maxLength={60}
              value={task.project}
              onChange={(e) => patch({ project: e.target.value })}
              list="project-options"
            />
            <datalist id="project-options">
              <option>个人</option>
              <option>论文阅读</option>
              <option>实验研究</option>
              <option>组会</option>
            </datalist>
          </Field>
          <Field label="优先级">
            <select
              value={task.priority}
              onChange={(e) =>
                patch({ priority: Number(e.target.value) as Task["priority"] })
              }
            >
              <option value="1">高优先级</option>
              <option value="2">普通</option>
              <option value="3">低优先级</option>
            </select>
          </Field>
        </div>
        <Field label="备注">
          <textarea
            rows={3}
            value={task.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            placeholder="补充想法、步骤或相关链接…"
          />
        </Field>
        {task.seriesId && (
          <Field label="修改范围">
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="one">当前待办及以后生成的待办</option>
              <option value="series">同时更新本系列已存在的未完成待办</option>
            </select>
          </Field>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            取消
          </button>
          <button className="primary" type="submit">
            {initial.id ? "保存修改" : "创建待办"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function MiniCalendar({
  selected,
  onSelect,
  large = false,
}: {
  selected: string;
  onSelect: (s: string) => void;
  large?: boolean;
}) {
  const { data } = useApp();
  const [month, setMonth] = useState(() => parseDay(selected));
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const start = addDays(dayKey(first), -((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const shift = (n: number) =>
    setMonth((d) => new Date(d.getFullYear(), d.getMonth() + n, 1, 12));
  return (
    <div className={"calendar-card " + (large ? "large-calendar" : "")}>
      <div className="section-heading">
        <h3>
          {month.getFullYear()} 年 {month.getMonth() + 1} 月
        </h3>
        <div className="button-group">
          <button
            className="text-button"
            onClick={() => {
              setMonth(new Date());
              onSelect(dayKey());
            }}
          >
            今天
          </button>
          <button
            className="icon-button"
            aria-label="上个月"
            onClick={() => shift(-1)}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="下个月"
            onClick={() => shift(1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <div className="calendar-grid">
        {"一二三四五六日".split("").map((d) => (
          <span className="weekday" key={d}>
            {d}
          </span>
        ))}
        {days.map((d) => {
          const tasks = data.tasks.filter(
            (t) => !t.completedAt && (t.date === d || t.deadline.startsWith(d)),
          );
          const events = data.events.filter((e) => eventOnDay(e, d));
          return (
            <button
              key={d}
              aria-label={`${d}，${tasks.length}项待办，${events.length}项日程`}
              aria-pressed={selected === d}
              className={
                (d === dayKey() ? "is-today " : "") +
                (d === selected ? "picked " : "") +
                (d.slice(0, 7) !== dayKey(month).slice(0, 7) ? "outside" : "")
              }
              onClick={() => onSelect(d)}
            >
              <span>{Number(d.slice(8))}</span>
              {large ? (
                <div className="cell-events">
                  {events.slice(0, 1).map((e) => (
                    <span key={e.id} className="calendar-event">
                      {e.title}
                    </span>
                  ))}
                  {tasks.slice(0, 2).map((t) => (
                    <span
                      key={t.id}
                      className={
                        "calendar-task " +
                        (t.deadline.startsWith(d) ? "has-deadline" : "")
                      }
                    >
                      {t.title}
                    </span>
                  ))}
                  {tasks.length + events.length > 3 && (
                    <small>+{tasks.length + events.length - 3} 项</small>
                  )}
                </div>
              ) : (
                tasks.length + events.length > 0 && (
                  <i className="day-has-items" />
                )
              )}
            </button>
          );
        })}
      </div>
      <div className="calendar-footer">
        <span className="legend-dot" />
        今天
        <span className="muted">
          {large ? "点击日期查看当天安排" : "选择日期查看计划"}
        </span>
      </div>
    </div>
  );
}
export function eventOnDay(
  e: { start: string; end: string; allDay: boolean },
  date: string,
) {
  const from = new Date(date + "T00:00:00").getTime(),
    to = new Date(addDays(date, 1) + "T00:00:00").getTime();
  return (
    Date.parse(e.start) < to &&
    Math.max(Date.parse(e.end), Date.parse(e.start) + 1) > from
  );
}
export function TaskRows({ tasks }: { tasks: Task[] }) {
  const { setData, editTask, notify } = useApp();
  return (
    <div className="task-list">
      {tasks.map((t) => (
        <div className={"task-row " + (t.completedAt ? "done" : "")} key={t.id}>
          <button
            className={"check-button priority-" + t.priority}
            aria-label={(t.completedAt ? "恢复 " : "完成 ") + t.title}
            onClick={() => {
              setData((d) => ({ ...d, tasks: toggleTask(d.tasks, t.id) }));
              notify(
                t.completedAt
                  ? "待办已恢复"
                  : t.repeat === "none"
                    ? "已完成，做得不错。"
                    : "已完成，下一次安排已更新。",
              );
            }}
          >
            {t.completedAt && <Check size={14} />}
          </button>
          <button className="task-body" onClick={() => editTask(t)}>
            <span className="task-title">{t.title}</span>
            <span className="task-meta">
              {t.date && (
                <span
                  className={
                    t.date < dayKey() && !t.completedAt ? "overdue" : ""
                  }
                >
                  <CalendarDays size={12} />
                  {t.date === dayKey() ? "今天" : dateLabel(t.date)} {t.time}
                </span>
              )}
              {t.repeat !== "none" && (
                <span>
                  <Repeat2 size={12} />
                  {repeatLabel(t.repeat)}
                </span>
              )}
              {t.deadline && (
                <span
                  className={
                    "deadline-pill " +
                    (new Date(t.deadline) < new Date() && !t.completedAt
                      ? "overdue"
                      : "")
                  }
                >
                  <Flag size={11} />
                  DDL {dateLabel(t.deadline)} {t.deadline.slice(11, 16)}
                </span>
              )}
              {t.reminder && <Bell size={12} />}
            </span>
          </button>
          <span className="tag">{t.project || "个人"}</span>
          <div className="task-actions">
            <button
              className="icon-button"
              aria-label={"编辑 " + t.title}
              onClick={() => editTask(t)}
            >
              <Pencil size={15} />
            </button>
            <button
              className="icon-button"
              aria-label={"移除 " + t.title}
              onClick={() => {
                setData((d) => ({
                  ...d,
                  tasks: d.tasks.filter((x) => x.id !== t.id),
                }));
                notify("已移除待办");
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
export function TodayPage() {
  const { data, setData, notify, editTask, askAssistant, query } = useApp();
  const [filter, setFilter] = useState("today");
  const [selected, setSelected] = useState(dayKey());
  const [input, setInput] = useState("");
  const [completed, setCompleted] = useState(false);
  const today = dayKey();
  const week = addDays(today, 7);
  const planned = data.tasks.filter((t) => !t.completedAt);
  const upcoming = planned
    .filter((t) => t.deadline && t.deadline.slice(0, 10) <= week)
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  const visible = data.tasks
    .filter(
      (t) =>
        (completed || !t.completedAt) &&
        (!query ||
          `${t.title} ${t.notes} ${t.project}`
            .toLowerCase()
            .includes(query.toLowerCase())) &&
        (filter === "all" || filter === "week"
          ? filter === "all" || (t.date && t.date <= week)
          : filter === "day"
            ? t.date === selected
            : !t.date ||
              t.date <= today ||
              (t.deadline && t.deadline.slice(0, 10) <= today)),
    )
    .sort(
      (a, b) =>
        Number(Boolean(a.completedAt)) - Number(Boolean(b.completedAt)) ||
        a.priority - b.priority ||
        (a.time || "99").localeCompare(b.time || "99"),
    );
  const quick = () => {
    if (!input.trim()) return;
    const parsed = parseQuickTask(input);
    setData((d) => ({ ...d, tasks: [...d.tasks, newTask(parsed)] }));
    setInput("");
    notify(
      `已添加${parsed.repeat !== "none" ? " · " + repeatLabel(parsed.repeat!) : ""} · ${dateLabel(parsed.date || "")}${parsed.time ? " " + parsed.time : ""}`,
    );
  };
  return (
    <>
      <Heading
        eyebrow="YOUR DAY, AT A GLANCE"
        title="今天，专注一点。"
        description={`${new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })} · 从一件小事开始，让研究向前一步。`}
        action={
          <button className="primary" onClick={() => editTask({})}>
            <Plus size={18} />
            新建待办
          </button>
        }
      />
      <div className="today-layout">
        <section>
          <div className="stats-strip">
            <div>
              <span>待完成</span>
              <strong>
                {planned.length}
                <small>项任务</small>
              </strong>
            </div>
            <div>
              <span>今天已完成</span>
              <strong>
                {
                  data.tasks.filter(
                    (t) =>
                      t.completedAt &&
                      dayKey(new Date(t.completedAt)) === today,
                  ).length
                }
                <small>继续保持</small>
              </strong>
            </div>
            <div>
              <span>即将截止</span>
              <strong>
                {upcoming.length}
                <small>未来七天</small>
              </strong>
            </div>
            <div className="stat-decoration">
              <span>一件一件，慢慢来。</span>
              <div className="mini-bars" aria-hidden="true">
                {[24, 40, 29, 49, 36, 58, 45].map((h, i) => (
                  <i key={i} style={{ height: h }} />
                ))}
              </div>
            </div>
          </div>
          <div className="section-heading">
            <h2>
              {filter === "day" ? dateLabel(selected) + "的待办" : "我的待办"}
              <span>{visible.length}</span>
            </h2>
            <div className="segmented">
              {[
                ["today", "今天"],
                ["week", "未来七天"],
                ["all", "全部"],
              ].map(([f, l]) => (
                <button
                  key={f}
                  className={filter === f ? "selected" : ""}
                  onClick={() => setFilter(f)}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <form
            className="quick-add"
            onSubmit={(e) => {
              e.preventDefault();
              quick();
            }}
          >
            <Plus size={20} />
            <input
              maxLength={500}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="添加一件事，例如：每周五下午三点准备组会"
              aria-label="快速添加待办"
            />
            <button type="submit" title="添加待办">
              <ArrowUpRight size={20} />
            </button>
          </form>
          {input.trim() && (
            <div className="quick-preview">
              <Sparkles size={13} />
              识别为 {dateLabel(parseQuickTask(input).date || "")}{" "}
              {parseQuickTask(input).time} ·{" "}
              {repeatLabel(parseQuickTask(input).repeat || "none")}
              <button
                className="text-button"
                onClick={() => {
                  editTask(parseQuickTask(input));
                  setInput("");
                }}
              >
                详细设置
              </button>
            </div>
          )}
          <TaskRows tasks={visible} />
          {!visible.length && (
            <Empty
              icon={<Check size={29} />}
              heading={
                query ? "没有找到匹配的待办" : "把脑海里的计划，放在这里。"
              }
              action={
                <button
                  className="text-button"
                  onClick={() =>
                    editTask({ date: filter === "day" ? selected : today })
                  }
                >
                  添加一项待办 <ArrowUpRight size={15} />
                </button>
              }
            >
              记下一项待办，再为它安排一个合适的时间。
              <br />
              你的第一步，不必很大。
            </Empty>
          )}
          <button
            className="completed-toggle"
            onClick={() => setCompleted((v) => !v)}
          >
            <ChevronDown size={15} />
            {completed ? "隐藏" : "显示"}已完成任务
          </button>
          <div className="bottom-tip">
            <Sparkles size={17} />
            <span>快速添加支持“明天”“每周五”“下午三点”。</span>
          </div>
        </section>
        <aside className="right-rail">
          <MiniCalendar
            selected={selected}
            onSelect={(d) => {
              setSelected(d);
              setFilter("day");
            }}
          />
          <div className="deadline-card">
            <div className="section-heading">
              <h3>即将到来的 DDL</h3>
              <Flag size={17} />
            </div>
            {upcoming.length ? (
              upcoming.slice(0, 4).map((t) => (
                <button
                  key={t.id}
                  className="ddl-item"
                  onClick={() => editTask(t)}
                >
                  <span>{t.title}</span>
                  <small
                    className={
                      new Date(t.deadline) < new Date() ? "overdue" : ""
                    }
                  >
                    {dateLabel(t.deadline)} · {t.deadline.slice(11, 16)}
                  </small>
                </button>
              ))
            ) : (
              <div className="quiet-empty">
                暂时没有临近的截止日期<span>重要的节点，提前安排。</span>
              </div>
            )}
          </div>
          <div className="assistant-card">
            <span className="assistant-icon">
              <Sparkles size={21} />
            </span>
            <h3>多一个思考伙伴。</h3>
            <p>
              安排计划、读懂文章、翻译动态。
              <br />
              让助手陪你把事情理清楚。
            </p>
            <button
              className="text-button"
              onClick={() => askAssistant("帮我安排今天的任务")}
            >
              随时呼出助手 <ArrowUpRight size={15} />
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}
export function CalendarPage() {
  const { data, setData, editTask, notify } = useApp();
  const [selected, setSelected] = useState(dayKey());
  const [busy, setBusy] = useState(false);
  const tasks = data.tasks.filter((t) => t.date === selected && !t.completedAt);
  const events = data.events
    .filter((e) => eventOnDay(e, selected))
    .sort((a, b) => a.start.localeCompare(b.start));
  return (
    <>
      <Heading
        eyebrow="MAKE ROOM FOR WHAT MATTERS"
        title="把时间，留给重要的事。"
        description="计划与日程放在一起；截止日期始终独立保留。"
        action={
          <div className="button-group">
            <label className="secondary file-button">
              <Upload size={17} />
              {busy ? "导入中…" : "导入日历"}
              <input
                type="file"
                accept=".ics,text/calendar"
                disabled={busy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setBusy(true);
                  try {
                    const events = importCalendar(await file.text(), file.name);
                    setData((d) => ({
                      ...d,
                      events: [
                        ...d.events.filter((x) => x.source !== file.name),
                        ...events,
                      ],
                    }));
                    notify(
                      `已导入 ${events.length} 项日程（过去31天至未来一年）`,
                    );
                  } catch (err) {
                    notify((err as Error).message);
                  } finally {
                    setBusy(false);
                    e.target.value = "";
                  }
                }}
              />
            </label>
            <button
              className="secondary"
              onClick={() => {
                downloadText(
                  "MyLab-tasks.ics",
                  exportCalendar(data.tasks),
                  "text/calendar",
                );
                notify("日历已导出，可导入系统日历设置后台提醒");
              }}
            >
              <Download size={17} />
              导出待办
            </button>
          </div>
        }
      />
      <div className="calendar-page-layout">
        <section>
          <MiniCalendar selected={selected} onSelect={setSelected} large />
          <Notice>
            支持导入 .ics
            日历文件，包括重复日程。重新导入同名文件会更新该日历；这不是账号的实时双向同步。
          </Notice>
        </section>
        <aside>
          <div className="section-heading">
            <h2>{dateLabel(selected)}的安排</h2>
            <button
              className="icon-button"
              aria-label="添加当日待办"
              onClick={() => editTask({ date: selected })}
            >
              <Plus size={20} />
            </button>
          </div>
          <TaskRows tasks={tasks} />
          {events.map((e) => (
            <div className="agenda-event" key={e.id}>
              <Clock size={17} />
              <div>
                <strong>{e.title}</strong>
                <small>
                  {e.allDay
                    ? "全天"
                    : new Date(e.start).toLocaleTimeString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                  · {e.source}
                </small>
                {e.description && <p>{e.description.slice(0, 150)}</p>}
              </div>
            </div>
          ))}
          {!tasks.length && !events.length && (
            <Empty
              icon={<CalendarDays size={26} />}
              heading="这一天还有很多可能。"
            >
              添加待办，或导入已有日历。
            </Empty>
          )}
          {data.events.length > 0 && (
            <div className="calendar-sources">
              <h3>已导入的日历</h3>
              {[...new Set(data.events.map((e) => e.source))].map((s) => (
                <div key={s}>
                  <span>{s}</span>
                  <button
                    className="text-button"
                    onClick={() => {
                      setData((d) => ({
                        ...d,
                        events: d.events.filter((e) => e.source !== s),
                      }));
                      notify("已移除日历，可重新导入原文件");
                    }}
                  >
                    移除
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
