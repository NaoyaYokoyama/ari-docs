export type Folder = {
  /** 一意のID */
  id: string;

  /** フォルダ名 */
  name: string;

  /** フォルダのパス */
  path: string;

  /** 説明 */
  description: string;

  /** ファイル数 */
  fileCount: number;

  /** ディスク使用量(Byte) */
  size: number;

  /** お気に入り */
  favorite: boolean;

  /** タグ */
  tags: string[];

  /** ステータス */
  status: FolderStatus;

  /** 最終更新者 */
  lastUpdatedBy: string;

  /** 最終更新日時 */
  updatedAt: Date;
};
