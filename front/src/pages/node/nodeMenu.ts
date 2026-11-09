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
import type { Node } from "@/types/node";
import { NodeType } from "@/types/nodeType";

type MenuContext = {
  currentPath: string;
  shared: boolean;
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
};

function pasteItem(context: MenuContext, dest: string): ContextMenuItem {
  return {
    label: context.clipboard ? `貼り付け（${context.clipboard.paths.length} 件）` : "貼り付け",
    icon: ClipboardPaste,
    shortcut: "Ctrl+V",
    disabled: !context.clipboard,
    onSelect: () => context.paste(dest),
  };
}

// 空いているところの右クリックのメニュー（FN0301-BR24）。対象は表示中のフォルダ
export function backgroundMenu(context: MenuContext): ContextMenuItem[] {
  return [
    { label: "新しいフォルダ", icon: FolderPlus, shortcut: "Ctrl+N", onSelect: () => context.create(NodeType.Folder) },
    { label: "新しいファイル", icon: FilePlus, onSelect: () => context.create(NodeType.File) },
    { label: "ファイルをアップロード", icon: Upload, onSelect: context.uploadFiles },
    { label: "フォルダをアップロード", icon: FolderUp, onSelect: context.uploadFolder },
    "separator",
    pasteItem(context, context.currentPath),
    { label: "このフォルダのリンクをコピー", icon: Link2, shortcut: "Ctrl+Shift+C", onSelect: context.copyFolderLink },
    "separator",
    { label: "すべて選択", icon: ListChecks, shortcut: "Ctrl+A", onSelect: context.selectAll },
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
      shortcut: "Enter",
      onSelect: () => context.open(node),
    });
    if (!folder) {
      items.push(
        { label: "プレビュー", icon: Eye, shortcut: "Space", onSelect: () => context.preview(node) },
        { label: "ダウンロード", icon: Download, onSelect: () => context.download(node) },
      );
    }
    items.push({ label: "ZIP でダウンロード", icon: FileArchive, onSelect: () => context.downloadAsZip([node]) });
    if (!context.shared) {
      items.push({ label: "ファイルの場所を開く", icon: FolderSearch, onSelect: () => context.reveal(node) });
    }
  } else {
    items.push({
      label: `ZIP でダウンロード（${selectedNodes.length} 件）`,
      icon: FileArchive,
      onSelect: () => context.downloadAsZip(selectedNodes),
    });
  }
  items.push(
    "separator",
    { label: "切り取り", icon: Scissors, shortcut: "Ctrl+X", onSelect: () => context.copyToClipboard("cut") },
    { label: "コピー", icon: Copy, shortcut: "Ctrl+C", onSelect: () => context.copyToClipboard("copy") },
    {
      label: node ? "リンクをコピー" : `リンクをコピー（${selectedNodes.length} 件）`,
      icon: Link2,
      shortcut: "Ctrl+Shift+C",
      onSelect: () => context.copyLink(selectedNodes),
    },
  );
  if (node && folder) {
    items.push(pasteItem(context, node.path));
  }
  if (node) {
    items.push(
      "separator",
      { label: "名前の変更", icon: Pencil, shortcut: "F2", onSelect: () => context.startRename(node) },
      {
        label: node.favoriteId ? "お気に入り解除" : "お気に入りに追加",
        icon: Star,
        onSelect: () => context.toggleFavorite(node),
      },
      { label: "詳細", icon: Info, onSelect: () => context.openDetails(node) },
    );
  }
  items.push("separator", {
    label: selectedNodes.length > 1 ? `ゴミ箱に移動（${selectedNodes.length} 件）` : "ゴミ箱に移動",
    icon: Trash2,
    shortcut: "Delete",
    danger: true,
    onSelect: () => context.remove(selectedNodes),
  });
  return items;
}
