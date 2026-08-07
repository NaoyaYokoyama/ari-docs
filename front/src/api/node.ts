import { get, post } from "./client";
import type { NodeResponse } from "../types/nodeResponse";
import type { NodeType } from "../types/nodeType";

export function getNodes(path: string) {
  return get<NodeResponse>(`/api/nodes?path=${encodeURIComponent(path)}`);
}

export function createNode(
  parentPath: string,
  nodeType: NodeType,
  name: string,
) {
  return post("/api/nodes", {
    parentPath,
    nodeType,
    name,
  });
}
