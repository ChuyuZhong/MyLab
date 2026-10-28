import { lazy, type ComponentType } from "react";

// A tab left open across a rebuild asks for chunk names that no longer exist. Reload once
// to pick up the new build instead of unmounting the whole app; the flag stops loops.
const KEY = "mylab.chunk-reload";
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load().then(
      (module) => {
        try {
          sessionStorage.removeItem(KEY);
        } catch {}
        return module;
      },
      (error) => {
        try {
          if (sessionStorage.getItem(KEY)) throw error;
          sessionStorage.setItem(KEY, "1");
        } catch {
          throw error;
        }
        location.reload();
        return new Promise<never>(() => {});
      },
    ),
  );
}
