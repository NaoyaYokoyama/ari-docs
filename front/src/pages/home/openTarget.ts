import type { NavigateOptions } from "react-router-dom";

// お気に入り・検索結果から開く画面。ノードは Folder 画面で親フォルダを開き、対象を選ぶ
export function targetOf(item: {
  noteId: string;
  wikiId: string;
  nodeId: string;
  name: string;
}): [string, NavigateOptions] | null {
  if (item.wikiId) {
    return ["/wiki", { state: { wikiId: item.wikiId } }];
  }
  if (item.noteId) {
    return ["/note", { state: { noteId: item.noteId } }];
  }
  if (item.nodeId || item.name) {
    return ["/folder", { state: { nodePath: item.name } }];
  }
  return null;
}

// "a/b/c.txt" -> ["c.txt", "a/b"]
export function splitPath(path: string): [string, string] {
  const index = path.lastIndexOf("/");
  return index === -1 ? [path, ""] : [path.slice(index + 1), path.slice(0, index)];
}
