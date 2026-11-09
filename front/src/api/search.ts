import { get, post } from "@/api/client";
import type { MessageResponse } from "@/types/messageResponse";
import type { DictionaryResponse, FormatsResponse, IndexStatus } from "@/types/search";

// ファイルの中身の検索の辞書と取り込み状況（FN0202）

export function getDictionary() {
  return get<DictionaryResponse>("/api/search/dictionary");
}

export function createDictionaryWord(word: string) {
  return post<MessageResponse>("/api/search/dictionary/create", { word });
}

export function deleteDictionaryWord(word: string) {
  return post<MessageResponse>("/api/search/dictionary/delete", { word });
}

export function getIndexStatus() {
  return get<IndexStatus>("/api/search/status");
}

export function getFormats() {
  return get<FormatsResponse>("/api/search/formats");
}
