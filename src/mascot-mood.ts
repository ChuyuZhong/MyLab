import { useSyncExternalStore } from "react";

// 小鲸's mood: a base mood from the clock and the user's activity, overridden for a few
// seconds by reactions to events (a task done, a model reply, an error…). Any module can
// call emitMascot(); components read the current state with useMascot().
export type Mood = "work" | "smile" | "sleep" | "eat" | "grab" | "pout" | "rage";
export type MascotEvent =
  | "greet"
  | "task-done"
  | "task-added"
  | "task-deleted"
  | "ai-start"
  | "ai-done"
  | "ai-stop"
  | "ai-error"
  | "grab"
  | "drop"
  | "hint";
export interface MascotState {
  mood: Mood;
  busy: boolean;
  line: string;
}

const SLEEP_AFTER = 3 * 60_000; // idle this long and she dozes off
const NIGHT_SLEEP_AFTER = 30_000; // after midnight she gives up sooner
const pick = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)];
const LINES: Record<string, string[]> = {
  "task-done": ["做得好！又完成一件～", "厉害厉害！", "这件搞定啦，喝口水吧", "完成！奖励自己一口白米饭"],
  "task-added": ["记下来啦！", "收到，我帮你盯着～"],
  "task-deleted": ["欸……删掉了吗", "好、好吧……"],
  "ai-done": ["想好啦！", "整理好了，请看～", "嘿嘿，这个我擅长"],
  "ai-error": ["呜……请求失败了！", "不、不是我的错！快检查一下设置"],
  wake: ["我、我才没睡着！", "唔……我在我在！"],
  grab: ["诶？诶诶？！", "放、放我下来……", "要带我去哪里呀？", "我、我会飞了？"],
  drop: ["唔……晕乎乎的", "到、到了吗？", "这里视野不错～"],
};
export const HOVER_LINES: Record<Mood, string> = {
  work: "有什么要帮忙的吗？",
  smile: "嘿嘿～",
  sleep: "唔……再睡五分钟……",
  eat: "吃饱了才有力气陪你干活！",
  grab: "……？",
  pout: "才、才没有哭呢！",
  rage: "哼！",
};
function greeting(hour: number) {
  if (hour < 6) return "这么晚还在？我陪你一会儿～";
  if (hour < 11) return "早上好！今天也一起加油～";
  if (hour < 14) return "中午好，记得吃饭哦！";
  if (hour < 18) return "下午好，喝口水再继续吧";
  return "晚上好，今天辛苦啦～";
}

let lastActive = Date.now();
let inflight = 0;
let held = "";
let reaction: { mood: Mood; line: string; until: number } | null = null;
let state: MascotState = { mood: "work", busy: false, line: "" };
const listeners = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | undefined;
let expiry: ReturnType<typeof setTimeout> | undefined;

function baseMood(now: Date): Mood {
  const idle = Date.now() - lastActive;
  const h = now.getHours() + now.getMinutes() / 60;
  if (idle >= SLEEP_AFTER || (h >= 0.5 && h < 6 && idle >= NIGHT_SLEEP_AFTER)) return "sleep";
  if ((h >= 11.5 && h < 13) || (h >= 17.5 && h < 19)) return "eat";
  return "work";
}
function compute(): MascotState {
  if (reaction && reaction.until <= Date.now()) reaction = null;
  if (held) return { mood: "grab", busy: false, line: held };
  if (inflight > 0) return { mood: "work", busy: true, line: "让我想想……" };
  if (reaction) return { mood: reaction.mood, busy: false, line: reaction.line };
  return { mood: baseMood(new Date()), busy: false, line: "" };
}
function update() {
  const next = compute();
  if (next.mood !== state.mood || next.busy !== state.busy || next.line !== state.line) {
    state = next;
    listeners.forEach((l) => l());
  }
}
function react(mood: Mood, line: string, ms: number) {
  reaction = { mood, line, until: Date.now() + ms };
  clearTimeout(expiry);
  expiry = setTimeout(update, ms + 20);
}

export function emitMascot(event: MascotEvent) {
  switch (event) {
    case "greet":
      react("smile", greeting(new Date().getHours()), 6000);
      break;
    case "ai-start":
      inflight++;
      break;
    case "ai-done":
      inflight = Math.max(0, inflight - 1);
      react("smile", pick(LINES["ai-done"]), 4000);
      break;
    case "ai-stop":
      inflight = Math.max(0, inflight - 1);
      break;
    case "ai-error":
      inflight = Math.max(0, inflight - 1);
      react("rage", pick(LINES["ai-error"]), 4500);
      break;
    case "task-done":
      react("smile", pick(LINES["task-done"]), 3800);
      break;
    case "task-added":
      react("smile", pick(LINES["task-added"]), 2600);
      break;
    case "task-deleted":
      react("pout", pick(LINES["task-deleted"]), 2600);
      break;
    case "grab": // held until "drop"
      held = pick(LINES.grab);
      lastActive = Date.now();
      break;
    case "drop":
      held = "";
      react("grab", pick(LINES.drop), 1600);
      break;
    case "hint":
      react("smile", "要小鲸帮你理一理今天的事吗？", 12000);
      break;
  }
  update();
}

export const MOOD_LABELS: Record<Mood, string> = {
  work: "正常工作",
  smile: "微笑迎接",
  sleep: "呼呼大睡",
  eat: "吃白米饭",
  grab: "被拎起来",
  pout: "委屈",
  rage: "炸毛",
};
// Lets Settings play any mood on demand.
export function previewMascot(mood: Mood) {
  react(mood, `这是「${MOOD_LABELS[mood]}」的我～`, 6000);
  update();
}

// Any input counts as activity; waking her up gets a sheepish reaction.
export function markActive() {
  const wasAsleep = state.mood === "sleep";
  lastActive = Date.now();
  if (wasAsleep) {
    react("smile", pick(LINES.wake), 3500);
    update();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!ticker) ticker = setInterval(update, 10_000);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearInterval(ticker);
      ticker = undefined;
    }
  };
}
export const useMascot = () => useSyncExternalStore(subscribe, () => state);
// The current state, re-evaluated against the clock (for non-React callers and tests).
export function mascotSnapshot() {
  update();
  return state;
}
