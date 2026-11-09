import { get, post } from "@/api/client";
import type { MessageResponse } from "@/types/messageResponse";
import type { ServerSettings, SystemInfo } from "@/types/system";

// ログインと保存の設定（FN0902。ローカルモード、または共有モードの管理者だけ）
export function getServerSettings() {
  return get<ServerSettings>("/api/system/settings");
}

export function updateServerSettings(settings: ServerSettings) {
  return post<MessageResponse>("/api/system/settings/update", settings);
}

// アプリの情報（FN0903）
export function getSystemInfo() {
  return get<SystemInfo>("/api/system/info");
}
