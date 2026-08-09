import { get, post } from "@/api/client";
import type { NodeResponse } from "@/types/nodeResponse";
import type { NodeType } from "@/types/nodeType";

export function getNodes(path: string) {
  return get<NodeResponse>(`/api/nodes?path=${encodeURIComponent(path)}`);
}

export function createNode(
  parentPath: string,
  nodeType: NodeType,
  name: string,
) {
  return post("/api/nodes/create", {
    parentPath,
    nodeType,
    name,
  });
}

export function deleteNode(
  parentPath: string,
  nodeType: NodeType,
  name: string,
) {
  return post("/api/nodes/delete", {
    parentPath,
    nodeType,
    name,
  });
}
