import { get, post } from "@/api/client";
import type { FavoriteList, FavoriteDetail  } from "@/types/favorite";

export function search(
  keyword: string,
) {
  return post("/api/home/search", {
    keyword,
  });
}

export function getFavorites() {
  return post("/api/home/favorites", {
  });
}
