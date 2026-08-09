import { useEffect, useState } from "react";
import { NodeType } from "@/types/nodeType";
import type { Node } from "@/types/node";
import Dialog from "@/components/common/Dialog";
import { deleteNode } from "@/api/node";

type Props = {
  nodeOpen: boolean;
  node: Node | null;
  onClose: () => void;
};

function NodeDialog({ nodeOpen, node, onClose }: Props) {
  const [newName, setNewName] = useState("");
  const [deleteChecked, setDeleteChecked] = useState(false);

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
      <div className="flex justify-end gap-2">
        <label className="mb-6 flex items-center gap-2">
          <input
            type="checkbox"
            checked={deleteChecked}
            onChange={(e) => setDeleteChecked(e.target.checked)}
          />

          <span>削除確認</span>
        </label>

        <button
          type="button"
          disabled={!deleteChecked}
          onClick={async () => {
            await deleteNode(node.path, node.nodeType, node.name);
            onClose();
          }}
          className="rounded px-4 py-2 text-white disabled:bg-slate-300
            disabled:cursor-not-allowed bg-red-600 hover:bg-red-700"
        >
          削除
        </button>
        <button onClick={onClose} className="rounded border px-2 py-2">
          閉じる
        </button>
      </div>
    </Dialog>
  );
}

export default NodeDialog;
