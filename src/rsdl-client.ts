import type { Article, FeedResult } from "./types.ts";
import { parseRSDL, RSDL_API } from "./rsdl.ts";

function snapshot(value: unknown, mode: "bridge" | "snapshot"): FeedResult {
  const j = value as {
    items?: Article[];
    fetchedAt?: string;
    latestItemAt?: string;
    upstreamUpdatedAt?: string;
    warning?: string;
  };
  if (!j || !Array.isArray(j.items) || !j.items.length)
    throw Error("目录快照没有可用内容");
  const items = j.items
    .filter(
      (a) =>
        a &&
        typeof a.id === "string" &&
        typeof a.title === "string" &&
        typeof a.url === "string" &&
        typeof a.content === "string" &&
        typeof a.provenance === "string" &&
        a.kind === "wechat" &&
        ["link", "excerpt", "full"].includes(a.contentScope),
    )
    .map((a) => ({ ...a, sourceId: "wechat-rsdl" }));
  if (!items.length) throw Error("目录快照格式不正确");
  return {
    items,
    sync: {
      mode,
      checkedAt: new Date().toISOString(),
      dataAt: typeof j.fetchedAt === "string" ? j.fetchedAt : "",
      latestItemAt:
        items
          .map((a) => a.indexedAt || a.publishedAt || "")
          .sort()
          .at(-1) || "",
      upstreamUpdatedAt:
        typeof j.upstreamUpdatedAt === "string" ? j.upstreamUpdatedAt : "",
      warning:
        mode === "snapshot"
          ? "实时接口未连接，当前显示部署缓存；本次检查不代表公众号已更新。"
          : j.warning,
    },
  };
}
export async function fetchRSDL(
  options: {
    fetcher?: typeof fetch;
    bridge?: () => Promise<unknown>;
    signal?: AbortSignal;
  } = {},
): Promise<FeedResult> {
  const fetcher = options.fetcher || fetch;
  const get = async (url: string) => {
    const response = await fetcher(url, {
      cache: "no-store",
      credentials: "omit",
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
    });
    if (!response.ok) throw Error("目录接口不可用");
    return response.json();
  };
  try {
    const result = parseRSDL(await get(RSDL_API + "&_=" + Date.now()));
    return {
      items: result.items,
      sync: {
        mode: "live",
        checkedAt: result.fetchedAt,
        dataAt: result.fetchedAt,
        latestItemAt: result.latestItemAt,
        upstreamUpdatedAt: result.upstreamUpdatedAt,
      },
    };
  } catch {
    if (options.signal?.aborted) throw Error("已取消更新");
  }
  if (options.bridge)
    try {
      return snapshot(await options.bridge(), "bridge");
    } catch {
      if (options.signal?.aborted) throw Error("已取消更新");
    }
  try {
    return snapshot(await get("./data/rsdl.json?_=" + Date.now()), "snapshot");
  } catch {
    throw Error(
      options.signal?.aborted
        ? "已取消更新"
        : "实时目录与部署缓存均不可用，已保留本机文章；请稍后重试。",
    );
  }
}
