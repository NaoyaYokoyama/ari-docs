import { get, post } from "@/api/client";

export function createFavoriteWiki(
  wikiId: string,
) {
  return post("/api/favorite/wiki/create", {
    wikiId,
  });
}

export function deleteFavorite(
  favoriteId: string,
) {
  return post("/api/favorite/delete", {
    favoriteId,
  });
}
