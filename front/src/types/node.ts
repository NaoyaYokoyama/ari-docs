export interface Node {
  nodeId: string;
  path: string;
  name: string;
  nodeType: string;
  // 説明（FN0301-BR33。無ければ空）
  description: string;
  updatedBy: string;
  updatedAt: string;
  favoriteId: string;
  // ファイルのサイズ（バイト）。フォルダは 0
  size: number;
}
