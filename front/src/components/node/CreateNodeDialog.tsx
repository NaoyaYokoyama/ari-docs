import { useEffect, useState } from "react";
import { createNode } from "@/api/node";

import { NodeType } from "@/types/nodeType";

type Props = {
  open: boolean;
  defaultType: NodeType;
  currentPath: string;
  onClose: () => void;
  onCreated: () => void;
};

function CreateNodeDialog({
  open,
  defaultType,
  currentPath,
  onClose,
  onCreated,
}: Props) {
  const [nodeType, setNodeType] = useState(defaultType);
  const [name, setName] = useState("");

  useEffect(() => {
    if (open) {
      setNodeType(defaultType);
      setName("");
    }
  }, [open, defaultType]);


  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40">
      <div className="w-[420px] rounded-lg bg-white p-6 shadow-xl">

        <h2 className="mb-6 text-xl font-semibold">
          新規作成
        </h2>

        <div className="mb-4">
          <p className="mb-2 text-sm font-medium">
            種類
          </p>

          <label className="mr-6">
            <input
              type="radio"
              checked={nodeType === NodeType.Folder}
              onChange={() => setNodeType(NodeType.Folder)}
            />
            <span className="ml-2">フォルダ</span>
          </label>

          <label>
            <input
              type="radio"
              checked={nodeType === NodeType.File}
              onChange={() => setNodeType(NodeType.File)}
            />
            <span className="ml-2">ファイル</span>
          </label>
        </div>

        <div className="mb-6">
          <p className="mb-2 text-sm font-medium">
            名前
          </p>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border px-3 py-2"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded border px-4 py-2"
          >
            キャンセル
          </button>

          <button
          type="button"
          onClick={async () => {
            await createNode(
              currentPath,
              nodeType,
              name,
            );

            onClose();
            onCreated();
          }}
          className="rounded bg-slate-800 px-4 py-2 text-white"
          >
          作成
          </button>
          </div>

          </div>
          </div>
  );
}

export default CreateNodeDialog;
