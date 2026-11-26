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
  // ロック（FN0301-BR38。共有モード。期限内のものだけ）
  lock?: NodeLock;
}

export interface NodeLock {
  // ロックした人の表示名と、自分か
  userName: string;
  mine: boolean;
  // 期限（YYYY/MM/DD HH:MM）
  expiresAt: string;
}
