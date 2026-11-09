export interface TrashItem {
  trashId: string;
  // 元の場所（folder/ からの相対パス）
  originalPath: string;
  name: string;
  nodeType: string;
  size: number;
  // 削除したユーザーの表示名
  deletedBy: string;
  // 削除した日時（UTC の "YYYY-MM-DD HH:MM:SS"）
  deletedAt: string;
}

export interface TrashResponse {
  items: TrashItem[];
  // 完全に削除・空にできる
  canDelete: boolean;
  // 自動で消すまでの日数
  retentionDays: number;
}
