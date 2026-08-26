import { get, post, postForm } from "@/api/client";
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

export function uploadNode(
  files: UploadFile[],
  parentPath: string,
) {
  console.log(files);
  console.log(parentPath);
  const formData = new FormData();
  formData.append("parentPath", parentPath);
  for (const item of files) {
    formData.append("files", item.file);
    formData.append(
      "paths",
      item.relativePath,
    );
  }
  return postForm(
    "/api/nodes/upload",
    formData,
  );
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
