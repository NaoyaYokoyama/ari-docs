import { get } from "./client";
import type { Node } from "../types/node";

export function getNodes(path: string) {
  return get<Node[]>(`/api/nodes?path=${encodeURIComponent(path)}`);
}
