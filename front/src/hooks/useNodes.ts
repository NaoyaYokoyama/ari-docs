import { useCallback, useEffect, useState } from "react";

import { getNodes } from "@/api/node";
import { errorMessage } from "@/lib/format";
import type { Node } from "@/types/node";

export function useNodes(path: string) {
  const [currentPath, setCurrentPath] = useState(path);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    return getNodes(path)
      .then((response) => {
        setCurrentPath(response.currentPath);
        setNodes(response.nodes);
        setError("");
      })
      .catch((e) => {
        console.error(e);
        setCurrentPath(path);
        setNodes([]);
        setError(errorMessage(e, "フォルダを読み込めませんでした"));
      })
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    currentPath,
    nodes,
    loading,
    error,
    reload: load,
  };
}
