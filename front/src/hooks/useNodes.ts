import { useEffect, useState } from "react";

import { getNodes } from "../api/node";
import type { Node } from "../types/node";

export function useNodes(path: string) {
  const [nodes, setNodes] = useState<Node[]>([]);

  useEffect(() => {
    getNodes(path)
      .then(setNodes)
      .catch(console.error);
  }, [path]);

  return nodes;
}
