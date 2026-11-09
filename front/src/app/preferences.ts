import { useSyncExternalStore } from "react";

import { setThemePreference, type ThemePreference } from "@/app/theme";
import { DEFAULT_VIM_SETTINGS, getVimSettings, replaceVimSettings, type VimSettings } from "@/vim/vimSettings";

// この PC（ブラウザの localStorage）だけに保存する、画面の使い方の設定（FN0701）。
// サーバーには送らないため、PC ごとに変えられる（家と会社で文字の大きさを変える、など）
export type FontSize = "small" | "normal" | "large" | "xlarge";
export type StartPage = "home" | "folder" | "note" | "wiki" | "docs" | "last";
// system は OS の「アニメーションを減らす」（Windows の「アニメーション効果」など）に合わせる
export type ReduceMotion = "system" | "on" | "off";
// ホームの検索で探す種類（サーバーの back/src/search/kind.rs と同じ名前。FN0201-BR09）
export type SearchType =
  | "excel"
  | "word"
  | "powerpoint"
  | "pdf"
  | "text"
  | "image"
  | "other"
  | "folder"
  | "note"
  | "wiki";

export type Preferences = {
  fontSize: FontSize;
  // 画面の動き（開く・閉じるの動きなど）を止める
  reduceMotion: ReduceMotion;
  // アプリを開いたときに出す画面。last は前回最後に開いていた画面
  startPage: StartPage;
  // Folder で削除する前に確かめる（ゴミ箱に移すだけなので、既定では確かめない）
  confirmDelete: boolean;
  // Folder で「.」で始まる名前（隠しファイル）を表示する
  showHidden: boolean;
  // Folder を開いたときに、一覧の右にプレビュー（選んだファイルの中身）を出す（FN0301-BR31）
  folderPreviewPane: boolean;
  // Note・Wiki の画面のボタンに、マウスを乗せたとき・キーで選んだときに一言の説明を出す
  buttonHints: boolean;
  // ホームの検索で探す種類。空ならすべて
  searchTypes: SearchType[];
};

export const DEFAULT_PREFERENCES: Preferences = {
  fontSize: "normal",
  reduceMotion: "system",
  startPage: "home",
  confirmDelete: false,
  showHidden: true,
  folderPreviewPane: true,
  buttonHints: true,
  searchTypes: [],
};

export const SEARCH_TYPES: { value: SearchType; label: string; description: string }[] = [
  { value: "excel", label: "Excel・CSV", description: "xlsx・xlsm・xlsb・xls・ods・csv・tsv" },
  { value: "word", label: "Word", description: "docx・docm・doc・rtf・odt" },
  { value: "powerpoint", label: "PowerPoint", description: "pptx・pptm・ppt・odp" },
  { value: "pdf", label: "PDF", description: "pdf" },
  { value: "text", label: "テキスト", description: "txt・md・log・json・コードなど" },
  { value: "image", label: "画像", description: "png・jpg・gif・bmp・webp・svg・tif" },
  { value: "other", label: "その他のファイル", description: "上のどれにも当たらないファイル" },
  { value: "folder", label: "フォルダ", description: "名前で見つかったフォルダ" },
  { value: "note", label: "Note", description: "自分の Note" },
  { value: "wiki", label: "Wiki", description: "全員の Wiki" },
];

export const FONT_SIZES: { value: FontSize; label: string; px: number }[] = [
  { value: "small", label: "小", px: 14 },
  { value: "normal", label: "標準", px: 16 },
  { value: "large", label: "大", px: 18 },
  { value: "xlarge", label: "特大", px: 20 },
];

export const REDUCE_MOTIONS: { value: ReduceMotion; label: string }[] = [
  { value: "system", label: "OS に合わせる" },
  { value: "on", label: "減らす" },
  { value: "off", label: "減らさない" },
];

export const START_PAGES: { value: StartPage; label: string; path?: string }[] = [
  { value: "home", label: "Home", path: "/" },
  { value: "folder", label: "Folder", path: "/folder" },
  { value: "note", label: "Note", path: "/note" },
  { value: "wiki", label: "Wiki", path: "/wiki" },
  { value: "docs", label: "Docs", path: "/docs" },
  { value: "last", label: "前回の画面" },
];

const STORAGE_KEY = "preferences";
const LAST_PAGE_KEY = "last-page";
// ほかの画面が自分で覚えている設定（書き出し・読み込みに含める）
const EDITOR_MODE_KEY = "editor-mode";
const CONTENT_SORT_KEY = "content-sort";
const THEME_KEY = "theme";

const listeners = new Set<() => void>();

function read(): Preferences {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value) {
      return sanitize(JSON.parse(value));
    }
  } catch {
    // 読めなければ既定の値
  }
  return DEFAULT_PREFERENCES;
}

// 知らない値・壊れた値は既定の値にする（書き出したファイルを手で直した場合など）
function sanitize(value: unknown): Preferences {
  const input = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const pick = <T>(key: keyof Preferences, allowed: readonly T[]): T =>
    allowed.includes(input[key] as T) ? (input[key] as T) : (DEFAULT_PREFERENCES[key] as T);
  return {
    fontSize: pick("fontSize", FONT_SIZES.map((size) => size.value)),
    // 以前はオン・オフ（true / false）で保存していた
    reduceMotion:
      input.reduceMotion === true
        ? "on"
        : pick("reduceMotion", REDUCE_MOTIONS.map((motion) => motion.value)),
    startPage: pick("startPage", START_PAGES.map((page) => page.value)),
    confirmDelete: pick("confirmDelete", [true, false]),
    showHidden: pick("showHidden", [true, false]),
    folderPreviewPane: pick("folderPreviewPane", [true, false]),
    buttonHints: pick("buttonHints", [true, false]),
    // 知らない種類・重なりは除く。すべて選んでいれば「すべて」（空）と同じ
    searchTypes: (() => {
      const known = SEARCH_TYPES.map((type) => type.value);
      const types = Array.isArray(input.searchTypes)
        ? known.filter((type) => (input.searchTypes as unknown[]).includes(type))
        : [];
      return types.length === known.length ? [] : types;
    })(),
  };
}

let preferences = read();
const motionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");

function apply() {
  const root = document.documentElement;
  const size = FONT_SIZES.find((item) => item.value === preferences.fontSize) ?? FONT_SIZES[1];
  // Tailwind の大きさは rem なので、根元の文字の大きさを変えると画面全体が大きくなる
  root.style.fontSize = `${size.px}px`;
  root.classList.toggle(
    "reduce-motion",
    preferences.reduceMotion === "on" ||
      (preferences.reduceMotion === "system" && motionMedia.matches),
  );
  listeners.forEach((listener) => listener());
}

motionMedia.addEventListener("change", apply);
apply();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // 保存できなくても、開いている間は使う
  }
  apply();
}

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
  preferences = { ...preferences, [key]: value };
  save();
}

export function getPreferences() {
  return preferences;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePreferences() {
  return useSyncExternalStore(subscribe, () => preferences);
}

function readKey(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string | null) {
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // 保存できない環境では何もしない
  }
}

// 「前回の画面」で開ける画面（設定画面も含める。メニューは設定画面の URL の ?section= で覚える）
const LAST_PAGES = [...START_PAGES.flatMap((page) => (page.path ? [page.path] : [])), "/setting"];

// 前回の画面（startPage が last のとき使う）。パスと ?以降を覚える
export function rememberLastPage(pathname: string, search: string) {
  if (LAST_PAGES.includes(pathname)) {
    writeKey(LAST_PAGE_KEY, pathname + (pathname === "/setting" ? search : ""));
  }
}

// 起動したときに開く画面。前回の画面が無いとき・Docs を使わない設定で Docs のときは Home
export function startPath(docsEnabled: boolean) {
  const page = START_PAGES.find((item) => item.value === preferences.startPage);
  const last = readKey(LAST_PAGE_KEY) ?? "";
  const path = page?.path ?? (LAST_PAGES.includes(last.split("?")[0]) ? last : "/");
  return !docsEnabled && path === "/docs" ? "/" : path;
}

// Note・Wiki の表示（編集・分割・プレビュー）。画面でも切り替えるたびに覚える
export type EditorMode = "edit" | "live" | "preview";

export function getEditorMode(): EditorMode {
  const value = readKey(EDITOR_MODE_KEY);
  return value === "edit" || value === "live" ? value : "preview";
}

export function setEditorMode(mode: EditorMode) {
  writeKey(EDITOR_MODE_KEY, mode);
}

// 設定の書き出し・読み込み（別の PC に同じ設定を移す）
type ExportedSettings = {
  app: "ari-docs";
  version: 1;
  preferences: Preferences;
  theme: ThemePreference;
  editorMode: EditorMode;
  contentSort: string;
  // Vim モード（FN0702）。無いファイル（以前に書き出したもの）は変えない
  vim?: VimSettings;
};

export function exportSettings(theme: ThemePreference): string {
  const data: ExportedSettings = {
    app: "ari-docs",
    version: 1,
    preferences,
    theme,
    editorMode: getEditorMode(),
    contentSort: readKey(CONTENT_SORT_KEY) === "title" ? "title" : "updated",
    vim: getVimSettings(),
  };
  return JSON.stringify(data, null, 2);
}

// 読み込めなければ例外（画面にそのまま出す文言）
export function importSettings(text: string) {
  let data: Partial<ExportedSettings>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("設定のファイルを読めません（JSON ではありません）");
  }
  if (data?.app !== "ari-docs") {
    throw new Error("ari-docs の設定のファイルではありません");
  }
  preferences = sanitize(data.preferences);
  save();
  if (data.theme === "light" || data.theme === "dark" || data.theme === "system") {
    setThemePreference(data.theme);
  }
  if (data.editorMode === "edit" || data.editorMode === "live" || data.editorMode === "preview") {
    setEditorMode(data.editorMode);
  }
  writeKey(CONTENT_SORT_KEY, data.contentSort === "title" ? "title" : null);
  if (data.vim) {
    replaceVimSettings(data.vim);
  }
}

// この PC の画面の設定をすべて初めの状態に戻す（ログインの情報は消さない）
export function resetSettings() {
  for (const key of [STORAGE_KEY, LAST_PAGE_KEY, EDITOR_MODE_KEY, CONTENT_SORT_KEY, THEME_KEY]) {
    writeKey(key, null);
  }
  preferences = DEFAULT_PREFERENCES;
  apply();
  setThemePreference("system");
  replaceVimSettings(DEFAULT_VIM_SETTINGS);
}
