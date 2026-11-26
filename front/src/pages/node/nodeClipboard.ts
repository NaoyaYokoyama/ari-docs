import { useCallback, useEffect, useState } from "react";

import { useDesktop } from "@/app/DesktopContext";

export type Clipboard = { mode: "copy" | "cut"; paths: string[] };

// Folder の切り取り・コピー（Ctrl+X・Ctrl+C）。ほかのウィンドウ（FN0301-BR36）で貼り付けられるよう、
// この PC の localStorage に場所ごとに置き、ほかのウィンドウの変更も受け取る。パスは場所の中でしか使えない
const KEY = "ari-docs-node-clipboard";

function read(key: string): Clipboard | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null") as Clipboard | null;
    return value && (value.mode === "copy" || value.mode === "cut") && Array.isArray(value.paths)
      ? value
      : null;
  } catch {
    return null;
  }
}

function write(key: string, value: Clipboard | null) {
  try {
    if (value) {
      localStorage.setItem(key, JSON.stringify(value));
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // 保存できなければ、このウィンドウの中だけで使う
  }
}

export function useNodeClipboard() {
  const desktop = useDesktop();
  const key = `${KEY}:${desktop?.place.id ?? "browser"}`;
  const [clipboard, setState] = useState<Clipboard | null>(() => read(key));

  // ほかのウィンドウで切り取り・コピー・貼り付けしたとき
  useEffect(() => {
    setState(read(key));
    const handleStorage = (event: StorageEvent) => {
      if (event.key === key) {
        setState(read(key));
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [key]);

  const setClipboard = useCallback(
    (next: Clipboard | null | ((current: Clipboard | null) => Clipboard | null)) => {
      setState((current) => {
        const value = typeof next === "function" ? next(current) : next;
        write(key, value);
        return value;
      });
    },
    [key],
  );

  return [clipboard, setClipboard] as const;
}
