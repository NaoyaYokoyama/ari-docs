import { get, post } from "@/api/client";
import { clientName } from "@/lib/clientName";
import type { MessageResponse } from "@/types/messageResponse";

// 管理者の PC（FN0102-BR12）
export type AdminDevice = {
  deviceId: string;
  userId: string;
  displayName: string;
  name: string;
  createdAt: string;
  lastUsedAt: string;
  // 今使っている PC
  current: boolean;
};

export function getAdminDevices() {
  return get<AdminDevice[]>("/api/admin-devices");
}

// ほかの PC を登録するコード（10 分）。相手は自分かほかの管理者
export function createPairingCode(userId: string) {
  return post<{ code: string }>("/api/admin-devices/pairing", { userId });
}

// この PC を管理者の PC にする。code は発行したコードか、サーバーの登録用のコード。name は一覧で見分ける名前
export function registerAdminDevice(code: string, name: string) {
  return post<MessageResponse>("/api/admin-devices/register", { code, client: name.trim() || clientName() });
}

export function deleteAdminDevice(deviceId: string) {
  return post<MessageResponse>("/api/admin-devices/delete", { deviceId });
}
