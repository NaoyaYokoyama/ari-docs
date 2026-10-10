import { FilePlus,FolderPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { useNodes } from "@/hooks/useNodes";
import Breadcrumb from "@/pages/node/Breadcrumb";
import CreateNodeDialog from "@/pages/node/CreateNodeDialog";
import NodeDialog from "@/pages/node/NodeDialog";
import NodeTable from "@/pages/node/NodeTable";
import Sidebar from "@/pages/node/Sidebar";
import { useNodeShortcuts } from "@/pages/node/useNodeShortcuts";
import type { Node as NodeItem } from "@/types/node";
import { NodeType } from "@/types/nodeType";

// "a/b/c" -> "a/b"、"a" -> ""
function parentPath(path: string) {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function Node() {
  const location = useLocation();
  // お気に入りから遷移してきた場合は対象ノードの親フォルダを開く
  const initialNodePath: string = location.state?.nodePath ?? "";

  const [createOpen, setCreateOpen] = useState(false);
  const [nodeOpen, setNodeOpen] = useState(false);
  const [path, setPath] = useState(parentPath(initialNodePath));
  const [defaultType, setDefaultType] = useState<NodeType>(NodeType.Folder);
  const [selectedNode, setSelectedNode] = useState<NodeItem | null>(null);
  const [targetPath, setTargetPath] = useState(initialNodePath);

  const handleClose = async () => {
    setCreateOpen(false);
    setNodeOpen(false);
    await reload();
  };

  const { currentPath, nodes, reload } = useNodes(path);

  // 親フォルダの読み込み後、フォルダなら中を開き、ファイルなら詳細ダイアログを開く
  useEffect(() => {
    if (!targetPath) {
      return;
    }
    const target = nodes.find((node) => node.path === targetPath);
    if (!target) {
      return;
    }
    setTargetPath("");
    if (target.nodeType === NodeType.Folder) {
      setPath(target.path);
    } else {
      setSelectedNode(target);
      setNodeOpen(true);
    }
  }, [nodes, targetPath]);

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
