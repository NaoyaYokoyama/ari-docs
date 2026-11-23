import { post } from "@/api/client";
import type { CreateFavoriteResponse } from "@/types/favorite";

export function createFavoriteNode(
  path: string,
) {
  return post<CreateFavoriteResponse>("/api/favorite/node/create", {
    path,
  });
}

export function createFavoriteWiki(
  id: string,
) {
  return post<CreateFavoriteResponse>("/api/favorite/wiki/create", {
    id,
  });
}

export function createFavoriteNote(
  id: string,
) {
  return post<CreateFavoriteResponse>("/api/favorite/note/create", {
    id,
  });
}

export function deleteFavorite(
  favoriteId: string,
) {
  return post("/api/favorite/delete", {
    favoriteId,
  });
}

// 並べ替え（FN0601-BR08）。上からの順に favoriteId を渡す
export function updateFavoriteOrder(favoriteIds: string[]) {
  return post("/api/favorite/order", { favoriteIds });
}
