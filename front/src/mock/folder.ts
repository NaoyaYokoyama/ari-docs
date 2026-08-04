import type { Folder } from "../types/folder";
import { FolderStatus } from "../types/folderStatus";
import { NodeType } from "../types/nodeType";

export const folders: Folder[] = [
  {
    id: "1",
    name: "ari-docs",
    path: "/home/naoya/ari-docs",
    description: "Markdown設計書",
    fileCount: 35,
    size: 1024 * 1024,
    favorite: true,
    type: NodeType.Folder,
    status: FolderStatus.Working,
    lastUpdatedBy: "Naoya",
    updatedAt: "2026-08-03T00:00:00Z",
  },
  {
    id: "2",
    name: "2testdir",
    path: "/home/naoya/ari-docs",
    description: "Markdown設計書",
    fileCount: 35,
    size: 1024 * 1024,
    favorite: true,
    type: NodeType.Folder,
    status: FolderStatus.Working,
    lastUpdatedBy: "Naoya",
    updatedAt: "2026-08-03T00:00:00Z",
  },
  {
    id: "3",
    name: "2testtest",
    path: "/home/naoya/ari-docs",
    description: "Markdown設計書",
    fileCount: 35,
    size: 1024 * 1024,
    favorite: true,
    type: NodeType.File,
    status: FolderStatus.Working,
    lastUpdatedBy: "Naoya",
    updatedAt: "2026-08-03T00:00:00Z",
  },
];
