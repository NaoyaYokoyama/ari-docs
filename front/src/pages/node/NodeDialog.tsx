import { Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  createFavoriteNode,
  deleteFavorite,
} from "@/api/favorite";
import { deleteNode } from "@/api/node";
import { useApp } from "@/app/AppContext";
import Button from "@/components/common/Button";
import Dialog from "@/components/common/Dialog";
import type { Node } from "@/types/node";
import type { NodeType } from "@/types/nodeType";

type Props = {
  nodeOpen: boolean;
  node: Node | null;
  onClose: () => void;
};

function NodeDialog({ nodeOpen, node, onClose }: Props) {
  const [favoriteId, setFavoriteId] = useState("");

  const {
    showMessage,
    showConfirm,
  } = useApp();

  // nodeをお気に入り登録
  const handleCreateFavoriteNode =
    async () => {
      if (node === null) {
        return; 
      }
      try {
        const response =
          await createFavoriteNode(node.path);
        setFavoriteId(response.data.favoriteId);
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

  // nodeのお気に入り解除
  const handleDeleteFavoriteNode =
    async () => {
      try {
        await deleteFavorite(favoriteId);
        setFavoriteId("");
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


  // nodeの削除
  const handleDeleteNode = async () => {
    if (node === null) {
      return;
    }
    const confirmed = await showConfirm(
      "「" + node.name + "」を削除しますか？",
    );
    if (!confirmed) {
      return;
    }
    // "a/b/c" -> "a/b"
    const index = node.path.lastIndexOf("/");
    const parentPath = index === -1 ? "" : node.path.slice(0, index);
    try {
      await deleteNode(parentPath, node.nodeType as NodeType, node.name);
      showMessage(
        "info",
        "削除しました",
      );
      onClose();
    } catch (error) {
      console.log(error);
      showMessage(
        "error",
        "削除に失敗しました",
      );
    }
  };

  useEffect(() => {
    if (!nodeOpen || !node) {
      return;
    }
    setFavoriteId(node.favoriteId);
  }, [nodeOpen, node?.favoriteId]);

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

      <div className="flex justify-end gap-7">
        {favoriteId ? (
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
          onClick={handleDeleteNode}
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
