import { useSyncExternalStore } from "react";

import { personalSettingsChanged } from "@/app/personalSettings";

export type ShortcutPage =
  | "dashboard"
  | "folder"
  | "note"
  | "wiki"
  | "docs"
  | "setting";

export type Shortcut = {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  key: string;
  pages: ShortcutPage[];
  description: string;
  focus?: string;
};

const ALL_PAGES: ShortcutPage[] = [
  "dashboard",
  "folder",
  "note",
  "wiki",
  "docs",
  "setting",
];

export const SHORTCUT = {
  // 探して開く（FN0003）。Vim の ctrlp.vim・VS Code と同じ。Vim モードでは o でも開く
  QUICK_OPEN: {
    ctrl: true,
    key: "p",
    pages: ALL_PAGES,
    description: "探して開く（Note・Wiki・ファイル・画面・操作）",
  },

  // 場所（自分の PC・共有サーバー）を切り替える（FN0002-BR20。デスクトップアプリだけ）。Alt+1〜6 は画面の移動
  PLACE_SWITCH: {
    alt: true,
    key: "0",
    pages: ALL_PAGES,
    description: "場所（自分の PC・共有サーバー）を切り替える（デスクトップアプリ）",
  },

  // "?" は配列によって Shift が要らないため、Shift の有無は見ない（isShortcut）
  HELP: {
    key: "?",
    pages: ALL_PAGES,
    description: "ショートカットの一覧",
  },

  CREATE: {
    ctrl: true,
    key: "n",
    pages: ["folder", "note", "wiki"],
    description: "新規作成",
  },

  SAVE: {
    ctrl: true,
    key: "s",
    pages: ["note", "wiki"],
    description: "保存",
  },

  DELETE: {
    key: "Delete",
    pages: ["note", "wiki"],
    description: "削除",
  },

  RENAME: {
    key: "F2",
    pages: ["note", "wiki"],
    description: "名前変更（タイトルへ移動）",
  },

  // Note・Wiki の本文の書式（FN0404-BR04）。本文を書いているときだけ（Vim のエディタは挿入モードのときだけ）
  MD_BOLD: { ctrl: true, key: "b", pages: ["note", "wiki"], description: "太字（本文）" },
  MD_ITALIC: { ctrl: true, key: "i", pages: ["note", "wiki"], description: "斜体（本文）" },
  MD_STRIKE: { ctrl: true, shift: true, key: "x", pages: ["note", "wiki"], description: "取り消し線（本文）" },
  MD_CODE: { ctrl: true, key: "e", pages: ["note", "wiki"], description: "コード（本文）" },
  MD_LINK: { ctrl: true, key: "k", pages: ["note", "wiki"], description: "リンク（本文）" },
  MD_FORMAT_TABLE: { alt: true, shift: true, key: "f", pages: ["note", "wiki"], description: "表を整える（本文）" },
  // フォルダ画面（FN0301-BR24）
  FOLDER_OPEN: { key: "Enter", pages: ["folder"], description: "開く" },
  FOLDER_PREVIEW: { key: " ", pages: ["folder"], description: "プレビュー" },
  FOLDER_PREVIEW_PANE: { alt: true, key: "p", pages: ["folder"], description: "右のプレビューを出す・しまう" },
  FOLDER_DELETE: { key: "Delete", pages: ["folder"], description: "削除" },
  FOLDER_RENAME: { key: "F2", pages: ["folder"], description: "名前の変更" },
  FOLDER_SELECT_ALL: { ctrl: true, key: "a", pages: ["folder"], description: "すべて選択" },
  FOLDER_COPY: { ctrl: true, key: "c", pages: ["folder"], description: "コピー" },
  FOLDER_COPY_LINK: {
    ctrl: true,
    shift: true,
    key: "c",
    pages: ["folder"],
    description: "リンクをコピー（ari-docs の中で開ける。選んでいなければ表示中のフォルダ）",
  },
  FOLDER_CUT: { ctrl: true, key: "x", pages: ["folder"], description: "切り取り" },
  FOLDER_PASTE: { ctrl: true, key: "v", pages: ["folder"], description: "貼り付け" },
  FOLDER_FILTER: { ctrl: true, key: "f", pages: ["folder"], description: "絞り込み" },
  FOLDER_PARENT: { key: "Backspace", pages: ["folder"], description: "一つ上のフォルダへ" },
  FOLDER_CLEAR: { key: "Escape", pages: ["folder"], description: "選択を外す" },

  FOCUS_LEFT: {
    alt: true,
    key: "h",
    pages: ["note", "wiki"],
    description: "左の領域へ移動",
  },

  FOCUS_DOWN: {
    alt: true,
    key: "j",
    pages: ["note", "wiki"],
    description: "下の領域へ移動",
  },

  FOCUS_UP: {
    alt: true,
    key: "k",
    pages: ["note", "wiki"],
    description: "上の領域へ移動",
  },

  FOCUS_RIGHT: {
    alt: true,
    key: "l",
    pages: ["note", "wiki"],
    description: "右の領域へ移動",
  },
} satisfies Record<string, Shortcut>;

// 探して開くを開くよう頼む出来事（Vim モードの o・本文の Vim のエディタの :e から送る。detail は最初に入れておく文字）
export const QUICK_OPEN_EVENT = "quick-open";

// 画面移動（ヘッダーのメニューと同じ順。Setting は一番右）
export type NavigationPage = "home" | "folder" | "note" | "wiki" | "docs" | "setting";

export type NavigationItem = {
  page: NavigationPage;
  label: string;
  path: string;
  shortcut: Shortcut;
};

const NAVIGATION_PAGES: { page: NavigationPage; label: string; path: string; description: string; focus?: string }[] = [
  { page: "home", label: "Home", path: "/", description: "ホームへ移動", focus: "search" },
  { page: "folder", label: "Folder", path: "/folder", description: "フォルダへ移動" },
  { page: "note", label: "Note", path: "/note", description: "Noteへ移動" },
  { page: "wiki", label: "Wiki", path: "/wiki", description: "Wikiへ移動" },
  { page: "docs", label: "Docs", path: "/docs", description: "Docsへ移動" },
  { page: "setting", label: "Setting", path: "/setting", description: "設定へ移動" },
];

// Alt+数字は、ヘッダーに出ている画面へ左から順に振る（機能ごとに決めない）。
// Docs を使わない設定（サーバーの設定。既定）では Docs を出さないので、Setting が Alt+5 になる
export function navigationItems(docsEnabled: boolean): NavigationItem[] {
  return NAVIGATION_PAGES.filter((item) => docsEnabled || item.page !== "docs").map((item, index) => ({
    page: item.page,
    label: item.label,
    path: item.path,
    shortcut: {
      ...(overrides[`NAV_${item.page}`] ?? { alt: true, key: String(index + 1) }),
      pages: ALL_PAGES,
      description: item.description,
      focus: item.focus,
    },
  }));
}

export function isShortcut(e: KeyboardEvent, shortcut: Shortcut) {
  // 設定画面でキーを決めている間は、どのショートカットも動かさない
  if (capturing) {
    return false;
  }
  return (
    e.altKey === !!shortcut.alt &&
    e.ctrlKey === !!shortcut.ctrl &&
    (shortcut.key === "?" || e.shiftKey === !!shortcut.shift) &&
    e.key.toLowerCase() === shortcut.key.toLowerCase()
  );
}

// 入力欄・エディタで文字を打っている最中か（Delete・? などの 1 キーのショートカットを効かせない）
export function isTyping(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  if (!target) {
    return false;
  }
  return (
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    target.isContentEditable
  );
}

// 表示用のキーの並び。例: ["Alt", "1"]
export function shortcutKeys(shortcut: Shortcut) {
  const keys: string[] = [];
  if (shortcut.ctrl) {
    keys.push("Ctrl");
  }
  if (shortcut.alt) {
    keys.push("Alt");
  }
  if (shortcut.shift) {
    keys.push("Shift");
  }
  const names: Record<string, string> = { " ": "Space", Escape: "Esc", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };
  keys.push(names[shortcut.key] ?? (shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key));
  return keys;
}

export function shortcutLabel(shortcut: Shortcut) {
  return shortcutKeys(shortcut).join("+");
}

// ---- キーの変更（FN0701-BR16）----
// 利用者が操作ごとにキーを変えられる。変えたものだけを localStorage の shortcut-keys に保存する（個人の設定。FN0701-BR15）。
// SHORTCUT の値をその場で書き換えるので、isShortcut・shortcutLabel を使っているところはそのまま新しいキーで動く。
// 画面移動（Alt+数字）は NAV_<画面> で変える。? の一覧（HELP）は変えない（配列によって Shift が要るため）

export type KeyCombo = { ctrl?: boolean; alt?: boolean; shift?: boolean; key: string };
export type ShortcutId = Exclude<keyof typeof SHORTCUT, "HELP">;
export type CustomShortcutId = ShortcutId | `NAV_${NavigationPage}`;

const KEYS_STORAGE = "shortcut-keys";
const SHORTCUTS = SHORTCUT as Record<string, Shortcut>;

function comboOf(shortcut: KeyCombo): KeyCombo {
  return { ctrl: !!shortcut.ctrl, alt: !!shortcut.alt, shift: !!shortcut.shift, key: shortcut.key };
}

// 変える前のキー（初期化で戻すため）
const DEFAULT_COMBOS: Record<string, KeyCombo> = Object.fromEntries(
  Object.entries(SHORTCUTS).map(([id, shortcut]) => [id, comboOf(shortcut)]),
);

function isCustomId(id: string): id is CustomShortcutId {
  return (id in SHORTCUTS && id !== "HELP") || NAVIGATION_PAGES.some((item) => `NAV_${item.page}` === id);
}

function sanitizeCombo(value: unknown): KeyCombo | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const input = value as Record<string, unknown>;
  if (typeof input.key !== "string" || input.key === "" || input.key.length > 20) {
    return null;
  }
  return comboOf({ ctrl: input.ctrl === true, alt: input.alt === true, shift: input.shift === true, key: input.key });
}

function sanitizeOverrides(value: unknown): Partial<Record<CustomShortcutId, KeyCombo>> {
  const result: Partial<Record<CustomShortcutId, KeyCombo>> = {};
  if (value && typeof value === "object") {
    for (const [id, combo] of Object.entries(value)) {
      const sanitized = sanitizeCombo(combo);
      if (isCustomId(id) && sanitized) {
        result[id] = sanitized;
      }
    }
  }
  return result;
}

function readOverrides() {
  try {
    const value = localStorage.getItem(KEYS_STORAGE);
    return value ? sanitizeOverrides(JSON.parse(value)) : {};
  } catch {
    return {};
  }
}

let overrides = readOverrides();
let version = 0;
let capturing = false;
const listeners = new Set<() => void>();

function apply() {
  for (const [id, combo] of Object.entries(DEFAULT_COMBOS)) {
    const next = overrides[id as CustomShortcutId] ?? combo;
    const shortcut = SHORTCUTS[id];
    shortcut.ctrl = next.ctrl;
    shortcut.alt = next.alt;
    shortcut.shift = next.shift;
    shortcut.key = next.key;
  }
  version++;
  listeners.forEach((listener) => listener());
}

apply();

function save() {
  try {
    if (Object.keys(overrides).length === 0) {
      localStorage.removeItem(KEYS_STORAGE);
    } else {
      localStorage.setItem(KEYS_STORAGE, JSON.stringify(overrides));
    }
  } catch {
    // 保存できなくても、開いている間は使う
  }
  personalSettingsChanged();
  apply();
}

function sameCombo(a: KeyCombo, b: KeyCombo) {
  return !!a.ctrl === !!b.ctrl && !!a.alt === !!b.alt && !!a.shift === !!b.shift && a.key.toLowerCase() === b.key.toLowerCase();
}

// 変えられる操作（設定画面の一覧の順）。画面移動は今ヘッダーに出ているものだけ
export function customShortcuts(docsEnabled: boolean): { id: CustomShortcutId; shortcut: Shortcut; changed: boolean }[] {
  const navigation = navigationItems(docsEnabled).map((item) => {
    const id: CustomShortcutId = `NAV_${item.page}`;
    return { id, shortcut: item.shortcut, changed: !!overrides[id] };
  });
  const others = (Object.keys(SHORTCUTS) as (keyof typeof SHORTCUT)[])
    .filter((id): id is ShortcutId => id !== "HELP")
    .map((id) => ({ id, shortcut: SHORTCUTS[id], changed: !!overrides[id] }));
  return [...navigation, ...others];
}

// 同じ画面で同じキーを使っているほかの操作（無ければ null）。? は変えられないが、ぶつかるかは見る
export function conflictOf(id: CustomShortcutId, combo: KeyCombo, docsEnabled: boolean): Shortcut | null {
  const target = customShortcuts(docsEnabled).find((item) => item.id === id)?.shortcut;
  if (!target) {
    return null;
  }
  const candidates = [...customShortcuts(docsEnabled).filter((item) => item.id !== id).map((item) => item.shortcut), SHORTCUT.HELP];
  return (
    candidates.find(
      (other) =>
        (other === SHORTCUT.HELP ? combo.key === "?" : sameCombo(other, combo)) &&
        other.pages.some((page) => target.pages.includes(page)),
    ) ?? null
  );
}

// キーを変える。null なら元のキーに戻す
export function setShortcutKey(id: CustomShortcutId, combo: KeyCombo | null) {
  const next = { ...overrides };
  if (combo) {
    next[id] = comboOf(combo);
  } else {
    delete next[id];
  }
  overrides = next;
  save();
}

// 設定の書き出し・読み込み・初期化（preferences.ts）から使う
export function getShortcutOverrides() {
  return overrides;
}

export function replaceShortcutOverrides(value: unknown) {
  overrides = sanitizeOverrides(value);
  save();
}

// 押したキーからキーの組み合わせを作る。修飾キーだけのときは null
export function comboFromEvent(e: KeyboardEvent | React.KeyboardEvent): KeyCombo | null {
  if (["Control", "Alt", "Shift", "Meta", "AltGraph", "CapsLock", "Process", "Unidentified", "Dead"].includes(e.key)) {
    return null;
  }
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  return { ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, shift: e.shiftKey, key };
}

// キーを決めている間（設定画面）はショートカットを止める
export function setShortcutCapturing(value: boolean) {
  capturing = value;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// キーを変えたら描き直すため（表示しているキーの名前を新しくする）
export function useShortcutVersion() {
  return useSyncExternalStore(subscribe, () => version);
}

// 別のタブ・ウィンドウで変えたときも合わせる
window.addEventListener("storage", (event) => {
  if (event.key === KEYS_STORAGE || event.key === null) {
    overrides = readOverrides();
    apply();
  }
});
