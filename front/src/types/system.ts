// 管理者が決めるログインと保存の設定（FN0902）
export interface ServerSettings {
  sessionDays: number;
  maxFailures: number;
  lockMinutes: number;
  historyKeep: number;
  // Docs（Markdown ビューア）を使う。既定は使わない
  docsEnabled: boolean;
  // 1 回にアップロードできる合計の大きさ（MB。既定 1024、10240 まで。FN0902-BR07）
  uploadMaxMb: number;
  // ファイルのロックの期限の上限（日。既定 7、365 まで。FN0301-BR38）
  fileLockMaxDays: number;
  // ファイルの以前の版を 1 つのファイルにつき残す数（既定 10、0 なら残さない、100 まで。FN0301-BR39）
  fileVersionKeep: number;
  // 共有モードで、Wiki を書いている人のほかは保存できないようにする（既定はする。FN0501-BR12）
  wikiEditLock: boolean;
  // Note・Wiki に貼る画像と Docs で送る画像を縮める。画質（%。10〜100、既定 85）と長い辺の上限（画素。800〜4096、既定 1920。FN0902-BR09）
  imageCompress: boolean;
  imageQuality: number;
  imageMaxSide: number;
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
    // Note・Wiki に貼り付けた画像の数と合計の大きさ（FN0404-BR06）
    images: number;
    imageBytes: number;
    // エラーのログのフォルダ（error.log。1 MB×5 個まで）
    logDir: string;
  } | null;
}
