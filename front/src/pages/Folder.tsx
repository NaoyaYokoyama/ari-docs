import { useState } from "react";
import { useNodes } from "@/hooks/useNodes";
import Breadcrumb from "@/components/common/Breadcrumb";
import CreateNodeDialog from "@/components/node/CreateNodeDialog";
import NodeDialog from "@/components/node/NodeDialog";
import NodeTable from "@/components/node/NodeTable";
import { NodeType } from "@/types/nodeType";
import {
  FolderPlus,
  FilePlus,
} from "lucide-react";

import type { Node } from "../types/node";

function Folder() {
  const handleCreated = async () => {
    setCreateOpen(false);
    await reload();
  };

  const [createOpen, setCreateOpen] = useState(false);
  const [nodeOpen, setNodeOpen] = useState(false);

  const [defaultType, setDefaultType] =
    useState<NodeType>(NodeType.Folder);
  const [selectedNode, setSelectedNode] =
    useState<Node | null>(null);
  const [path, setPath] = useState("");
  const {
    currentPath,
    nodes,
    reload,
  } = useNodes(path);
  console.log(nodes);

  return (

    <div className="p-6">
    <div className="mb-4 flex items-center justify-between">
    <Breadcrumb
    path={currentPath}
    onNavigate={setPath}
    />

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
    onClose={() => setCreateOpen(false)}
    onCreated={handleCreated}
    />

    <NodeDialog
    nodeOpen={nodeOpen}
    node={selectedNode}
    onClose={() => setNodeOpen(false)}
    />

    </div>
  );
}

export default Folder;
