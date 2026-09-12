import type { AppData, Article, FeedResult } from "./types.ts";
import { articleIdentity } from "./rsdl.ts";

// Keep existing IDs so reading notes and weekly report selections keep working.
export function mergeFeedArticles(
  existing: Article[],
  incoming: Article[],
  allowUpdates = true,
) {
  const articles = [...existing];
  const positions = new Map(articles.map((a, i) => [articleIdentity(a), i]));
  let added = 0;
  for (const fresh of incoming) {
    const key = articleIdentity(fresh),
      index = positions.get(key);
    if (index === undefined) {
      positions.set(key, articles.length);
      articles.push(fresh);
      added++;
      continue;
    }
    const old = articles[index];
    if (!allowUpdates) continue;
    articles[index] = {
      ...fresh,
      id: old.id,
      read: old.read,
      saved: old.saved,
      translation: old.translation,
      summary: old.summary,
      ...(old.provenance.includes("手动") || (old.content && !fresh.content)
        ? {
            content: old.content,
            contentScope: old.contentScope,
            provenance: old.provenance,
          }
        : {}),
    };
  }
  return { articles, added };
}
export function applyFeedResult(
  data: AppData,
  sourceId: string,
  result: FeedResult,
) {
  const merged = mergeFeedArticles(
    data.articles,
    result.items,
    result.sync.mode !== "snapshot",
  );
  return {
    ...data,
    articles: merged.articles,
    sources: data.sources.map((s) =>
      s.id === sourceId
        ? {
            ...s,
            lastFetched: result.sync.checkedAt,
            error: undefined,
            sync: { ...result.sync, added: merged.added },
          }
        : s,
    ),
  };
}
