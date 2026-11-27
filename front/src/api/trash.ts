import { get, post } from "@/api/client";
import type { MessageResponse } from "@/types/messageResponse";
import type { TrashResponse } from "@/types/trash";

// ゴミ箱（FN0302）

export function getTrash() {
  return get<TrashResponse>("/api/trash");
}

// 元の場所に戻す。戻した場所（folder/ からのパス）を返す。
// destination は、元のフォルダが無いものを戻すフォルダ（一番上は空）。省くと元のフォルダを作り直す（FN0302-BR10）
export function restoreTrash(trashIds: string[], destination?: string) {
  return post<MessageResponse & { data: string[] }>("/api/trash/restore", { trashIds, destination });
}

export function deleteTrash(trashIds: string[]) {
  return post<MessageResponse>("/api/trash/delete", { trashIds });
}

export function emptyTrash() {
  return post<MessageResponse>("/api/trash/empty", {});
}
