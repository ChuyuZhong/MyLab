import test from "node:test";
import assert from "node:assert/strict";
import {
  newTask,
  parseQuickTask,
  nextTaskDate,
  toggleTask,
  defaultData,
  makeBackup,
  validateBackup,
  dayKey,
  safeUrl,
} from "../src/core.ts";
import { importCalendar, exportCalendar } from "../src/calendar.ts";
const now = new Date("2026-09-12T10:00:00");
test("Chinese quick add recognizes weekly day, local time, and preserves the task title", () => {
  const t = parseQuickTask("每周五下午三点准备组会", now);
  assert.equal(t.title, "准备组会");
  assert.equal(t.date, "2026-09-18");
  assert.equal(t.time, "15:00");
  assert.equal(t.repeat, "weekly");
  assert.deepEqual(t.repeatDays, [5]);
});
test("weekday repeat skips weekends and overdue completion advances into the future", () => {
  const t = newTask(
    { title: "日报", date: "2026-09-11", repeat: "weekdays" },
    now,
  );
  assert.equal(nextTaskDate(t, now), "2026-09-14");
});
test("monthly recurrence clamps February while preserving the original day for March", () => {
  const t = newTask(
    { title: "月底汇总", date: "2026-01-31", repeat: "monthly" },
    now,
  );
  const feb = nextTaskDate(t, new Date("2026-01-31T10:00:00"));
  assert.equal(feb, "2026-02-28");
  assert.equal(
    nextTaskDate(
      { ...t, date: feb!, anchorDay: 31 },
      new Date("2026-02-28T10:00:00"),
    ),
    "2026-03-31",
  );
});
test("completion keeps independent DDL, shifts reminder, and undo avoids a duplicate next occurrence", () => {
  const task = newTask(
    {
      title: "组会",
      date: "2026-09-12",
      time: "15:00",
      reminder: "2026-09-12T14:00",
      repeat: "weekly",
      repeatDays: [6],
      deadline: "2026-10-01T18:00",
    },
    now,
  );
  const completed = toggleTask([task], task.id, now);
  assert.equal(completed.length, 2);
  assert.equal(completed[1].date, "2026-09-19");
  assert.equal(completed[1].deadline, task.deadline);
  assert.equal(completed[1].reminder, "2026-09-19T14:00");
  const undone = toggleTask(completed, task.id, now);
  assert.equal(undone.length, 1);
  assert.equal(undone[0].completedAt, undefined);
  assert.equal(toggleTask(undone, task.id, now).length, 2);
});
test("repeat end date prevents creating an occurrence after the end", () => {
  const t = newTask(
    {
      title: "冲刺",
      date: "2026-09-12",
      repeat: "daily",
      repeatUntil: "2026-09-12",
    },
    now,
  );
  assert.equal(nextTaskDate(t, now), undefined);
});
test("backup excludes private connection endpoints and rejects malformed arrays and dates", () => {
  const d = defaultData();
  d.settings.gpuUrl = "http://private.test";
  d.sources[0].feedUrl = "https://feed.test/secret";
  const backup = makeBackup(d);
  assert.equal(backup.settings.gpuUrl, "");
  assert.equal(backup.sources[0].feedUrl, "");
  assert.deepEqual(validateBackup(backup).tasks, []);
  assert.throws(() => validateBackup({ ...d, tasks: [{ title: "broken" }] }));
  assert.throws(() =>
    validateBackup({
      ...d,
      tasks: [newTask({ title: "bad", date: "2026-02-31" })],
    }),
  );
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.equal(safeUrl("https://name:pass@example.com"), "");
});
test("ICS import expands recurrence, respects excluded dates, and handles all-day exclusive end", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:test-event",
    "DTSTART;VALUE=DATE:20260912",
    "DTEND;VALUE=DATE:20260913",
    "RRULE:FREQ=DAILY;COUNT=3",
    "EXDATE;VALUE=DATE:20260913",
    "SUMMARY:实验记录",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const events = importCalendar(ics, "lab.ics", now);
  assert.equal(events.length, 2);
  assert.equal(dayKey(new Date(events[0].start)), "2026-09-12");
  assert.equal(dayKey(new Date(events[1].start)), "2026-09-14");
  assert.equal(events[0].allDay, true);
});
test("ICS export preserves task, time, repeat and alarm in a re-importable calendar", () => {
  const task = newTask(
    {
      title: "论文,组会",
      date: "2026-09-12",
      time: "15:00",
      repeat: "weekly",
      repeatDays: [6],
      repeatUntil: "2026-09-20",
      reminder: "2026-09-12T14:00",
      deadline: "2026-09-30T18:00",
    },
    now,
  );
  const text = exportCalendar([task]);
  assert.match(text, /BEGIN:VALARM/);
  assert.match(text, /RRULE:FREQ=WEEKLY;BYDAY=SA/);
  const events = importCalendar(text, "tasks.ics", now);
  assert.equal(events.length, 2);
  assert.equal(events[0].title, "论文,组会");
  assert.equal(new Date(events[0].start).getHours(), 15);
});
