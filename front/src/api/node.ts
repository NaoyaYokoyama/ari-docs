import { get, getBlob, post, postBlob, postFormWithProgress } from "@/api/client";
import type { NodeResponse } from "@/types/nodeResponse";
import type { NodeType } from "@/types/nodeType";
import type { UploadFile } from "@/types/uploadFile";

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

// onProgress には送った割合（0〜1）を渡す
export function uploadNode(
  files: UploadFile[],
  parentPath: string,
  onProgress: (ratio: number) => void = () => {},
) {
  const formData = new FormData();
  formData.append("parentPath", parentPath);
  for (const item of files) {
    formData.append("files", item.file);
    formData.append(
      "paths",
      item.relativePath,
    );
  }
  return postFormWithProgress("/api/nodes/upload", formData, onProgress);
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

export function openNode(
  path: string,
) {
  return post("/api/nodes/open", {
    path,
  });
}

export function renameNode(parentPath: string, name: string, newName: string) {
  return post("/api/nodes/rename", { parentPath, name, newName });
}

// paths を destPath のフォルダへ移す
export function moveNodes(paths: string[], destPath: string) {
  return post("/api/nodes/move", { paths, destPath });
}

// paths を destPath のフォルダへ複製する。同じ名前があれば「 - コピー」を付けた名前になる
export function copyNodes(paths: string[], destPath: string) {
  return post<{ names: string[] }>("/api/nodes/copy", { paths, destPath });
}

export function downloadNode(path: string) {
  return getBlob(`/api/nodes/download?path=${encodeURIComponent(path)}`);
}

// エクスプローラーなどでその場所を開く（ローカルモードだけ）
export function revealNode(path: string) {
  return post("/api/nodes/reveal", { path });
}

// 選んだファイル・フォルダを 1 つの ZIP にしてダウンロードする
export function downloadZip(paths: string[]) {
  return postBlob("/api/nodes/download-zip", { paths });
}
