export interface Wiki {
  wikiId: string;
  title: string;
  updatedAt: string;
}

export interface WikiDetail {
  wikiId: string;
  title: string;
  content: string;
  updatedAt: string;
  favoriteId: string;
  // 最後に更新した人（まだ誰も更新していなければ作成者）の表示名
  updatedBy: string;
}

export interface WikiList {
  wikis: Wiki[];
}
