import { get, post } from "@/api/client";
import type { SearchType } from "@/app/preferences";
import type { FavoriteListResponse } from "@/types/favorite";
import type { SearchResponse } from "@/types/searchItem";

// types は探す種類（空ならすべて。FN0201-BR09）
export function search(keyword: string, types: SearchType[] = []) {
  return post<SearchResponse>("/api/home/search", {
    keyword,
    types,
  });
}

export function getFavorites() {
  return post<FavoriteListResponse>("/api/home/favorites", {
  });
}

export interface RecentContent {
  id: string;
  title: string;
  // UTC の "YYYY-MM-DD HH:MM:SS"
  updatedAt: string;
  // 最後に更新した人（Note は空文字）
  updatedBy: string;
}

export interface RecentResponse {
  wikis: RecentContent[];
  notes: RecentContent[];
  // path は folder/ からの相対パス、updatedAt は "YYYY/MM/DD HH:MM"
  files: { path: string; updatedAt: string }[];
}

// 最近更新されたもの（FN0201-BR07）
export function getRecent() {
  return get<RecentResponse>("/api/home/recent");
}
