import { get, post } from "@/api/client";

export function createFavoriteNode(
  path: string,
) {
  return post("/api/favorite/node/create", {
    path,
  });
}

export function createFavoriteWiki(
  id: string,
) {
  return post("/api/favorite/wiki/create", {
    id,
  });
}

export function createFavoriteNote(
  id: string,
) {
  return post("/api/favorite/note/create", {
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
