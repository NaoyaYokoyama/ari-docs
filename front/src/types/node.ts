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

// ファイルの以前の版（FN0301-BR39）。日時は YYYY/MM/DD HH:MM
export interface NodeVersionItem {
  versionId: string;
  size: number;
  // その版の中身の更新日時
  modifiedAt: string;
  // 上書きした人と日時
  replacedBy: string;
  replacedAt: string;
}

// ロック中のファイルの一覧の 1 行
export interface NodeLockItem {
  path: string;
  userName: string;
  mine: boolean;
  expiresAt: string;
}

export interface NodeLock {
  // ロックした人の表示名と、自分か
  userName: string;
  mine: boolean;
  // 期限（YYYY/MM/DD HH:MM）
  expiresAt: string;
}
