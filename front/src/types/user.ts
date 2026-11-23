export interface UserItem {
  userId: string;
  displayName: string;
  isAdmin: boolean;
  // 付けた許可（dictionary・exclusion・backup。FN0102-BR11）。管理者は付けなくてもすべてできる
  permissions: string[];
  // 更新日時（UTC の "YYYY-MM-DD HH:MM:SS"）
  updatedAt: string;
}
