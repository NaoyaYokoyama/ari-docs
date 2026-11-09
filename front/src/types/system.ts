// 管理者が決めるログインと保存の設定（FN0902）
export interface ServerSettings {
  sessionDays: number;
  maxFailures: number;
  lockMinutes: number;
  historyKeep: number;
  // Docs（Markdown ビューア）を使う。既定は使わない
  docsEnabled: boolean;
}

// アプリの情報（FN0903）
export interface SystemInfo {
  version: string;
  mode: string;
  os: string;
  https: boolean;
  startedAt: string;
  counts: {
    users: number;
    notes: number;
    wikis: number;
    nodes: number;
    indexedFiles: number;
    keywords: number;
  };
  // ローカルモード、または共有モードの管理者だけ
  paths: {
    folderRoot: string;
    dataDir: string;
    databasePath: string;
    databaseBytes: number;
  } | null;
}
