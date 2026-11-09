import { BookOpen, FileText, type LucideIcon } from "lucide-react";

import { createFavoriteNote, createFavoriteWiki } from "@/api/favorite";
import { createNote, deleteNote, getNote, getNotes, updateNote } from "@/api/note";
import { createWiki, deleteWiki, getWiki, getWikis, updateWiki } from "@/api/wiki";

// Note と Wiki は同じ画面（ContentPage）で扱う。違いはここにまとめる
export type ContentItem = {
  id: string;
  title: string;
  updatedAt: string;
};

export type ContentDetail = ContentItem & {
  content: string;
  favoriteId: string;
  // 最後に更新した人の表示名（Wiki だけ）
  updatedBy?: string;
};

export type ContentKind = {
  kind: "note" | "wiki";
  // 画面・メッセージでの呼び名
  label: string;
  icon: LucideIcon;
  description: string;
  // 他の画面から開くときの location.state のキー
  stateKey: "noteId" | "wikiId";
  // タイトルの入力欄の最大文字数（作成時はサーバーの制限に合わせる）
  titleMaxLength: number;
  createMaxLength: number;
  list: () => Promise<ContentItem[]>;
  get: (id: string) => Promise<ContentDetail>;
  create: (title: string) => Promise<ContentDetail>;
  // baseUpdatedAt と今の更新日時が違えば 409（force なら上書き）。保存したあとの更新日時を返す
  update: (
    id: string,
    title: string,
    content: string,
    baseUpdatedAt?: string,
    force?: boolean,
  ) => Promise<{ data: { updatedAt: string } }>;
  remove: (id: string) => Promise<unknown>;
  addFavorite: (id: string) => Promise<{ data: { favoriteId: string } }>;
};

export const NOTE: ContentKind = {
  kind: "note",
  label: "Note",
  icon: FileText,
  description: "自分だけが見られるメモです",
  stateKey: "noteId",
  titleMaxLength: 25,
  createMaxLength: 25,
  list: async () =>
    (await getNotes()).notes.map((note) => ({
      id: note.noteId,
      title: note.title,
      updatedAt: note.updatedAt,
    })),
  get: async (id) => {
    const note = await getNote(id);
    return { ...note, id: note.noteId };
  },
  create: async (title) => {
    const note = await createNote(title);
    return { ...note, id: note.noteId };
  },
  update: updateNote,
  remove: deleteNote,
  addFavorite: createFavoriteNote,
};

export const WIKI: ContentKind = {
  kind: "wiki",
  label: "Wiki",
  icon: BookOpen,
  description: "全員で共有するページです",
  stateKey: "wikiId",
  titleMaxLength: 25,
  // サーバーは 1〜20 文字までしか作成できない（FN0501-BR02）
  createMaxLength: 20,
  list: async () =>
    (await getWikis()).wikis.map((wiki) => ({
      id: wiki.wikiId,
      title: wiki.title,
      updatedAt: wiki.updatedAt,
    })),
  get: async (id) => {
    const wiki = await getWiki(id);
    return { ...wiki, id: wiki.wikiId };
  },
  create: async (title) => {
    const wiki = await createWiki(title);
    return { ...wiki, id: wiki.wikiId };
  },
  update: updateWiki,
  remove: deleteWiki,
  addFavorite: createFavoriteWiki,
};
