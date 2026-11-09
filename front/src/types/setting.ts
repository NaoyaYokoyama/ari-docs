export interface DocsRootResponse {
  // 設定した初期フォルダ（未設定なら空文字）
  docsRoot: string;
  // 未設定のときに表示するフォルダ（リポジトリの docs/）
  defaultRoot: string;
}

export interface UpdateDocsRootResponse {
  message: string;
  data: DocsRootResponse;
}

export interface SessionItem {
  key: number;
  // ログインしたときの User-Agent
  client: string;
  createdAt: string;
  lastUsedAt: string;
  // 今使っている端末
  current: boolean;
}

export interface SessionListResponse {
  sessions: SessionItem[];
  sessionDays: number;
}
