import { useEffect, useState } from "react";

import { getNodes } from "../api/node";
import type { Node } from "../types/node";

export function useNodes(path: string) {
  const [currentPath, setCurrentPath] = useState(path);
  const [nodes, setNodes] = useState<Node[]>([]);

  const load = () => {
    return getNodes(path)
      .then((response) => {
        setCurrentPath(response.currentPath);
        setNodes(response.nodes);
      })
      .catch(console.error);
  };

  useEffect(() => {
    load();
  }, [path]);

  return {
    currentPath,
    nodes,
    reload: load,
  };
}
