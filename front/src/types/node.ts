export interface Node {
  nodeId: string;
  path: string;
  name: string;
  nodeType: string;
  status: number;
  description: string;
  updatedBy: string;
  updatedAt: string;
  favoriteId: string;
  // ファイルのサイズ（バイト）。フォルダは 0
  size: number;
}
