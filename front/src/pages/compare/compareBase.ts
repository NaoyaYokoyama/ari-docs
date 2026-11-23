import { useSyncExternalStore } from "react";

// 「比べる相手に選ぶ」で覚えたファイル・フォルダ（FN0304-BR01）。別のフォルダにあるものと比べるときに使う。
// この画面を開いている間だけ覚える（保存しない）
export type CompareBase = { path: string; isDir: boolean };

let base: CompareBase | null = null;
const listeners = new Set<() => void>();

export function setCompareBase(next: CompareBase | null) {
  base = next;
  listeners.forEach((listener) => listener());
}

export function useCompareBase() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => base,
  );
}

// 比べる画面の URL
export function compareUrl(isDir: boolean, left: string, right: string) {
  const params = new URLSearchParams({ mode: isDir ? "folders" : "files", left, right });
  return `/compare?${params.toString()}`;
}
