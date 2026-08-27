import { FilePlus,FolderPlus } from "lucide-react";
import { useState } from "react";

import Sidebar from "@/pages/node/Sidebar";
import Breadcrumb from "@/pages/node/Breadcrumb";
import { useNodeShortcuts } from "@/pages/node/useNodeShortcuts";

import CreateNodeDialog from "@/pages/node/CreateNodeDialog";
import NodeDialog from "@/pages/node/NodeDialog";
import NodeTable from "@/pages/node/NodeTable";
import { useNodes } from "@/hooks/useNodes";
import { NodeType } from "@/types/nodeType";

import type { Node } from "../types/node";

function Node() {
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

  useNodeShortcuts({
    currentPath,
    onNavigate: setPath,
  });

  return (
    <div className="flex h-full">
      <Sidebar
        onNavigate={setPath}
        currentPath={currentPath}
      />

      <main>
        <div className="mb-4 flex items-center justify-between">
          <div className="mb-6">
            <Breadcrumb path={currentPath} onNavigate={setPath} />
          </div>

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
          currentPath={currentPath}
          onOpenFolder={setPath}
          onOpenNode={(node) => {
            setSelectedNode(node);
            setNodeOpen(true);
          }}
          reload={reload}
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
      </main>
    </div>
  );
}

export default Node;
