import {
  ClipboardPaste,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileArchive,
  FilePlus,
  FolderOpen,
  FolderPlus,
  FolderSearch,
  FolderUp,
  FolderX,
  GitCompare,
  Info,
  Link2,
  ListChecks,
  Pencil,
  RefreshCw,
  Scissors,
  Star,
  Trash2,
  Upload,
} from "lucide-react";

import type { ContextMenuItem } from "@/components/common/ContextMenu";
import type { Clipboard } from "@/pages/node/useNodeActions";
import { SHORTCUT, shortcutLabel } from "@/shortcut/shortcut";
import type { Node } from "@/types/node";
import { NodeType } from "@/types/nodeType";

type MenuContext = {
  currentPath: string;
  shared: boolean;
  // ファイルがこの PC にある（ローカルモード）
  filesHere: boolean;
  clipboard: Clipboard | null;
  // 選んでいるもの
  selectedNodes: Node[];
  open: (node: Node) => void;
  preview: (node: Node) => void;
  download: (node: Node) => void;
  downloadAsZip: (nodes: Node[]) => void;
  reveal: (node: Node) => void;
  copyToClipboard: (mode: Clipboard["mode"]) => void;
  paste: (destPath: string) => void;
  startRename: (node: Node) => void;
  toggleFavorite: (node: Node) => void;
  openDetails: (node: Node) => void;
  remove: (nodes: Node[]) => void;
  create: (type: NodeType) => void;
  uploadFiles: () => void;
  uploadFolder: () => void;
  selectAll: () => void;
  refresh: () => void;
  // ari-docs の中のリンク（FN0004）
  copyLink: (nodes: Node[]) => void;
  copyFolderLink: () => void;
  // 検索の対象外（FN0202-BR16・BR17）。全員の対象外にできる（ローカルモード、共有モードの管理者と許可を付けた利用者。FN0102-BR11）
  canExcludeForAll: boolean;
  excludeFromSearch: (path: string, forAll: boolean) => void;
  // 比べる（FN0304-BR01）。比べる相手に選んだもの（無ければ null）
  compareBase: { path: string; isDir: boolean } | null;
  pickCompareBase: (node: Node) => void;
  compare: (left: string, right: string, isDir: boolean) => void;
};

function baseName(path: string) {
  return path.split("/").pop() ?? path;
}

// 比べる項目。2 つ選んでいればその 2 つ、1 つなら「比べる相手に選ぶ」と、選んである相手と比べる
function compareItems(context: MenuContext): ContextMenuItem[] {
  const { selectedNodes, compareBase } = context;
  if (selectedNodes.length === 2) {
    const [left, right] = selectedNodes;
    const isDir = left.nodeType === NodeType.Folder;
    if (isDir !== (right.nodeType === NodeType.Folder)) {
      return [];
    }
    return [{ label: "2 つを比べる", icon: GitCompare, onSelect: () => context.compare(left.path, right.path, isDir) }];
  }
  if (selectedNodes.length !== 1) {
    return [];
  }
  const node = selectedNodes[0];
  const isDir = node.nodeType === NodeType.Folder;
  const items: ContextMenuItem[] = [];
  if (compareBase && compareBase.isDir === isDir && compareBase.path !== node.path) {
    items.push({
      label: `「${baseName(compareBase.path)}」と比べる`,
      icon: GitCompare,
      onSelect: () => context.compare(compareBase.path, node.path, isDir),
    });
  }
  items.push({ label: "比べる相手に選ぶ", icon: GitCompare, onSelect: () => context.pickCompareBase(node) });
  return items;
}

// 検索の対象から外す項目。ローカルモードは 1 つ、共有モードは自分だけと（管理者なら）全員
function excludeItems(context: MenuContext, path: string, label: string): ContextMenuItem[] {
  if (!context.shared) {
    return [{ label, icon: FolderX, onSelect: () => context.excludeFromSearch(path, true) }];
  }
  const items: ContextMenuItem[] = [
    { label: `${label}（自分だけ）`, icon: FolderX, onSelect: () => context.excludeFromSearch(path, false) },
  ];
  if (context.canExcludeForAll) {
    items.push({ label: `${label}（全員）`, icon: FolderX, onSelect: () => context.excludeFromSearch(path, true) });
  }
  return items;
}

function pasteItem(context: MenuContext, dest: string): ContextMenuItem {
  return {
    label: context.clipboard ? `貼り付け（${context.clipboard.paths.length} 件）` : "貼り付け",
    icon: ClipboardPaste,
    shortcut: shortcutLabel(SHORTCUT.FOLDER_PASTE),
    disabled: !context.clipboard,
    onSelect: () => context.paste(dest),
  };
}

// 空いているところの右クリックのメニュー（FN0301-BR24）。対象は表示中のフォルダ
export function backgroundMenu(context: MenuContext): ContextMenuItem[] {
  return [
    { label: "新しいフォルダ", icon: FolderPlus, shortcut: shortcutLabel(SHORTCUT.CREATE), onSelect: () => context.create(NodeType.Folder) },
    { label: "新しいファイル", icon: FilePlus, onSelect: () => context.create(NodeType.File) },
    { label: "ファイルをアップロード", icon: Upload, onSelect: context.uploadFiles },
    { label: "フォルダをアップロード", icon: FolderUp, onSelect: context.uploadFolder },
    "separator",
    pasteItem(context, context.currentPath),
    { label: "このフォルダのリンクをコピー", icon: Link2, shortcut: shortcutLabel(SHORTCUT.FOLDER_COPY_LINK), onSelect: context.copyFolderLink },
    ...(context.currentPath ? excludeItems(context, context.currentPath, "このフォルダを検索の対象から外す") : []),
    "separator",
    { label: "すべて選択", icon: ListChecks, shortcut: shortcutLabel(SHORTCUT.FOLDER_SELECT_ALL), onSelect: context.selectAll },
    { label: "再読み込み", icon: RefreshCw, onSelect: context.refresh },
  ];
}

// 行の右クリックのメニュー（FN0301-BR24）。対象は選んでいるもの。1 件のときだけのものは 2 件以上では出さない
export function nodeMenu(context: MenuContext): ContextMenuItem[] {
  const { selectedNodes } = context;
  const node = selectedNodes.length === 1 ? selectedNodes[0] : null;
  const folder = node?.nodeType === NodeType.Folder;
  const items: ContextMenuItem[] = [];
  if (node) {
    items.push({
      label: "開く",
      icon: folder ? FolderOpen : ExternalLink,
      shortcut: shortcutLabel(SHORTCUT.FOLDER_OPEN),
      onSelect: () => context.open(node),
    });
    if (!folder) {
      items.push(
        { label: "プレビュー", icon: Eye, shortcut: shortcutLabel(SHORTCUT.FOLDER_PREVIEW), onSelect: () => context.preview(node) },
        { label: "ダウンロード", icon: Download, onSelect: () => context.download(node) },
      );
    }
    items.push({ label: "ZIP でダウンロード", icon: FileArchive, onSelect: () => context.downloadAsZip([node]) });
    if (context.filesHere) {
      items.push({ label: "ファイルの場所を開く", icon: FolderSearch, onSelect: () => context.reveal(node) });
    }
  } else {
    items.push({
      label: `ZIP でダウンロード（${selectedNodes.length} 件）`,
      icon: FileArchive,
      onSelect: () => context.downloadAsZip(selectedNodes),
    });
  }
  const compare = compareItems(context);
  if (compare.length > 0) {
    items.push("separator", ...compare);
  }
  items.push(
    "separator",
    { label: "切り取り", icon: Scissors, shortcut: shortcutLabel(SHORTCUT.FOLDER_CUT), onSelect: () => context.copyToClipboard("cut") },
    { label: "コピー", icon: Copy, shortcut: shortcutLabel(SHORTCUT.FOLDER_COPY), onSelect: () => context.copyToClipboard("copy") },
    {
      label: node ? "リンクをコピー" : `リンクをコピー（${selectedNodes.length} 件）`,
      icon: Link2,
      shortcut: shortcutLabel(SHORTCUT.FOLDER_COPY_LINK),
      onSelect: () => context.copyLink(selectedNodes),
    },
  );
  if (node && folder) {
    items.push(pasteItem(context, node.path));
  }
  if (node) {
    items.push(
      "separator",
      { label: "名前の変更", icon: Pencil, shortcut: shortcutLabel(SHORTCUT.FOLDER_RENAME), onSelect: () => context.startRename(node) },
      {
        label: node.favoriteId ? "お気に入り解除" : "お気に入りに追加",
        icon: Star,
        onSelect: () => context.toggleFavorite(node),
      },
      ...excludeItems(context, node.path, "検索の対象から外す"),
      { label: "詳細・説明", icon: Info, onSelect: () => context.openDetails(node) },
    );
  }
  items.push("separator", {
    label: selectedNodes.length > 1 ? `ゴミ箱に移動（${selectedNodes.length} 件）` : "ゴミ箱に移動",
    icon: Trash2,
    shortcut: shortcutLabel(SHORTCUT.FOLDER_DELETE),
    danger: true,
    onSelect: () => context.remove(selectedNodes),
  });
  return items;
}
