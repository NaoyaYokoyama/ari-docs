import { FilePlus,FolderPlus } from "lucide-react";
import { useState } from "react";

import Breadcrumb from "@/components/common/Breadcrumb";
import CreateNodeDialog from "@/components/node/CreateNodeDialog";
import NodeDialog from "@/components/node/NodeDialog";
import NodeTable from "@/components/node/NodeTable";
import { useNodes } from "@/hooks/useNodes";
import { NodeType } from "@/types/nodeType";

import type { Node } from "../types/node";

function Folder() {
  const [createOpen, setCreateOpen] = useState(false);
  const [nodeOpen, setNodeOpen] = useState(false);
  const [path, setPath] = useState("");
  const [defaultType, setDefaultType] = useState<NodeType>(NodeType.Folder);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const handleClose = async () => {
    setCreateOpen(false);
    setNodeOpen(false);
    await reload();
  };

  const { currentPath, nodes, reload } = useNodes(path);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <Breadcrumb path={currentPath} onNavigate={setPath} />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setDefaultType(NodeType.Folder);
              setCreateOpen(true);
            }}
            className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            <FolderPlus size={16} />
            新しいフォルダ
          </button>

          <button
            type="button"
            onClick={() => {
              setDefaultType(NodeType.File);
              setCreateOpen(true);
            }}
            className="flex items-center gap-2 rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            <FilePlus size={16} />
            新しいファイル
          </button>
        </div>
      </div>

      <NodeTable
        nodes={nodes}
        onOpenFolder={setPath}
        onOpenNode={(node) => {
          setSelectedNode(node);
          setNodeOpen(true);
        }}
      />

      <CreateNodeDialog
        open={createOpen}
        defaultType={defaultType}
        currentPath={currentPath}
        onClose={handleClose}
      />

      <NodeDialog
        nodeOpen={nodeOpen}
        node={selectedNode}
        onClose={handleClose}
      />
    </div>
  );
}

export default Folder;
