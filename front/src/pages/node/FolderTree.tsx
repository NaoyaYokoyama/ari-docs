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
  path: string;
  onNavigate: (path: string) => void;
};

function FolderTree({
  path,
  onNavigate,
}: Props) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [openPaths, setOpenPaths] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    const load = async () => {
      const response = await getNodes(path);

      const folders = response.nodes.filter(
        (node) => node.nodeType === NodeType.Folder,
      );

      setNodes(folders);
    };

    load();
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
        const open = openPaths.has(node.path);

        return (
          <div key={node.nodeId}>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleToggle(node.path)}
              >
                {open ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </button>

              <button
                type="button"
                className="flex items-center gap-1"
                onClick={() => onNavigate(node.path)}
              >
                <Folder size={16} />
                <span>{node.name}</span>
              </button>
            </div>

            {open && (
              <div className="ml-4">
                <FolderTree
                  path={node.path}
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

export default FolderTree;
