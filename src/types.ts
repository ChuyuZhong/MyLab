export type Page =
  | "today"
  | "calendar"
  | "x"
  | "wechat"
  | "gpu"
  | "weekly"
  | "settings";
export type Repeat = "none" | "daily" | "weekdays" | "weekly" | "monthly";
export interface Task {
  id: string;
  title: string;
  notes: string;
  project: string;
  priority: 1 | 2 | 3;
  date: string;
  time: string;
  deadline: string;
  reminder: string;
  repeat: Repeat;
  repeatDays: number[];
  repeatUntil: string;
  completedAt?: string;
  createdAt: string;
  generatedFrom?: string;
  seriesId?: string;
  anchorDay?: number;
  sourceUrl?: string;
}
export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  source: string;
  description: string;
}
export interface Source {
  id: string;
  kind: "x" | "wechat";
  name: string;
  handle: string;
  url: string;
  feedUrl: string;
  color?: string;
  lastFetched?: string;
  error?: string;
  sync?: FeedSync;
}
export interface FeedSync {
  mode: "live" | "bridge" | "snapshot";
  checkedAt: string;
  dataAt: string;
  latestItemAt: string;
  upstreamUpdatedAt?: string;
  warning?: string;
  added?: number;
}
export interface FeedResult {
  items: Article[];
  sync: FeedSync;
}
export interface Article {
  id: string;
  sourceId: string;
  kind: "x" | "wechat";
  title: string;
  content: string;
  contentMarkdown?: string;
  url: string;
  publishedAt: string;
  indexedAt?: string;
  author: string;
  read: boolean;
  saved: boolean;
  translation?: string;
  summary?: string;
  contentScope: "full" | "excerpt" | "link";
  provenance: string;
  provenanceUrl?: string;
}
export interface GpuRequest {
  id: string;
  title: string;
  count: number;
  memory: number;
  start: string;
  hours: number;
  notes: string;
  status: "draft" | "recorded" | "finished";
  createdAt: string;
}
export interface Settings {
  name: string;
  theme: "light" | "dark";
  aiBase: string;
  aiModel: string;
  translationPrompt: string;
  bridgeUrl: string;
  gpuUrl: string;
  feedMode: "direct" | "bridge";
  autoRefresh: number;
  wechatRefresh: number;
  assistantHints: boolean;
}
export interface AppData {
  version: 1;
  tasks: Task[];
  events: CalendarEvent[];
  sources: Source[];
  articles: Article[];
  requests: GpuRequest[];
  settings: Settings;
  notified: string[];
  reports: WeeklyReportDraft[];
}
export interface WeeklyReadingNote {
  paperTitle: string;
  publication: string;
  notes: string;
}
export interface WeeklyReportDraft {
  id: string;
  weekStart: string;
  author: string;
  articleIds: string[];
  taskIds: string[];
  includeNonDDL: boolean;
  readingNotes: Record<string, WeeklyReadingNote>;
  work: string;
  ideas: string;
  nextWeek: string;
  other: string;
  markdown: string;
  updatedAt: string;
  generatedBasis: string;
  generationMode: "" | "local" | "ai";
}
export interface Secrets {
  aiKey: string;
  bridgeKey: string;
  xKey: string;
}
export interface GpuSlot {
  id: string;
  device: string;
  memory: number | null;
  enabled: boolean;
  state: string;
  allocated: boolean;
}
export interface GpuAgent {
  id: string;
  name: string;
  resourcePool: string;
  enabled: boolean;
  slots: GpuSlot[];
}
export interface GpuSnapshot {
  fetchedAt: string;
  agents: GpuAgent[];
  pools: { name: string; total: number; used: number }[];
  version?: string;
}
