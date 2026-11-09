export interface UserItem {
  userId: string;
  displayName: string;
  isAdmin: boolean;
  // 更新日時（UTC の "YYYY-MM-DD HH:MM:SS"）
  updatedAt: string;
}
