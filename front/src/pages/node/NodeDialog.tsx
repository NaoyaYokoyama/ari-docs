import { ExternalLink, FileText, Folder, FolderOpen, Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { createFavoriteNode, deleteFavorite } from "@/api/favorite";
import { deleteNode } from "@/api/node";
import { useApp } from "@/app/AppContext";
import Button from "@/components/common/Button";
import Dialog from "@/components/common/Dialog";
import { errorMessage } from "@/lib/format";
import type { Node } from "@/types/node";
import { NodeType } from "@/types/nodeType";

type Props = {
  nodeOpen: boolean;
  node: Node | null;
  onClose: () => void;
  onOpen: (node: Node) => void;
  // 削除・お気に入りの変更のあと、一覧を読み込み直す
  onChanged: () => void;
};

function NodeDialog({ nodeOpen, node, onClose, onOpen, onChanged }: Props) {
  const [favoriteId, setFavoriteId] = useState("");
  const { user, showMessage } = useApp();

  useEffect(() => {
    if (nodeOpen && node) {
      setFavoriteId(node.favoriteId);
    }
  }, [nodeOpen, node]);

  if (!nodeOpen || !node) {
    return null;
  }

  const folder = node.nodeType === NodeType.Folder;
  const Icon = folder ? Folder : FileText;

  const toggleFavorite = async () => {
    try {
      if (favoriteId) {
        await deleteFavorite(favoriteId);
        setFavoriteId("");
        showMessage("info", "お気に入り解除しました");
      } else {
        const response = await createFavoriteNode(node.path);
        setFavoriteId(response.data.favoriteId);
        showMessage("info", "お気に入り登録しました");
      }
      onChanged();
    } catch (error) {
      console.error(error);
      showMessage(
        "error",
        favoriteId ? "お気に入り解除に失敗しました" : "お気に入り登録に失敗しました",
      );
    }
  };

  const remove = async () => {
    // "a/b/c" -> "a/b"
    const index = node.path.lastIndexOf("/");
    const parentPath = index === -1 ? "" : node.path.slice(0, index);
    try {
      await deleteNode(parentPath, node.nodeType as NodeType, node.name);
      showMessage("info", `「${node.name}」をゴミ箱に移動しました（ゴミ箱から元に戻せます）`);
      onClose();
      onChanged();
    } catch (error) {
      console.error(error);
      showMessage("error", errorMessage(error, "削除に失敗しました"));
    }
  };

  const rows: [string, string][] = [
    ["種類", folder ? "フォルダ" : "ファイル"],
    ["場所", `folder/${node.path}`],
    ["更新日時", node.updatedAt],
    ...(user?.mode !== "local"
      ? ([
          ["更新者", node.updatedBy || "-"],
          ["説明", node.description || "-"],
        ] as [string, string][])
      : []),
  ];

  return (
    <Dialog
      open={nodeOpen}
      title={
        <span className="flex items-center gap-2">
          <Icon size={18} className={folder ? "text-brand" : "text-muted-foreground"} />
          <span className="truncate">{node.name}</span>
        </span>
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={remove} className="mr-auto text-destructive hover:bg-destructive/10">
            <Trash2 size={16} />
            削除
          </Button>
          <Button variant="secondary" onClick={toggleFavorite}>
            <Star size={16} className={favoriteId ? "fill-warning text-warning" : undefined} />
            {favoriteId ? "お気に入り解除" : "お気に入り"}
          </Button>
          <Button
            onClick={() => {
              onClose();
              onOpen(node);
            }}
          >
            {folder ? <FolderOpen size={16} /> : <ExternalLink size={16} />}
            開く
          </Button>
        </>
      }
    >
      <dl className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-all">{value}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}

export default NodeDialog;
