export type ShortcutPage =
  | "dashboard"
  | "folder"
  | "note"
  | "wiki"
  | "setting";

export type Shortcut = {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  key: string;
  pages: ShortcutPage[];
  description: string;
};

export const SHORTCUT = {
  TO_HOME: {
    alt: true,
    key: "1",
    pages: [
      "dashboard",
      "folder",
      "note",
      "wiki",
      "setting",
    ],
    description: "ホームへ移動",
    focus: "search",
  },

  TO_FOLDER: {
    alt: true,
    key: "2",
    pages: [
      "dashboard",
      "folder",
      "note",
      "wiki",
      "setting",
    ],
    description: "フォルダへ移動",
  },

  TO_NOTE: {
    alt: true,
    key: "3",
    pages: [
      "dashboard",
      "folder",
      "note",
      "wiki",
      "setting",
    ],
    description: "個人メモへ移動",
  },

  TO_WIKI: {
    alt: true,
    key: "4",
    pages: [
      "dashboard",
      "folder",
      "note",
      "wiki",
      "setting",
    ],
    description: "Wikiへ移動",
  },

  TO_SETTING: {
    alt: true,
    key: "5",
    pages: [
      "dashboard",
      "folder",
      "note",
      "wiki",
      "setting",
    ],
    description: "設定へ移動",
  },

  SAVE: {
    ctrl: true,
    key: "s",
    pages: ["note", "wiki"],
    description: "保存",
  },

  DELETE: {
    key: "Delete",
    pages: ["folder", "note", "wiki"],
    description: "削除",
  },

  RENAME: {
    key: "F2",
    pages: ["folder", "note", "wiki"],
    description: "名前変更",
  },
} satisfies Record<string, Shortcut>;
