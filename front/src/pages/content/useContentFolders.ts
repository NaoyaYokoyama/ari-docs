import { useCallback, useMemo, useState } from "react";

import {
  createContentFolder,
  deleteContentFolder,
  getContentFolders,
  moveToContentFolder,
  renameContentFolder,
} from "@/api/contentFolder";
import { useApp } from "@/app/AppContext";
import { errorMessage } from "@/lib/format";
import type { ContentKind } from "@/pages/content/contentKinds";
import { buildTree } from "@/pages/content/contentTree";
import type { ContentFolder, ContentFolders } from "@/types/contentFolder";

// Note・Wiki のフォルダの読み込みと操作（FN0403）
export function useContentFolders(kind: ContentKind) {
  const { showMessage, showConfirm } = useApp();
  const [data, setData] = useState<ContentFolders | null>(null);
  const tree = useMemo(() => buildTree(data), [data]);

  const reload = useCallback(async () => {
    try {
      setData(await getContentFolders(kind.kind));
    } catch (error) {
      console.error(error);
      // フォルダが読めなくても、Note・Wiki は一番上に並べて使えるようにする
      setData({ folders: [], items: [] });
      showMessage("error", errorMessage(error, "フォルダの読み込みに失敗しました"));
    }
  }, [kind, showMessage]);

  // 成功したら null、失敗したら画面に出す文言を返す（名前の入力欄に出す）
  const create = async (parentId: string, name: string) => {
    try {
      const response = await createContentFolder(kind.kind, parentId, name);
      await reload();
      showMessage("info", `フォルダ「${name.trim()}」を作成しました`);
      return { folderId: response.data.folderId, error: null };
    } catch (error) {
      return { folderId: "", error: errorMessage(error, "フォルダの作成に失敗しました") };
    }
  };

  const rename = async (folder: ContentFolder, name: string) => {
    try {
      await renameContentFolder(kind.kind, folder.folderId, name);
      await reload();
      return null;
    } catch (error) {
      return errorMessage(error, "フォルダの名前を変更できませんでした");
    }
  };

  // 中が空のフォルダだけ削除できる（Note・Wiki にはゴミ箱が無いため。FN0403-BR05）
  const remove = async (folder: ContentFolder) => {
    if (!(await showConfirm(`フォルダ「${folder.name}」を削除しますか？`))) {
      return;
    }
    try {
      await deleteContentFolder(kind.kind, folder.folderId);
      showMessage("info", `フォルダ「${folder.name}」を削除しました`);
    } catch (error) {
      showMessage("error", errorMessage(error, "フォルダを削除できませんでした"));
    }
    await reload();
  };

  const move = async (folderIds: string[], itemIds: string[], destId: string) => {
    try {
      await moveToContentFolder(kind.kind, folderIds, itemIds, destId);
      const place = destId ? `「${tree.folders.get(destId)?.name ?? ""}」` : "一番上";
      showMessage("info", `${place}に移動しました`);
    } catch (error) {
      showMessage("error", errorMessage(error, "移動に失敗しました"));
    }
    await reload();
  };

  return { data, tree, reload, create, rename, remove, move };
}

export type ContentFoldersState = ReturnType<typeof useContentFolders>;
