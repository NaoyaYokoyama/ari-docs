import { get, post } from "@/api/client";
import type { MessageResponse } from "@/types/messageResponse";
import type { TrashResponse } from "@/types/trash";

// ゴミ箱（FN0302）

export function getTrash() {
  return get<TrashResponse>("/api/trash");
}

// 元の場所に戻す。戻した場所（folder/ からのパス）を返す
export function restoreTrash(trashIds: string[]) {
  return post<MessageResponse & { data: string[] }>("/api/trash/restore", { trashIds });
}

export function deleteTrash(trashIds: string[]) {
  return post<MessageResponse>("/api/trash/delete", { trashIds });
}

export function emptyTrash() {
  return post<MessageResponse>("/api/trash/empty", {});
}
