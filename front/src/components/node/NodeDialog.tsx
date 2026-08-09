import { useEffect, useState } from "react";
import { NodeType } from "@/types/nodeType";
import type { Node } from "@/types/node";

import { deleteNode } from "@/api/node";

type Props = {
  nodeOpen: boolean;
  node: Node | null;
  onClose: () => void;
};

function NodeDialog({
  nodeOpen,
  node,
  onClose,
}: Props) {
  if (!nodeOpen || !node) {
    return null;
  }

  const [newName, setNewName] = useState("");
  const [deleteChecked, setDeleteChecked] = useState(false);

  useEffect(() => {
    if (nodeOpen && node) {
      setNewName(node.name);
      setDeleteChecked(false);
    }
    const handleKeyDown = (e: keyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [nodeOpen, node?.name]);




  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40">
      <div className="w-[420px] rounded-lg bg-white p-6 shadow-xl">

        <h2 className="mb-6 text-xl font-semibold">
          {node.name}
        </h2>

        <div className="flex justify-end gap-2">
        <label className="mb-6 flex items-center gap-2">
          <input
            type="checkbox"
            checked={deleteChecked}
            onChange={(e) => setDeleteChecked(e.target.checked)}
          />

          <span>
            削除確認
          </span>
          <button
            type="button"
            disabled={!deleteChecked}
            onClick={async () => {
              await deleteNode(
                node.path,
                node.nodeType,
                node.name,
              );
              onClose();
            }}
            className="
              rounded
              px-4
              py-2
              text-white
              disabled:bg-slate-300
              disabled:cursor-not-allowed
              bg-red-600
              hover:bg-red-700
            "
          >
            削除
          </button>
        </label>
          <button
            onClick={onClose}
            className="rounded border px-4 py-2"
          >
            キャンセル
          </button>

          <button
          type="button"
          onClick={() => {
            onClose();
          }}
          className="rounded bg-slate-800 px-4 py-2 text-white"
          >
          その他
          </button>
          </div>

          </div>
          </div>
  );
}

export default NodeDialog;
