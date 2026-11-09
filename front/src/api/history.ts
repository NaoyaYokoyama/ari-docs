import { get } from "@/api/client";

// Note・Wiki の変更履歴（FN0402）

export interface HistoryItem {
  historyId: number;
  title: string;
  updatedBy: string;
  // その版の更新日時（UTC の "YYYY-MM-DD HH:MM:SS"）
  savedAt: string;
  // 本文の文字数
  length: number;
}

export interface HistoryVersion {
  historyId: number;
  title: string;
  content: string;
  updatedBy: string;
  savedAt: string;
}

export function getHistory(kind: "note" | "wiki", id: string) {
  return get<HistoryItem[]>(`/api/${kind}/${encodeURIComponent(id)}/history`);
}

export function getVersion(historyId: number) {
  return get<HistoryVersion>(`/api/history/${historyId}`);
}
