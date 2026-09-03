
import { get, post } from "@/api/client";
import type { WikiList, WikiDetail  } from "@/types/wiki";

export function getWikis() {
  return get<WikiList>("/api/wikis");
}


export function getWiki(wikiId: string) {
  return get<WikiDetail>(`/api/wiki/${wikiId}`);
}

export function createWiki(
  title: string,
) {
  return post("/api/wiki/create", {
    title,
  });
}

export function updateWiki(
  wikiId: string,
  title: string,
  content: string,
) {
  return post("/api/wiki/update", {
    wikiId, title, content,
  });
}

export function deleteWiki(
  wikiId: string,
) {
  return post("/api/wiki/delete", {
    wikiId,
  });
}

