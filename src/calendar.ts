import ICAL from "ical.js";
import type { CalendarEvent, Task } from "./types";
import { dayKey, addDays } from "./core.ts";
export function importCalendar(
  text: string,
  source: string,
  now = new Date(),
): CalendarEvent[] {
  if (text.length > 5_000_000) throw Error("日历文件不能超过 5 MB");
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents("vtimezone")) {
    const id = String(tz.getFirstPropertyValue("tzid"));
    ICAL.TimezoneService.register(
      new ICAL.Timezone({ component: tz, tzid: id }),
      id,
    );
  }
  const components = root.getAllSubcomponents("vevent");
  const result: CalendarEvent[] = [];
  const from = new Date(`${addDays(dayKey(now), -31)}T00:00:00`),
    to = new Date(`${addDays(dayKey(now), 366)}T23:59:59`);
  const masters = components.filter((c) => !c.hasProperty("recurrence-id"));
  for (const component of masters) {
    if (component.getFirstPropertyValue("status") === "CANCELLED") continue;
    const event = new ICAL.Event(component);
    const exceptions = components.filter(
      (c) =>
        c.hasProperty("recurrence-id") &&
        c.getFirstPropertyValue("uid") === event.uid,
    );
    for (const ex of exceptions) event.relateException(new ICAL.Event(ex));
    const push = (start: ICAL.Time, end: ICAL.Time, item = event) => {
      const s = start.toJSDate(),
        e = end.toJSDate();
      if (s > to || e < from) return;
      result.push({
        id: `${source}:${event.uid}:${start.toString()}`,
        title: item.summary || "未命名日程",
        start: s.toISOString(),
        end: e.toISOString(),
        allDay: start.isDate,
        source,
        description: item.description || "",
      });
    };
    if (event.isRecurring()) {
      const iterator = event.iterator();
      let next;
      let count = 0;
      while ((next = iterator.next()) && count++ < 50000) {
        if (next.toJSDate() > to) break;
        const item = event.getOccurrenceDetails(next);
        if (item.item.component.getFirstPropertyValue("status") === "CANCELLED")
          continue;
        push(item.startDate, item.endDate, item.item);
        if (result.length >= 5000)
          throw Error("展开的日程超过 5000 条，请缩小日历范围");
      }
      if (count >= 50000) throw Error("日历重复次数过多，请导出近期日程后重试");
    } else push(event.startDate, event.endDate);
  }
  return result;
}
const esc = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
const stamp = (s: string) =>
  new Date(s)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
export function exportCalendar(tasks: Task[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MyLab//Personal Workspace//ZH",
    "CALSCALE:GREGORIAN",
  ];
  for (const t of tasks.filter(
    (t) => !t.completedAt && (t.date || t.deadline),
  )) {
    const timed = Boolean(t.time || t.deadline);
    const date = t.date || t.deadline.slice(0, 10);
    const time = t.time || (!t.date ? t.deadline.slice(11, 16) : "09:00");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${t.id}@mylab`,
      `DTSTAMP:${stamp(new Date().toISOString())}`,
      `SUMMARY:${esc(t.title)}`,
      `DESCRIPTION:${esc([t.notes, t.deadline ? `截止时间：${t.deadline}` : ""].filter(Boolean).join("\n"))}`,
    );
    if (timed) {
      const start = `${date}T${time || "09:00"}`;
      lines.push(
        `DTSTART:${stamp(start)}`,
        `DTEND:${stamp(new Date(new Date(start).getTime() + 3600000).toISOString())}`,
      );
    } else {
      lines.push(
        `DTSTART;VALUE=DATE:${date.replace(/-/g, "")}`,
        `DTEND;VALUE=DATE:${addDays(date, 1).replace(/-/g, "")}`,
      );
    }
    if (t.repeat !== "none") {
      let r =
        t.repeat === "daily"
          ? "FREQ=DAILY"
          : t.repeat === "weekdays"
            ? "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
            : t.repeat === "monthly"
              ? "FREQ=MONTHLY"
              : "FREQ=WEEKLY";
      if (t.repeat === "weekly" && t.repeatDays.length)
        r += `;BYDAY=${t.repeatDays.map((d) => ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][d]).join(",")}`;
      if (t.repeatUntil)
        r += `;UNTIL=${timed ? stamp(t.repeatUntil + "T23:59:59") : t.repeatUntil.replace(/-/g, "")}`;
      lines.push(`RRULE:${r}`);
    }
    if (t.reminder) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${esc(t.title)}`,
        `TRIGGER;VALUE=DATE-TIME:${stamp(t.reminder)}`,
        "END:VALARM",
      );
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
