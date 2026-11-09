import { get, getBlob, post } from "@/api/client";
import type { BackupListResponse, BackupSettings } from "@/types/backup";
import type { MessageResponse } from "@/types/messageResponse";

// バックアップ（FN0901。ローカルモード、または共有モードの管理者だけ）

export function getBackupSettings() {
  return get<BackupSettings>("/api/backup/settings");
}

export function updateBackupSettings(settings: BackupSettings) {
  return post<MessageResponse>("/api/backup/settings/update", settings);
}

export function getBackups() {
  return get<BackupListResponse>("/api/backups");
}

export function createBackup() {
  return post<MessageResponse>("/api/backups/create", {});
}

export function deleteBackup(backupId: string) {
  return post<MessageResponse>("/api/backups/delete", { backupId });
}

export function restoreBackup(backupId: string) {
  return post<MessageResponse>("/api/backups/restore", { backupId });
}

export function downloadBackup(backupId: string) {
  return getBlob(`/api/backups/download?backupId=${encodeURIComponent(backupId)}`);
}
