export const NodeType = {
  Folder: "folder",
  File: "file",
} as const;

export type NodeType =
  (typeof NodeType)[keyof typeof NodeType];
