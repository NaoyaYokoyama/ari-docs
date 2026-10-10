export interface Favorite {
  favoriteId: string;
  name: string;
  nodeId: string;
  noteId: string;
  wikiId: string;
}

export interface FavoriteListResponse {
  favoriteList: Favorite[];
}

export interface CreateFavoriteResponse {
  message: string;
  data: {
    favoriteId: string;
  };
}
