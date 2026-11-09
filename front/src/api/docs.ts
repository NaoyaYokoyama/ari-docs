import { get } from "@/api/client";
import type { DocFileResponse, DocsIndexResponse } from "@/types/docs";

// root を省略するとリポジトリの docs/ を表示する
export function getDocs(root: string) {
  const query = root ? `?root=${encodeURIComponent(root)}` : "";
  return get<DocsIndexResponse>(`/api/docs${query}`);
}

export function getDoc(root: string, path: string) {
  const params = new URLSearchParams({ path });
  if (root) {
    params.set("root", root);
  }
  return get<DocFileResponse>(`/api/doc?${params}`);
}
