export interface Favorite {
  name: string;
  noteId: string;
  wikiId: string;
  nodePath: string;
}

export interface FavoriteList {
  favorites: Favorite[];
}
