import { useEffect, useState } from "react";

import { deleteNode } from "@/api/node";
import Button from "@/components/common/Button";
import Dialog from "@/components/common/Dialog";
import type { Node } from "@/types/node";

type Props = {
  nodeOpen: boolean;
  node: Node | null;
  onClose: () => void;
};

function NodeDialog({ nodeOpen, node, onClose }: Props) {
  const [newName, setNewName] = useState();
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

      <div className="flex justify-end gap-2">
        <Button variant="primary"
        >
          更 新
        </Button>
        <Button
          type="button"
          disabled={!deleteChecked}
          onClick={async () => {
            await deleteNode(node.path, node.nodeType, node.name);
            onClose();
          }}
          variant="danger"
        >
          削 除
        </Button>
        <Button onClick={onClose} variant="secondary">
          閉じる
        </Button>
      </div>
    </Dialog>
  );
}

export default NodeDialog;
