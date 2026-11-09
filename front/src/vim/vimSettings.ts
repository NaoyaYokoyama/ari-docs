import { useSyncExternalStore } from "react";

import { DEFAULT_VIM_KEYS, VIM_ACTIONS, type VimActionId } from "@/vim/actions";

// Vim モードの設定（FN0702）。この PC（localStorage）だけに保存する（ほかの画面の設定と同じ。FN0701）
export type VimSettings = {
  enabled: boolean;
  // 操作ごとのキー（"j"、"d, <C-d>" など）
  keys: Record<VimActionId, string>;
  // j・k で動く量（px。文字の大きさの設定に合わせて大きくなる）
  scrollStep: number;
  // f で出す文字（左から順に使う。ホームポジションの文字が打ちやすい）
  hintChars: string;
  // Note・Wiki の本文も Vim で編集する
  editor: boolean;
  // 挿入モードを抜けるキー（"jk" など。空なら Esc だけ）
  insertEscape: string;
  // 本文のエディタに追加する設定（vimrc と同じ書き方。nmap・inoremap・set など）
  vimrc: string;
};

export const DEFAULT_VIM_SETTINGS: VimSettings = {
  enabled: false,
  keys: DEFAULT_VIM_KEYS,
  scrollStep: 60,
  hintChars: "sadfjklewcmpgh",
  editor: true,
  insertEscape: "",
  vimrc: "",
};

export const SCROLL_STEP_RANGE = { min: 10, max: 400 };

const STORAGE_KEY = "vim";

const listeners = new Set<() => void>();

// 知らない値・壊れた値は既定の値にする（書き出したファイルを手で直した場合など）
export function sanitizeVimSettings(value: unknown): VimSettings {
  const input = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const keysInput = (input.keys && typeof input.keys === "object" ? input.keys : {}) as Record<string, unknown>;
  const keys = Object.fromEntries(
    VIM_ACTIONS.map((action) => {
      const text = keysInput[action.id];
      // 空（割り当てなし）も認める。読めない部分は使うときに無視する（設定画面で知らせる）
      return [action.id, typeof text === "string" ? text.slice(0, 100) : action.keys];
    }),
  ) as Record<VimActionId, string>;
  const step = Number(input.scrollStep);
  const chars = typeof input.hintChars === "string" ? uniqueChars(input.hintChars) : "";
  return {
    enabled: input.enabled === true,
    keys,
    scrollStep:
      Number.isFinite(step) && step >= SCROLL_STEP_RANGE.min && step <= SCROLL_STEP_RANGE.max
        ? Math.round(step)
        : DEFAULT_VIM_SETTINGS.scrollStep,
    hintChars: chars.length >= 2 ? chars : DEFAULT_VIM_SETTINGS.hintChars,
    editor: input.editor !== false,
    insertEscape: typeof input.insertEscape === "string" ? input.insertEscape.trim() : "",
    vimrc: typeof input.vimrc === "string" ? input.vimrc : "",
  };
}

// 重なった文字・空白を除く（ヒントの文字）
export function uniqueChars(text: string) {
  return [...new Set([...text].filter((char) => char.trim() !== ""))].join("");
}

function read(): VimSettings {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value) {
      return sanitizeVimSettings(JSON.parse(value));
    }
  } catch {
    // 読めなければ既定の値
  }
  return DEFAULT_VIM_SETTINGS;
}

let settings = read();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 保存できなくても、開いている間は使う
  }
  listeners.forEach((listener) => listener());
}

export function setVimSettings(next: Partial<VimSettings>) {
  settings = { ...settings, ...next };
  save();
}

export function setVimKey(id: VimActionId, keys: string) {
  settings = { ...settings, keys: { ...settings.keys, [id]: keys } };
  save();
}

// 設定の読み込み・初期化（preferences.ts の書き出し・読み込みから使う）
export function replaceVimSettings(value: unknown) {
  settings = sanitizeVimSettings(value);
  save();
}

export function getVimSettings() {
  return settings;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useVimSettings() {
  return useSyncExternalStore(subscribe, () => settings);
}

// 別のタブ・ウィンドウで変えたときも合わせる
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY || event.key === null) {
    settings = read();
    listeners.forEach((listener) => listener());
  }
});
