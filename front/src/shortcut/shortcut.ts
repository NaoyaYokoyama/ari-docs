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
      alt: true,
      key: String(index + 1),
      pages: ALL_PAGES,
      description: item.description,
      focus: item.focus,
    },
  }));
}

export function isShortcut(e: KeyboardEvent, shortcut: Shortcut) {
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
  keys.push(shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key);
  return keys;
}

export function shortcutLabel(shortcut: Shortcut) {
  return shortcutKeys(shortcut).join("+");
}
