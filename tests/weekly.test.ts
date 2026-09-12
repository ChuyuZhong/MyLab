import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  defaultData,
  newTask,
  validateBackup,
  makeBackup,
} from "../src/core.ts";
import {
  weekStartFor,
  weekIdentity,
  completedThisWeek,
  emptyReport,
  reportInputs,
  reportBasis,
  assembleReport,
  localSections,
  buildWeeklyMessages,
  parseWeeklyResult,
  queueReading,
} from "../src/weekly.ts";
import type { Article } from "../src/types.ts";
process.env.TZ = "Asia/Shanghai";
const start = "2026-09-07";
const article: Article = {
  id: "paper-1",
  sourceId: "wechat-test",
  kind: "wechat",
  title: "测试用论文推文",
  content: "",
  url: "https://example.com/paper",
  publishedAt: "",
  author: "测试来源",
  read: true,
  saved: false,
  contentScope: "link",
  provenance: "验收夹具",
};
const task = (
  id: string,
  completedAt: string | undefined,
  deadline = "2026-10-01T18:00",
) => newTask({ id, title: id, deadline, completedAt });

test("week selection uses Monday boundaries and ISO week years at New Year", () => {
  assert.equal(weekStartFor("2026-09-13"), start);
  assert.equal(weekStartFor("2026-09-14"), "2026-09-14");
  assert.deepEqual(weekIdentity(weekStartFor("2027-01-01")), {
    year: 2026,
    week: 53,
  });
  assert.throws(() => weekStartFor("2026-02-31"));
});
test("DDL selection follows local completion time, excluding undone, next week and ordinary tasks", () => {
  const tasks = [
    task("monday", "2026-09-06T16:00:00Z"),
    task("sunday", "2026-09-13T15:59:59Z"),
    task("next", "2026-09-13T16:00:00Z"),
    task("before", "2026-09-06T15:59:59Z"),
    task("undone", undefined, "2026-09-09T18:00"),
    task("ordinary", "2026-09-09T09:00:00Z", ""),
  ];
  assert.deepEqual(
    completedThisWeek(tasks, start).map((t) => t.id),
    ["monday", "sunday"],
  );
  assert.equal(completedThisWeek(tasks, start, true).length, 3);
});
test("only explicitly selected readings and eligible tasks reach model context; secrets and unselected notes do not", () => {
  const tasks = [
    task("included", "2026-09-09T09:00:00Z"),
    task("excluded", undefined),
  ];
  const draft = {
    ...emptyReport(start, tasks),
    articleIds: [article.id],
    taskIds: ["included", "excluded"],
  };
  const input = reportInputs(
    draft,
    [
      article,
      { ...article, id: "other", content: "UNSELECTED_PRIVATE_CONTENT" },
    ],
    tasks,
  );
  const messages = buildWeeklyMessages(
    input,
    readFileSync("public/skills/chuyu-weekly-report/SKILL.md", "utf8"),
  );
  assert.equal(input.readings.length, 1);
  assert.deepEqual(
    input.completed.map((t) => t.id),
    ["included"],
  );
  assert.ok(!messages[1].content.includes("UNSELECTED_PRIVATE_CONTENT"));
  assert.ok(!("settings" in input));
});
test("host preserves exact DDL items and refuses fabricated link-only reviews or uninstructed work", () => {
  const tasks = [task("核对样本 [A]", "2026-09-09T09:00:00Z")];
  const draft = { ...emptyReport(start, tasks), articleIds: [article.id] };
  const input = reportInputs(draft, [article], tasks);
  const result = parseWeeklyResult(
    JSON.stringify({
      papers: ["虚构准确率 99.9%"],
      work: "虚构已完成实验",
      nextWeek: "虚构下周投稿",
      ideas: "虚构个人创意",
      other: "虚构学习",
    }),
    input,
  );
  const md = assembleReport(input, result);
  assert.ok(!md.includes("虚构"));
  assert.ok(
    md.includes("核对样本 \\[A\\]（DDL：2026-10-01 18:00；完成：2026-09-09）"),
  );
  assert.ok(md.includes("仅有链接"));
  assert.ok(md.includes("[原文](https://example.com/paper)"));
});
test("report parser rejects incomplete model answers; local drafts preserve work and independent edited Markdown", () => {
  const draft = {
    ...emptyReport(start),
    articleIds: [article.id],
    work: "完成测试记录\n继续检查边界",
    ideas: "能否减少标注成本？",
    readingNotes: {
      [article.id]: {
        paperTitle: "Known paper",
        publication: "来源中明确给出的信息",
        notes: "**分割任务**，目前方法细节仍需复核。",
      },
    },
  };
  const input = reportInputs(draft, [article], []);
  assert.throws(() => parseWeeklyResult("not JSON", input));
  assert.throws(() =>
    parseWeeklyResult(
      JSON.stringify({
        papers: [],
        work: "",
        nextWeek: "",
        ideas: "",
        other: "",
      }),
      input,
    ),
  );
  const md = assembleReport(input, localSections(input));
  assert.ok(md.includes("Known paper"));
  assert.ok(md.includes("1. 完成测试记录\n\n2. 继续检查边界"));
  assert.notEqual(
    reportBasis(input),
    reportBasis({ ...input, work: "changed" }),
  );
});
test("legacy backups migrate without losing tasks and new report drafts survive backup roundtrip", () => {
  const original = defaultData();
  original.tasks = [task("kept", "2026-09-09T09:00:00Z")];
  const { reports, ...legacy } = original;
  assert.equal(validateBackup(legacy).tasks[0].id, "kept");
  assert.deepEqual(validateBackup(legacy).reports, []);
  original.reports = [
    { ...emptyReport(start), markdown: "# 我的修改", ideas: "真实想法" },
  ];
  assert.equal(
    validateBackup(makeBackup(original)).reports[0].markdown,
    "# 我的修改",
  );
  assert.throws(() =>
    validateBackup({
      ...original,
      reports: [{ ...original.reports[0], weekStart: "2026-09-08" }],
    }),
  );
});
test("adding a reading to a report preserves existing writing and deduplicates selection", () => {
  const data = defaultData();
  data.articles = [article];
  data.reports = [
    { ...emptyReport(start), markdown: "已编辑的内容", work: "手动工作记录" },
  ];
  const first = queueReading(data, article.id, start);
  const second = queueReading(first, article.id, start);
  assert.equal(second.reports[0].markdown, "已编辑的内容");
  assert.deepEqual(second.reports[0].articleIds, [article.id]);
  assert.equal(data.reports[0].articleIds.length, 0);
});
test("oversized inputs produce an actionable error instead of silently truncating user materials", () => {
  const draft = { ...emptyReport(start), work: "a".repeat(61000) };
  assert.throws(() =>
    buildWeeklyMessages(reportInputs(draft, [], []), "skill"),
  );
});
