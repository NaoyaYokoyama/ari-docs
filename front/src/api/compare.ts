import { post } from "@/api/client";
import type { FileCompare, FolderCompare } from "@/types/compare";

// 2 つのファイルを比べる（API0317）。パスは folder/ からの相対パス
export function compareFiles(left: string, right: string) {
  return post<FileCompare>("/api/compare/files", { left, right });
}

// 2 つのフォルダを比べる（API0318）
export function compareFolders(left: string, right: string) {
  return post<FolderCompare>("/api/compare/folders", { left, right });
}
