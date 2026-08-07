import { useState } from "react";
import { useNodes } from "../hooks/useNodes";
import Breadcrumb from "../components/Breadcrumb";
import NodeTable from "../components/NodeTable";
import CreateNodeDialog from "../components/CreateNodeDialog";
import { NodeType } from "../types/nodeType";

import {
  FolderPlus,
  FilePlus,
} from "lucide-react";


function Folder() {
  const handleCreated = async () => {
    setOpen(false);
    await reload();
  };

  const [open, setOpen] = useState(false);
  const [defaultType, setDefaultType] =
    useState<NodeType>(NodeType.Folder);

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
      setOpen(true);
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
      setOpen(true);
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
    />

    <CreateNodeDialog
    open={open}
    defaultType={defaultType}
    currentPath={currentPath}
    onClose={() => setOpen(false)}
    onCreated={handleCreated}
    />

    </div>
  );
}

export default Folder;
