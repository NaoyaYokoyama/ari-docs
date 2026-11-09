import { timeOf } from "@/lib/format";
import type { ContentItem } from "@/pages/content/contentKinds";
import type { ContentFolder, ContentFolders } from "@/types/contentFolder";

// Note・Wiki のフォルダの木（FN0403）。サーバーから受け取った平らな一覧を、画面で使う形にする
export type Sort = "updated" | "title";

export type Tree = {
  folders: Map<string, ContentFolder>;
  // 親のフォルダ ID（'' は一番上）→ 子のフォルダ（名前順）
  childFolders: Map<string, ContentFolder[]>;
  // Note・Wiki の ID → 入っているフォルダ（無ければ一番上）
  folderOf: Map<string, string>;
};

export function buildTree(data: ContentFolders | null): Tree {
  const folders = new Map((data?.folders ?? []).map((folder) => [folder.folderId, folder]));
  const childFolders = new Map<string, ContentFolder[]>();
  for (const folder of folders.values()) {
    // 親が消えていたら一番上に出す（壊れたデータでも見失わないように）
    const parent = folders.has(folder.parentId) ? folder.parentId : "";
    childFolders.set(parent, [...(childFolders.get(parent) ?? []), folder]);
  }
  for (const list of childFolders.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }
  const folderOf = new Map(
    (data?.items ?? [])
      .filter((item) => folders.has(item.folderId))
      .map((item) => [item.itemId, item.folderId]),
  );
  return { folders, childFolders, folderOf };
}

export function sortItems(items: ContentItem[], sort: Sort) {
  return [...items].sort((a, b) =>
    sort === "title"
      ? a.title.localeCompare(b.title, "ja")
      : timeOf(b.updatedAt) - timeOf(a.updatedAt),
  );
}

// 一覧に並べる行。フォルダを先に、その後に Note・Wiki
export type Row =
  | { type: "folder"; folder: ContentFolder; depth: number; open: boolean; count: number }
  | { type: "item"; item: ContentItem; depth: number; folderId: string };

export function rowKey(row: Row) {
  return row.type === "folder" ? `f:${row.folder.folderId}` : `i:${row.item.id}`;
}

// 開いているフォルダの中だけを並べる
export function visibleRows(
  tree: Tree,
  items: ContentItem[],
  sort: Sort,
  openFolders: Set<string>,
): Row[] {
  const itemsIn = new Map<string, ContentItem[]>();
  for (const item of sortItems(items, sort)) {
    const folderId = tree.folderOf.get(item.id) ?? "";
    itemsIn.set(folderId, [...(itemsIn.get(folderId) ?? []), item]);
  }
  // フォルダの中（下の階層も含む）の Note・Wiki の数
  const counts = new Map<string, number>();
  const countOf = (folderId: string): number => {
    const cached = counts.get(folderId);
    if (cached !== undefined) {
      return cached;
    }
    counts.set(folderId, 0);
    const count =
      (itemsIn.get(folderId)?.length ?? 0) +
      (tree.childFolders.get(folderId) ?? []).reduce((sum, child) => sum + countOf(child.folderId), 0);
    counts.set(folderId, count);
    return count;
  };

  const rows: Row[] = [];
  const walk = (folderId: string, depth: number, seen: Set<string>) => {
    for (const folder of tree.childFolders.get(folderId) ?? []) {
      if (seen.has(folder.folderId)) {
        continue;
      }
      const open = openFolders.has(folder.folderId);
      rows.push({ type: "folder", folder, depth, open, count: countOf(folder.folderId) });
      if (open) {
        walk(folder.folderId, depth + 1, new Set(seen).add(folder.folderId));
      }
    }
    for (const item of itemsIn.get(folderId) ?? []) {
      rows.push({ type: "item", item, depth, folderId });
    }
  };
  walk("", 0, new Set());
  return rows;
}

// フォルダの場所（"手順書 / サーバー"）。'' は一番上。探して開く（FN0003）はサーバーと同じ "/" でつなぐ
export function folderPath(tree: Tree, folderId: string, separator = " / ") {
  return ancestors(tree, folderId)
    .reverse()
    .map((id) => tree.folders.get(id)?.name ?? "")
    .join(separator);
}

// folderId 自身と、その親をたどった ID（近い順）
export function ancestors(tree: Tree, folderId: string) {
  const result: string[] = [];
  let current = folderId;
  while (current && tree.folders.has(current) && !result.includes(current)) {
    result.push(current);
    current = tree.folders.get(current)?.parentId ?? "";
  }
  return result;
}

// target が folderId 自身かその中か（フォルダを自分の中へは移せない）
export function isInside(tree: Tree, target: string, folderId: string) {
  return ancestors(tree, target).includes(folderId);
}

// 移動先に選べるフォルダを木の順に並べる（movingFolderIds とその中は除く）
export function folderOptions(tree: Tree, movingFolderIds: string[] = []) {
  const options: { folderId: string; name: string; depth: number }[] = [];
  const walk = (parentId: string, depth: number) => {
    for (const folder of tree.childFolders.get(parentId) ?? []) {
      if (movingFolderIds.includes(folder.folderId) || options.some((o) => o.folderId === folder.folderId)) {
        continue;
      }
      options.push({ folderId: folder.folderId, name: folder.name, depth });
      walk(folder.folderId, depth + 1);
    }
  };
  walk("", 0);
  return options;
}
