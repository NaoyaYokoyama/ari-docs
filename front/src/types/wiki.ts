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
}

export interface WikiList {
  wikis: Wiki[];
}
