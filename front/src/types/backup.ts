export interface BackupSettings {
  // off / daily / weekly / monthly
  interval: string;
  // 実行する時刻（0〜23 時）
  hour: number;
  // 定期のバックアップを残す日数
  retentionDays: number;
  // 保存先のフォルダ（絶対パス）。空文字なら既定の場所
  dir: string;
  // ゴミ箱に残す日数
  trashRetentionDays: number;
  // ゴミ箱の容量の上限（MB）。0 は上限なし（FN0302-BR09）
  trashMaxMb: number;
}

export interface BackupItem {
  backupId: string;
  fileName: string;
  size: number;
  // auto（定期）/ manual（手動）/ before_restore（復元の前の自動）
  kind: string;
  createdBy: string;
  // 作った日時（UTC の "YYYY-MM-DD HH:MM:SS"）
  createdAt: string;
  // ファイルがある
  exists: boolean;
}

export interface BackupListResponse {
  backups: BackupItem[];
  // バックアップ・復元の実行中
  busy: boolean;
  // 既定の保存先
  defaultDir: string;
  // 最後に自動のバックアップに失敗した日時と理由（FN0901-BR11）
  lastFailure: { at: string; message: string } | null;
}
