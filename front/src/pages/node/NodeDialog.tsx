import { useEffect, useState } from "react";

import { deleteNode } from "@/api/node";
import Button from "@/components/common/Button";
import Dialog from "@/components/common/Dialog";
import type { Node } from "@/types/node";
import { Folder as FolderIcon, Star, Trash2 } from "lucide-react";

type Props = {
  nodeOpen: boolean;
  node: Node | null;
  onClose: () => void;
};

function NodeDialog({ nodeOpen, node, onClose }: Props) {
  const [newName, setNewName] = useState();
  const [deleteChecked, setDeleteChecked] = useState(false);

  // nodeをお気に入り登録
  const handleCreateFavoriteNode =
    async () => {
      alert("favorite_create");
      try {
        const response =
          await createFavoriteNode(node.nodeId);
        showMessage(
          "info",
          "お気にいり登録しました",
        );
      } catch (error) {
        console.log(error);
        showMessage(
          "error",
          "お気に入り登録に失敗しました",
        );
      }
    };

  // Wikiのお気に入り解除
  const handleDeleteFavoriteNode =
    async () => {
      alert("favorite_delete");
      try {
        await deleteFavorite(
          node.favoriteId,
        );
        showMessage(
          "info",
          "お気にいり解除しました",
        );
      } catch (error) {
        console.log(error);
        showMessage(
          "error",
          "お気に入り解除に失敗しました",
        );
      }
    };


  useEffect(() => {
    if (!nodeOpen || !node) {
      return;
    }
    setNewName(node.name);
    setDeleteChecked(false);
  }, [nodeOpen, node?.name]);

  if (!nodeOpen || !node) {
    return null;
  }

  return (
    <Dialog open={nodeOpen} title={node.name} onClose={onClose}>
      <div>
        {node.name}
      </div>
      <div>
        {node.status}
      </div>
      <div>
        {node.description}
      </div>

      <div>
        {node.updatedBy}
      </div>
      <div>
        {node.updatedAt}
      </div>

      <div>
        <label className="mb-6 flex items-center gap-2">
          <input
            type="checkbox"
            checked={deleteChecked}
            onChange={(e) => setDeleteChecked(e.target.checked)}
          />
          <span>削除確認</span>
        </label>
      </div>

      <div className="flex justify-end gap-7">
        {node.favoriteId ? (
          <button
            type="button"
            title="お気に入り解除"
            onClick={handleDeleteFavoriteNode}
            className="cursor-pointer bg-transparent p-0"
          >
            <Star className="fill-yellow-400 text-yellow-400 hover:bg-slate-100" />
          </button>
        ) : (
          <button
            type="button"
            title="お気に入り登録"
            onClick={handleCreateFavoriteNode}
            className="cursor-pointer bg-transparent p-0"
          >
            <Star  className="text-slate-500 hover:bg-slate-200" />
          </button>
        )}
        <button
          type="button"
          title="削除"
          onClick={handleDeleteFavoriteNode}
          className="cursor-pointer bg-transparent p-0"
        >
          <Trash2 className="text-slate-500 hover:bg-slate-200" />
        </button>
        <Button onClick={onClose} variant="secondary">
          閉じる
        </Button>
      </div>
    </Dialog>
  );
}

export default NodeDialog;
