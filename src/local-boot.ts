import { DATA_KEY } from "./store";

// When the page is served by scripts/start.mjs, the same origin hands over the pairing
// code and the newest MyLab-settings file, so a local start needs no manual setup.
export interface LocalBoot {
  pairing: string;
  config: { name: string; modifiedAt: string; text: string } | null;
  warning?: string;
}
const APPLIED_KEY = "mylab.local.config";

// Read before the first render persists defaults, so "no data yet" is still knowable.
export const storageWasEmpty = (() => {
  try {
    return localStorage.getItem(DATA_KEY) === null;
  } catch {
    return false;
  }
})();

export async function fetchLocalBoot(): Promise<LocalBoot | null> {
  if (location.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(location.hostname)) return null;
  try {
    const r = await fetch("./local/bootstrap", {
      headers: { "X-MyLab-Local": "1" },
      cache: "no-store",
    });
    if (!r.ok || !r.headers.get("content-type")?.includes("json")) return null;
    const boot = await r.json();
    return typeof boot?.pairing === "string" ? boot : null;
  } catch {
    return null;
  }
}

// Settings from a config file apply once per file version, so later changes made in the
// page survive restarts until a newer file appears. Secrets always come from the file.
export function configIsNew(boot: LocalBoot) {
  if (!boot.config) return false;
  try {
    return localStorage.getItem(APPLIED_KEY) !== `${boot.config.name}@${boot.config.modifiedAt}`;
  } catch {
    return true;
  }
}
export function markConfigApplied(boot: LocalBoot) {
  if (!boot.config) return;
  try {
    localStorage.setItem(APPLIED_KEY, `${boot.config.name}@${boot.config.modifiedAt}`);
  } catch {}
}
