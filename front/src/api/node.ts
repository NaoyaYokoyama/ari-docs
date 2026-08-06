import { get } from "./client";
import type { NodeResponse } from "../types/nodeResponse";

export function getNodes(path: string) {
  return get<NodeResponse>(`/api/nodes?path=${encodeURIComponent(path)}`);
}
