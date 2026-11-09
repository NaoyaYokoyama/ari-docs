import { post } from "@/api/client";

export interface QuickOpenItem {
  kind: "note" | "wiki" | "folder" | "file";
  // noteId / wikiId / nodeId
  id: string;
  // タイトル・ファイル名
  name: string;
  // 入っているところ。Note・Wiki はフォルダの名前を "/" でつないだもの、ノードは親のパス。一番上は空文字
  location: string;
  // ノードの folder/ からの相対パス（Note・Wiki は空文字）
  path: string;
  score: number;
}

// 探して開く（FN0003）。本人の Note・Wiki・ノードを名前であいまい検索する
export function quickOpen(keyword: string, showHidden: boolean) {
  return post<{ items: QuickOpenItem[] }>("/api/home/quick-open", { keyword, showHidden });
}
