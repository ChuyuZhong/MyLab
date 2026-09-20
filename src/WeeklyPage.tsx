import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Copy,
  FilePenLine,
  Plus,
  Search,
  Sparkles,
  Square,
  X,
  ScrollText,
} from "lucide-react";
import { useApp } from "./store";
import { callAI } from "./api";
import { addDays, dayKey } from "./core";
import { Heading, Field, Notice, Modal, ExternalLink } from "./ui";
import { MarkdownView } from "./MarkdownView";
import {
  assembleReport,
  buildWeeklyMessages,
  completedThisWeek,
  emptyReadingNote,
  emptyReport,
  localSections,
  parseWeeklyResult,
  putReport,
  reportBasis,
  reportInputs,
  weekIdentity,
  weekStartFor,
  REPORT_LIMIT,
} from "./weekly";
import type { WeeklyReportDraft, WeeklyReadingNote } from "./types";
import weeklySkill from "../public/skills/chuyu-weekly-report/SKILL.md?raw";
import "./weekly.css";

export default function WeeklyPage() {
  const { data, setData, secrets, notify, navigate } = useApp();
  const [week, setWeek] = useState(weekStartFor());
  const [filter, setFilter] = useState("read");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("preview");
  const [guide, setGuide] = useState(false);
  const [busy, setBusy] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");
  const request = useRef<AbortController | null>(null);
  const draft =
    data.reports.find((r) => r.weekStart === week) ||
    emptyReport(week, data.tasks);
  useEffect(() => {
    if (!draft.markdown) {
      setDownloadUrl("");
      return;
    }
    const url = URL.createObjectURL(
      new Blob([draft.markdown], { type: "text/markdown;charset=utf-8" }),
    );
    setDownloadUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [draft.markdown]);
  const identity = weekIdentity(week);
  const input = reportInputs(draft, data.articles, data.tasks);
  const basis = reportBasis(input);
  const stale = Boolean(
    draft.markdown && draft.generatedBasis && draft.generatedBasis !== basis,
  );
  const candidates = completedThisWeek(data.tasks, week, draft.includeNonDDL);
  const visible = data.articles
    .filter(
      (a) =>
        a.kind === "wechat" &&
        (filter === "all" ||
          (filter === "selected" && draft.articleIds.includes(a.id)) ||
          (filter === "read" && a.read) ||
          (filter === "saved" && a.saved)) &&
        `${a.title} ${a.author}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      (b.publishedAt || b.indexedAt || "").localeCompare(
        a.publishedAt || a.indexedAt || "",
      ),
    );
  const missing =
    draft.articleIds.length -
    input.readings.length +
    draft.taskIds.length -
    input.completed.length;
  const size = JSON.stringify(input, null, 2).length;
  function patch(update: Partial<WeeklyReportDraft>, target = week) {
    setData((d) => {
      const current =
        d.reports.find((r) => r.weekStart === target) ||
        emptyReport(target, d.tasks);
      return {
        ...d,
        reports: putReport(d.reports, {
          ...current,
          ...update,
          updatedAt: new Date().toISOString(),
        }),
      };
    });
  }
  function selectArticle(id: string) {
    if (!draft.articleIds.includes(id) && draft.articleIds.length >= 12) {
      notify("每份周报最多选择 12 篇论文");
      return;
    }
    patch({
      articleIds: draft.articleIds.includes(id)
        ? draft.articleIds.filter((x) => x !== id)
        : [...draft.articleIds, id],
    });
  }
  function note(id: string, update: Partial<WeeklyReadingNote>) {
    patch({
      readingNotes: {
        ...draft.readingNotes,
        [id]: { ...(draft.readingNotes[id] || emptyReadingNote()), ...update },
      },
    });
  }
  function changeWeek(start: string) {
    if (request.current) {
      request.current.abort();
      request.current = null;
      setBusy(false);
    }
    setWeek(start);
  }
  useEffect(() => () => request.current?.abort(), []);
  function local() {
    patch({
      markdown: assembleReport(input, localSections(input)),
      generatedBasis: basis,
      generationMode: "local",
    });
    setTab("preview");
    notify("已按所选材料生成本地草稿，可继续编辑");
  }
  async function generate() {
    if (request.current) return;
    if (!secrets.aiKey) {
      notify("请先在设置中填写个人模型 API Key，也可以直接使用本地整理");
      return;
    }
    let messages;
    try {
      messages = buildWeeklyMessages(input, weeklySkill);
    } catch (e) {
      notify((e as Error).message);
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      const result = await callAI(
        data.settings,
        secrets.aiKey,
        messages,
        controller.signal,
        { maxTokens: 8192 },
      );
      if (controller.signal.aborted) return;
      const sections = parseWeeklyResult(result, input);
      patch(
        {
          markdown: assembleReport(input, sections),
          generatedBasis: basis,
          generationMode: "ai",
        },
        week,
      );
      setTab("preview");
      notify("周报已生成，建议核对论文事实和个人判断后下载");
    } catch (e) {
      if (!controller.signal.aborted) notify((e as Error).message);
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }
  const downloadName = `科研周报-${identity.year}-W${String(identity.week).padStart(2, "0")}-${week}.md`;
  return (
    <>
      <Heading
        eyebrow="FROM READING TO REFLECTION"
        title="把一周，写成自己的思考。"
        description="选论文、收拢完成事项，再留一点地方给工作和新想法。"
        action={
          <button className="secondary" onClick={() => setGuide(true)}>
            <ScrollText size={17} />
            我的写作 Skill
          </button>
        }
      />
      <div className="report-week-bar surface">
        <div className="report-week-picker">
          <span className="report-week-icon">
            <CalendarDays size={21} />
          </span>
          <div>
            <strong>
              {identity.year} 年 · 第 {identity.week} 周
            </strong>
            <small>
              {week} — {addDays(week, 6)} · 周一至周日
            </small>
          </div>
        </div>
        <div className="button-group">
          <button
            className="icon-button"
            aria-label="上一周周报"
            onClick={() => changeWeek(addDays(week, -7))}
          >
            <ChevronLeft size={18} />
          </button>
          <label className="report-date">
            <span>选择周内任一天</span>
            <input
              aria-label="选择周报日期"
              type="date"
              value={week}
              onInput={(e) => {
                if (e.currentTarget.value)
                  try {
                    changeWeek(weekStartFor(e.currentTarget.value));
                  } catch {}
              }}
              onChange={(e) => {
                if (e.target.value)
                  try {
                    changeWeek(weekStartFor(e.target.value));
                  } catch {}
              }}
            />
          </label>
          <button
            className="icon-button"
            aria-label="下一周周报"
            onClick={() => changeWeek(addDays(week, 7))}
          >
            <ChevronRight size={18} />
          </button>
          <button
            className="text-button"
            onClick={() => changeWeek(weekStartFor())}
          >
            本周
          </button>
        </div>
      </div>
      <div className="report-layout">
        <section className="report-materials">
          <section className="report-card">
            <div className="report-card-heading">
              <span className="report-step">01</span>
              <div>
                <h2>选择阅读材料</h2>
                <p>沿用你的论文评述习惯，最多 12 篇。</p>
              </div>
              <span className="count-badge">已选 {input.readings.length}</span>
            </div>
            <fieldset disabled={busy}>
              <div className="report-reading-toolbar">
                <div className="segmented">
                  {[
                    ["read", "已读"],
                    ["saved", "收藏"],
                    ["all", "全部"],
                    ["selected", "已选"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={filter === value ? "selected" : ""}
                      onClick={() => setFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => navigate("wechat")}
                >
                  <Plus size={14} />
                  导入文章
                </button>
              </div>
              <div className="report-search">
                <Search size={15} />
                <input
                  aria-label="搜索周报阅读材料"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索论文或公众号…"
                />
              </div>
              <div className="report-reading-list">
                {visible.map((a) => (
                  <label
                    key={a.id}
                    className={
                      "report-reading-choice " +
                      (draft.articleIds.includes(a.id) ? "chosen" : "")
                    }
                  >
                    <input
                      type="checkbox"
                      checked={draft.articleIds.includes(a.id)}
                      onChange={() => selectArticle(a.id)}
                    />
                    <span>
                      <strong>{a.title}</strong>
                      <small>
                        {a.author} ·{" "}
                        {a.content
                          ? a.contentScope === "full"
                            ? "已补充正文"
                            : "节选材料"
                          : "仅链接，需补充笔记"}
                      </small>
                    </span>
                  </label>
                ))}
                {!visible.length && (
                  <div className="report-empty">
                    {filter === "read"
                      ? "还没有已读文章。可以切到“全部”选择，或先到公众号页阅读。"
                      : "没有符合条件的阅读材料。"}
                  </div>
                )}
              </div>
              {input.readings.length > 0 && (
                <div className="report-note-list">
                  {input.readings.map((a, i) => (
                    <details key={a.id} className="report-note">
                      <summary>
                        <BookOpen size={15} />
                        <span>
                          {i + 1}. {a.paperTitle || a.title}
                        </span>
                        <small>补充理解</small>
                      </summary>
                      <div className="form-stack">
                        <div className="report-note-source">
                          <ExternalLink url={a.url}>打开原文</ExternalLink>
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => selectArticle(a.id)}
                          >
                            <X size={13} />
                            移出本周
                          </button>
                        </div>
                        <Field
                          label={`论文原题 ${i + 1}`}
                          hint="填写论文原文的正式题名，保留原始语言；不填时标注待核实，不采用推文标题。"
                        >
                          <input
                            maxLength={500}
                            value={draft.readingNotes[a.id]?.paperTitle || ""}
                            onChange={(e) =>
                              note(a.id, { paperTitle: e.target.value })
                            }
                          />
                        </Field>
                        <Field label={`年份、期刊、发表单位与通讯作者 ${i + 1}`} hint="按四项顺序以逗号隔开；同项多人或单位用顿号。请核对论文原文或出版社资料，未知项写待核实；旧格式需重新整理。">
                          <input
                            maxLength={500}
                            value={draft.readingNotes[a.id]?.publication || ""}
                            onChange={(e) =>
                              note(a.id, { publication: e.target.value })
                            }
                            placeholder="2026，期刊名称，发表单位，通讯作者名字"
                          />
                        </Field>
                        <Field
                          label={`阅读笔记 ${i + 1}`}
                          hint="写自己的理解、疑问和可借鉴点；只有链接时，也可粘贴关键内容并注明是原文节选。"
                        >
                          <textarea
                            rows={5}
                            maxLength={18000}
                            value={draft.readingNotes[a.id]?.notes || ""}
                            onChange={(e) =>
                              note(a.id, { notes: e.target.value })
                            }
                            placeholder="这篇在做什么？数据怎么来？方法本质是什么？哪里值得参考或验证？"
                          />
                        </Field>
                        <small className="muted">
                          {a.content
                            ? `同时使用文章中已保存的 ${a.content.length.toLocaleString()} 字符内容。`
                            : "当前没有正文；不填写笔记时只列为待阅读，模型不会凭标题编写论文细节。"}
                        </small>
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </fieldset>
          </section>
          <section className="report-card">
            <div className="report-card-heading">
              <span className="report-step">02</span>
              <div>
                <h2>本周完成的事项</h2>
                <p>按实际完成日期筛选，DDL 逐条列出。</p>
              </div>
              <span className="count-badge">已选 {input.completed.length}</span>
            </div>
            <fieldset disabled={busy}>
              <div className="report-task-controls">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={draft.includeNonDDL}
                    onChange={(e) =>
                      patch({
                        includeNonDDL: e.target.checked,
                        taskIds: draft.taskIds.filter((id) =>
                          completedThisWeek(
                            data.tasks,
                            week,
                            e.target.checked,
                          ).some((t) => t.id === id),
                        ),
                      })
                    }
                  />
                  也显示没有 DDL 的完成待办
                </label>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    patch({ taskIds: candidates.map((t) => t.id) })
                  }
                >
                  选中本周全部
                </button>
              </div>
              <div className="report-completed-list">
                {candidates.map((t) => (
                  <label className="report-completed-choice" key={t.id}>
                    <input
                      type="checkbox"
                      checked={draft.taskIds.includes(t.id)}
                      onChange={() =>
                        patch({
                          taskIds: draft.taskIds.includes(t.id)
                            ? draft.taskIds.filter((id) => id !== t.id)
                            : [...draft.taskIds, t.id],
                        })
                      }
                    />
                    <span>
                      <strong>{t.title}</strong>
                      <small>
                        {t.deadline
                          ? "DDL " + t.deadline.replace("T", " ") + " · "
                          : ""}
                        完成于 {dayKey(new Date(t.completedAt!))}
                      </small>
                    </span>
                    <Check size={15} />
                  </label>
                ))}
                {!candidates.length && (
                  <div className="report-empty">
                    这一周暂无符合条件的完成记录。
                    <br />
                    未完成的 DDL 不会被写成已完成。
                  </div>
                )}
              </div>
            </fieldset>
          </section>
          <section className="report-card">
            <div className="report-card-heading">
              <span className="report-step">03</span>
              <div>
                <h2>工作与想法</h2>
                <p>每行一件事，保留当前进度与真实疑问。</p>
              </div>
            </div>
            <fieldset disabled={busy} className="form-stack">
              <Field label="署名（可选）">
                <input
                  maxLength={80}
                  value={draft.author}
                  onChange={(e) => patch({ author: e.target.value })}
                  placeholder="你的名字"
                />
              </Field>
              <Field label="其他工作">
                <textarea
                  rows={4}
                  maxLength={12000}
                  value={draft.work}
                  onChange={(e) => patch({ work: e.target.value })}
                  placeholder="本周做了什么、推进到哪里、还卡在哪一步…"
                />
              </Field>
              <Field label="下周计划">
                <textarea
                  rows={3}
                  maxLength={8000}
                  value={draft.nextWeek}
                  onChange={(e) => patch({ nextWeek: e.target.value })}
                  placeholder="先做什么，再做什么；已确定的时间或依赖条件…"
                />
              </Field>
              <Field label="idea 小记">
                <textarea
                  rows={4}
                  maxLength={12000}
                  value={draft.ideas}
                  onChange={(e) => patch({ ideas: e.target.value })}
                  placeholder="观察到的问题、一个可能方向、需要验证什么…"
                />
              </Field>
              <details className="report-extra">
                <summary>其他学习内容（可选）</summary>
                <Field label="其他学习内容">
                  <textarea
                    rows={3}
                    maxLength={8000}
                    value={draft.other}
                    onChange={(e) => patch({ other: e.target.value })}
                    placeholder="课程、技术学习或会议收获…"
                  />
                </Field>
              </details>
            </fieldset>
          </section>
        </section>
        <section className="report-output">
          <div className="report-output-card surface">
            <div className="report-output-header">
              <div>
                <span className="eyebrow">YOUR WEEK IN WORDS</span>
                <h2>这一周的周报</h2>
              </div>
              <span className="status-tag">
                {draft.generationMode === "ai"
                  ? "模型生成 · 可编辑"
                  : draft.markdown
                    ? "本地草稿"
                    : "待整理"}
              </span>
            </div>
            <div className="report-generate-bar">
              <button className="secondary" disabled={busy} onClick={local}>
                <FilePenLine size={16} />
                {draft.markdown ? "本地重整" : "本地整理"}
              </button>
              <button
                className="primary"
                disabled={busy || size > REPORT_LIMIT}
                onClick={() => void generate()}
              >
                <Sparkles size={16} />
                {busy
                  ? "正在整理…"
                  : draft.markdown
                    ? "重新生成周报"
                    : "按我的写法生成"}
              </button>
              {busy && (
                <button
                  className="text-button"
                  onClick={() => {
                    request.current?.abort();
                    notify("已取消生成，原稿保留");
                  }}
                >
                  <Square size={13} />
                  停止
                </button>
              )}
            </div>
            <p className="report-model-note">
              {secrets.aiKey ? (
                `共用 ${data.settings.aiModel} · 仅发送本页所选材料`
              ) : (
                <>
                  <button
                    className="text-button"
                    onClick={() => navigate("settings")}
                  >
                    填写个人模型 API Key
                  </button>{" "}
                  后使用模型；本地整理无需接口。
                </>
              )}
            </p>
            <div className="report-outline">
              <span>学习内容</span>
              <i>→</i>
              <span>项目进展</span>
              <i>→</i>
              <span>下周计划</span>
              <i>→</i>
              <span>idea小记</span>
            </div>
            {draft.markdown && (
              <p className="report-replace-note">
                “本地重整”或“重新生成周报”会替换当前稿件，重要修改可先下载保存。
              </p>
            )}
            {missing > 0 && (
              <Notice tone="warning">
                有 {missing}{" "}
                条已选记录被移除、恢复未完成或不在本周，生成时不会计入。
                <button
                  className="text-button"
                  onClick={() =>
                    patch({
                      articleIds: input.readings.map((r) => r.id),
                      taskIds: input.completed.map((t) => t.id),
                    })
                  }
                >
                  清理失效选择
                </button>
              </Notice>
            )}
            {size > REPORT_LIMIT && (
              <Notice tone="warning">
                所选材料约 {size.toLocaleString()} 字符，超过 60,000
                字符上限。请减少篇数，或在公众号页把过长正文改为节选。
              </Notice>
            )}
            {stale && (
              <Notice>
                材料已调整，当前稿件尚未更新。编辑稿件会保留你的修改；重新生成后才会采用新材料。
              </Notice>
            )}
            <div className="report-editor-toolbar">
              <div className="segmented">
                <button
                  className={tab === "preview" ? "selected" : ""}
                  onClick={() => setTab("preview")}
                >
                  排版预览
                </button>
                <button
                  className={tab === "edit" ? "selected" : ""}
                  onClick={() => setTab("edit")}
                >
                  编辑 Markdown
                </button>
              </div>
              <span>{draft.markdown.length.toLocaleString()} 字符</span>
            </div>
            {tab === "edit" ? (
              <textarea
                className="report-markdown-editor"
                aria-label="周报 Markdown 内容"
                spellCheck={false}
                value={draft.markdown}
                maxLength={200000}
                disabled={busy}
                onChange={(e) => patch({ markdown: e.target.value })}
                placeholder="在这里编辑或直接撰写 Markdown 周报…"
              />
            ) : draft.markdown ? (
              <div className="report-paper">
                <MarkdownView text={draft.markdown} />
              </div>
            ) : (
              <div className="report-preview-empty">
                <ScrollText size={34} />
                <h3>材料准备好，就可以开始了。</h3>
                <p>
                  论文部分讲清数据、方法和判断；
                  <br />
                  其余部分简明记录实际进展。
                </p>
                <small>草稿按周自动保存在当前浏览器。</small>
              </div>
            )}
            <div className="report-download-bar">
              <span>
                {draft.updatedAt
                  ? "本机已保存 · " +
                    new Date(draft.updatedAt).toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "内容仅在当前浏览器保存"}
              </span>
              <div className="button-group wrap">
                <button
                  className="text-button"
                  disabled={!draft.markdown || busy}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(draft.markdown);
                      notify("Markdown 已复制");
                    } catch {
                      setTab("edit");
                      notify("浏览器未允许复制，请在编辑区全选后复制");
                    }
                  }}
                >
                  <Copy size={14} />
                  复制 Markdown
                </button>
                {downloadUrl && draft.markdown && !busy ? (
                  <a
                    className="primary"
                    href={downloadUrl}
                    download={downloadName}
                  >
                    <Download size={16} />
                    下载 Markdown
                  </a>
                ) : (
                  <button className="primary" disabled>
                    <Download size={16} />
                    下载 Markdown
                  </button>
                )}
              </div>
            </div>
          </div>
          {data.reports.length > 0 && (
            <div className="report-history">
              <h3>已保存的周报</h3>
              <div>
                {data.reports.slice(0, 16).map((r) => (
                  <button
                    key={r.id}
                    className={r.weekStart === week ? "selected" : ""}
                    onClick={() => changeWeek(r.weekStart)}
                  >
                    {r.weekStart}
                    <small>{r.markdown ? "已有稿件" : "材料草稿"}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
      {guide && (
        <Modal
          title="个人科研周报 · 写作 Skill"
          onClose={() => setGuide(false)}
          wide
        >
          <div className="report-skill-intro">
            <p>
              从历年周报提炼，近期论文评述为重点。网站与可复用 Skill
              共用这份规则。
            </p>
            <a
              className="secondary"
              href={`${import.meta.env.BASE_URL}skills/chuyu-weekly-report/SKILL.md`}
              download="SKILL.md"
            >
              <Download size={16} />
              下载 SKILL.md
            </a>
          </div>
          <MarkdownView text={weeklySkill.replace(/^---[\s\S]*?---\s*/, "")} />
        </Modal>
      )}
    </>
  );
}
