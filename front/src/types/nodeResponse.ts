import type { Node } from "./node";

export interface NodeResponse {
  currentPath: string;
  nodes: Node[];
}
