// Note・Wiki のフォルダ（FN0403）
export interface ContentFolder {
  folderId: string;
  // 空なら一番上
  parentId: string;
  name: string;
}

export interface ContentFolders {
  folders: ContentFolder[];
  // Note・Wiki の入っているフォルダ。一番上にあるものは含まない
  items: { itemId: string; folderId: string }[];
}
