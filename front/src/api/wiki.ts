
import { get, post } from "@/api/client";
import type { WikiDetail, WikiList } from "@/types/wiki";

export function getWikis() {
  return get<WikiList>("/api/wikis");
}


export function getWiki(wikiId: string) {
  return get<WikiDetail>(`/api/wiki/${wikiId}`);
}

export function createWiki(
  title: string,
) {
  return post<WikiDetail>("/api/wiki/create", {
    title,
  });
}

// baseUpdatedAt（開いたときの更新日時）と今の更新日時が違えば 409（force なら上書きする）。保存したあとの更新日時を返す
export function updateWiki(
  wikiId: string,
  title: string,
  content: string,
  baseUpdatedAt?: string,
  force = false,
) {
  return post<{ message: string; data: { updatedAt: string } }>("/api/wiki/update", {
    wikiId,
    title,
    content,
    baseUpdatedAt,
    force,
  });
}

export function deleteWiki(
  wikiId: string,
) {
  return post("/api/wiki/delete", {
    wikiId,
  });
}


// 書いている（true）・やめた（false）を知らせる（同時編集のお知らせ。FN0501-BR11）。
// ほかに書いている人の表示名と、今の Wiki の更新日時・最後に更新した人を返す
export type EditingStatus = {
  editors: string[];
  updatedAt: string;
  updatedBy: string;
  // 書いている間はほかの人が書けない設定か（FN0501-BR12）
  lock: boolean;
  // ロックしている人（自分のほか）と書き始めた時刻（HH:MM）
  lockedBy: string | null;
  lockedSince: string | null;
};

// 書いている・やめたを知らせる。check は確かめるだけ、release は管理者がロックを外す（API0507）
export function reportEditing(wikiId: string, editing: boolean, options: { check?: boolean; release?: boolean } = {}) {
  return post<EditingStatus>("/api/wiki/editing", { wikiId, editing, ...options });
}
