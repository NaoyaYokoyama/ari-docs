import { useSyncExternalStore } from "react";

// 画面の配色。system は OS の設定に合わせる。選んだ値はこのブラウザ（PC）の localStorage に保存する
export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "light" || value === "dark") {
      return value;
    }
  } catch {
    // 保存できない環境では system とする
  }
  return "system";
}

let preference = readPreference();

function resolve(value: ThemePreference): "light" | "dark" {
  if (value === "system") {
    return media.matches ? "dark" : "light";
  }
  return value;
}

function apply() {
  document.documentElement.classList.toggle(
    "dark",
    resolve(preference) === "dark",
  );
  listeners.forEach((listener) => listener());
}

media.addEventListener("change", apply);
apply();

export function setThemePreference(value: ThemePreference) {
  preference = value;
  try {
    if (value === "system") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, value);
    }
  } catch {
    // 保存できなくても、開いている間は切り替える
  }
  apply();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTheme() {
  const current = useSyncExternalStore(subscribe, () => preference);
  const resolved = useSyncExternalStore(subscribe, () => resolve(preference));
  return {
    preference: current,
    // 実際に表示している配色（Markdown エディタ・mermaid の配色に使う）
    resolved,
    setPreference: setThemePreference,
  };
}
