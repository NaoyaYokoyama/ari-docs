import {
  ChevronDown,
  ChevronRight,
  Folder,
} from "lucide-react";
import { useEffect, useState } from "react";

import { getNodes } from "@/api/node";
import type { Node } from "@/types/node";
import { NodeType } from "@/types/nodeType";

type Props = {
  currentPath: string;
  onNavigate: (path: string) => void;
};

type TreeProps = {
  path: string;
  currentPath: string;
  onNavigate: (path: string) => void;
};

function Tree({
  path,
  currentPath,
  onNavigate,
}: TreeProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [openPaths, setOpenPaths] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    const loadNodes = async () => {
      const response = await getNodes(path);

      setNodes(
        response.nodes.filter(
          (node) => node.nodeType === NodeType.Folder,
        ),
      );
    };

    void loadNodes();
  }, [path]);

  const handleToggle = (path: string) => {
    setOpenPaths((current) => {
      const next = new Set(current);

      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }

      return next;
    });
  };

  return (
    <div>
      {nodes.map((node) => {
        const open =
          openPaths.has(node.path) ||
          currentPath === node.path ||
          currentPath.startsWith(`${node.path}/`);

        const selected =
          currentPath === node.path;

        return (
          <div key={node.nodeId}>
            <div className="flex items-center gap-1">
              {nodes.length > 0 ? (
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 hover:bg-slate-200"
                  onClick={() =>
                    handleToggle(node.path)
                  }
                >
                  {open ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </button>
              ) : (
                <div className="w-5" />
              )}

              <button
                type="button"
                className={`flex h-7 w-full items-center gap-1 rounded px-1 text-left ${
                  selected
                    ? "bg-slate-300"
                    : "hover:bg-slate-200"
                }`}
                onClick={() =>
                  onNavigate(node.path)
                }
              >
                <Folder
                  size={16}
                  className="shrink-0"
                />

                <span
                  className="min-w-0 flex-1 truncate"
                  title={node.name}
                >
                  {node.name}
                </span>
              </button>
            </div>

            {open && (
              <div className="ml-5">
                <Tree
                  path={node.path}
                  currentPath={currentPath}
                  onNavigate={onNavigate}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Sidebar({
  currentPath,
  onNavigate,
}: Props) {
  return (
    <aside className="w-72 bg-slate-100 p-2 pr-11">
      <Tree
        path=""
        currentPath={currentPath}
        onNavigate={onNavigate}
      />
    </aside>
  );
}

export default Sidebar;
