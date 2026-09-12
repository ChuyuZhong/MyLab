import type { Source } from "./types.ts";
export const SOURCE_COLORS = [
  ["emerald", "翡翠绿", "#087f5b"],
  ["violet", "紫罗兰", "#7040b5"],
  ["blue", "钴蓝", "#2458c4"],
  ["orange", "橙红", "#b44715"],
  ["rose", "莓红", "#b32965"],
  ["cyan", "湖蓝", "#086e87"],
  ["gold", "赭金", "#916800"],
] as const;
export function sourceColor(source: Pick<Source, "id" | "kind" | "color">) {
  if (SOURCE_COLORS.some(([key]) => key === source.color)) return source.color!;
  if (source.id === "wechat-rsdl") return "emerald";
  if (source.id === "x-tibo") return "violet";
  let hash = 0;
  for (const c of source.id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return SOURCE_COLORS[hash % SOURCE_COLORS.length][0];
}
