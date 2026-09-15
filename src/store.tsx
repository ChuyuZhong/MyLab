import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import { defaultData, validateBackup } from "./core";
import { cleanLegacyWechat } from "./wechat-archive";
import type { AppData, Article, Page, Secrets, Task } from "./types";
type Store = {
  data: AppData;
  setData: Dispatch<SetStateAction<AppData>>;
  secrets: Secrets;
  setSecrets: Dispatch<SetStateAction<Secrets>>;
  page: Page;
  navigate: (p: Page) => void;
  notify: (s: string) => void;
  editTask: (t: Partial<Task> | null) => void;
  askAssistant: (prompt?: string, article?: Article) => void;
  query: string;
  setQuery: (q: string) => void;
};
export const AppContext = createContext<Store>(null!);
export const useApp = () => useContext(AppContext);
export const DATA_KEY = "mylab.data.v1";
export function loadData() {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    return {
      data: raw ? cleanLegacyWechat(validateBackup(JSON.parse(raw))) : defaultData(),
      error: "",
    };
  } catch {
    return {
      data: defaultData(),
      error:
        "本机数据暂时无法读取，原记录已保留。请先到设置导出原始数据，再导入有效备份。",
    };
  }
}
export function usePersistedData() {
  const initial = useRef(loadData());
  const [data, setData] = useState(initial.current.data);
  const [storageError, setStorageError] = useState(initial.current.error);
  useEffect(() => {
    if (initial.current.error) return;
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify(data));
      setStorageError("");
    } catch {
      setStorageError("浏览器存储空间不足，最新修改尚未保存。请立即导出备份。");
    }
  }, [data]);
  return {
    data,
    setData,
    storageError,
    recoverStorage: () => {
      initial.current.error = "";
      setStorageError("");
    },
  };
}
export function AppProvider({
  value,
  children,
}: {
  value: Store;
  children: ReactNode;
}) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
