import { get, post } from "@/api/client";
import type { ContentFolders } from "@/types/contentFolder";

// Note・Wiki のフォルダ（FN0403）。kind は "note" / "wiki"
type Kind = "note" | "wiki";

export function getContentFolders(kind: Kind) {
  return get<ContentFolders>(`/api/content-folders/${kind}`);
}

// parentId が空なら一番上に作る
export function createContentFolder(kind: Kind, parentId: string, name: string) {
  return post<{ message: string; data: { folderId: string } }>("/api/content-folders/create", {
    kind,
    parentId,
    name,
  });
}

export function renameContentFolder(kind: Kind, folderId: string, name: string) {
  return post("/api/content-folders/rename", { kind, folderId, name });
}

// 中が空のフォルダだけ削除できる（中身があれば 409）
export function deleteContentFolder(kind: Kind, folderId: string) {
  return post("/api/content-folders/delete", { kind, folderId });
}

// フォルダと Note・Wiki を destId のフォルダへ移す（空なら一番上）
export function moveToContentFolder(
  kind: Kind,
  folderIds: string[],
  itemIds: string[],
  destId: string,
) {
  return post("/api/content-folders/move", { kind, folderIds, itemIds, destId });
}
