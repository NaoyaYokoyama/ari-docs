import { post } from "@/api/client";
import type { FavoriteListResponse } from "@/types/favorite";
import type { SearchResponse } from "@/types/searchItem";

export function search(
  keyword: string,
) {
  return post<SearchResponse>("/api/home/search", {
    keyword,
  });
}

export function getFavorites() {
  return post<FavoriteListResponse>("/api/home/favorites", {
  });
}
