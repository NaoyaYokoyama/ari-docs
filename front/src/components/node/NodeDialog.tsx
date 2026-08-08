import { useEffect, useState } from "react";
import { NodeType } from "@/types/nodeType";
import type { Node } from "@/types/node";

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

  useEffect(() => {
    if (nodeOpen && node) {
      setNewName(node.name);
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
