
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

