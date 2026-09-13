import { defaultData, safeUrl } from "./core.ts";
import type { AppData, Secrets, Settings, Source } from "./types.ts";

// This version belongs to the portable file format, independently of app releases.
export const CONFIG_VERSION = 1;
export const CONFIG_MAX_BYTES = 2_000_000;
const FORMAT = "mylab-settings";
const secretLimits: Record<keyof Secrets, number> = {
  aiKey: 16000,
  xKey: 16000,
  bridgeKey: 16000,
};
const secretKeys = Object.keys(secretLimits) as (keyof Secrets)[];
type SourceConfig = Pick<
  Source,
  "id" | "kind" | "name" | "handle" | "url" | "feedUrl" | "color"
>;
export interface ImportedConfig {
  settings: Partial<Settings>;
  secrets: Partial<Secrets>;
  sources?: SourceConfig[];
}
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
function string(value: unknown, label: string, max = 16000): string {
  if (typeof value !== "string" || value.length > max)
    throw Error(`${label}格式不正确或过长`);
  return value;
}
function url(value: string, label: string, local = false) {
  if (value && !safeUrl(value, local))
    throw Error(`${label}需要有效的 HTTP(S) 地址`);
}
// Adding a Settings field requires defining its validation here as well.
const validators: { [K in keyof Settings]: (value: Settings[K]) => boolean } = {
  name: (s) => s.length <= 100,
  theme: (s) => ["light", "dark"].includes(s),
  aiBase: (s) => !s || Boolean(safeUrl(s)),
  aiModel: (s) => s.length <= 500,
  translationPrompt: (s) => s.length <= 100000,
  bridgeUrl: (s) => !s || Boolean(safeUrl(s)),
  gpuUrl: (s) => !s || Boolean(safeUrl(s, true)),
  feedMode: (s) => ["direct", "bridge"].includes(s),
  autoRefresh: (n) => [0, 15, 30, 60].includes(n),
  wechatRefresh: (n) => [0, 1, 5, 15, 30, 60].includes(n),
  assistantHints: (b) => typeof b === "boolean",
};
export function parseConfig(text: string): ImportedConfig {
  if (text.length > CONFIG_MAX_BYTES) throw Error("配置文件不能超过 2 MB");
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw Error("配置文件不是有效的 JSON，当前配置未修改");
  }
  if (!object(value) || value.format !== FORMAT)
    throw Error("请选择 MyLab 配置文件；任务/周报备份请使用“合并导入备份”");
  if (
    !Number.isInteger(value.schemaVersion) ||
    (value.schemaVersion as number) < 1
  )
    throw Error("配置文件版本无效");
  if ((value.schemaVersion as number) > CONFIG_VERSION)
    throw Error("此文件由更新版本导出，请先刷新或更新 MyLab 后再导入");
  if (!object(value.settings)) throw Error("配置文件缺少 settings 对象");
  const defaults = defaultData().settings;
  const settings: Record<string, unknown> = {};
  for (const key of Object.keys(defaults) as (keyof Settings)[]) {
    if (!Object.hasOwn(value.settings, key)) continue;
    const field = value.settings[key];
    const validate = validators[key] as (v: unknown) => boolean;
    if (typeof field !== typeof defaults[key] || !validate(field))
      throw Error(`配置项 ${key} 的类型或值无效，当前配置未修改`);
    settings[key] = field;
  }
  const secrets: Partial<Secrets> = {};
  if (value.secrets !== undefined) {
    if (!object(value.secrets)) throw Error("密钥配置格式不正确");
    for (const key of secretKeys) {
      if (Object.hasOwn(value.secrets, key))
        secrets[key] = string(value.secrets[key], "密钥", secretLimits[key]);
    }
  }
  let sources: SourceConfig[] | undefined;
  if (value.sources !== undefined) {
    if (!Array.isArray(value.sources) || value.sources.length > 1000)
      throw Error("订阅配置格式不正确或超过 1000 项");
    const ids = new Set<string>();
    sources = value.sources.map((s) => {
      if (!object(s) || !["x", "wechat"].includes(s.kind as string))
        throw Error("订阅来源类型无效");
      const id = string(s.id, "订阅 ID", 500);
      if (!id || ids.has(id)) throw Error("订阅 ID 为空或重复");
      ids.add(id);
      const source: SourceConfig = {
        id,
        kind: s.kind as Source["kind"],
        name: string(s.name, "订阅名称", 500),
        handle: string(s.handle ?? "", "订阅用户名", 500),
        url: string(s.url ?? "", "来源地址"),
        feedUrl: string(s.feedUrl ?? "", "订阅地址"),
      };
      url(source.url, "来源地址");
      url(source.feedUrl, "订阅地址");
      if (s.color !== undefined) source.color = string(s.color, "来源配色", 50);
      return source;
    });
  }
  return { settings: settings as Partial<Settings>, secrets, sources };
}
export function exportConfig(data: AppData, secrets: Secrets) {
  const document = {
    format: FORMAT,
    schemaVersion: CONFIG_VERSION,
    exportedAt: new Date().toISOString(),
    settings: Object.fromEntries(
      Object.keys(defaultData().settings).map((key) => [
        key,
        data.settings[key as keyof Settings],
      ]),
    ),
    secrets: Object.fromEntries(secretKeys.map((key) => [key, secrets[key]])),
    sources: data.sources.map(
      ({ id, kind, name, handle, url, feedUrl, color }) => ({
        id,
        kind,
        name,
        handle,
        url,
        feedUrl,
        color,
      }),
    ),
  };
  const text = JSON.stringify(document, null, 2);
  if (new TextEncoder().encode(text).byteLength > CONFIG_MAX_BYTES)
    throw Error("配置文件不能超过 2 MB，请减少订阅或过长配置");
  parseConfig(text); // Never offer an export that this version cannot restore.
  return text;
}
export function applyConfig(
  data: AppData,
  secrets: Secrets,
  config: ImportedConfig,
) {
  const sources = new Map(data.sources.map((s) => [s.id, s]));
  for (const incoming of config.sources || []) {
    const old = sources.get(incoming.id);
    if (old && old.kind !== incoming.kind)
      throw Error("订阅 ID 与已有来源类型冲突，当前配置未修改");
    const merged = { ...old, ...incoming };
    delete merged.lastFetched;
    delete merged.error;
    delete merged.sync;
    sources.set(incoming.id, merged);
  }
  return {
    data: {
      ...data,
      settings: { ...data.settings, ...config.settings },
      sources: [...sources.values()],
    },
    secrets: { ...secrets, ...config.secrets },
  };
}
