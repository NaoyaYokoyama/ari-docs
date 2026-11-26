import { ExternalLink, FileText, Folder, FolderOpen, Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { createFavoriteNode, deleteFavorite } from "@/api/favorite";
import { deleteNode, updateNodeDescription } from "@/api/node";
import { useApp } from "@/app/AppContext";
import Button from "@/components/common/Button";
import Dialog from "@/components/common/Dialog";
import { errorMessage } from "@/lib/format";
import type { Node } from "@/types/node";
import { NodeType } from "@/types/nodeType";

// 説明の長さの上限（サーバーの MAX_DESCRIPTION_CHARS と同じ）
const MAX_DESCRIPTION = 200;

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
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const { user, showMessage } = useApp();

  useEffect(() => {
    if (nodeOpen && node) {
      setFavoriteId(node.favoriteId);
      setDescription(node.description);
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

  // 説明（FN0301-BR33）。空にして保存すると消す
  const saveDescription = async () => {
    setSaving(true);
    try {
      await updateNodeDescription(node.path, description);
      showMessage("info", description.trim() ? "説明を保存しました" : "説明を消しました");
      onChanged();
    } catch (error) {
      console.error(error);
      showMessage("error", errorMessage(error, "説明の保存に失敗しました"));
    } finally {
      setSaving(false);
    }
  };
  const descriptionChanged = description.trim() !== node.description;

  const rows: [string, string][] = [
    ["種類", folder ? "フォルダ" : "ファイル"],
    ["場所", `folder/${node.path}`],
    ["更新日時", node.updatedAt],
    ...(user?.mode !== "local" ? ([["更新者", node.updatedBy || "-"]] as [string, string][]) : []),
    // ロック（FN0301-BR38）
    ...(node.lock
      ? ([["ロック", `${node.lock.mine ? "自分" : `${node.lock.userName}さん`}（${node.lock.expiresAt} まで）`]] as [string, string][])
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
      <label className="mt-4 block text-sm">
        <span className="mb-1 flex items-baseline justify-between">
          <span className="text-muted-foreground">説明</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {Array.from(description.trim()).length} / {MAX_DESCRIPTION}
          </span>
        </span>
        <textarea
          value={description}
          maxLength={MAX_DESCRIPTION}
          rows={3}
          placeholder="このファイル・フォルダが何かを一言で（一覧・プレビューに出て、ホームの検索でも探せます）"
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && descriptionChanged) {
              e.preventDefault();
              void saveDescription();
            }
          }}
          className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
        />
      </label>
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="secondary" disabled={!descriptionChanged || saving} onClick={saveDescription} title="説明を保存（Ctrl+Enter）">
          説明を保存
        </Button>
      </div>
    </Dialog>
  );
}

export default NodeDialog;
